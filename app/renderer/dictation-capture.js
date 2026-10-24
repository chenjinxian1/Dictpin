'use strict';
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.DictationCapture=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 function createCapture({bridge,mediaDevices,Recorder,decode,now=()=>performance.now(),AudioContextClass,requestFrame=()=>null,cancelFrame=()=>{}}){
  let active=null,disposed=false;const started=new Set();
  function close(capture){
   if(capture.stream&&capture.closedStream!==capture.stream){capture.stream.getTracks().forEach(track=>{try{track.stop();}catch{}});capture.closedStream=capture.stream;}
   if(capture.closed)return;capture.closed=true;
   if(capture.frame!==undefined)cancelFrame(capture.frame);
   try{void capture.context?.close()?.catch?.(()=>{});}catch{}
  }
  function cancel(id){
   const capture=active;if(!capture||id!==capture.id)return false;
   capture.cancelled=true;active=null;capture.chunks=[];close(capture);
   try{if(capture.recorder?.state!=='inactive')capture.recorder?.stop();}catch{}
   capture.resolve?.({accepted:false});return true;
  }
  async function fail(capture,message){
   if(capture.cancelled||active!==capture)return;
   capture.cancelled=true;close(capture);capture.chunks=[];
   try{if(capture.recorder?.state!=='inactive')capture.recorder?.stop();}catch{}
   try{await bridge.reportRecordingError({sessionId:capture.id,message:String(message||'麦克风或录音格式不可用。').slice(0,250)});}catch{}
   if(active===capture)active=null;capture.resolve?.({accepted:false});
  }
  function meter(capture){
   if(!AudioContextClass)return;
   try{
    const context=new AudioContextClass(),source=context.createMediaStreamSource(capture.stream),analyser=context.createAnalyser();analyser.fftSize=256;source.connect(analyser);capture.context=context;
    const samples=new Float32Array(analyser.fftSize);
    const tick=()=>{if(capture.closed||active!==capture||capture.cancelled)return;analyser.getFloatTimeDomainData(samples);let total=0;for(const value of samples)total+=value*value;bridge.reportLevel?.(Math.min(1,Math.sqrt(total/samples.length)*4));capture.frame=requestFrame(tick);};
    void context.resume()?.catch?.(()=>{});capture.frame=requestFrame(tick);
   }catch{/* Optional level display cannot block complete local capture. */}
  }
  async function finish(capture){
   if(capture.cancelled||active!==capture){close(capture);capture.resolve?.({accepted:false});return;}
   if(!capture.stopRequested){await fail(capture,'录音意外停止，未提交不完整片段。');return;}
   let bytes,pcm;
   try{
    capture.status='decoding';capture.timings.recordingStopMs=Math.max(0,now()-capture.stopRequestedAt);const durationMs=now()-capture.startedAt;
    const blob=new Blob(capture.chunks,{type:capture.recorder.mimeType||capture.mime});capture.chunks=[];close(capture);
    bytes=await blob.arrayBuffer();if(capture.cancelled||active!==capture)return;
    if(bytes.byteLength<100||bytes.byteLength>2*1024*1024||durationMs<=0||durationMs>60000)throw Error('本地听写最长 60 秒；录音未裁剪，请分段重录。');
    const decodeStarted=now();const audio=await decode(bytes,{durationMs,isCurrent:()=>active===capture&&!capture.cancelled});pcm=audio.localPcm;capture.timings.decodeMs=Math.max(0,now()-decodeStarted);
    if(capture.cancelled||active!==capture)return;
    capture.status='submitting';
    const submit=capture.retainRequested?bridge.submitCancelledAudio:bridge.submitAudio;
    const result=await submit({sessionId:capture.id,bytes,mimeType:blob.type,durationMs,...audio,timings:capture.timings});capture.resolve?.(result);
   }catch(error){if(!capture.cancelled&&active===capture)await fail(capture,error?.message||'音频解码失败，未提交部分录音。');}
   finally{
    if(pcm?.fill)pcm.fill(0);if(bytes)new Uint8Array(bytes).fill(0);close(capture);if(active===capture)active=null;capture.resolve?.({accepted:false});
   }
  }
  async function start(command){
   if(disposed||typeof command.sessionId!=='string'||!command.sessionId||started.has(command.sessionId))return {accepted:false};
   if(active)cancel(active.id);
   started.add(command.sessionId);if(started.size>128)started.delete(started.values().next().value);
   const capture={id:command.sessionId,status:'starting',chunks:[],size:0,cancelled:false,closed:false,stream:null,stopRequested:false,requestedAt:now(),timings:{}};
   capture.done=new Promise(resolve=>{capture.resolve=resolve;});active=capture;
   try{
    // Communications processing can suppress headset input; local dictation uses raw capture.
    const audio={echoCancellation:false,noiseSuppression:false,autoGainControl:false,...(command.deviceId?{deviceId:{exact:command.deviceId}}:{})};
    const stream=await mediaDevices.getUserMedia({audio,video:false});
    capture.stream=stream;
    if(capture.cancelled||active!==capture||disposed){close(capture);return {accepted:false};}
    const mime=typeof Recorder.isTypeSupported==='function'&&Recorder.isTypeSupported('audio/webm;codecs=opus')?'audio/webm;codecs=opus':'audio/webm';
    if(typeof Recorder.isTypeSupported==='function'&&!Recorder.isTypeSupported(mime))throw Error('当前环境不支持完整的 WebM 音频录制。');
    capture.mime=mime;const recorder=new Recorder(stream,{mimeType:mime});capture.recorder=recorder;
    recorder.ondataavailable=event=>{
     if(capture.cancelled||active!==capture||!event.data?.size)return;
     capture.size+=event.data.size;if(capture.size>2*1024*1024){void fail(capture,'录音超过本地大小上限，未裁剪或提交。');return;}capture.chunks.push(event.data);
    };
    recorder.onerror=()=>void fail(capture,'录音设备发生错误，本次片段未提交。');
    recorder.onstop=()=>void finish(capture);
    capture.startedAt=now();capture.timings.deviceReadyMs=Math.max(0,capture.startedAt-capture.requestedAt);capture.status='recording';recorder.start(250);meter(capture);
    const ready=await bridge.recordingReady({sessionId:capture.id});
    if(ready?.accepted!==true||capture.cancelled||active!==capture){cancel(capture.id);return {accepted:false};}
    return {accepted:true};
   }catch(error){await fail(capture,error?.message||'无法启动麦克风。');return {accepted:false};}
  }
  async function command(value){
   if(!value||typeof value!=='object')return {accepted:false};
   if(value.type==='start')return start(value);
   if(value.type==='cancel')return {accepted:cancel(value.sessionId)};
   if(value.type==='cancel-retain'){
    const capture=active;if(!capture||capture.id!==value.sessionId||capture.cancelled)return {accepted:false};
    if(capture.status==='starting')return {accepted:cancel(capture.id)};
    capture.retainRequested=true;capture.stopRequestedAt=now();capture.stopRequested=true;
    try{if(capture.recorder?.state==='recording'){capture.status='stopping';capture.recorder.stop();}close(capture);}catch{await fail(capture,'录音已停止，片段未能恢复。');}
    return capture.done;
   }
   if(value.type==='stop'){
    const capture=active;if(!capture||capture.id!==value.sessionId||capture.cancelled)return {accepted:false};
    if(capture.stopRequested)return capture.done;
    if(capture.status!=='recording')return {accepted:false};
    capture.stopRequestedAt=now();capture.stopRequested=true;capture.status='stopping';
    try{capture.recorder.stop();}catch{await fail(capture,'录音未能完整停止，本次片段未提交。');}
    return capture.done;
   }
   return {accepted:false};
  }
  return {command,dispose(){disposed=true;if(active)cancel(active.id);}};
 }
 return {createCapture};
});
