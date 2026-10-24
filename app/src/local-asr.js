'use strict';
// Fixed sibling CPU worker only. No URL, credential, microphone or caller-chosen path crosses the pipe.
const {spawn}=require('node:child_process');const path=require('node:path');const fs=require('node:fs');const {performance}=require('node:perf_hooks');
const MAX_PCM_BYTES=1920000;
const NO_SPEECH_MESSAGES=Object.freeze({silent_input:'录音没有收到声音信号。请检查所选麦克风与设备静音后重录。',speech_not_detected:'录音中有声音，但未检测到可识别的语音。请确认麦克风并靠近说话后重试。',empty_transcript:'已检测到语音，但本地识别没有返回文字。可以重试本段，或重新录音。'});
function fault(code,reason){return Object.assign(new Error((code==='no_speech'&&NO_SPEECH_MESSAGES[reason])||({busy:'本地识别器正在处理，请稍后重试。',cancelled:'已取消本地识别。',timeout:'本地识别超时，已请求结束 worker；未上传录音。',no_speech:'未检测到语音，未执行识别或文字请求。',format:'本地模式需要完整的 16 kHz 单声道 PCM16，最长 60 秒；历史片段缺少 PCM 时请重新录制。',worker:'本地识别进程不可用或尚未确认退出；未切换到云端。',disposed:'本地识别器已关闭。'})[code]||'本地识别失败。'),{code,...(reason?{reason}:{})});}
function pcmBytes(audio){
 if(!audio||audio.sampleRate!==16000||audio.channels!==1||!ArrayBuffer.isView(audio.localPcm)||audio.localPcm.byteLength<320||audio.localPcm.byteLength>MAX_PCM_BYTES||audio.localPcm.byteLength%2)throw fault('format');
 return Buffer.from(audio.localPcm.buffer,audio.localPcm.byteOffset,audio.localPcm.byteLength);
}
function pcmMetrics(pcm){
 let inputPeak=0,total=0,inputNonzeroSamples=0;const inputSamples=pcm.byteLength/2;
 for(let at=0;at<pcm.byteLength;at+=2){const sample=pcm.readInt16LE(at);if(sample!==0)inputNonzeroSamples++;const value=sample/32768;inputPeak=Math.max(inputPeak,Math.abs(value));total+=value*value;}
 return {inputPeak,inputRms:Math.sqrt(total/inputSamples),inputNonzeroSamples,inputSamples};
}
const finiteMetric=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=Number.MAX_SAFE_INTEGER;
class LocalAsr {
 constructor({spawnImpl=spawn,readyTimeoutMs=20000,requestTimeoutMs=30000,closeTimeoutMs=1000,idleTimeoutMs=180000,numThreads=4,now=()=>performance.now()}={}){
  if(![1,2,4].includes(numThreads))throw Error('本地识别线程只允许 1、2 或 4。');
  if(!Number.isFinite(idleTimeoutMs)||idleTimeoutMs<1||idleTimeoutMs>180000)throw Error('本地识别保温时间无效。');
  this.spawnImpl=spawnImpl;this.readyTimeoutMs=readyTimeoutMs;this.requestTimeoutMs=requestTimeoutMs;this.closeTimeoutMs=closeTimeoutMs;this.idleTimeoutMs=idleTimeoutMs;this.numThreads=numThreads;this.now=now;
  this.child=null;this.ready=false;this.job=null;this.sequence=0;this.disposed=false;this.lastResult=null;this.stopping=false;this.terminationSettled=false;this.phase='idle';this.preparation=null;this.releaseWaiters=[];this.releaseRequested=false;
  // The reviewed old executable remains untouched; never silently fall back.
  this.exe=path.resolve(__dirname,'../../native/local-asr-worker-local03.exe');this.work=path.resolve(__dirname,'../../work/worker');
 }
 get pid(){return this.child?.pid??null;}
 clearIdle(){clearTimeout(this.idleTimer);this.idleTimer=null;}
 armIdle(){this.clearIdle();if(this.disposed||this.stopping||this.job||!this.ready||this.releaseRequested)return;this.idleTimer=setTimeout(()=>{void this.release().catch(()=>{});},this.idleTimeoutMs);this.idleTimer.unref?.();}
 ensureReady(){
  if(this.disposed)return Promise.reject(fault('disposed'));
  this.clearIdle();
  if(this.stopping){if(this.terminationSettled)return Promise.reject(fault('worker'));return this.waitForClose().then(()=>{if(this.child)throw fault('worker');return this.ensureReady();});}
  if(this.ready){this.armIdle();return Promise.resolve({ready:true,loadMs:this.loadMs,cold:false});}
  if(this.preparation)return this.preparation.promise;
  const preparation={};preparation.promise=new Promise((resolve,reject)=>{preparation.resolve=resolve;preparation.reject=reject;});this.preparation=preparation;
  this.start();return preparation.promise;
 }
 settlePreparation(error){const preparation=this.preparation;if(!preparation)return;this.preparation=null;if(error)preparation.reject(error);else preparation.resolve({ready:true,loadMs:this.loadMs,cold:true});}
 transcribe(audio,{signal}={}){
  if(this.disposed)return Promise.reject(fault('disposed'));if(this.job)return Promise.reject(fault('busy'));if(this.stopping)return Promise.reject(fault('worker'));
  let pcm;try{pcm=Buffer.from(pcmBytes(audio));}catch(error){return Promise.reject(error);}
  if(signal?.aborted){pcm.fill(0);return Promise.reject(fault('cancelled'));}
  return new Promise((resolve,reject)=>{
   const job={id:++this.sequence,pcm,inputMetrics:pcmMetrics(pcm),resolve,reject,signal,sent:false,started:this.now(),coldStart:!this.ready,abort:()=>{if(this.job===job)this.terminate(fault('cancelled'));}};
   this.job=job;this.lastResult=null;this.clearIdle();signal?.addEventListener('abort',job.abort,{once:true});
   if(this.ready)this.send();else void this.ensureReady().then(()=>{if(this.job===job)this.send();}).catch(error=>{if(this.job===job)this.finish(error);});
  });
 }
 start(){
  if(this.child||this.stopping||this.disposed)return;
  let child;this.phase='loading';
  try{fs.mkdirSync(this.work,{recursive:true});child=this.spawnImpl(this.exe,['--threads',String(this.numThreads)],{cwd:this.work,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{SystemRoot:process.env.SystemRoot||'C:\\Windows',WINDIR:process.env.WINDIR||'C:\\Windows',TEMP:this.work,TMP:this.work}});}
  catch{this.phase='idle';this.settlePreparation(fault('worker'));this.finish(fault('worker'));return;}
  this.child=child;this.ready=false;this.stopping=false;this.terminationSettled=false;let pending='';const decoder=new TextDecoder('utf-8',{fatal:true});
  const fail=()=>{if(this.child===child)this.terminate(fault('worker'));};
  this.bootTimer=setTimeout(()=>{if(this.child===child)this.terminate(fault('timeout'));},this.readyTimeoutMs);
  child.stdout.on('data',chunk=>{
   if(this.child!==child||this.stopping)return;try{pending+=typeof chunk==='string'?chunk:decoder.decode(chunk,{stream:true});}catch{fail();return;}
   if(Buffer.byteLength(pending)>65536){fail();return;}
   let at;while(!this.stopping&&this.child===child&&(at=pending.indexOf('\n'))>=0){const line=pending.slice(0,at);pending=pending.slice(at+1);try{this.receive(JSON.parse(line));}catch{fail();return;}}
  });
  // Drain without logging or retaining native diagnostics.
  child.stderr.on('data',()=>{});child.stdin.on('error',fail);child.stdout.on('error',fail);child.stderr.on('error',fail);child.on('error',fail);
  child.once('close',()=>{
   if(this.child!==child)return;clearTimeout(this.bootTimer);clearTimeout(this.closeTimer);this.clearIdle();this.child=null;this.ready=false;this.stopping=false;this.terminationSettled=false;this.phase=this.disposed?'disposed':'idle';
   const error=this.job?.failure||this.preparationFailure||fault('worker');this.preparationFailure=null;this.settlePreparation(error);if(this.job)this.finish(error);this.resolveClose();this.settleRelease();
  });
 }
 receive(message){
  if(!message||typeof message!=='object'||Array.isArray(message))throw fault('worker');
  if(message.type==='ready'){
   if(this.ready||message.version!=='1.13.8'||!finiteMetric(message.loadMs)||(message.threads!==undefined&&message.threads!==this.numThreads))throw fault('worker');clearTimeout(this.bootTimer);this.ready=true;this.loadMs=message.loadMs;this.phase='idle';this.settlePreparation();if(this.job)this.send();else this.armIdle();return;
  }
  const job=this.job;
  if(message.type==='working'&&job?.sent&&!job.failure&&message.id===job.id&&message.phase==='decode'&&this.phase==='vad'){this.phase='decode';return;}
  const detailed=message.vadMs!==undefined||message.asrMs!==undefined||message.threads!==undefined;
  if(message.type!=='result'||!job?.sent||job.failure||message.id!==job.id||message.frames!==job.pcm.byteLength/2||typeof message.speech!=='boolean'||typeof message.text!=='string'||message.text.length>20000||message.text.includes('\0')||!finiteMetric(message.elapsedMs)||!Number.isSafeInteger(message.privateBytes)||message.privateBytes<0||!Number.isSafeInteger(message.peakWorkingSetBytes)||message.peakWorkingSetBytes<0||(detailed&&(!finiteMetric(message.vadMs)||!finiteMetric(message.asrMs)||message.threads!==this.numThreads)))throw fault('worker');
  this.lastResult={frames:message.frames,speech:message.speech,elapsedMs:message.elapsedMs,vadMs:message.vadMs??null,asrMs:message.asrMs??null,privateBytes:message.privateBytes,peakWorkingSetBytes:message.peakWorkingSetBytes,loadMs:this.loadMs,waitReadyMs:job.waitReadyMs,totalMs:Math.max(0,this.now()-job.started),coldStart:job.coldStart,threads:this.numThreads,...job.inputMetrics};
  if(!message.speech||!message.text.trim())this.finish(fault('no_speech',job.inputMetrics.inputNonzeroSamples===0?'silent_input':!message.speech?'speech_not_detected':'empty_transcript'));else this.finish(null,message.text.trim());
 }
 send(){
  const job=this.job;if(!this.ready||this.stopping||!job||job.sent||job.failure)return;
  job.sent=true;job.waitReadyMs=Math.max(0,this.now()-job.started);this.phase='vad';job.timer=setTimeout(()=>{if(this.job===job)this.terminate(fault('timeout'));},this.requestTimeoutMs);
  const header={type:'transcribe',format:'pcm_s16le',sampleRate:16000,channels:1,id:job.id,byteLength:job.pcm.byteLength};
  try{this.child.stdin.write(JSON.stringify(header)+'\n');if(this.job===job&&!this.stopping)this.child.stdin.write(job.pcm);}catch{this.terminate(fault('worker'));}
 }
 finish(error,text){
  const job=this.job;if(!job)return;clearTimeout(job.timer);job.signal?.removeEventListener('abort',job.abort);this.job=null;job.pcm.fill(0);job.pcm=null;
  if(error)job.reject(error);else job.resolve(text);
  if(this.releaseRequested&&!this.stopping){if(this.child)this.terminate(fault('cancelled'));else this.settleRelease();}else if(!this.stopping){this.phase=this.disposed?'disposed':'idle';this.armIdle();}
 }
 waitForClose(){if(!this.child)return Promise.resolve();if(!this.closing)this.closing=new Promise(resolve=>{this.closeResolve=resolve;});return this.closing;}
 resolveClose(){this.closeResolve?.();this.closeResolve=null;this.closing=null;}
 settleRelease(error){const waiters=this.releaseWaiters.splice(0);this.releaseRequested=false;for(const waiter of waiters)if(error)waiter.reject(error);else waiter.resolve();}
 release(){
  this.clearIdle();if(!this.child&&!this.job)return Promise.resolve();
  this.releaseRequested=true;const released=new Promise((resolve,reject)=>this.releaseWaiters.push({resolve,reject}));
  if(!this.job&&!this.stopping)this.terminate(fault('cancelled'));else if(this.stopping&&this.terminationSettled)this.settleRelease(fault('worker'));
  return released;
 }
 terminate(error){
  if(this.job&&!this.job.failure)this.job.failure=error;if(this.preparation&&!this.preparationFailure)this.preparationFailure=error;
  this.clearIdle();clearTimeout(this.bootTimer);clearTimeout(this.job?.timer);
  const child=this.child;if(!child){this.settlePreparation(error);if(this.job)this.finish(error);this.resolveClose();this.settleRelease();return;}
  if(this.stopping)return;this.stopping=true;this.ready=false;this.phase='stopping';
  // Kill is a request, not proof of exit. Bound the wait and reject reuse until close is observed.
  this.closeTimer=setTimeout(()=>{
   if(this.child!==child)return;
   try{child.stdin.destroy();}catch{}
   try{child.kill('SIGKILL');}catch{}
   if(this.child!==child)return;
   this.terminationSettled=true;this.settlePreparation(this.preparationFailure||error);if(this.job)this.finish(this.job.failure||error);this.resolveClose();this.settleRelease(fault('worker'));
  },this.closeTimeoutMs);
  try{child.kill();}catch{}
 }
 async dispose(){
  this.disposed=true;this.clearIdle();if(this.stopping&&this.terminationSettled)return;if(!this.child){this.settlePreparation(fault('disposed'));if(this.job)this.finish(fault('disposed'));this.phase='disposed';return;}
  const closing=this.waitForClose();this.terminate(fault('cancelled'));await closing;
 }
}
module.exports={LocalAsr,pcmBytes,MAX_PCM_BYTES};
