'use strict';
function readable(result){return result?.mode==='dictate'&&['completed','failed','cancelled','processing'].includes(result.status)&&typeof result.original==='string'&&String(result.original||result.text||'').trim();}
function createActions({controller,store,writeClipboard,onCopied=()=>{}}){
 let copying=false;
 function readResult(id){
  if(typeof id!=='string'||!id||id.length>128)throw Error('结果标识无效。');
  const result=[controller.state?.result,store.getRecentResult?.()].find(item=>item?.id===id&&readable(item));
  if(!result)throw Error('结果已变化，请重新查看。');
  return result;
 }
 async function copyResult(input){
  if(copying)throw Error('正在复制，请稍候。');
  const object=typeof input==='object'&&input!==null&&!Array.isArray(input);
  if(object)for(const key of Reflect.ownKeys(input)){const d=Object.getOwnPropertyDescriptor(input,key);if(typeof key!=='string'||!['id','expectedRevision','source'].includes(key)||!Object.hasOwn(d,'value'))throw Error('复制请求无效。');}
  const id=object?input.id:input,source=object?input.source:undefined;if(source!==undefined&&source!=='original')throw Error('复制来源无效。');
  let result=controller.resultFor?controller.resultFor(id,object?input.expectedRevision:undefined):readResult(id);
  if(controller.active()&&controller.state.sessionId!==id)throw Error('当前任务尚未结束，请稍后复制。');
  if(source!=='original'&&controller.active()){if(!controller.freezeResult)throw Error('当前任务尚未结束，请稍后复制。');result=controller.freezeResult(id,result.revision);}
  const text=source==='original'?result.original:typeof result.text==='string'?result.text:result.original;if(!text.trim())throw Error('当前文字为空，请先输入文字。');copying=true;
  try{await writeClipboard(text);let same=true;if(controller.resultFor)try{same=controller.resultFor(id).revision===(result.revision||1);}catch{same=false;}if(source!=='original'&&same)onCopied(id,result.revision||1);return {ok:true,id,revision:result.revision||1};}finally{copying=false;}
 }
 return Object.freeze({readResult,copyResult});
}
module.exports={createActions,readable};
