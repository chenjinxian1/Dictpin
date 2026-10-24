'use strict';
const {Controller:ProductController}=require('./dictation-controller');
const {SegmentPipeline}=require('./segment-pipeline');
const {correctText}=require('./local-dictionary');
const {randomUUID}=require('node:crypto');
const MAX_SESSION_MS=1800000;
const join=(a,b)=>!a?b:!b?a:a+(/[\u3400-\u9fff]$/.test(a)&&/^[\u3400-\u9fff]/.test(b)?'':' ')+b;
function inputObject(input,allowed){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!allowed.includes(key)))throw Error('听写操作无效。');}
class Controller extends ProductController{
 constructor(options){super(options);this.streamRecovery=null;this.tailPending=null;this.finishing=new WeakSet();this.startSource='ui';this.appendIntent=null;}
 async start(input={},source='ui'){
  inputObject(input,['discardRecoveryToken','appendTo','expectedRevision']);if(this.active())return{accepted:false,reason:'busy'};
  this.recoverySummary();if(this.tailPending&&!this.tailPending.queue.sealed)return{accepted:false,reason:'recovering'};
  let base=null;
  if(input.appendTo!==undefined){if(!Number.isSafeInteger(input.expectedRevision))throw Error('追加需要当前文字版本。');base=this.resultFor(input.appendTo,input.expectedRevision);}
  else if(this.store.settings.appendMode===true){const previous=this.state.result?.original?.trim()?this.state.result:this.store.getRecentResult?.();if(previous?.text?.trim())base=this.resultFor(previous.id,previous.revision||1);}
  this.appendIntent=base?structuredClone(base):null;this.startSource=source;
  try{return await super.start(input.discardRecoveryToken===undefined?{}:{discardRecoveryToken:input.discardRecoveryToken},source);}finally{this.appendIntent=null;this.startSource='ui';}
 }
 begin(prepared,...args){
  const s=super.begin(prepared,...args);s.origin=this.startSource;
  if(args[0]==='recording'){
   s.appendBase=this.appendIntent;s.recordingLimits={...s.recordingLimits,segmented:true,maxDurationMs:MAX_SESSION_MS,stopAfterMs:MAX_SESSION_MS-1000};
   s.original='';s.corrected='';s.text='';s.corrections=[];s.revision=1;s.previousText=null;this.attachPipeline(s);
  }
  return s;
 }
 attachPipeline(s,queue){
  if(!queue){let q;q=new SegmentPipeline({sessionId:s.id,recognize:(audio,options)=>this.localAsr.transcribe(audio,options),
   onText:(text,packet)=>{const current=this.session;if(current?.pipeline===q&&this.currentSession(current))this.segmentText(current,text,packet);},
   onProgress:summary=>{if(this.session?.pipeline===q&&this.currentSession(this.session))this.publish({pipeline:summary});},
   onFailure:error=>{if(this.session?.pipeline===q)this.streamFail(this.session,error?.message||'本段识别失败。');},
   onBackpressure:()=>{if(this.session?.pipeline===q&&this.state.phase==='recording'){this.publish({operationFeedback:'识别暂时跟不上，正在结束录音并保留已接收片段。'});this.stop('backpressure');}},
   onDrain:()=>{const current=this.session;if(current?.pipeline===q&&this.currentSession(current))this.drainStream(current);}
  });queue=q;}
  s.pipeline=queue;return queue;
 }
 segmentText(s,text){
  const before=s.original,separator=join(before,text).length-before.length-text.length,original=join(before,text),correction=correctText(text,s.config.dictionary),corrected=join(s.corrected,correction.text),changes=[...s.corrections,...correction.changes.map(c=>({...c,start:c.start+before.length+separator,end:c.end+before.length+separator}))];
  if(original.length+(s.appendBase?.original?.length||0)+(s.appendBase?.original?1:0)>100000||corrected.length+(s.appendBase?.text?.length||0)+(s.appendBase?.text?1:0)>100000||changes.length+(s.appendBase?.corrections?.length||0)>1000)throw Error('本次文字已达到资源保护上限，已完成文字保留，剩余片段可恢复。');
  Object.assign(s,{original,corrected,text:corrected,corrections:changes,source:changes.length?'dictionary':'original',revision:s.revision+1,durationMs:s.pipeline.totalSamples/16});
  const checkpoint=this.result(s,'cancelled',{message:'录音尚未结束，已识别文字已保留。'});this.saveResult(s,checkpoint);
  this.publish({result:this.result(s,'processing'),pipeline:s.pipeline.summary(),message:this.state.phase==='recording'?'正在录音，文字逐段就绪。':'正在完成剩余片段。'});
 }
 result(s,status,extra={}){
  const r=super.result(s,status,extra);if(!s.pipeline)return r;
  r.segmentCount=s.pipeline.completed;r.segmented=true;r.sampleCount=s.pipeline.totalSamples;r.deliveryText=r.text;r.deliveryAllowed=s.userStopped===true;
  if(status==='completed'&&!r.deliveryAllowed)r.message=[r.message,'录音已因资源保护停止，请检查文字后手动复制。'].filter(Boolean).join(' ');
  if(s.appendBase){
   const base=s.appendBase,rawPrefix=(base.original||'')+(base.original&&r.original?'\n':''),textPrefix=(base.text||'')+(base.text&&r.text?'\n':'');
   if(textPrefix.length+r.text.length>100000){r.text=s.corrected;r.refined=false;r.deliveryText=s.corrected;r.message='轻整理超出追加后的文字上限，已保留本地纠正稿。';}
   r.original=rawPrefix+r.original;r.corrected=textPrefix+r.corrected;r.text=textPrefix+r.text;r.previousText=base.text;r.source='appended';r.durationMs=Math.min(86400000,(base.durationMs||0)+r.durationMs);
   r.corrections=[...(base.corrections||[]),...r.corrections.map(c=>({...c,start:c.start+rawPrefix.length,end:c.end+rawPrefix.length}))];r.deliveryText=r.deliveryText?textPrefix?'\n'+r.deliveryText:r.deliveryText:'';
  }
  return r;
 }
 recordingReady(input){const result=super.recordingReady(input);if(result.accepted&&this.session?.pipeline){clearTimeout(this.recordTimer);this.recordTimer=setTimeout(()=>{if(this.current(input.sessionId))this.stop('limit');},this.session.recordingLimits.stopAfterMs);this.recordTimer.unref?.();this.publish({pipeline:this.session.pipeline.summary()});}return result;}
 stop(reason='user'){const s=this.session;if(!s?.pipeline)return super.stop();const before=s.userStopped;s.userStopped=reason==='user';const accepted=super.stop();if(!accepted)s.userStopped=before;return accepted;}
 submitSegment(input){
  const s=this.session?.id===input?.sessionId?this.session:this.tailPending?.session.id===input?.sessionId?this.tailPending.session:null;
  if(!s?.pipeline||!['recording','stopping'].includes(this.state.phase)&&this.session===s&&!this.tailPending)return{accepted:false,reason:'stale'};
  const accepted=s.pipeline.enqueue(input);if(accepted.accepted)s.durationMs=s.pipeline.totalSamples/16;return accepted;
 }
 sealSegments(input){
  const s=this.session?.id===input?.sessionId?this.session:this.tailPending?.session.id===input?.sessionId?this.tailPending.session:null;
  if(!s?.pipeline){const r=this.state.result;return{accepted:!!r?.segmented&&r.id===input?.sessionId&&r.sampleCount===input?.startSample&&r.segmentCount===input?.sequence,settled:true};}
  if(this.session===s&&this.state.phase==='recording')this.stop('producer');
  clearTimeout(this.stopTimer);this.stopTimer=null;
  if(this.session===s)this.publish({phase:'processing',message:'正在完成剩余片段。',level:0});
  const accepted=s.pipeline.seal(input);if(accepted.accepted){s.durationMs=s.pipeline.totalSamples/16;if(this.tailPending?.session===s){clearTimeout(this.tailTimer);this.tailPending=null;this.publish({});}}return accepted;
 }
 drainStream(s){
  if(this.finishing.has(s))return;
  if(!s.original.trim()){s.pipeline.restoreLastSilent();this.streamFail(s,'未检测到可识别的语音，已完成文字仍保留。');return;}
  this.finishing.add(s);this.clearTimers();s.durationMs=s.pipeline.totalSamples/16;
  void super.finishText(s).catch(error=>{if(this.currentSession(s))this.streamFail(s,error?.message||'文字收尾失败。');}).finally(()=>{s.pipeline.dispose();if(!this.active())this.publish({pipeline:null});});
 }
 freezeResult(id,revision){if(this.session?.pipeline&&this.session.id===id&&(!this.session.pipeline.sealed||this.session.pipeline.summary().pending))throw Error('请先结束录音并等待剩余片段完成。');return super.freezeResult(id,revision);}
 canRetryCleanup(result){return result?.source!=='appended'&&super.canRetryCleanup(result);}
 retainTail(s){
  if(s.pipeline.sealed)return;this.tailPending={session:s,queue:s.pipeline};clearTimeout(this.tailTimer);
  this.tailTimer=setTimeout(()=>{if(this.tailPending?.session!==s)return;this.tailPending=null;s.pipeline.seal({sessionId:s.pipeline.sessionId,sequence:s.pipeline.sequence,startSample:s.pipeline.totalSamples});this.publish({message:'录音尾段未确认，已接收片段与识别文字仍保留。'});},5000);this.tailTimer.unref?.();
 }
 keepStreamRecovery(s,reason){
  const expiresAt=this.now()+(reason==='cancelled'?30000:300000);
  this.streamRecovery={token:randomUUID(),queue:s.pipeline,session:s,expiresAt,expiresMono:this.monotonicNow()+(reason==='cancelled'?30000:300000),reason};s.keys={};clearTimeout(this.streamRecoveryTimer);
  this.streamRecoveryTimer=setTimeout(()=>{this.recoverySummary();this.publish({});},Math.max(1,expiresAt-this.now()));this.streamRecoveryTimer.unref?.();
 }
 streamFail(s,message){
  if(this.session!==s)return;void s.pipeline.pause();this.clearTimers();s.abort.abort();this.performanceFinish(s,'failed');this.retainTail(s);this.keepStreamRecovery(s,'recognition-failed');
  const r=this.result(s,'failed',{message:message+' 已完成文字保留；未处理片段只在内存保留5分钟，须主动重试。',text:s.text,delivery:'none'});this.saveResult(s,r);this.session=null;
  this.publish({phase:'error',sessionId:null,result:r,pipeline:null,message:r.message,level:0});this.emit('command',{type:'stop',sessionId:s.id});
 }
 fail(id,message,errorCode){if(this.session?.pipeline&&this.session.id===id&&!this.finishing.has(this.session))return this.streamFail(this.session,message);return super.fail(id,message,errorCode);}
 cancel(){
  const s=this.session;if(!s?.pipeline||this.finishing.has(s))return super.cancel();
  void s.pipeline.pause();if(!s.pipeline.summary().pending&&!s.original.trim())s.pipeline.restoreLastSilent();this.clearTimers();s.abort.abort();this.performanceFinish(s,'cancelled');this.retainTail(s);this.keepStreamRecovery(s,'cancelled');
  const r=this.result(s,'cancelled',{message:'已取消；已完成文字保留，未处理片段仅在内存保留30秒。',text:s.text,delivery:'none'});this.saveResult(s,r);this.session=null;
  this.publish({phase:'cancelled',sessionId:null,result:r,pipeline:null,message:r.message,level:0});this.emit('command',{type:'cancel-retain',sessionId:s.id});return true;
 }
 recoverySummary(){
  const slot=this.streamRecovery;if(slot&&(this.now()>=slot.expiresAt||this.monotonicNow()>=slot.expiresMono))this.clearRecovery();
  const current=this.streamRecovery;if(!current)return super.recoverySummary();
  const summary=current.queue.summary();if(!summary.pending)return null;
  return{token:current.token,sessionId:current.session.id,mode:'dictate',durationMs:current.queue.pending.reduce((n,p)=>n+p.frames/16,0),audioBytes:current.queue.pending.reduce((n,p)=>n+p.pcm.byteLength,0),expiresAt:current.expiresAt,reason:current.reason,segments:summary.pending,tailPending:!!this.tailPending};
 }
 clearRecovery(){
  super.clearRecovery();clearTimeout(this.streamRecoveryTimer);if(this.streamRecovery){const q=this.streamRecovery.queue;this.streamRecovery=null;q.dispose();if(this.tailPending?.queue===q){this.tailPending=null;clearTimeout(this.tailTimer);}}
 }
 async retryRecovery(token){
  const summary=this.recoverySummary();if(!this.streamRecovery)return super.retryRecovery(token);
  if(this.active()||!summary||token!==summary.token||this.tailPending)return{accepted:false};
  const slot=this.streamRecovery;await slot.queue.pause();if(this.streamRecovery!==slot||!this.recoverySummary())return{accepted:false};
  this.streamRecovery=null;clearTimeout(this.streamRecoveryTimer);this.recoveryAttempt=true;let s;
  try{const prepared=this.prepare({});this.requireKeys(prepared,{asr:false});s=this.begin(prepared,'retry');}finally{this.recoveryAttempt=false;}
  const old=slot.session;Object.assign(s,{original:old.original,corrected:old.corrected,text:old.text,corrections:old.corrections,revision:old.revision,source:old.source,previousText:old.previousText,appendBase:old.appendBase,createdAt:old.createdAt,durationMs:old.durationMs,origin:'recovery'});this.attachPipeline(s,slot.queue);
  this.publish({phase:'processing',sessionId:s.id,result:this.result(s,'processing'),pipeline:slot.queue.summary(),message:'正在本机恢复剩余片段；不会调用轻整理。',level:0});
  if(!this.currentSession(s))return{accepted:false};
  // A retry acknowledges this attempt. Completion/failure arrives through state; the lifetime
  // queue promise deliberately survives another failure and must not hold an IPC reply open.
  void slot.queue.resume(s.id).catch(error=>{if(this.currentSession(s))this.streamFail(s,error?.message||'恢复识别失败。');});return{accepted:true};
 }
 dispose(){const q=this.session?.pipeline;super.dispose();q?.dispose();this.clearRecovery();clearTimeout(this.tailTimer);this.tailPending=null;}
}
module.exports={Controller,MAX_SESSION_MS};
