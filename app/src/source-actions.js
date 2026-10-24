'use strict';
const {createHash}=require('node:crypto');
const {validateMetadata,normalizeSourceUrl}=require('./source-citations');
function readPayloadSource(payload,sourceId){
 if(!payload||typeof payload.id!=='string'||typeof sourceId!=='string'||!sourceId||sourceId.length>128)throw Error('来源标识无效。');
 const metadata=validateMetadata(payload.answer,payload.sourceMetadata),source=metadata?.sources.find(item=>item.id===sourceId);
 const destination=source&&normalizeSourceUrl(source.url);
 if(!source||!destination)throw Error('来源已失效或目的地不受支持。');
 return Object.freeze({...source,...destination,identity:createHash('sha256').update(JSON.stringify([payload.id,payload.generation??null,payload.answer,metadata])).digest('hex')});
}
function createSourceActions({confirm,open}){
 const pending=new Set();
 return {async open({key,window,read}){
  if(pending.has(key))throw Error('已有来源确认正在进行，请先完成或取消。');
  if(!window||window.isDestroyed())throw Error('回答窗口已关闭。');
  pending.add(key);
  try{
   const first=read();
   if(!await confirm(window,first))return{ok:false,cancelled:true};
   if(window.isDestroyed())throw Error('回答窗口已关闭，未打开网页。');
   const current=read(),destination=normalizeSourceUrl(current.url);
   if(!destination||current.identity!==first.identity||current.id!==first.id||current.url!==first.url)throw Error('回答或来源已更新，未打开网页，请重新确认。');
   await open(destination.url);
   return{ok:true,dispatched:true};
  }finally{pending.delete(key);}
 }};
}
module.exports={readPayloadSource,createSourceActions};
