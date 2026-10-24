'use strict';
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.DictationUiState=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 function draftPatch(before,after){
  const patch={},refiner={};
  for(const key of ['deviceId','shortcut','copyShortcut'])if(after[key]!==before[key])patch[key]=after[key];
  for(const key of ['enabled','baseUrl','model'])if(after[key]!==before[key])refiner[key]=after[key];
  if(after.key){refiner.key=after.key;refiner.persistKey=after.remember===true;}
  else if(after.remember!==before.remember)refiner.persistKey=after.remember===true;
  if(Object.keys(refiner).length){
   patch.refiner=refiner;patch.expectedRefiner={baseUrl:before.baseUrl,model:before.model};
   if(before.endpointMode!==undefined)patch.expectedRefiner.endpointMode=before.endpointMode;
  }
  return patch;
 }
 function effectiveShortcut(snapshot){
  const current=snapshot?.shortcutStatus?.statuses?.current;
  if(current?.registered!==true||typeof current.accelerator!=='string'||!current.accelerator)return '快捷键未生效';
  return current.accelerator.replace(/CommandOrControl|CmdOrCtrl|Control/gi,'Ctrl').replace(/\+/g,' + ');
 }
 function captureView(snapshot){
  if(!snapshot)return {label:'连接中',action:null,disabled:true,cancel:false};
  const phase=snapshot?.state?.phase||'idle',active=['starting','recording','stopping','processing','transcribing','refining'].includes(phase);
  if(phase==='recording')return {label:'结束听写',action:'stop',disabled:false,cancel:true};
  if(active)return {label:phase==='starting'?'准备中':phase==='stopping'?'结束中':snapshot?.canUseOriginal||phase==='refining'||/整理/.test(snapshot?.state?.message||'')?'整理中':'识别中',action:null,disabled:true,cancel:true};
  if(snapshot?.localEngine?.workerFound===false)return {label:'识别器不可用',action:null,disabled:true,cancel:false};
  return {label:phase==='error'?'重新听写':'开始听写',action:'start',disabled:false,cancel:false};
 }
 function sessionView(snapshot){
  const phase=snapshot?.state?.phase,active=['starting','recording','stopping','processing','transcribing','refining'].includes(phase),original=active&&snapshot?.canUseOriginal===true;
  if(!active)return {active:false,title:'',detail:'',step:null,cancelLabel:'取消'};
  if(phase==='starting')return {active:true,title:'正在准备麦克风',detail:'准备完成后开始录音，可随时取消。',step:'recording',cancelLabel:'取消'};
  if(phase==='recording')return {active:true,title:'正在录音',detail:'再次按快捷键，或点“结束听写”。',step:'recording',cancelLabel:'取消'};
  if(phase==='stopping')return {active:true,title:'正在结束录音',detail:'即将进行本机识别。',step:'recording',cancelLabel:'取消'};
  const cleanup=original||phase==='refining'||/整理/.test(snapshot?.state?.message||'');
  return {active:true,title:cleanup?'文字已就绪，正在轻整理':'正在本机识别',detail:original?'可以直接复制文字，或修改后使用。':cleanup?'整理失败时保留完整原文。':'语音留在本机，请稍候。',step:cleanup?'cleanup':'recognition',cancelLabel:original?'结束整理':'取消'};
 }
 function duplicateWord(entries,word,id){
  if(typeof word!=='string')return null;const key=word.trim().normalize('NFKC').toLocaleLowerCase('en-US');
  return (Array.isArray(entries)?entries:[]).find(entry=>entry.id!==id&&entry.word.normalize('NFKC').toLocaleLowerCase('en-US')===key)||null;
 }
 function engineStatus(snapshot){return snapshot?.localEngine?.workerFound===false?'识别组件缺失':snapshot?.localEngine?.ready===true?'本地识别就绪':snapshot?.localEngine?.workerFound===true?'识别器待加载':'本地识别';}
 function errorMessage(error,fallback){
  let text=typeof error?.message==='string'?error.message:'';
  text=text.replace(/^Error invoking remote method '[^']+':\s*/,'').replace(/^Error:\s*/,'').split(/[\r\n]/,1)[0];
  if(/\bENOSPC\b/.test(text))return '磁盘空间不足。'+fallback;
  if(/\b(?:EACCES|EPERM)\b/.test(text))return '当前没有写入权限。'+fallback;
  if(/\bENOENT\b/.test(text))return '所需文件不存在。'+fallback;
  if(/\bEIO\b/.test(text))return '本地文件写入失败。'+fallback;
  if(/[\u3400-\u9fff]/.test(text)&&!/(?:[A-Za-z]:[\\/]|\bat\s|Error|Exception|remote method)/.test(text))return text.slice(0,200);
  return fallback;
 }
 function resultView(result,active=false,sessionId=null){
  if(!result)return {text:'',message:'',warning:false,metadata:'',characters:0,showShortcut:true};
  const text=typeof result.text==='string'?result.text:result.original||'',characters=Array.from(text).length;
  const warning=result.status!=='completed'||/整理未完成|无法|失败|越出|超出/.test(result.message||'');
  const message=active&&sessionId!==result.id?'正在处理新听写，上次结果仍保留。':result.source==='manual'?'已手动修改':result.source==='restored'?'已还原文字':active?(sessionId===result.id?'本次文字':'正在处理新听写，上次结果仍保留。'):warning?(result.message||'整理未完成，文字已保留。'):result.refined?'已轻整理':result.corrections?.length?'已纠正 '+result.corrections.length+' 处':'识别原文';
  const date=new Date(result.createdAt===null||result.createdAt===undefined||result.createdAt===''?NaN:result.createdAt),pad=n=>String(n).padStart(2,'0');
  const time=Number.isFinite(date.getTime())?date.getFullYear()+'.'+pad(date.getMonth()+1)+'.'+pad(date.getDate())+' / '+pad(date.getHours())+':'+pad(date.getMinutes()):'';
  return {text,message,warning:!active&&warning,characters,metadata:(time?time+' │ ':'')+characters.toLocaleString()+' 字符',showShortcut:false};
 }
 function acceleratorForKey(event){
  if(event.isComposing||event.repeat||['Control','Alt','Shift','Meta','AltGraph','Process','Unidentified'].includes(event.key))return null;
  const modifiers=[];if(event.ctrlKey)modifiers.push('Ctrl');if(event.altKey)modifiers.push('Alt');if(event.shiftKey)modifiers.push('Shift');if(event.metaKey)modifiers.push('Super');if(!modifiers.length)return null;
  const named={Enter:'Return',' ':'Space',Escape:'Escape',ArrowUp:'Up',ArrowDown:'Down',ArrowLeft:'Left',ArrowRight:'Right','+':'Plus'};
  const key=named[event.key]||(/^(?:[a-z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Tab|Backspace|Delete|Home|End|PageUp|PageDown)$/i.test(event.key)?event.key.length===1?event.key.toUpperCase():event.key:null);
  return key?[...modifiers,key].join('+'):null;
 }
 return {draftPatch,effectiveShortcut,captureView,sessionView,duplicateWord,engineStatus,errorMessage,resultView,acceleratorForKey};
});
