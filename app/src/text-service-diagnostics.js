'use strict';
const {randomUUID}=require('node:crypto');
const {ApiError}=require('./api');
const {resolveProviderEndpoint}=require('./settings');
const edit=require('./dictation-edit');
const SAMPLE='今天下午三点开会，预算为500元，不要修改日期。\nWe will meet at 3 PM. Do not change the date.';
const MAX_MODELS=500,MAX_BYTES=2*1024*1024;
const messages=Object.freeze({
 test_success:'本次轻整理样例通过；未验证真实听写质量。',
 models_success:'已获取模型列表；不代表模型兼容轻整理。',
 not_supported:'当前地址暂未支持获取模型，请选择建议或手动填写。',
 authentication:'认证失败，请检查本服务的密钥、权限和区域。',
 credentials_missing:'当前服务没有可用密钥，请填写密钥；本地听写仍可使用。',
 configuration:'当前模型配置不完整或已变化，请核对地址、模型和密钥。',
 model_or_endpoint:'未找到模型或接口，请核对最终地址和模型名称。',
 model_or_protocol:'服务拒绝请求，请核对模型用途和兼容协议。',
 incompatible:'样例未通过轻整理检查，已保留本地文字；请检查模型兼容性。',
 rate_limit:'服务受到额度或频率限制，未自动重试。',
 provider:'模型服务暂时失败，未自动重试。',
 size:'模型列表或响应超出读取上限，仍可手动填写模型。',
 format:'服务响应格式不兼容，仍可手动填写模型。',
 network:'网络请求失败或重定向被阻止，未自动重试。',
 timeout:'检查超时；服务端可能已处理或计费，未自动重试。',
 cancelled:'检查已取消；已发出的请求仍可能计费。',
 busy:'已有检查正在进行，请先取消或等待完成。'
});
function failureCategory(error,status){
 if(status===401||status===403)return 'authentication';
 if(status===404)return 'model_or_endpoint';
 if(status===400||status===422||status===415)return 'model_or_protocol';
 if(status===429)return 'rate_limit';
 if(status>=500)return 'provider';
 if(['incomplete','light_edit','empty'].includes(error?.code))return 'incompatible';
 if(['size','format','credentials_missing','configuration'].includes(error?.code))return error.code;
 return status!==null?'format':'network';
}
function safeId(value){return typeof value==='string'&&value.length>0&&value.length<=160&&!/[\x00-\x1f\x7f]/.test(value);}
function textModel(row,format){
 if(!row||typeof row!=='object')return null;
 const id=format==='qwen'?row.model:row.id;if(!safeId(id))return null;
 const caps=row.capabilities;
 if(Array.isArray(caps)&&caps.length&&!caps.includes('TG')&&!caps.includes('text')&&!caps.includes('chat'))return null;
 const modalities=Array.isArray(row.modalities)?row.modalities:row.modalities?.output||row.output_modalities;
 if(Array.isArray(modalities)&&modalities.length&&!modalities.includes('text'))return null;
 return id;
}
function createTextServiceDiagnostics({resolveDraft,fetchImpl=fetch,presetApi,now=()=>performance.now(),wallNow=()=>Date.now(),getUsageObserver,onUsage,testTimeoutMs=12000,modelsTimeoutMs=10000,setTimer=setTimeout,clearTimer=clearTimeout}={}){
 if(typeof resolveDraft!=='function')throw Error('Draft resolver required.');
 let active=null;
 const busy=()=>active!==null;
 function cancel(requestId){if(!active||requestId!==undefined&&requestId!==active.id)return false;const current=active;active=null;current.abort.abort();return true;}
 const cancelAll=()=>cancel();
 async function run(kind,input={}){
  if(!['test','models'].includes(kind))throw Error('Unsupported diagnostic.');
  const id=safeId(input.requestId)&&input.requestId.length<=128?input.requestId:randomUUID();
  const start=now();let binding={requestId:id,profileId:null,draftRevision:null,credentialGeneration:null},status=null,endpointUrl='',model='',timedOut=false;
  const result=(category,extra={})=>({...binding,kind,category,message:messages[category]||messages.configuration,httpStatus:status,elapsedMs:Math.max(0,Math.round(now()-start)),testedAt:new Date(wallNow()).toISOString(),endpointUrl,model,qualityVerified:false,...extra});
  if(active)return result('busy');
  const job={id,abort:new AbortController()};active=job;
  const signal=job.abort.signal,timeout=Math.min(kind==='test'?12000:10000,Math.max(1,kind==='test'?testTimeoutMs:modelsTimeoutMs));
  let rejectAbort;const stopped=new Promise((_resolve,reject)=>{rejectAbort=()=>reject(new ApiError('检查已中止。','cancelled'));signal.addEventListener('abort',rejectAbort,{once:true});});
  const timer=setTimer(()=>{timedOut=true;job.abort.abort();},timeout);
  async function perform(){
   let resolved;try{resolved=await resolveDraft(input,{requireModel:kind==='test'});}catch(error){throw Object.assign(new Error('配置已变化。'),{code:error?.code==='credentials_missing'?'credentials_missing':'configuration'});}
   if(signal.aborted)throw new ApiError('已取消。','cancelled');
   const profile=structuredClone(resolved.profile);model=profile.model||'';
   binding={requestId:id,profileId:resolved.profileId,draftRevision:resolved.draftRevision,credentialGeneration:resolved.credentialGeneration};
   const endpoint=resolveProviderEndpoint(profile.baseUrl,'refiner',undefined,profile.endpointMode);endpointUrl=endpoint.endpointUrl;
   if(!endpoint.local&&!resolved.key)throw new ApiError('缺少密钥。','credentials_missing');
   const adapters=presetApi||require('../renderer/provider-presets');
   const observedFetch=async(url,options)=>{if(signal.aborted)throw new ApiError('已取消。','cancelled');const response=await fetchImpl(url,options);status=Number.isInteger(response.status)?response.status:null;return response;};
   if(kind==='test'){
    const observer=getUsageObserver?.({kind:'refiner',model,profileId:resolved.profileId,operationId:id,mode:'diagnostic'})||onUsage;
    await edit.refine(SAMPLE,{refiner:profile,dictionary:[]},resolved.key,{signal,timeoutMs:timeout,fetchImpl:observedFetch,presetApi:adapters,onUsage:observer});
    return result('test_success');
   }
   const metadata=adapters.discovery(profile);
   if(!metadata)return result('not_supported');
   let first;try{first=new URL(metadata.url);}catch{return result('not_supported');}
   if(first.origin!==new URL(endpointUrl).origin||first.username||first.password||first.hash)return result('not_supported');
   if(metadata.format==='qwen'){first.searchParams.set('providers','qwen');first.searchParams.set('capabilities','TG');first.searchParams.set('page_size','100');}
   endpointUrl=first.toString();let bytes=0,partial=false;const ids=new Set();
   for(let page=1;page<=(metadata.paged?5:1);page++){
    const url=new URL(first);if(metadata.paged)url.searchParams.set('page_no',String(page));
    const response=await observedFetch(url.toString(),{method:'GET',headers:resolved.key?{Authorization:'Bearer '+resolved.key}:{},signal,redirect:'error'});
    if(!response.ok){await response.body?.cancel();throw new ApiError('模型列表请求失败。','http');}
    if(!response.body?.getReader)throw new ApiError('模型列表格式不兼容。','format');
    const reader=response.body.getReader(),chunks=[];
    while(true){if(signal.aborted){await reader.cancel();throw new ApiError('已取消。','cancelled');}const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_BYTES){await reader.cancel();throw new ApiError('响应过大。','size');}chunks.push(Buffer.from(value));}
    let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new ApiError('响应格式不兼容。','format');}
    const rows=metadata.format==='qwen'?data?.output?.models:data?.data;
    if(!Array.isArray(rows))throw new ApiError('响应格式不兼容。','format');
    for(const row of rows){const id=textModel(row,metadata.format);if(id){if(ids.size>=MAX_MODELS){partial=true;break;}ids.add(id);}}
    const total=Number(data?.output?.total),more=metadata.paged&&Number.isSafeInteger(total)&&total>page*100;
    if(ids.size>=MAX_MODELS||page===5){partial=partial||more||rows.length>MAX_MODELS;break;}
    if(!more||rows.length===0)break;
   }
   return result('models_success',{models:[...ids],partial});
  }
  try{const outcome=await Promise.race([perform(),stopped]);return signal.aborted||active!==job?result(timedOut?'timeout':'cancelled'):outcome;}
  catch(error){if(timedOut)return result('timeout');if(signal.aborted||active!==job)return result('cancelled');return result(failureCategory(error,status));}
  finally{clearTimer(timer);signal.removeEventListener('abort',rejectAbort);if(active===job)active=null;}
 }
 return {run,cancel,cancelAll,busy};
}
module.exports={createTextServiceDiagnostics,SAMPLE};
