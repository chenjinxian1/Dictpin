'use strict';
const {performance}=require('node:perf_hooks');
const {pcmBytes}=require('./local-asr');
const {recordingLimits}=require('../renderer/provider-endpoint');
const {validateMetadata}=require('./source-citations');
const {EventEmitter}=require('node:events');const {randomUUID}=require('node:crypto');const api=require('./api');
const {validateSettings,validateOperation,languageCode,MAX_RECORDING_MS}=require('./settings');
const {planDelivery,deliveryMessage}=require('./delivery-planner');
const ACTIVE=new Set(['starting','recording','stopping','processing','delivering']);
const ERROR_CODES=new Set(['http','size','format','empty','network','timeout','cancelled','recording','processing']);
class Controller extends EventEmitter {
  // This slot is intentionally private: snapshots/history never receive audio or cached credentials.
  #recovery=null;
  constructor({store,bridge,localAsr=null,apiImpl=api,now=()=>Date.now(),maxRecordingMs=MAX_RECORDING_MS,monotonicNow=()=>performance.now(),stopTimeoutMs=15000,readyTimeoutMs=30000,recoveryTtlMs=300000}){
    super();this.store=store;this.bridge=bridge;this.localAsr=localAsr;this.api=apiImpl;this.now=now;this.monotonicNow=monotonicNow;
    this.maxRecordingMs=Math.min(MAX_RECORDING_MS,Math.max(1,Number(maxRecordingMs)||MAX_RECORDING_MS));this.stopTimeoutMs=stopTimeoutMs;
    this.readyTimeoutMs=Math.min(30000,Math.max(1,Number(readyTimeoutMs)||30000));
    this.recoveryTtlMs=Math.min(300000,Math.max(1,Number(recoveryTtlMs)||300000));
    this.state={phase:'idle',sessionId:null,message:'准备好，把想法说出来。',level:0,retaining:false};this.session=null;this.disposed=false;
  }
  active(){return ACTIVE.has(this.state.phase);}
  publish(update){const config=this.session?.config;this.state={...this.state,...(config?{recordingLimits:this.session.recordingLimits,mode:this.session.mode,task:this.session.task,targetLanguage:config.targetLanguage,targetLanguages:[...config.targetLanguages]}:{}),...update};this.state.retaining=this.state.phase==='stopping'&&this.session?.completionIntent==='retain';if(!['starting','recording'].includes(this.state.phase))this.state.languageError=null;this.emit('state',this.state);}
  current(id){return typeof id==='string'&&!!this.session&&this.session.id===id&&!this.session.abort.signal.aborted;}
  prepare(options={},fallbackMode){
    const config=validateSettings(this.store.settings),operation=validateOperation(options,fallbackMode??config.mode);
    config.mode=operation.mode;if(operation.targetLanguage)config.targetLanguage=operation.targetLanguage;
    // Only the app's manually maintained dictionary is sent. Never inspect another app or screen.
    config.dictionary=Array.isArray(this.store.dictionary)?this.store.dictionary.slice(0,500).map(entry=>entry&&({source:entry.source,word:entry.word,replacement:entry.replacement})):[];
    return {config,keys:{...this.store.keys},...operation};
  }
  usageObserver(s,kind){return event=>{if(typeof this.store.recordUsage!=='function')return;try{this.store.recordUsage({...event,operationId:s.id,kind,mode:s.mode,model:s.config[kind].model,price:s.config.usagePrices?.[kind]});this.emit('usage');}catch{}};}
  requireKeys(prepared,{asr=true,chat=false}={}){
    const kinds=[...(asr&&prepared.config.asr.backend!=='local'?['asr']:[]),...(chat||prepared.mode!=='dictate'||prepared.config.refiner.enabled?['refiner']:[])];
    for(const kind of kinds){
      const host=new URL(prepared.config[kind].baseUrl).hostname;
      if(!prepared.keys[kind]&&!['localhost','127.0.0.1','[::1]'].includes(host))throw new Error(`请先在设置中填写${kind==='asr'?'识别':'Chat / 整理'}服务的 API 密钥。${kind==='refiner'&&prepared.mode!=='dictate'?'Translate / Ask 需要 Chat 服务，不是本地功能。':''}`);
    }
  }
  begin(prepared,inputSource,retryOf){
    this.clearRecovery();
    const id=randomUUID();const s={...prepared,id,inputSource,preferredTargetTracking:inputSource==='recording'&&prepared.mode==='translate'&&(!prepared.targetLanguage||prepared.targetLanguage===this.store.settings.targetLanguage),...(retryOf?{retryOf}:{}),createdAt:new Date(this.now()).toISOString(),abort:new AbortController(),target:null,submitted:false,original:'',text:'',refined:false,durationMs:0,audioAvailable:false,audioBytes:0,historyStarted:false,storageWarnings:[]};
    s.recordingLimits=recordingLimits(s.config.asr.protocol,this.maxRecordingMs,s.config.asr.backend);
    s.config.targetLanguages=Object.freeze([...s.config.targetLanguages]);
    const dictionary=api.dictionarySummary(s.config);if(dictionary.omitted)s.storageWarnings.push(`词典提示最多 8000 字；本次有 ${dictionary.omitted} 条未发送。服务商和模型可能忽略提示。`);
    this.session=s;return s;
  }
  rejected(error){const message=error instanceof Error?error.message:'操作无效。';this.publish({phase:'error',message,sessionId:null,result:null,errorId:randomUUID(),level:0});return{accepted:false};}
  async toggle(source='ui',options={}){
    if(this.disposed)return{accepted:false};
    if(this.state.phase==='starting')return{accepted:this.cancel()};
    if(this.state.phase==='recording'){this.stop();return{accepted:true};}
    if(this.active())return{accepted:false};
    let prepared;
    try{if(!['ui','shortcut'].includes(source))throw new Error('操作来源无效。');prepared=this.prepare(options);this.requireKeys(prepared);}catch(error){return this.rejected(error);}
    const s=this.begin(prepared,'recording'),id=s.id;
    this.publish({phase:'starting',sessionId:id,mode:s.mode,message:'正在准备麦克风…',startedAt:null,durationMs:0,result:null,level:0,languageError:null});
    if(!this.current(id)||this.state.phase!=='starting')return{accepted:true};
    this.readyTimer=setTimeout(()=>{if(this.current(id)&&this.state.phase==='starting')this.fail(id,'麦克风启动超时，已取消。本次音频未上传。','recording');},this.readyTimeoutMs);
    this.readyTimer.unref?.();
    this.emit('command',{type:'start',sessionId:id,deviceId:s.config.deviceId,asrBackend:s.config.asr.backend,recordingLimits:s.recordingLimits});
    return{accepted:true};
  }
  recordingReady(input={}){
    if(!input||typeof input!=='object'||Array.isArray(input))return{accepted:false};
    const {sessionId}=input;
    if(this.disposed||!this.current(sessionId)||this.state.phase!=='starting')return{accepted:false};
    clearTimeout(this.readyTimer);this.readyTimer=null;
    const startedAt=this.now();this.session.startedAt=startedAt;this.session.startedMono=this.monotonicNow();
    this.recordTimer=setTimeout(()=>{if(this.current(sessionId)&&this.state.phase==='recording')this.stop();},this.session.recordingLimits.stopAfterMs);
    this.recordTimer.unref?.();
    this.publish({phase:'recording',message:'正在聆听，再按一次快捷键结束。',startedAt});
    return{accepted:true};
  }
  setSessionTarget(input={}){
    if(!input||typeof input!=='object'||Array.isArray(input)||this.disposed)return{accepted:false};
    const {sessionId}=input;
    if(!this.current(sessionId)||this.session.mode!=='translate'||!['starting','recording'].includes(this.state.phase))return{accepted:false};
    let targetLanguage;try{targetLanguage=languageCode(input.targetLanguage);}catch{return{accepted:false};}
    if(!this.session.config.targetLanguages.includes(targetLanguage))return{accepted:false};
    if(!Array.isArray(this.store.settings.targetLanguages)||!this.store.settings.targetLanguages.includes(targetLanguage))return{accepted:false};
    if(this.session.config.targetLanguage===targetLanguage&&this.store.settings.targetLanguage===targetLanguage&&!this.state.languageError)return{accepted:true};
    try{if(this.store.settings.targetLanguage!==targetLanguage)this.store.save({...this.store.settings,targetLanguage});}
    catch{this.publish({languageError:'首选语言保存失败，目标未变；请重试。'});return{accepted:false};}
    this.session.config.targetLanguage=targetLanguage;this.session.targetLanguage=targetLanguage;this.session.preferredTargetTracking=true;
    this.publish({targetLanguage,targetLanguages:[...this.session.config.targetLanguages],languageError:null});return{accepted:true};
  }
  retentionAllowed(s=this.session){return !!s&&s.config.saveHistory===true&&s.config.saveAudio===true&&this.store.settings.saveHistory===true&&this.store.settings.saveAudio===true;}
  canRetainRecording(){return !this.disposed&&this.state.phase==='recording'&&this.current(this.state.sessionId)&&this.session.inputSource==='recording'&&!this.session.completionIntent&&this.retentionAllowed();}
  retainRecording(input={}){
    if(!input||typeof input!=='object'||Array.isArray(input)||!this.canRetainRecording()||input.sessionId!==this.session.id)return{accepted:false};
    return{accepted:this.stopRecording('retain')};
  }
  stop(){return this.stopRecording('submit');}
  stopRecording(intent){
    if(this.disposed||this.state.phase!=='recording'||!this.current(this.state.sessionId)||this.session.completionIntent||!['submit','retain'].includes(intent))return false;
    const limits=this.session.recordingLimits;
    if(limits.backend==='local'&&this.monotonicNow()-this.session.startedMono>limits.maxDurationMs){this.fail(this.session.id,'本地模式最长 60 秒；已安全中止，未裁剪或上传录音。','recording');return false;}
    if(limits.protocol==='qwen-input-audio'&&this.monotonicNow()-this.session.startedMono>limits.maxDurationMs){
      this.fail(this.session.id,'Qwen 录音超过 5 分钟，已安全中止；未裁剪音频或发送识别请求，请重新分段录制。','recording');return false;
    }
    // Lock before any state event or recorder command can synchronously re-enter the controller.
    this.session.completionIntent=intent;clearTimeout(this.recordTimer);
    if(this.session.mode==='translate'&&this.session.inputSource==='recording'&&this.session.preferredTargetTracking){
      // Re-read only the persisted language, never refresh this session's API/key/context snapshot.
      const list=this.store.settings.targetLanguages,preferred=this.store.settings.targetLanguage;
      if(Array.isArray(list)&&list.length){try{this.session.config.targetLanguage=languageCode(list.includes(preferred)?preferred:list[0]);this.session.targetLanguage=this.session.config.targetLanguage;}catch{}}
    }
    const id=this.session.id;this.publish({phase:'stopping',languageError:null,message:intent==='retain'?'正在结束录音并保留到本地，本次保留操作不会上传…':'正在结束录音…',level:0});
    if(!this.current(id)||this.state.phase!=='stopping')return true;
    this.stopTimer=setTimeout(()=>{if(this.current(id)&&this.state.phase==='stopping')this.fail(id,'录音结束超时，已取消。本次音频未上传。','recording');},this.stopTimeoutMs);
    this.stopTimer.unref?.();
    this.emit('command',{type:'stop',sessionId:id});return true;
  }
  clearRecovery(){
    clearTimeout(this.recoveryTimer);this.recoveryTimer=null;
    if(this.#recovery){this.#recovery.audio.bytes.fill(0);this.#recovery.audio.localPcm?.fill(0);this.#recovery=null;}
  }
  armRecoveryExpiry(){
    clearTimeout(this.recoveryTimer);
    if(!this.#recovery)return;
    const slot=this.#recovery,delay=Math.max(1,slot.expiresAt-this.now());
    this.recoveryTimer=setTimeout(()=>{
      if(this.#recovery!==slot)return;
      if(this.now()<slot.expiresAt){this.armRecoveryExpiry();return;}
      this.clearRecovery();this.publish({});
    },delay);
    this.recoveryTimer.unref?.();
  }
  stageRecovery(s,audio,{ttlMs=this.recoveryTtlMs,reason='recognition-failed'}={}){
    this.clearRecovery();
    // Copy the exact view range, not its potentially much larger backing buffer.
    const view=audio.bytes instanceof ArrayBuffer?new Uint8Array(audio.bytes):new Uint8Array(audio.bytes.buffer,audio.bytes.byteOffset,audio.bytes.byteLength);
    const owned={bytes:new Uint8Array(view),mimeType:audio.mimeType,durationMs:audio.durationMs};
    if(audio.localPcm){owned.localPcm=new Uint8Array(audio.localPcm);owned.sampleRate=16000;owned.channels=1;}
    this.#recovery={sessionId:s.id,audio:owned,expiresAt:this.now()+Math.min(this.recoveryTtlMs,Math.max(1,ttlMs)),reason,token:null,
      operation:{mode:s.mode,targetLanguage:s.config.targetLanguage,context:s.context,task:s.task}};
    this.armRecoveryExpiry();return owned;
  }
  recoverySummary(){
    if(this.#recovery&&this.now()>=this.#recovery.expiresAt)this.clearRecovery();
    const slot=this.#recovery;if(!slot?.token)return null;
    return{token:slot.token,sessionId:slot.sessionId,mode:slot.operation.mode,targetLanguage:slot.operation.targetLanguage,
      durationMs:slot.audio.durationMs,audioBytes:slot.audio.bytes.byteLength,expiresAt:slot.expiresAt,reason:slot.reason||'recognition-failed'};
  }
  offerRecovery(id){
    this.recoverySummary();
    if(this.#recovery?.sessionId===id)this.#recovery.token=randomUUID();
  }
  restrictRecovery(id,{ttlMs,reason}){
    if(this.#recovery?.sessionId!==id)return false;
    this.#recovery.expiresAt=Math.min(this.#recovery.expiresAt,this.now()+Math.max(1,ttlMs));
    this.#recovery.reason=reason;this.armRecoveryExpiry();return true;
  }
  discardRecovery(token){
    const summary=this.recoverySummary();
    if(typeof token!=='string'||!summary||summary.token!==token)return{accepted:false};
    this.clearRecovery();this.publish({});return{accepted:true};
  }
  async retryRecovery(token){
    if(this.disposed||this.active())return{accepted:false};
    const summary=this.recoverySummary();
    if(typeof token!=='string'||!summary||summary.token!==token)return{accepted:false};
    const slot=this.#recovery;let prepared;
    try{
      // Only operation intent survives. Destination, models, dictionary and keys are revalidated now.
      prepared=this.prepare(slot.operation,slot.operation.mode);this.requireKeys(prepared);
      this.validAudio(slot.audio,prepared.config);
    }catch(error){return this.rejected(error);}
    if(this.recoverySummary()?.token!==token)return{accepted:false};
    // Detach before begin() clears the previous slot; there is never a second retained segment.
    clearTimeout(this.recoveryTimer);this.recoveryTimer=null;this.#recovery=null;slot.token=null;
    const s=this.begin(prepared,'retry',slot.sessionId);s.submitted=true;s.durationMs=slot.audio.durationMs;
    slot.sessionId=s.id;this.#recovery=slot;this.armRecoveryExpiry();
    this.publish({phase:'processing',sessionId:s.id,mode:s.mode,message:'正在重新识别你确认恢复的临时音频…',startedAt:this.now(),durationMs:s.durationMs,result:null,level:0});
    if(!this.current(s.id))return{accepted:true};
    if(this.#recovery!==slot||this.now()>=slot.expiresAt){this.fail(s.id,'临时音频已过期，未重新上传。','recording');return{accepted:false};}
    // Only a validated, still-current explicit retry starts a fresh failure-recovery period.
    slot.expiresAt=this.now()+this.recoveryTtlMs;slot.reason='recognition-failed';this.armRecoveryExpiry();
    this.retainAudio(s,slot.audio);return this.runAudio(s,slot.audio);
  }
  result(s,status,extra={}){
    return {id:s.id,createdAt:s.createdAt,mode:s.mode,status,context:s.context,contextSource:s.context?'provided':'none',task:s.task,targetLanguage:s.config.targetLanguage,inputSource:s.inputSource,...(s.retryOf?{retryOf:s.retryOf}:{}),original:s.original,text:s.text,...(status==='completed'&&s.mode==='ask'&&s.sourceMetadata?{sourceMetadata:s.sourceMetadata}:{}),refined:s.refined,durationMs:s.durationMs,audioAvailable:s.audioAvailable,audioBytes:s.audioBytes,delivery:'pending',message:'',...extra};
  }
  saveResult(s,result){
    result.message=[result.message,...s.storageWarnings].filter(Boolean).join(' ');
    if(s.config.saveHistory&&this.store.settings.saveHistory!==false){
      try{this.store.addHistory(result);s.historyStarted=true;}
      catch{const warning='本地历史保存失败，本次结果仍可复制。';if(!s.storageWarnings.includes(warning)){s.storageWarnings.push(warning);result.message=[result.message,warning].filter(Boolean).join(' ');}}
    }
    return result;
  }
  retainAudio(s,audio){
    if(!s.config.saveAudio)return;
    if(!s.config.saveHistory||this.store.settings.saveHistory===false){s.storageWarnings.push('历史保存已关闭，音频未保存。');return;}
    const pending=this.result(s,'processing');this.saveResult(s,pending);
    if(!s.historyStarted)return;
    try{
      if(typeof this.store.saveAudio!=='function')throw new Error();
      const saved=this.store.saveAudio(s.id,audio);
      s.audioAvailable=saved?.audioAvailable===true;s.audioBytes=s.audioAvailable&&Number.isFinite(saved.audioBytes)?saved.audioBytes:0;
      if(!s.audioAvailable)s.storageWarnings.push('音频未保存；无法从历史记录重试这段音频。');
    }catch{s.storageWarnings.push('本地音频保存失败，识别仍可继续；无法从历史记录重试这段音频。');}
  }
  cancel(){
    if(!this.active()||this.state.phase==='delivering'||(this.state.phase==='stopping'&&this.session?.completionIntent==='retain'))return false;
    const s=this.session,id=s?.id;s?.abort.abort();this.clearTimers();this.clearRecovery();this.emit('command',{type:'cancel',sessionId:id});
    let result=s?this.result(s,'cancelled',{text:'',delivery:'none',errorCode:'cancelled',message:s.audioAvailable?'已取消。保留的音频仅可由你主动重试。':'已取消。'}):null;
    if(s?.historyStarted)result=this.saveResult(s,result);
    this.session=null;this.publish({phase:'cancelled',message:'已取消。若请求已上传，服务端仍可能处理并计费。',sessionId:null,level:0,...(result?{result}:{})});return true;
  }
  interrupt(reason){
    // A lost renderer/device lifecycle cannot finish the promised complete recording. This is
    // deliberately separate from user Cancel, which cannot change a locked retain intent.
    if(this.state.phase==='stopping'&&this.current(this.state.sessionId)&&this.session.completionIntent==='retain'){
      this.failRetention(this.session.id,typeof reason==='string'&&reason.trim()?reason.slice(0,250):'录音因系统中断而停止。',{persist:false});return true;
    }
    return this.cancel();
  }
  clearTimers(){clearTimeout(this.readyTimer);clearTimeout(this.recordTimer);clearTimeout(this.stopTimer);this.readyTimer=this.recordTimer=this.stopTimer=null;}
  fail(id,message,errorCode='processing'){
    if(!this.current(id))return;
    if(this.session.completionIntent==='retain')return this.failRetention(id,message);
    const s=this.session;s.abort.abort();this.clearTimers();this.offerRecovery(id);this.emit('command',{type:'cancel',sessionId:id});
    // A raw transcription is recoverable, but is never labelled as a successful translation/answer.
    const result=this.saveResult(s,this.result(s,'failed',{text:'',refined:false,delivery:'none',errorCode:ERROR_CODES.has(errorCode)?errorCode:'processing',message}));
    this.session=null;this.publish({phase:'error',message:result.message,sessionId:null,level:0,result});
  }
  reportRecordingError(error={}){
    if(!error||typeof error!=='object'||Array.isArray(error))return{accepted:false};
    const {sessionId,message}=error;if(!this.current(sessionId)||!['starting','recording','stopping'].includes(this.state.phase))return{accepted:false};
    // Error-path flushes are not the complete MediaRecorder submission the user chose to retain.
    if(this.session.completionIntent==='retain'){this.failRetention(sessionId,typeof message==='string'?message.slice(0,250):'麦克风录音失败。');return{accepted:true};}
    if(error.audio){try{const audio=this.validAudio(error.audio);this.session.durationMs=audio.durationMs;this.stageRecovery(this.session,audio);this.retainAudio(this.session,audio);}catch{}}
    this.fail(sessionId,typeof message==='string'?message.slice(0,250):'麦克风录音失败。','recording');return{accepted:true};
  }
  validAudio(audio,config=this.session?.config??this.store.settings){
    if(!audio||(!(audio.bytes instanceof ArrayBuffer)&&!ArrayBuffer.isView(audio.bytes)))throw new Error('录音数据格式无效。');
    if(audio.bytes.byteLength<100||audio.bytes.byteLength>api.MAX_AUDIO_BYTES)throw new Error('录音为空或超过 25 MB；请分段录音。');
    if(!['audio/webm','audio/webm;codecs=opus'].includes(audio.mimeType))throw new Error('录音格式不受支持，请使用 WebM/Opus。');
    if(audio.durationMs!==undefined&&(!Number.isFinite(audio.durationMs)||audio.durationMs<0||audio.durationMs>MAX_RECORDING_MS))throw new Error('录音时长无效或超过 9 分钟；请分段录音。');
    if(config.asr?.backend==='local'){
      const pcm=pcmBytes(audio);
      if(!Number.isFinite(audio.durationMs)||audio.durationMs<=0||audio.durationMs>60000||audio.bytes.byteLength>2*1024*1024)throw Error('本地模式最长 60 秒；原音频未裁剪，请分段重新录制。');
      return {bytes:audio.bytes,mimeType:audio.mimeType,durationMs:audio.durationMs,localPcm:pcm,sampleRate:16000,channels:1};
    }
    const qwen=config.asr?.protocol==='qwen-input-audio';
    if(qwen&&(!Number.isFinite(audio.durationMs)||audio.durationMs<=0||audio.durationMs>300000))throw Error('当前 Qwen 协议仅支持最多 5 分钟的音频，原片段未裁剪或改写；请选择兼容协议或重新分段录制，不能直接重试。');
    if(qwen&&audio.bytes.byteLength>7500000)throw Error('当前 Qwen 协议编码后请求最多 10 MB，原片段未裁剪或改写；请重新分段录制。');
    const durationMs=qwen?audio.durationMs:Number.isFinite(audio.durationMs)?Math.min(this.maxRecordingMs,audio.durationMs):0;
    return {bytes:audio.bytes,mimeType:audio.mimeType,durationMs};
  }
  failRetention(id,message,{recoverable=false,persist=true}={}){
    if(!this.current(id))return;
    const s=this.session;
    if(recoverable&&this.retentionAllowed(s))this.offerRecovery(id);else this.clearRecovery();
    s.abort.abort();this.clearTimers();this.emit('command',{type:'cancel',sessionId:id});
    const result=this.result(s,'failed',{original:'',text:'',refined:false,audioAvailable:false,audioBytes:0,delivery:'none',errorCode:'recording',message:`${message} 本次保留操作未上传，也未完成本地保留。`});
    // Never create history from an incomplete/error-path blob. Only settle an entry already written
    // for a validated complete submission, and never imply there is text available to copy.
    if(persist&&s.historyStarted&&this.retentionAllowed(s)){
      try{this.store.addHistory(result);}catch{result.message+=' 本地历史状态更新失败，请检查磁盘权限或可用空间。';}
    }
    this.session=null;this.publish({phase:'error',message:result.message,sessionId:null,level:0,result});
  }
  finishRetention(s,audio){
    if(!this.current(s.id)||s.completionIntent!=='retain')return{accepted:false};
    if(!this.retentionAllowed(s)){this.failRetention(s.id,'历史或音频保存已关闭。');return{accepted:false};}
    // Only a validated complete blob may enter the existing bounded private recovery slot.
    audio=this.stageRecovery(s,audio);
    const pending=this.result(s,'processing',{original:'',text:'',refined:false,delivery:'none',message:'正在将录音保留到本地，本次保留操作未上传。'});
    let step='history';
    try{
      const savedHistory=this.store.addHistory(pending);
      s.historyStarted=savedHistory?.id===s.id||!!this.store.getHistory?.(s.id);
      if(!s.historyStarted)throw new Error('history');
      if(!this.retentionAllowed(s)){this.failRetention(s.id,'历史或音频保存已关闭。');return{accepted:false};}
      step='audio';
      const result=this.result(s,'dismissed',{original:'',text:'',refined:false,delivery:'none',message:'主动保留，本次保留操作未上传。录音已保存到本地历史。'});
      // Store commits this terminal metadata and audio ownership in the same atomic history write.
      const saved=this.store.saveAudio(s.id,audio,result);
      if(saved?.audioAvailable!==true||!Number.isSafeInteger(saved.audioBytes)||saved.audioBytes!==audio.bytes.byteLength)throw new Error('audio');
      s.audioAvailable=true;s.audioBytes=saved.audioBytes;
      result.audioAvailable=true;result.audioBytes=s.audioBytes;
      this.clearRecovery();this.session=null;this.publish({phase:'retained',message:result.message,sessionId:null,durationMs:s.durationMs,level:0,result});return{accepted:true};
    }catch{
      const reason=!this.retentionAllowed(s)?'历史或音频保存已关闭。':this.store.readOnly?'本地数据由更新版本创建，当前为只读。':step==='history'?'本地历史保存失败，请检查磁盘权限或可用空间。':'本地音频保存失败，请检查磁盘权限、可用空间或音频容量上限。';
      this.failRetention(s.id,reason,{recoverable:true});return{accepted:false};
    }
  }
  async submitAudio(audio){
    const id=audio?.sessionId;if(!this.current(id)||this.state.phase!=='stopping'||this.session.submitted)return{accepted:false};
    this.session.submitted=true;this.clearTimers();let valid;
    try{valid=this.validAudio(audio);}catch(error){this.fail(id,error.message,'recording');return{accepted:false};}
    const s=this.session;s.durationMs=valid.durationMs;
    if(s.completionIntent==='retain')return this.finishRetention(s,valid);
    valid=this.stageRecovery(s,valid);this.retainAudio(s,valid);
    this.publish({phase:'processing',message:'正在识别语音…',durationMs:s.durationMs,level:0});
    return this.runAudio(s,valid);
  }
  async runAudio(s,audio){
    if(s.completionIntent==='retain')return{accepted:false};
    if(!this.current(s.id))return{accepted:true};
    try{
      let original;
      if(s.config.asr.backend==='local'){
        if(!this.localAsr)throw Error('本地识别器未安装；未上传或切换到云端。');
        original=await this.localAsr.transcribe(audio,{signal:s.abort.signal});
      }else original=await this.api.transcribe(audio,s.config,s.keys.asr,{signal:s.abort.signal,onUsage:this.usageObserver(s,'asr')});
      if(!this.current(s.id))return{accepted:true};
      s.original=api.validatedText(original,'语音识别');
      return await this.finishText(s,false);
    }catch(error){if(this.current(s.id))this.fail(s.id,error.message||'处理失败，未自动重试。',error.code);return{accepted:true};}
  }
  async finishText(s,forceChat){
    const id=s.id;
    if(!this.current(id))return{accepted:true};
    this.publish({result:this.result(s,'processing',{text:s.mode==='dictate'?s.original:'',delivery:'pending'})});
    if(!this.current(id))return{accepted:true};
    if(s.historyStarted)this.saveResult(s,this.result(s,'processing'));
    let warning='';
    try{
      const options={signal:s.abort.signal,context:s.context,task:s.task,onUsage:this.usageObserver(s,'refiner')};
      if(s.mode==='translate'){
        this.publish({message:'原始文本已保留，正在使用 Chat 服务翻译…'});
        if(!this.current(id))return{accepted:true};
        s.text=api.validatedText(await this.api.translate(s.original,s.config,s.keys.refiner,options),'翻译');s.refined=true;
      }else if(s.mode==='ask'){
        this.publish({message:'原始文本已保留，正在使用 Chat 服务处理本次请求…'});
        if(!this.current(id))return{accepted:true};
        const response=await this.api.ask(s.original,s.config,s.keys.refiner,options);
        if(response&&typeof response==='object'&&['openai','local-v1'].includes(s.config.refiner.citationFormat)){api.validatedText(response.text,'Ask');s.text=response.text;s.sourceMetadata=validateMetadata(s.text,response.sourceMetadata);}else s.text=api.validatedText(response,'Ask');s.refined=true;
      }else if(s.config.refiner.enabled||forceChat){
        this.publish({message:'原始文本已保留，正在整理文字…'});
        if(!this.current(id))return{accepted:true};
        try{s.text=api.validatedText(await this.api.refine(s.original,s.config,s.keys.refiner,options),'文本整理');s.refined=true;}
        catch(error){if(s.abort.signal.aborted)throw error;s.text=s.original;warning=`整理未完成，已保留原始转录。${error.message}`;}
      }else s.text=s.original;
      if(!this.current(id))return{accepted:true};
      const deliveryPlan=planDelivery({mode:s.mode,task:s.task});
      if(!this.current(id))return{accepted:true};
      const result=this.saveResult(s,this.result(s,'completed',{delivery:'fallback',deliveryPlan,message:[warning,deliveryMessage(deliveryPlan)].filter(Boolean).join(' ')}));
      this.clearRecovery();this.session=null;this.publish({phase:'done',message:result.message,sessionId:null,result});return{accepted:true};
    }catch(error){if(this.current(id))this.fail(id,`${s.mode==='translate'?'翻译':s.mode==='ask'?'Ask':'文字处理'}未完成，已保留原始文本。${error.message||'请求失败，未自动重试。'}`,error.code);return{accepted:true};}
  }
  async processText(input={}){
    if(this.disposed||this.active())return{accepted:false};
    let prepared,original;
    try{if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('文字任务格式不正确。');original=api.validatedText(input.text,'输入');prepared=this.prepare(input,'ask');this.requireKeys(prepared,{asr:false,chat:true});}catch(error){return this.rejected(error);}
    const s=this.begin(prepared,'text');s.original=original;s.submitted=true;
    this.publish({phase:'processing',sessionId:s.id,mode:s.mode,message:'正在处理主动提供的文字…',startedAt:this.now(),durationMs:0,result:null,level:0});
    return this.finishText(s,true);
  }
  async retryHistory(id,options={}){
    if(this.disposed||this.active())return{accepted:false};
    let prepared,old,audio,original;
    try{
      if(typeof id!=='string'||!id||id.length>128)throw new Error('历史记录标识无效。');
      // Retention is enforced before reading text. A stale snapshot must never revive expired content.
      this.store.pruneHistory?.();
      if(!this.store.getHistory?.(id))throw new Error('找不到这条历史记录，可能已删除或过期。');
      if(!options||typeof options!=='object'||Array.isArray(options))throw new Error('重试设置格式不正确。');
      const retryKind=options.retryKind;
      if(retryKind!==undefined&&!['audio','text'].includes(retryKind))throw new Error('重试类型无效，请选择重新识别音频或重新处理文字。');
      // Explicit text processing must not read retained audio, even when a file exists.
      if(retryKind!=='text'&&this.store.settings.asr?.backend==='local')throw new Error('本地历史解码尚未接入，请重新录音；原录音仍可导出，已有原文可仅重做文字处理。');
      if(retryKind!=='text')audio=this.store.readAudio?.(id);
      // Both paths use the live entry after retention cleanup, never the UI's old snapshot.
      old=this.store.getHistory?.(id);if(!old)throw new Error('找不到这条历史记录，可能已删除或过期。');
      // Retry only the context explicitly supplied for that live entry, never an external selection.
      let targetLanguage=this.store.settings.targetLanguage;try{targetLanguage=languageCode(old.targetLanguage);}catch{}
      const overrides=Object.fromEntries(Object.entries(options).filter(([name,value])=>name!=='retryKind'&&value!==undefined));
      prepared=this.prepare({mode:old.mode??'dictate',context:old.context??'',task:old.task??'ask',targetLanguage,...overrides},old.mode??'dictate');
      if(retryKind==='audio'&&!audio)throw new Error('这条记录没有可用的保留音频，无法重新识别；请重新录音。');
      if(audio)audio=this.validAudio(audio,prepared.config);
      else if(typeof old.original==='string'&&old.original.trim()&&(retryKind==='text'||prepared.mode!=='dictate'||prepared.config.refiner.enabled||old.inputSource==='text'))original=api.validatedText(old.original,'原始文本');
      else if(retryKind==='text')throw new Error('这条记录没有可用的原始文本，无法重新处理文字。');
      else throw new Error('这条记录没有可用的保留音频，无法重新识别；请重新录音或主动提交文字。');
      this.requireKeys(prepared,{asr:!!audio,chat:!audio});
    }catch(error){return this.rejected(error);}
    const s=this.begin(prepared,'retry',id);s.submitted=true;s.durationMs=audio?audio.durationMs:0;
    this.publish({phase:'processing',sessionId:s.id,mode:s.mode,message:audio?'正在重新识别你选择的保留音频…':'正在重新处理你选择的原始文本…',startedAt:this.now(),durationMs:s.durationMs,result:null,level:0});
    if(!this.current(s.id))return{accepted:true};
    if(audio){audio=this.stageRecovery(s,audio);this.retainAudio(s,audio);return this.runAudio(s,audio);}
    s.original=original;return this.finishText(s,true);
  }
  setLevel(level){if(this.state.phase==='recording'){this.state.level=Math.max(0,Math.min(1,Number(level)||0));this.emit('level',this.state.level);}}
  dispose(){this.disposed=true;const s=this.session;s?.abort.abort();this.clearTimers();this.clearRecovery();if(s?.historyStarted)this.saveResult(s,this.result(s,'cancelled',{text:'',delivery:'none',errorCode:'cancelled',message:'应用关闭，处理已取消；保留的音频可主动重试。'}));this.session=null;}
}
module.exports={Controller,ACTIVE};
