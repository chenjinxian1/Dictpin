'use strict';
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./pcm-segmenter'));else root.DictpinPcmCapture=factory(root.DictpinPcm);})(typeof globalThis!=='undefined'?globalThis:this,function({PcmSegmenter}){
 function createCapture({bridge,mediaDevices,AudioContextClass,WorkletNodeClass=globalThis.AudioWorkletNode,workletURL='pcm-worklet.js'}){
  let active=null,disposed=false;const started=new Set();
  const owns=id=>active?.id===id;
  function close(c){if(c.closed)return;c.closed=true;clearTimeout(c.stopTimer);try{c.source?.disconnect();c.node?.disconnect();}catch{}for(const track of c.stream?.getTracks?.()||[])try{track.stop();}catch{}try{void c.context?.close()?.catch?.(()=>{});}catch{}}
  async function fail(c,message){if(c.failed||c.discarded)return;c.failed=true;close(c);try{await bridge.reportRecordingError({sessionId:c.id,message:String(message).slice(0,250)});}catch{}c.segmenter?.finish();if(active===c)active=null;c.resolve({accepted:false});}
  function requestStop(c){
   if(c.stopping||c.discarded)return;c.stopping=true;
   if(c.node){c.node.port.postMessage({type:'flush'});c.stopTimer=setTimeout(()=>void fail(c,'录音尾段未确认，已完成文字仍保留。'),3000);}
   else{close(c);void Promise.resolve(bridge.sealSegments({sessionId:c.id,sequence:0,startSample:0})).finally(()=>{if(active===c)active=null;c.resolve({accepted:true});});}
  }
  async function start(command){
   if(disposed||active||started.has(command.sessionId))return{accepted:false};started.add(command.sessionId);if(started.size>128)started.delete(started.values().next().value);
   const c={id:command.sessionId,closed:false,stopping:false,discarded:false,chain:Promise.resolve(),pending:0};c.done=new Promise(resolve=>{c.resolve=resolve;});active=c;
   try{
    if(typeof AudioContextClass!=='function'||typeof WorkletNodeClass!=='function')throw Error('当前环境不支持连续分段采集，请检查 Electron 版本。');
    c.stream=await mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false,...(command.deviceId?{deviceId:{exact:command.deviceId}}:{})},video:false});
    if(c.closed||c.discarded||active!==c||disposed){for(const track of c.stream.getTracks())track.stop();return{accepted:false};}
    c.context=new AudioContextClass({sampleRate:16000,latencyHint:'interactive'});if(c.context.sampleRate!==16000||!c.context.audioWorklet)throw Error('设备无法创建 16 kHz 分段采集上下文。');
    await c.context.audioWorklet.addModule(workletURL);if(c.closed||c.discarded||active!==c)return{accepted:false};
    c.segmenter=new PcmSegmenter({sessionId:c.id,
     onSegment:packet=>{
      c.pending++;c.chain=c.chain.then(async()=>{if(c.discarded)return;const ack=await bridge.submitSegment(packet);if(ack?.accepted!==true)throw Error('分段音频未被接收，已完成文字仍保留。');}).finally(()=>{packet.pcm.fill(0);c.pending--;});
      void c.chain.catch(error=>fail(c,error.message));if(c.pending>=2)requestStop(c);
     },
     onSeal:input=>{c.chain=c.chain.then(()=>c.discarded?null:bridge.sealSegments(input));void c.chain.then(()=>{close(c);if(active===c)active=null;c.resolve({accepted:!c.failed});},error=>fail(c,error.message));}
    });
    c.node=new WorkletNodeClass(c.context,'dictpin-pcm',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1],channelCount:1,channelCountMode:'explicit'});
    c.node.port.onmessage=event=>{
     if(c.discarded||c.failed||active!==c)return;
     const data=event.data;
     if(data?.type==='pcm'){
      const samples=data.pcm;if(!(samples instanceof Int16Array)||samples.length>1600){void fail(c,'分段音频格式无效。');return;}
      let power=0;for(const sample of samples)power+=(sample/32768)**2;bridge.reportLevel?.(Math.min(1,Math.sqrt(power/Math.max(1,samples.length))*4));
      c.segmenter.push(samples);samples.fill(0);c.node.port.postMessage({type:'ack'});
     }else if(data?.type==='closed'){
      if(!c.stopping){void fail(c,'分段采集意外停止，已完成文字仍保留。');return;}
      clearTimeout(c.stopTimer);close(c);c.segmenter.finish();
     }else if(data?.type==='error')void fail(c,data.message||'分段采集失败。');
    };
    c.node.onprocessorerror=()=>void fail(c,'音频处理器中断，已完成文字仍保留。');
    c.source=c.context.createMediaStreamSource(c.stream);c.source.connect(c.node);c.node.connect(c.context.destination);
    for(const track of c.stream.getAudioTracks?.()||[])track.addEventListener('ended',()=>{if(!c.closed&&!c.stopping)void fail(c,'麦克风已断开，已完成文字仍保留。');},{once:true});
    await c.context.resume();if(c.closed||c.discarded||active!==c)return{accepted:false};
    const ready=await bridge.recordingReady({sessionId:c.id});if(ready?.accepted!==true){await fail(c,'录音任务已结束，未启动新的处理。');return{accepted:false};}return{accepted:true};
   }catch(error){await fail(c,error?.message||'麦克风无法启动。');return{accepted:false};}
  }
  function command(value){
   if(value?.type==='start')return start(value);const c=active;if(!c||value?.sessionId!==c.id)return Promise.resolve({accepted:false});
   if(value.type==='stop'||value.type==='cancel-retain'){requestStop(c);return c.done;}
   if(value.type==='cancel'){c.discarded=true;close(c);c.segmenter?.dispose();active=null;c.resolve({accepted:false});return c.done;}
   return Promise.resolve({accepted:false});
  }
  return{owns,command,dispose(){disposed=true;if(active)void command({type:'cancel',sessionId:active.id});}};
 }
 return{createCapture};
});
