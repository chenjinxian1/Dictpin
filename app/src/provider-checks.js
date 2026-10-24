'use strict';
const {requestJSON}=require('./api');
const {randomUUID}=require('node:crypto');
const {qwenAudioRequest,qwenText,MAX_QWEN_REQUEST_BYTES}=require('./asr-protocol');
const {resolveProviderEndpoint}=require('./settings');
const {modelWarning}=require('../renderer/provider-endpoint');
const MESSAGES=Object.freeze({
  local_ready:'本地 CPU worker 已加载，合成静音被 VAD 拦截；未使用网络，未验证识别质量。',
  local_failed:'本地 worker 检查失败；未切换到云端或发送请求。',
  chat_success:'文本测试收到有效回答；仅验证本次已保存配置。',
  asr_response:'合成音接口收到 JSON text 响应；未验证真实语音识别质量。',
  authentication:'认证失败。请核对已保存密钥、权限和对应主机。',
  model_or_endpoint:'未找到模型或接口。请核对最终 URL 和模型名称。',
  model_or_protocol:'请求被拒绝。请核对模型用途、接口协议和参数。',
  protocol:'响应或媒体协议不兼容。HTTP 成功不代表模型可用。',
  rate_limit:'请求受到额度或频率限制；未自动重试。',
  provider:'供应商服务错误；未自动重试。',
  credentials_missing:'远程服务没有当前会话可用的密钥，请先保存。',
  configuration:'已保存的地址或模型配置无效。',
  network:'网络请求失败或重定向被阻止；未自动重试。',
  timeout:'测试超时。服务端可能已处理或计费；未自动重试。',
  cancelled:'测试已取消；服务端可能已处理或计费。'
});
function validKind(kind){if(typeof kind!=='string'||!['asr','refiner'].includes(kind))throw Error('Invalid service.');return kind;}
function syntheticWav(){
  const samples=4000,buffer=Buffer.alloc(44+samples*2);
  buffer.write('RIFF');buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(16000,24);buffer.writeUInt32LE(32000,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(samples*2,40);
  for(let i=0;i<samples;i++)buffer.writeInt16LE(Math.round(1800*Math.sin(2*Math.PI*440*i/16000)),44+i*2);
  return buffer;
}
function createProviderChecks({getSettings,getKey,localAsr=null,getUsageObserver,fetchImpl=fetch,now=()=>performance.now(),timeoutMs=15000}={}){
  const jobs=new Map();
  function cancel(kind){validKind(kind);jobs.get(kind)?.abort();}
  function cancelAll(){for(const kind of jobs.keys())cancel(kind);}
  async function run(kind){
    validKind(kind);cancel(kind);
    const abort=new AbortController();jobs.set(kind,abort);
    const start=now();let httpStatus=null,warning='';
    function result(category){
      const callSucceeded=['chat_success','asr_response','local_ready'].includes(category);
      return {kind,category,message:MESSAGES[category]||MESSAGES.protocol,httpStatus,elapsedMs:Math.max(0,Math.round(now()-start)),callSucceeded,qualityVerified:false,outcome:category==='chat_success'?'success':['asr_response','local_ready'].includes(category)?'warning':category==='cancelled'?'cancelled':'error',warning};
    }
    try{
      const config=getSettings()?.[kind];let resolved;
      if(kind==='asr'&&config?.backend==='local'){
        if(!localAsr)return result('local_failed');
        try{await localAsr.transcribe({localPcm:new Uint8Array(8000),sampleRate:16000,channels:1},{signal:abort.signal});return result('local_failed');}
        catch(error){if(abort.signal.aborted||jobs.get(kind)!==abort)return result('cancelled');return result(error.code==='no_speech'?'local_ready':'local_failed');}
      }
      try{
        resolved=resolveProviderEndpoint(config?.baseUrl,kind,config?.protocol,config?.endpointMode);
        if(typeof config?.model!=='string'||!config.model.trim()||config.model.length>160)throw Error();
      }catch{return result('configuration');}
      warning=modelWarning(config.model,kind,config.protocol);
      const key=getKey(kind)||'';
      if(!resolved.local&&!key)return result('credentials_missing');
      let body;const qwen=kind==='asr'&&config.protocol==='qwen-input-audio';
      if(kind==='refiner')body=JSON.stringify({model:config.model,messages:[{role:'user',content:'Reply with OK.'}],max_tokens:8,stream:false});
      else if(qwen){body=qwenAudioRequest({bytes:syntheticWav(),mimeType:'audio/wav',durationMs:250},{asr:config}).body;}
      else{body=new FormData();body.append('file',new Blob([syntheticWav()],{type:'audio/wav'}),'synthetic-probe.wav');body.append('model',config.model);body.append('response_format','json');}
      const data=await requestJSON(resolved.endpointUrl,body,key,{signal:abort.signal,timeoutMs,onUsage:getUsageObserver?.({kind,model:config.model,operationId:randomUUID(),mode:'diagnostic'}),...(qwen?{maxRequestBytes:MAX_QWEN_REQUEST_BYTES}:{}),fetchImpl:async(url,options)=>{const response=await fetchImpl(url,options);httpStatus=response.status;return response;}});
      if(abort.signal.aborted||jobs.get(kind)!==abort)return result('cancelled');
      if(kind==='asr')return result(typeof (qwen?qwenText(data):data?.text)==='string'&&!data.error?'asr_response':'protocol');
      const content=data?.choices?.[0]?.message?.content;
      return result(!data?.error&&typeof content==='string'&&content.trim()&&!content.includes('\0')?'chat_success':'protocol');
    }catch(error){
      if(abort.signal.aborted||jobs.get(kind)!==abort)return result('cancelled');
      if(error.code==='timeout')return result('timeout');
      if(httpStatus===401||httpStatus===403)return result('authentication');
      if(httpStatus===404)return result('model_or_endpoint');
      if(httpStatus===400||httpStatus===422)return result('model_or_protocol');
      if(httpStatus===415)return result('protocol');
      if(httpStatus===429)return result('rate_limit');
      if(httpStatus>=500)return result('provider');
      if(httpStatus!==null)return result('protocol');
      return result('network');
    }finally{if(jobs.get(kind)===abort)jobs.delete(kind);}
  }
  return {run,cancel,cancelAll};
}
module.exports={createProviderChecks};
