'use strict';
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./dictation-i18n'));else root.DictationUiState=factory(root.DictpinI18n);})(typeof globalThis!=='undefined'?globalThis:this,function(i18n){
 function draftPatch(before,after){
  const patch={},refiner={};
  for(const key of ['deviceId','shortcut','copyShortcut','autoPaste','appendMode','cleanupLevel','uiLanguage'])if(after[key]!==undefined&&after[key]!==before[key])patch[key]=after[key];
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
 function captureView(snapshot,language='zh-CN'){
  const t=key=>i18n.t(key,language);
  if(!snapshot)return {label:t('capture.connecting'),action:null,disabled:true,cancel:false};
  if(snapshot.state?.delivery?.status==='pending')return {label:t('capture.pasting'),action:null,disabled:true,cancel:false};
  const phase=snapshot?.state?.phase||'idle',active=['starting','recording','stopping','processing','transcribing','refining'].includes(phase);
  if(phase==='recording')return {label:t('capture.stop'),action:'stop',disabled:false,cancel:true};
  if(active)return {label:t(phase==='starting'?'capture.prepare':phase==='stopping'?'capture.finish':snapshot.state.stage==='cleanup'||phase==='refining'?'capture.cleanup':'capture.recognize'),action:null,disabled:true,cancel:true};
  if(snapshot?.localEngine?.workerFound===false)return {label:t('capture.unavailable'),action:null,disabled:true,cancel:false};
  return {label:t(phase==='error'?'capture.retry':'capture.start'),action:'start',disabled:false,cancel:false};
 }
 function sessionView(snapshot,language='zh-CN'){
  const t=(key,values)=>i18n.t(key,language,values);
  const phase=snapshot?.state?.phase,active=['starting','recording','stopping','processing','transcribing','refining'].includes(phase),original=active&&snapshot?.canUseOriginal===true;
  if(!active)return {active:false,title:'',detail:'',step:null,cancelLabel:'取消'};
  const base={active:true,cancelLabel:t('action.cancel'),useLocal:false};
  if(phase==='starting')return {...base,title:t('task.prepare'),detail:t('task.prepareDetail'),step:'recording'};
  if(phase==='recording')return {...base,title:t(snapshot.state?.pipeline?'task.stream':'task.record'),detail:snapshot.state?.pipeline?t('task.progress',{done:snapshot.state.pipeline.completed,pending:snapshot.state.pipeline.pending}):t('task.recordDetail'),step:'recording'};
  if(phase==='stopping')return {...base,title:t('task.stop'),detail:t('task.stopDetail'),step:'recording'};
  if(snapshot.state?.pipeline?.pending)return {...base,title:t('task.remaining'),detail:t('task.progress',{done:snapshot.state.pipeline.completed,pending:snapshot.state.pipeline.pending}),step:'recognition'};
  const cleanup=snapshot?.state?.stage==='cleanup'||phase==='refining';
  return {...base,title:t(cleanup?'task.cleanup':'task.local'),detail:t(original?'task.copyReady':'task.waitLocal'),step:cleanup?'cleanup':'recognition',useLocal:cleanup&&original};
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
 function cleanupWarning(result){return !!result&&(result.persistenceFailed===true||result.status==='failed'||result.status==='cancelled'||!['manual','restored'].includes(result.source)&&['failed','timeout'].includes(result.cleanupStatus));}
 function canRetryView(snapshot){const r=snapshot?.recentResult;return !!snapshot?.canRetryCleanup&&!!r&&!['manual','restored','appended'].includes(r.source)&&(['failed','timeout'].includes(r.cleanupStatus)||r.cleanupStatus===undefined&&r.refined!==true);}
 function recordingClock(snapshot,now=Date.now()){
  const s=snapshot?.state,visible=s?.phase==='recording'&&Number.isFinite(s.startedAt),limit=Number.isFinite(s?.recordingLimits?.maxDurationMs)?s.recordingLimits.maxDurationMs:1800000,elapsed=visible?Math.max(0,Math.min(limit,now-s.startedAt)):0,remaining=visible&&limit-elapsed<=120000,ms=remaining?limit-elapsed:elapsed,seconds=Math.max(0,Math.floor(ms/1000));
  return {visible,remaining,elapsedMs:elapsed,text:String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')};
 }
 function recoveryClock(recovery,now=Date.now()){const ms=recovery&&Number.isFinite(recovery.expiresAt)?Math.max(0,recovery.expiresAt-now):0;return {seconds:Math.ceil(ms/1000),expired:ms<=0};}
 function resultView(result,active=false,sessionId=null,language='zh-CN'){
  if(!result)return {text:'',message:'',warning:false,metadata:'',characters:0,showShortcut:true};
  const text=typeof result.text==='string'?result.text:result.original||'',characters=Array.from(text).length;
  const warning=cleanupWarning(result),t=(key,values)=>i18n.t(key,language,values);
  const message=t(active&&sessionId!==result.id?'result.previous':result.source==='manual'?'result.manual':result.source==='restored'?'result.restored':active?(result.cleanupStatus==='running'?'result.autoPending':'result.current'):result.persistenceFailed?'result.saveFailed':result.status==='failed'?'result.incomplete':result.status==='cancelled'?'result.cancelled':warning?'result.cleanupFailed':result.refined?'result.refined':result.corrections?.length?'result.corrected':result.cleanupStatus==='unavailable'?'result.localOnly':'result.original',{count:result.corrections?.length||0});
  const date=new Date(result.createdAt===null||result.createdAt===undefined||result.createdAt===''?NaN:result.createdAt),pad=n=>String(n).padStart(2,'0');
  const time=Number.isFinite(date.getTime())?date.getFullYear()+'.'+pad(date.getMonth()+1)+'.'+pad(date.getDate())+' / '+pad(date.getHours())+':'+pad(date.getMinutes()):'';
  return {text,message,warning:!active&&warning,characters,metadata:(time?time+' · ':'')+t('result.characters',{count:characters.toLocaleString()}),showShortcut:false};
 }
 function acceleratorForKey(event){
  if(event.isComposing||event.repeat||['Control','Alt','Shift','Meta','AltGraph','Process','Unidentified'].includes(event.key))return null;
  const modifiers=[];if(event.ctrlKey)modifiers.push('Ctrl');if(event.altKey)modifiers.push('Alt');if(event.shiftKey)modifiers.push('Shift');if(event.metaKey)modifiers.push('Super');if(!modifiers.length)return null;
  const named={Enter:'Return',' ':'Space',Escape:'Escape',ArrowUp:'Up',ArrowDown:'Down',ArrowLeft:'Left',ArrowRight:'Right','+':'Plus'};
  const key=named[event.key]||(/^(?:[a-z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Tab|Backspace|Delete|Home|End|PageUp|PageDown)$/i.test(event.key)?event.key.length===1?event.key.toUpperCase():event.key:null);
  return key?[...modifiers,key].join('+'):null;
 }
 return {draftPatch,effectiveShortcut,captureView,sessionView,duplicateWord,engineStatus,errorMessage,resultView,acceleratorForKey,cleanupWarning,canRetryView,recordingClock,recoveryClock};
});
