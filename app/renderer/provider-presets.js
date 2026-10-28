(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./provider-endpoint'):root.ProviderEndpoint);if(typeof module==='object'&&module.exports)module.exports=api;else root.ProviderPresets=api;})(typeof globalThis==='object'?globalThis:this,function(endpoints){
 'use strict';
 const VERSION=1,CHECKED_AT='2026-10-28';
 const PROVIDERS=Object.freeze([
  {id:'qwen',label:'通义千问',en:'Qwen'},{id:'deepseek',label:'DeepSeek',en:'DeepSeek'},
  {id:'openai',label:'OpenAI',en:'OpenAI'},{id:'siliconflow',label:'硅基流动',en:'SiliconFlow'},
  {id:'local',label:'本地兼容服务',en:'Local compatible service'},{id:'custom',label:'自定义',en:'Custom'}
 ]);
 const REGIONS=Object.freeze([
  {id:'cn-beijing',segment:'cn-beijing',label:'北京',en:'Beijing'},
  {id:'ap-southeast-1',segment:'ap-southeast-1',label:'新加坡',en:'Singapore'},
  {id:'cn-hongkong',segment:'cn-hongkong',label:'香港',en:'Hong Kong'},
  {id:'ap-northeast-1',segment:'ap-northeast-1',label:'东京',en:'Tokyo'},
  {id:'eu-central-1',segment:'eu-central-1',label:'法兰克福',en:'Frankfurt'},
  {id:'us-east-1',segment:'us-east-1',label:'弗吉尼亚',en:'Virginia'}
 ]);
 function slotId(provider,region=''){if(provider==='legacy')return 'legacy';if(!PROVIDERS.some(p=>p.id===provider))throw Error('模型厂商无效。');if(provider==='qwen'){if(!region)return 'qwen:unselected';if(!REGIONS.some(r=>r.id===region))throw Error('千问区域无效。');return 'qwen:'+region;}return provider;}
 function workspaceUrl(region,workspaceId){if(!workspaceId)return '';if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(workspaceId))throw Error('业务空间 ID 格式无效。');return 'https://'+workspaceId+'.'+region+'.maas.aliyuncs.com/compatible-mode/v1';}
 function createProfile(presetId,region='',workspaceId=''){
  const id=slotId(presetId,region);let baseUrl='',model='',endpointMode='base';
  if(presetId==='qwen'){baseUrl=region?workspaceUrl(region,workspaceId):'';model='qwen-flash';}
  if(presetId==='deepseek'){baseUrl='https://api.deepseek.com/chat/completions';model='deepseek-flash';endpointMode='endpoint';}
  if(presetId==='openai'){baseUrl='https://api.openai.com/v1';model='gpt-6-luna';}
  if(presetId==='siliconflow')baseUrl='https://api.siliconflow.cn/v1';
  return {id,presetId,region:presetId==='qwen'?region:'',workspaceId:presetId==='qwen'?workspaceId:'',baseUrl,endpointMode,model,revision:0,customized:false};
 }
 function suggestions(profile){return profile?.presetId==='qwen'?['qwen-flash','qwen-plus']:profile?.presetId==='deepseek'?['deepseek-flash']:profile?.presetId==='openai'?['gpt-6-luna']:profile?.presetId==='siliconflow'?['Qwen/Qwen3.8-27B','deepseek-ai/DeepSeek-V4-Flash']:[];}
 function providerLabel(profile,language='zh-CN'){if(profile?.presetId==='legacy')return language==='en'?'Previous configuration':'原有配置';const p=PROVIDERS.find(p=>p.id===profile?.presetId);return p?(language==='en'?p.en:p.label):(language==='en'?'Not configured':'未配置');}
 function text(value,label,max){if(typeof value!=='string'||value.length>max||/[\x00-\x1f\x7f]/.test(value))throw Error(label+'格式无效。');return value.trim();}
 function normalizeProfile(input,{requireModel=true}={}){
  if(!input||typeof input!=='object'||Array.isArray(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input)))throw Error('服务配置无效。');
  for(const descriptor of Object.values(Object.getOwnPropertyDescriptors(input)))if(!Object.hasOwn(descriptor,'value'))throw Error('服务配置无效。');
  const presetId=text(input.presetId,'厂商',40),region=text(input.region??'','区域',40),workspaceId=text(input.workspaceId??'','业务空间 ID',128);
  const id=slotId(presetId,region);if(id==='qwen:unselected'||input.id!==id)throw Error('服务配置标识或区域不匹配。');
  if(presetId!=='qwen'&&(region||workspaceId))throw Error('此厂商不使用区域或业务空间设置。');
  if(workspaceId&&!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(workspaceId))throw Error('业务空间 ID 格式无效。');
  const resolved=endpoints.resolveProviderEndpoint(input.baseUrl,'refiner',undefined,input.endpointMode??'auto');
  if(presetId==='local'&&!resolved.local)throw Error('本地服务须使用回环地址。');
  const model=text(input.model??'','模型名称',160);if(requireModel&&!model)throw Error('模型名称不能为空。');
  const revision=input.revision??0;if(!Number.isSafeInteger(revision)||revision<0)throw Error('服务配置版本无效。');
  const defaults=presetId==='legacy'?null:createProfile(presetId,region,workspaceId);
  return {id,presetId,region,workspaceId,baseUrl:resolved.baseUrl,endpointMode:resolved.endpointMode,model,revision,customized:defaults?resolved.baseUrl!==defaults.baseUrl||resolved.endpointMode!==defaults.endpointMode:input.customized===true};
 }
 function officialQwen(profile,url){
  if(profile.presetId!=='qwen'||!REGIONS.some(r=>r.id===profile.region)||url.protocol!=='https:')return false;
  const host=profile.workspaceId?profile.workspaceId+'.'+profile.region+'.maas.aliyuncs.com':'';
  const legacy={'cn-beijing':'dashscope.aliyuncs.com','ap-southeast-1':'dashscope-intl.aliyuncs.com','cn-hongkong':'cn-hongkong.dashscope.aliyuncs.com'};
  return (url.hostname===host||url.hostname===legacy[profile.region])&&url.pathname==='/compatible-mode/v1/chat/completions'&&!url.port;
 }
 function requestParameters(profile){
  try{const p=normalizeProfile(profile),url=new URL(endpoints.resolveProviderEndpoint(p.baseUrl,'refiner',undefined,p.endpointMode).endpointUrl);
   if(officialQwen(p,url)&&['qwen-flash','qwen-plus'].includes(p.model))return {enable_thinking:false};
   if(p.presetId==='deepseek'&&url.href==='https://api.deepseek.com/chat/completions'&&p.model==='deepseek-flash')return {thinking:{type:'disabled'}};
   if(p.presetId==='openai'&&url.href==='https://api.openai.com/v1/chat/completions'&&p.model==='gpt-6-luna')return {reasoning_effort:'none'};
  }catch{}return {};
 }
 function discovery(profile){
  try{const p=normalizeProfile(profile,{requireModel:false}),resolved=endpoints.resolveProviderEndpoint(p.baseUrl,'refiner',undefined,p.endpointMode),url=new URL(resolved.endpointUrl),origin=url.origin;
   if(p.presetId==='qwen'){
    if(!officialQwen(p,url))return null;
    const workspaceRegions=['cn-beijing','ap-northeast-1','eu-central-1','us-east-1'];
    const sameOriginVerified=(p.workspaceId&&workspaceRegions.includes(p.region)&&url.hostname===p.workspaceId+'.'+p.region+'.maas.aliyuncs.com')||url.hostname==='dashscope-intl.aliyuncs.com'&&p.region==='ap-southeast-1'||url.hostname==='cn-hongkong.dashscope.aliyuncs.com'&&p.region==='cn-hongkong';
    return sameOriginVerified?{url:origin+'/api/v1/models',format:'qwen',paged:true}:null;
   }
   if(p.presetId==='deepseek'&&url.href==='https://api.deepseek.com/chat/completions')return {url:origin+'/models',format:'openai',paged:false};
   if(p.presetId==='openai'&&url.href==='https://api.openai.com/v1/chat/completions')return {url:origin+'/v1/models',format:'openai',paged:false};
   if(p.presetId==='siliconflow'&&url.href==='https://api.siliconflow.cn/v1/chat/completions')return {url:origin+'/v1/models?sub_type=chat',format:'openai',paged:false};
   if(!['local','custom','legacy'].includes(p.presetId))return null;
   return {url:origin+url.pathname.replace(/\/chat\/completions$/,'/models'),format:'openai',paged:false};
  }catch{return null;}
 }
 return {VERSION,CHECKED_AT,PROVIDERS,REGIONS,slotId,createProfile,suggestions,providerLabel,normalizeProfile,requestParameters,discovery};
});
