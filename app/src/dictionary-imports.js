'use strict';
const {randomUUID,createHash}=require('node:crypto');
const PREVIEW_TTL_MS=10*60*1000;
function createDictionaryImports({store,now=()=>Date.now()}){
  let pending=null,timer;
  const revision=()=>createHash('sha256').update(JSON.stringify(store.dictionary)).digest('hex');
  const clear=()=>{clearTimeout(timer);timer=undefined;pending=null;};
  return{
    preview(csv){
      const data=store.previewDictionaryCSV(csv);clear();
      const token=randomUUID(),expiresAt=now()+PREVIEW_TTL_MS;
      pending={token,csv,revision:revision(),expiresAt};timer=setTimeout(clear,PREVIEW_TTL_MS);timer.unref?.();
      return{...data,token,expiresAt};
    },
    commit(token){
      if(typeof token!=='string'||!pending||token!==pending.token)throw Error('没有可提交的导入预览，请重新选择 CSV。');
      const current=pending;clear();
      if(now()>=current.expiresAt)throw Error('导入预览已过期，请重新选择 CSV。');
      if(revision()!==current.revision)throw Error('预览后词典发生了变化，请重新预览再导入。');
      // Consume before mutating: repeated IPC cannot import the same preview twice.
      return store.importDictionaryCSV(current.csv);
    },
    cancel(token){if(pending&&pending.token===token)clear();return{cancelled:true};},
    dispose:clear
  };
}
module.exports={PREVIEW_TTL_MS,createDictionaryImports};
