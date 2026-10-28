'use strict';
const {randomUUID}=require('node:crypto');
const presets=require('../renderer/provider-presets');
const {resolveProviderEndpoint}=require('../renderer/provider-endpoint');
const clone=value=>structuredClone(value);
function plain(value){return value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));}
function object(value,allowed){if(!plain(value))throw Error('服务操作格式无效。');for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!allowed.includes(key)||!d||!Object.hasOwn(d,'value'))throw Error('服务操作包含不支持的字段。');}return value;}
function generation(){return randomUUID();}
function credentialKey(value){if(typeof value!=='string'||value.length>4096||/[\r\n\0]/.test(value))throw Error('API 密钥格式无效。');return value.trim();}
function endpointIdentity(profile){return resolveProviderEndpoint(profile.baseUrl,'refiner',undefined,profile.endpointMode).endpointUrl;}
const KEY_PREFIX='DictpinServiceKey/v1:';
function encodeKey(profile,key){return KEY_PREFIX+JSON.stringify({version:1,profileId:profile.id,endpoint:endpointIdentity(profile),key});}
function decodeKey(profile,value){
 if(!value.startsWith(KEY_PREFIX)){if(profile.id==='legacy')return credentialKey(value);throw Error('Unbound service credential.');}
 const payload=JSON.parse(value.slice(KEY_PREFIX.length));
 if(payload?.version!==1||payload.profileId!==profile.id||payload.endpoint!==endpointIdentity(profile))throw Error('Service credential binding changed.');
 return credentialKey(payload.key);
}
function imported(store){return {id:'legacy',presetId:'legacy',region:'',workspaceId:'',baseUrl:store.settings.refiner.baseUrl,endpointMode:store.settings.refiner.endpointMode,model:store.settings.refiner.model,revision:1,customized:false};}
function load(store){
 const raw=store.rawSettings.textServices;
 store.serviceKeys={};store.serviceGenerations={};store.serviceSecrets=plain(store.secrets.textServices)?clone(store.secrets.textServices):{};
 if(raw===undefined){const p=imported(store);store.textServices={version:1,revision:0,activeProfileId:'legacy',profiles:[p]};if(typeof store.secrets.refiner==='string')store.serviceSecrets.legacy=store.secrets.refiner;try{store.serviceKeys.legacy=decodeKey(p,store.keys.refiner||'');}catch{store.serviceKeys.legacy='';}}
 else{
  try{if(!plain(raw)||raw.version!==1||!Number.isSafeInteger(raw.revision)||raw.revision<1||!Array.isArray(raw.profiles)||raw.profiles.length<1||raw.profiles.length>16)throw Error();
   const profiles=raw.profiles.map(p=>({...clone(p),...presets.normalizeProfile(p)}));if(new Set(profiles.map(p=>p.id)).size!==profiles.length||!profiles.some(p=>p.id===raw.activeProfileId))throw Error();
   store.textServices={...clone(raw),version:1,revision:raw.revision,activeProfileId:raw.activeProfileId,profiles};
   for(const p of profiles){store.serviceKeys[p.id]='';const secret=store.serviceSecrets[p.id]??(p.id==='legacy'?store.secrets.refiner:undefined);if(typeof secret==='string'){store.serviceSecrets[p.id]=secret;try{if(!store.secureAvailable())throw Error();store.serviceKeys[p.id]=decodeKey(p,store.safe.decryptString(Buffer.from(secret,'base64')));}catch{}}}
  }catch{store.settingsReadable=false;store.settings.refiner.enabled=false;store.notices.push('模型服务配置版本或内容无法读取，已只读打开；原配置和密钥保持不变。');store.textServices={version:1,revision:0,activeProfileId:'legacy',profiles:[imported(store)]};store.serviceKeys.legacy='';}
 }
 for(const p of store.textServices.profiles)store.serviceGenerations[p.id]=generation();
 project(store);
}
function active(store){return clone(store.textServices.profiles.find(p=>p.id===store.textServices.activeProfileId));}
function status(store,id){const hasKey=!!store.serviceKeys[id],hasStoredKey=typeof store.serviceSecrets[id]==='string';return {hasKey,hasStoredKey,persistent:hasStoredKey&&hasKey,state:hasStoredKey&&!hasKey?'unavailable':hasStoredKey?'saved':hasKey?'session':'missing'};}
function view(store){return {version:1,revision:store.textServices.revision,activeProfileId:store.textServices.activeProfileId,profiles:store.textServices.profiles.map(p=>({...presets.normalizeProfile(p),keyStatus:status(store,p.id),credentialGeneration:store.serviceGenerations[p.id]}))};}
function project(store){const p=active(store);store.settings.refiner={...store.settings.refiner,baseUrl:p.baseUrl,model:p.model,endpointMode:p.endpointMode};store.keys.refiner=store.serviceKeys[p.id]||'';}
function resolve(store,input,{requireModel=true}={}){
 object(input,['requestId','profileId','expectedRevision','draftRevision','profile','keyAction','key','credentialGeneration','persistKey']);
 if(typeof input.profileId!=='string'||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||!Number.isSafeInteger(input.draftRevision)||input.draftRevision<0)throw Error('服务配置版本无效。');
 if(input.requestId!==undefined&&(typeof input.requestId!=='string'||!input.requestId||input.requestId.length>128))throw Error('请求标识无效。');
 if(input.persistKey!==undefined&&typeof input.persistKey!=='boolean')throw Error('密钥保存选项无效。');
 const profile=presets.normalizeProfile(input.profile,{requireModel});if(profile.id!==input.profileId)throw Error('服务配置标识不匹配。');
 const saved=store.textServices.profiles.find(p=>p.id===profile.id);if(input.expectedRevision!==(saved?.revision||0))throw Error('服务配置已变化，请重新核对草稿。');
 if(saved&&input.credentialGeneration!==store.serviceGenerations[profile.id])throw Error('密钥状态已变化，请重新核对草稿。');
 if(!['retain','replace','remove'].includes(input.keyAction))throw Error('请明确保留、替换或移除密钥。');
 if(input.keyAction!=='replace'&&Object.hasOwn(input,'key')&&input.key)throw Error('密钥操作不匹配。');
 let key='',credentialGeneration=store.serviceGenerations[profile.id]||'new:'+profile.id;
 if(input.keyAction==='replace'){key=credentialKey(input.key);if(!key)throw Error('新密钥不能为空。');credentialGeneration='draft:'+profile.id+':'+input.draftRevision;}
 if(input.keyAction==='retain'){
  if(saved&&endpointIdentity(saved)!==endpointIdentity(profile)&&(store.serviceKeys[profile.id]||store.serviceSecrets[profile.id]))throw Error('API 地址已改变，请替换或明确移除旧密钥。');
  key=store.serviceKeys[profile.id]||'';
 }
 if(input.keyAction==='remove')credentialGeneration='removed:'+profile.id+':'+input.draftRevision;
 return {profileId:profile.id,profile,key,credentialGeneration,draftRevision:input.draftRevision};
}
function legacyDraft(store,input){
 const before=active(store),next={...before,baseUrl:input.baseUrl,model:input.model,endpointMode:input.endpointMode};
 const key=typeof input.key==='string'?credentialKey(input.key):'';
 const keyAction=key?'replace':input.clearKey===true?'remove':'retain';
 return {profileId:before.id,expectedRevision:before.revision,draftRevision:0,profile:next,keyAction,credentialGeneration:store.serviceGenerations[before.id],...(key?{key}:{}),...(input.persistKey===undefined?{}:{persistKey:input.persistKey})};
}
function stage(store,patch,refinerInput){
 const next={state:clone(store.textServices),keys:{...store.serviceKeys},secrets:clone(store.serviceSecrets),generations:{...store.serviceGenerations}};
 let changes=[],explicit=patch!==undefined;
 if(explicit){object(patch,['expectedRevision','activeProfileId','changes']);if(patch.expectedRevision!==store.textServices.revision)throw Error('模型服务集合已变化，请核对草稿后再保存。');if(!Array.isArray(patch.changes)||patch.changes.length>16)throw Error('模型服务更改过多。');changes=patch.changes;next.state.activeProfileId=patch.activeProfileId;}
 else{const p=refinerInput,before=store.settings.refiner;if(p.baseUrl!==before.baseUrl||p.model!==before.model||p.endpointMode!==before.endpointMode||p.key||p.clearKey||p.persistKey!==undefined)changes=[legacyDraft(store,p)];}
 const ids=new Set();
 for(const change of changes){const resolved=resolve(store,change);if(ids.has(resolved.profileId))throw Error('同一服务配置不能重复提交。');ids.add(resolved.profileId);const old=next.state.profiles.find(p=>p.id===resolved.profileId),p={...old,...resolved.profile,revision:(old?.revision||0)+1};
  const index=next.state.profiles.findIndex(p=>p.id===resolved.profileId);if(index<0)next.state.profiles.push(p);else next.state.profiles[index]=p;
  next.keys[p.id]=resolved.key;
  if(change.keyAction==='remove'||change.keyAction==='replace'||change.persistKey===false)delete next.secrets[p.id];
  if(change.persistKey===true){if(!resolved.key)throw Error('当前没有可用于安全保存的密钥。');if(!store.secureAvailable())throw Error('系统安全存储不可用，未保存任何更改。');try{next.secrets[p.id]=store.safe.encryptString(encodeKey(p,resolved.key)).toString('base64');}catch{throw Error('系统密钥加密失败，未保存任何更改。');}}
  if(change.keyAction!=='retain')next.generations[p.id]=generation();else if(!next.generations[p.id])next.generations[p.id]=generation();
 }
 if(next.state.profiles.length>16||!next.state.profiles.some(p=>p.id===next.state.activeProfileId))throw Error('请选择已完整配置的生效服务。');
 next.state.revision=store.textServices.revision+1;
 return next;
}
function apply(store,next){store.textServices=next.state;store.serviceKeys=next.keys;store.serviceSecrets=next.secrets;store.serviceGenerations=next.generations;project(store);}
module.exports={load,view,active,status,resolve,stage,apply};
