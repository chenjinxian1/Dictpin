'use strict';
// The renderer never supplies filesystem paths. Every import/export is gated by
// a native user file chooser and handles only bounded, application-owned data.
const fs=require('node:fs/promises');
const path=require('node:path');
const {createDictionaryImports}=require('./dictionary-imports');
const MAX_CSV_BYTES=8*1024*1024;
async function readCSVFile(filename){
  const handle=await fs.open(filename,'r');
  try{
    const stat=await handle.stat();
    if(!stat.isFile()||stat.size>MAX_CSV_BYTES)throw Error('CSV 必须是 8 MB 以内的普通文件。');
    const buffer=Buffer.alloc(MAX_CSV_BYTES+1);let total=0;
    while(total<buffer.length){const {bytesRead}=await handle.read(buffer,total,buffer.length-total,null);if(!bytesRead)break;total+=bytesRead;}
    const data=buffer.subarray(0,total);
    if(data.length>MAX_CSV_BYTES)throw Error('CSV 文件超过 8 MB。');
    // Reject malformed UTF-8 rather than silently importing replacement chars.
    let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(data);}catch{throw Error('CSV 请使用 UTF-8 编码。');}
    return text.replace(/^\uFEFF/,'');
  }finally{await handle.close();}
}
function createFileActions({store,dialog,getWindow=()=>undefined,ensureIdle=()=>{}}){
  const imports=createDictionaryImports({store});
  async function chooseOutput(title,defaultPath,filters){
    const options={title,defaultPath,filters};
    const window=getWindow();
    return window?dialog.showSaveDialog(window,options):dialog.showSaveDialog(options);
  }
  return{
    async importDictionary(){
      ensureIdle();const options={title:'导入本地词典 CSV',properties:['openFile'],filters:[{name:'UTF-8 CSV',extensions:['csv']}]};
      const window=getWindow();const chosen=await(window?dialog.showOpenDialog(window,options):dialog.showOpenDialog(options));
      if(chosen.canceled||!chosen.filePaths?.[0])return{cancelled:true};
      let csv;try{csv=await readCSVFile(chosen.filePaths[0]);}catch(e){if(/CSV/.test(e.message))throw e;throw Error('无法读取 CSV 文件，请检查权限。');}
      ensureIdle();return{cancelled:false,importPreview:imports.preview(csv)};
    },
    commitDictionary(token){ensureIdle();return imports.commit(token);},
    cancelDictionary:token=>imports.cancel(token),
    dispose:()=>imports.dispose(),
    async exportDictionary(){
      const chosen=await chooseOutput('导出本地词典','Local-Dictation-Dictionary.csv',[{name:'UTF-8 CSV',extensions:['csv']}]);
      if(chosen.canceled||!chosen.filePath)return{cancelled:true};
      const csv=store.exportDictionaryCSV();const data=Buffer.from(csv.startsWith('\uFEFF')?csv:'\uFEFF'+csv,'utf8');
      try{await fs.writeFile(chosen.filePath,data,{mode:0o600});}catch{throw Error('无法保存 CSV 文件，请检查目标位置和权限。');}
      return{cancelled:false,bytes:data.length,fileName:path.basename(chosen.filePath)};
    },
    async exportAudio(id){
      const item=store.getHistory(id);
      if(!item?.audioAvailable)throw Error('这条记录没有可导出的本地音频。');
      const date=/^\d{4}-\d{2}-\d{2}/.exec(item.createdAt||'')?.[0]||'recording';
      const chosen=await chooseOutput('导出未加密的录音文件',`Local-Dictation-${date}.webm`,[{name:'WebM Opus 音频',extensions:['webm']}]);
      if(chosen.canceled||!chosen.filePath)return{cancelled:true};
      // Re-read after the chooser: a record removed/expired meanwhile must not
      // be resurrected from a retained memory copy.
      const audio=store.readAudio(id);if(!audio)throw Error('音频已删除或已过期，无法导出。');
      const data=Buffer.from(audio.bytes);
      try{await fs.writeFile(chosen.filePath,data,{mode:0o600});}catch{throw Error('无法保存音频文件，请检查目标位置和权限。');}
      return{cancelled:false,bytes:data.length,fileName:path.basename(chosen.filePath)};
    }
  };
}
module.exports={MAX_CSV_BYTES,readCSVFile,createFileActions};
