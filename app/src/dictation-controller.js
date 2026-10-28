'use strict';
const {Controller:Engine}=require('./controller');
const {validateSettings,DEFAULTS,resolveProviderEndpoint}=require('./settings');
const {correctText}=require('./local-dictionary');
const {validatedText}=require('./api');
const DURATION_KEYS=['deviceReadyMs','recordingStopMs','decodeMs','beginToDeviceReadyMs','stopToSubmitMs','asrWaitMs','recognitionMs','modelLoadMs','vadMs','asrElapsedMs','asrWallMs','dictionaryMs','cleanupMs','textReadyMs','totalMs'];
const duration=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=600000?value:null;
function captureTimings(value){
 if(value===undefined)return null;
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('录音计时数据无效。');
 const result={};for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!['deviceReadyMs','recordingStopMs','decodeMs'].includes(key)||!Object.hasOwn(d,'value')||duration(d.value)===null)throw Error('录音计时字段无效。');result[key]=d.value;}return result;
}
function operation(options={}){
 if(!options||typeof options!=='object'||Array.isArray(options)||![Object.prototype,null].includes(Object.getPrototypeOf(options)))throw Error('听写操作无效。');
 for(const [key,descriptor]of Object.entries(Object.getOwnPropertyDescriptors(options)))if(!Object.hasOwn(descriptor,'value')||!['mode','context','task','targetLanguage'].includes(key))throw Error('此版本仅支持听写。');
 if(options.mode!==undefined&&options.mode!=='dictate')throw Error('Ask、翻译及其他任务已停用。');
 if(options.context||options.task)throw Error('此版本不执行上下文或文字任务。');
 return {mode:'dictate',context:'',task:undefined};
}
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;}
function request(input,keys){if(!input||typeof input!=='object'||Array.isArray(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input)))throw Error('结果操作无效。');for(const key of Reflect.ownKeys(input)){const d=Object.getOwnPropertyDescriptor(input,key);if(typeof key!=='string'||!keys.includes(key)||!Object.hasOwn(d,'value'))throw Error('结果操作字段无效。');}return input;}
function body(text){if(typeof text!=='string'||text.length>100000||/\0/.test(text))throw Error('文字内容无效或过长。');return text;}
class Controller extends Engine{
 constructor(options){super({...options,apiImpl:options.apiImpl||{...require('./api'),refine:require('./dictation-edit').refine}});this.cleanupTimeoutMs=Math.min(12000,Math.max(1,options.cleanupTimeoutMs||12000));this.pendingCancelled=null;this.recoveryAttempt=false;this.performanceRecords=[];this.performanceSlots=new WeakMap();this.state={...this.state,stage:'idle',cleanupStatus:'off'};}
 publish(update){const phase=update.phase||this.state.phase,cleanupStatus=this.session?.cleanupStatus||update.result?.cleanupStatus||(update.phase==='starting'?'pending':this.state.cleanupStatus)||'off';const stage=phase==='processing'?(cleanupStatus==='running'?'cleanup':'recognition'):({starting:'preparing',recording:'recording',stopping:'stopping',transcribing:'recognition',refining:'cleanup'})[phase]||phase;return super.publish({...update,stage,cleanupStatus});}
 getPerformanceRecords(){return structuredClone(this.performanceRecords);}
 performanceSlot(session=this.session){return session?this.performanceSlots.get(session):null;}
 performanceStart(s){const threads=this.localAsr?.numThreads,record={id:s.id,status:'starting',audioBytes:null,threads:Number.isSafeInteger(threads)&&threads>=1&&threads<=64?threads:null,durations:Object.fromEntries(DURATION_KEYS.map(key=>[key,null]))};this.performanceRecords.push(record);if(this.performanceRecords.length>100)this.performanceRecords.shift();this.performanceSlots.set(s,{record,startedAt:this.monotonicNow(),stoppedAt:null});}
 elapsed(start){return start===null||start===undefined?null:duration(this.monotonicNow()-start);}
 performanceFinish(s,status){const slot=this.performanceSlot(s);if(slot){slot.record.status=status;slot.record.durations.totalMs=this.elapsed(slot.startedAt);}}
 performanceAudio(s,audio){const slot=this.performanceSlot(s);if(!slot)return;slot.record.audioBytes=audio.bytes.byteLength;slot.record.durations.stopToSubmitMs=this.elapsed(slot.stoppedAt);if(audio.timings)Object.assign(slot.record.durations,audio.timings);}
 performanceAsr(s){const slot=this.performanceSlot(s),metrics=this.localAsr?.lastResult;if(!slot||!metrics)return;const keys={asrWaitMs:'waitReadyMs',recognitionMs:'asrMs',modelLoadMs:'loadMs',vadMs:'vadMs',asrElapsedMs:'elapsedMs'};for(const [to,from]of Object.entries(keys))slot.record.durations[to]=duration(metrics[from]);if(Number.isSafeInteger(metrics.threads)&&metrics.threads>=1&&metrics.threads<=64)slot.record.threads=metrics.threads;}
 validAudio(audio,config){const timings=captureTimings(audio?.timings),valid=super.validAudio(audio,config);return timings?{...valid,timings}:valid;}
 recordingReady(input){const s=this.session,result=super.recordingReady(input),slot=this.performanceSlot(s);if(result.accepted&&slot){slot.record.status='recording';slot.record.durations.beginToDeviceReadyMs=this.elapsed(slot.startedAt);}return result;}
 stopRecording(intent){const s=this.session,slot=this.performanceSlot(s),before=slot&&{at:slot.stoppedAt,status:slot.record.status};if(slot){slot.stoppedAt=this.monotonicNow();slot.record.status='stopping';}const accepted=super.stopRecording(intent);if(!accepted&&slot){slot.stoppedAt=before.at;slot.record.status=before.status;}return accepted;}
 async submitAudio(input){if(this.current(input?.sessionId)&&this.state.phase==='stopping'&&!this.session.submitted){try{this.performanceAudio(this.session,this.validAudio(input));}catch{/* The established audio validator reports this failure without invoking ASR. */}}return super.submitAudio(input);}
 async runAudio(s,audio){
  if(s.completionIntent==='retain'||!this.currentSession(s))return {accepted:false};const slot=this.performanceSlot(s),start=this.monotonicNow();if(slot)slot.record.status='recognizing';
  try{if(!this.localAsr)throw Error('本地识别器未安装；未上传或切换到云端。');const original=await this.localAsr.transcribe(audio,{signal:s.abort.signal});if(slot)slot.record.durations.asrWallMs=this.elapsed(start);if(!this.currentSession(s))return {accepted:true};this.performanceAsr(s);s.original=validatedText(original,'语音识别');return await this.finishText(s);}
  catch(error){if(slot&&slot.record.durations.asrWallMs===null)slot.record.durations.asrWallMs=this.elapsed(start);if(this.currentSession(s)){this.performanceAsr(s);this.fail(s.id,error.message||'本地处理失败，未自动重试。',error.code);}return {accepted:true};}
 }
 fail(id,message,errorCode){if(this.current(id))this.performanceFinish(this.session,'failed');return super.fail(id,message,errorCode);}
 rejectDisabled(message){return this.active()?{accepted:false,message}:this.rejected(Error(message));}
 async toggle(source='ui',options={}){
  try{operation(options);}catch(error){return this.rejectDisabled(error.message);}
  if(this.active()){
   if(!['starting','recording'].includes(this.state.phase)){this.publish({operationFeedback:'本段正在处理，请稍候；原文就绪后可立即复制。'});return {accepted:false,reason:'busy'};}
   return super.toggle(source,options);
  }
  return this.start({},source);
 }
 async start(input={},source='ui'){
  request(input,['discardRecoveryToken']);if(this.active())return {accepted:false,reason:'busy'};
  if(this.pendingCancelled&&this.now()<this.pendingCancelled.expiresAt)return {accepted:false,reason:'recovering'};
  const recovery=this.recoverySummary();
  if(recovery){if(input.discardRecoveryToken!==recovery.token)return {accepted:false,reason:'recovery',recovery};this.discardRecovery(recovery.token);}
  else if(input.discardRecoveryToken!==undefined)return {accepted:false,reason:'recovery'};
  return super.toggle(source,{});
 }
 prepare(options={}){
  const op=operation(options),raw=this.store.settings,service=this.store.activeService?.();
  const metadata={};for(const field of ['id','presetId','region','workspaceId','baseUrl','endpointMode','model','customized'])if(service&&Object.hasOwn(service,field))metadata[field]=service[field];
  const selected={...raw.refiner,...metadata};let valid=false,credentials=false;
  try{const resolved=resolveProviderEndpoint(selected.baseUrl,'refiner',undefined,selected.endpointMode);valid=typeof selected.model==='string'&&!!selected.model.trim()&&selected.model.length<=160&&!/[\x00-\x1f]/.test(selected.model);credentials=resolved.local||!!this.store.keys?.refiner;}catch{}
  const enabled=raw.refiner.enabled===true&&valid&&credentials&&!this.recoveryAttempt;
  const config=validateSettings({...raw,refiner:valid?{...selected,enabled}:{...DEFAULTS.refiner,enabled:false}});
  if(valid)Object.assign(config.refiner,metadata);config.refiner.enabled=enabled;
  if(raw.refiner.enabled&&!enabled&&!this.recoveryAttempt)config.cleanupNotice='本次使用本地文字，模型连接待配置。';
  config.mode='dictate';config.asr={...config.asr,backend:'local'};config.saveAudio=false;config.saveHistory=false;config.writingPreferences='';config.dictionaryPromptEnabled=true;config.refiner={...config.refiner,citationFormat:'none',...(this.recoveryAttempt?{enabled:false}:{})};
  config.dictionary=Array.isArray(this.store.dictionary)?this.store.dictionary.slice(0,500).map(e=>({id:e.id,source:'manual',word:e.word,replacement:'',aliases:[...(e.aliases||[])]})):[];
  return {config,keys:{...this.store.keys},...op};
 }
 begin(prepared,...args){
  if(prepared?.mode!=='dictate'||prepared?.config?.asr?.backend!=='local'||prepared.context||prepared.task)throw Error('不允许执行旧任务。');
  this.pendingCancelled=null;const s=super.begin(prepared,...args);s.cleanupStatus=s.config.cleanupNotice?'unavailable':s.config.refiner.enabled?'pending':'off';this.performanceStart(s);freeze(s.config);freeze(s.keys);
  if(s.config.cleanupNotice)s.storageWarnings.push(s.config.cleanupNotice);
  if(args[0]==='recording')try{Promise.resolve(this.localAsr?.ensureReady?.()).catch(()=>{});}catch{}
  return s;
 }
 currentSession(s){return this.session===s&&this.current(s?.id);}
 result(s,status,extra={}){return {...super.result(s,status,extra),corrected:s.corrected??s.original,revision:s.revision||1,source:s.source||(s.refined?'refined':'original'),corrections:structuredClone(s.corrections||[]),previousText:s.previousText??null,cleanupStatus:s.cleanupStatus||'off',persistenceFailed:s.persistenceFailed===true};}
 saveResult(session,result){
  result.persistenceFailed=false;
  result.message=[result.message,...(session.storageWarnings||[])].filter(Boolean).join(' ');
  if(String(result.text||result.original||'').trim()&&['completed','failed','cancelled'].includes(result.status)&&typeof this.store.saveRecentResult==='function'){
   let saved=false;try{this.store.saveRecentResult(result);saved=true;}catch{result.persistenceFailed=true;result.message=[result.message,'识别原文暂未保存到磁盘；最近结果保存失败，请复制当前文字后再退出。'].filter(Boolean).join(' ');}if(saved)this.emit('result-saved',{id:result.id,revision:result.revision||1});
  }
  session.persistenceFailed=result.persistenceFailed;return result;
 }
 async finishText(s){
  if(s?.mode!=='dictate'||s?.config?.asr?.backend!=='local'||s.context||s.task)return this.rejected(Error('旧任务已停用。'));
  if(!this.currentSession(s))return {accepted:true};
  const slot=this.performanceSlot(s);
  if(s.corrected===undefined){const started=this.monotonicNow(),correction=correctText(s.original,s.config.dictionary);if(slot)slot.record.durations.dictionaryMs=this.elapsed(started);s.corrected=correction.text;s.corrections=correction.changes;s.text=s.corrected;s.source=s.corrections.length?'dictionary':'original';s.revision=1;}
  this.clearRecovery();
  s.cleanupStatus=s.config.refiner.enabled?'running':s.config.cleanupNotice?'unavailable':'off';
  const checkpoint=this.saveResult(s,this.result(s,'cancelled',{text:s.text,delivery:'none',message:'整理未完成，完整识别原文与当前文字已保留。'}));
  if(slot)slot.record.durations.textReadyMs=this.elapsed(slot.startedAt);
  this.publish({phase:'processing',result:this.result(s,'processing'),message:s.config.refiner.enabled?'原始文本已保留，正在整理文字…':'识别已完成。',operationFeedback:''});
  if(!this.currentSession(s))return {accepted:true};
  let warning=checkpoint.persistenceFailed?checkpoint.message:'',timer,abortHandler,cleanupFailed=false;
  if(s.config.refiner.enabled){
   const cleanupStarted=this.monotonicNow();if(slot)slot.record.status='refining';
   const cleanup=new AbortController(),signal=AbortSignal.any([s.abort.signal,cleanup.signal]);
   const deadline=new Promise((_resolve,reject)=>{abortHandler=()=>reject(Object.assign(Error(cleanup.signal.aborted&&!s.abort.signal.aborted?'轻整理超时，已保留当前文字。':'整理已结束。'),{code:'cancelled'}));signal.addEventListener('abort',abortHandler,{once:true});timer=setTimeout(()=>cleanup.abort(),this.cleanupTimeoutMs);});
   try{
    const text=await Promise.race([Promise.resolve().then(()=>this.api.refine(s.corrected,s.config,s.keys.refiner,{signal,onUsage:this.usageObserver(s,'refiner')})),deadline]);
    if(!this.currentSession(s))return {accepted:true};body(text);if(!text.trim())throw Error('轻整理没有返回文字。');
    if(text!==s.text||s.source!=='refined'){s.previousText=s.text;s.revision++;}s.text=text;s.refined=true;s.source='refined';s.cleanupStatus='completed';
   }catch(error){if(!this.currentSession(s))return {accepted:true};cleanupFailed=true;s.cleanupStatus=cleanup.signal.aborted&&!s.abort.signal.aborted||error?.code==='timeout'?'timeout':'failed';warning=[warning,'整理未完成，已保留原始转录与当前文字。',error?.message||''].filter(Boolean).join(' ');}
   finally{if(slot)slot.record.durations.cleanupMs=this.elapsed(cleanupStarted);clearTimeout(timer);signal.removeEventListener('abort',abortHandler);}
  }
  if(!this.currentSession(s))return {accepted:true};
  const result=this.saveResult(s,this.result(s,'completed',{delivery:'fallback',message:warning||(!s.config.refiner.enabled?'识别完成，可编辑后复制。':'')}));
  this.performanceFinish(s,cleanupFailed?'fallback':'completed');this.session=null;this.publish({phase:'done',sessionId:null,result,message:result.message,level:0,operationFeedback:''});return {accepted:true};
 }
 resultFor(id,revision){
  if(typeof id!=='string'||!id||id.length>128)throw Error('结果标识无效。');
  if(this.active()&&this.state.result?.original?.trim()&&this.state.result.id!==id)throw Error('结果已变化，请重新查看。');
  const result=[this.state.result,this.store.getRecentResult?.()].find(r=>r?.id===id&&typeof r.original==='string'&&String(r.original||r.text||'').trim());if(!result)throw Error('结果已变化，请重新查看。');
  const normalized={...result,corrected:result.corrected??result.original,revision:result.revision||1,source:result.source||(result.refined?'refined':'original'),corrections:result.corrections||[],previousText:result.previousText??null};
  if(revision!==undefined&&(!Number.isSafeInteger(revision)||revision!==normalized.revision))throw Error('文字版本已变化，请重新查看。');return normalized;
 }
 freezeResult(id,revision){
  const result=this.resultFor(id,revision);
  if(this.active()&&this.session?.id===id){const s=this.session;s.abort.abort();this.clearTimers();this.clearRecovery();this.performanceFinish(s,'completed');this.session=null;result.status='completed';result.cleanupStatus='stopped';result.message='整理已结束，当前文字已保留。';this.saveResult(s,result);this.publish({phase:'done',sessionId:null,result,message:result.message,level:0});}
  return result;
 }
 commitText(result,text,source){
  const unchanged=result.text===text&&result.source===source;
  const changed={...result,status:'completed',text:body(text),previousText:unchanged?result.previousText:result.text,revision:result.revision+(unchanged?0:1),source,refined:source==='refined',message:''};
  this.saveResult({storageWarnings:[]},changed);
  if(!this.active()||this.session?.id===result.id)this.publish({result:changed,message:changed.message});else this.publish({});
  if(changed.persistenceFailed)throw Error('修改尚未保存到磁盘，当前文字仍在，请重试或先复制。');
  return changed;
 }
 updateResult(input){request(input,['id','expectedRevision','text','editing']);if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1)throw Error('缺少有效文字版本。');if(typeof input.editing!=='undefined'&&input.editing!==true)throw Error('编辑操作无效。');body(input.text);const result=this.freezeResult(input.id,input.expectedRevision);return this.commitText(result,input.text,'manual');}
 restoreResult(input){request(input,['id','expectedRevision','source']);if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1)throw Error('缺少有效文字版本。');if(!['original','corrected','previous'].includes(input.source))throw Error('还原来源无效。');const result=this.freezeResult(input.id,input.expectedRevision),text=input.source==='previous'?result.previousText:result[input.source];if(typeof text!=='string')throw Error('没有可还原的文字。');return this.commitText(result,text,'restored');}
 canRetryCleanup(result=this.state.result||this.store.getRecentResult?.()){if(this.active()||!result?.original?.trim())return false;try{return this.prepare().config.refiner.enabled===true;}catch{return false;}}
 async retryCleanup(input){
  request(input,['id','expectedRevision']);if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1)throw Error('缺少有效文字版本。');if(this.active())throw Error('请先结束当前任务。');const old=this.resultFor(input.id,input.expectedRevision);if(!this.canRetryCleanup(old))throw Error('请先配置并启用轻整理。');
  const prepared=this.prepare({});this.requireKeys(prepared,{asr:false});const s=this.begin(prepared,'cleanup');Object.assign(s,{original:old.original,corrected:old.corrected,corrections:old.corrections,text:old.text,source:old.source,revision:old.revision,previousText:old.text,createdAt:old.createdAt,durationMs:old.durationMs});
  s.id=old.id;const slot=this.performanceSlot(s);if(slot)slot.record.id=s.id;this.publish({phase:'processing',sessionId:s.id,result:this.result(s,'processing'),message:'正在重试整理，可能计费。'});return this.finishText(s);
 }
 cancel(){
  if(!this.active())return false;const s=this.session;if(!s)return false;
  if(s.original?.trim()){this.freezeResult(s.id);return true;}
  const phase=this.state.phase,id=s.id,slot=this.performanceSlot(s);if(slot&&slot.stoppedAt===null)slot.stoppedAt=this.monotonicNow();s.abort.abort();this.clearTimers();this.performanceFinish(s,'cancelled');
  if(phase==='recording'||phase==='stopping'){
   this.clearRecovery();this.pendingCancelled={id,session:s,expiresAt:this.now()+30000};clearTimeout(this.cancelledCaptureTimer);this.cancelledCaptureTimer=setTimeout(()=>{if(this.pendingCancelled?.id===id){this.pendingCancelled=null;this.publish({message:'已取消；完整录音未能保留，请重新录音。'});}},30000);this.cancelledCaptureTimer.unref?.();this.emit('command',{type:'cancel-retain',sessionId:id});
  }else{this.restrictRecovery(id,{ttlMs:30000,reason:'cancelled'});this.offerRecovery(id);this.emit('command',{type:'cancel',sessionId:id});}
  this.session=null;this.publish({phase:'cancelled',sessionId:null,result:null,message:phase==='recording'||phase==='stopping'?'已取消，正在保留本段临时录音。':'已取消。',level:0});return true;
 }
 submitCancelledAudio(input){
  const pending=this.pendingCancelled;if(!pending||input?.sessionId!==pending.id||this.active()||this.now()>=pending.expiresAt)return {accepted:false};this.pendingCancelled=null;clearTimeout(this.cancelledCaptureTimer);
  let valid;try{valid=this.validAudio(input,pending.session.config);}catch{return {accepted:false};}this.performanceAudio(pending.session,valid);this.performanceFinish(pending.session,'cancelled');
  this.stageRecovery(pending.session,valid,{ttlMs:30000,reason:'cancelled'});this.offerRecovery(pending.id);this.publish({message:'已取消；本段仅在内存保留30秒，可主动恢复识别。'});return {accepted:true};
 }
 async retryRecovery(token){this.recoveryAttempt=true;try{return await super.retryRecovery(token);}finally{this.recoveryAttempt=false;}}
 dispose(){
  this.pendingCancelled=null;clearTimeout(this.cancelledCaptureTimer);const session=this.session,preserve=!this.disposed&&this.active()&&session?.original?.trim();if(this.active())this.performanceFinish(session,'cancelled');super.dispose();
  if(preserve){const result=this.saveResult(session,this.result(session,'cancelled',{text:session.text||session.corrected||session.original,refined:false,delivery:'none',errorCode:'cancelled',message:'应用已关闭，整理已取消；完整识别原文与当前文字已保留。'}));this.publish({phase:'cancelled',sessionId:null,result,message:result.message,level:0});}
 }
 async processText(){return this.rejectDisabled('手动文字、Ask、翻译及扩写任务已停用。');}
 async retryHistory(){return this.rejectDisabled('旧记录只保留查看，不再执行旧任务或重试上传。');}
 setSessionTarget(){return {accepted:false};}
 async retainRecording(){return {accepted:false};}
 canRetainRecording(){return false;}
}
module.exports={Controller,operation};
