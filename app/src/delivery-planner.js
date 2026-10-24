'use strict';
// Independent BYOK policy. Plain answer text is never parsed for links or commands.
const TASKS=new Set(['ask','explain','write','shorten','expand','rewrite','translate']);
const MESSAGES=Object.freeze({reply_in_app:'本次回答仅显示在应用内，可检查后手动复制。',native_adapter_unverified:'本次需要文本交付；原生写入适配尚未通过 Windows 验收，结果保留在应用内，请手动复制。',explicit_confirmation_required:'外部操作尚未执行；需要明确的用户确认与受限适配，结果保留在应用内。',invalid_contract:'交付类型无效或不受支持，结果仅保留在应用内，请检查后手动复制。'});
function safeExternalUrl(value){try{if(typeof value!=='string'||value.length>2048)return false;const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!!url.hostname;}catch{return false;}}
function planDelivery(input={}){
 let requested='unknown',source='unknown';
 if(input&&typeof input==='object'&&!Array.isArray(input)){
  if(Object.hasOwn(input,'providerDelivery')){
   source='provider-contract';const contract=input.providerDelivery;
   if(contract&&typeof contract==='object'&&!Array.isArray(contract)&&['reply','replace','external'].includes(contract.type)&& (contract.type!=='external'||safeExternalUrl(contract.url)))requested=contract.type;
  }else if(['dictate','translate'].includes(input.mode)){requested='replace';source='user-task';}
  else if(input.mode==='ask'&&TASKS.has(input.task??'ask')){requested=['ask','explain'].includes(input.task??'ask')?'reply':'replace';source='user-task';}
 }
 const reason=requested==='reply'?'reply_in_app':requested==='replace'?'native_adapter_unverified':requested==='external'?'explicit_confirmation_required':'invalid_contract';
 return Object.freeze({version:1,source,requested,actual:'in-app',reason,executed:false});
}
function normalizeDeliveryPlan(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==1||value.actual!=='in-app'||value.executed!==false)return null;
 if(!['user-task','provider-contract','unknown'].includes(value.source)||!['reply','replace','external','unknown'].includes(value.requested))return null;
 const reason=value.requested==='reply'?'reply_in_app':value.requested==='replace'?'native_adapter_unverified':value.requested==='external'?'explicit_confirmation_required':'invalid_contract';
 if(value.reason!==reason)return null;
 return {version:1,source:value.source,requested:value.requested,actual:'in-app',reason,executed:false};
}
function deliveryMessage(plan){return MESSAGES[normalizeDeliveryPlan(plan)?.reason]||MESSAGES.invalid_contract;}
module.exports={planDelivery,normalizeDeliveryPlan,deliveryMessage,safeExternalUrl};
