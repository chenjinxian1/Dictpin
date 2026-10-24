'use strict';
(function(factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(typeof window==='object')window.LocalAudio=api;})(function(){
 const MAX_MS=60000,MAX_BYTES=2*1024*1024;
 function invalid(){return Error('本地识别只接收最长 60 秒的完整录音；解码失败时不会上传云端。');}
 function toPcm(buffer){
  if(buffer.sampleRate!==16000||![1,2].includes(buffer.numberOfChannels)||!Number.isInteger(buffer.length)||buffer.length<160||buffer.length>960000)throw invalid();
  const left=buffer.getChannelData(0),right=buffer.numberOfChannels===2?buffer.getChannelData(1):null;
  const bytes=new Uint8Array(buffer.length*2),out=new DataView(bytes.buffer);
  for(let i=0;i<buffer.length;i++){let v=right?(left[i]+right[i])/2:left[i];if(!Number.isFinite(v))throw invalid();v=Math.max(-1,Math.min(1,v));out.setInt16(i*2,Math.round(v*(v<0?32768:32767)),true);}
  return {localPcm:bytes,sampleRate:16000,channels:1,pcmDurationMs:buffer.length/16};
 }
 async function decode(bytes,{durationMs,isCurrent=()=>true,Context=globalThis.OfflineAudioContext}={}){
  if(!(bytes instanceof ArrayBuffer)||bytes.byteLength<100||bytes.byteLength>MAX_BYTES||!Number.isFinite(durationMs)||durationMs<=0||durationMs>MAX_MS||typeof Context!=='function')throw invalid();
  if(!isCurrent())throw Error('已取消本地解码。');
  // Decode a copy of the real container, resampling to 16 kHz in an offline context.
  // Native decoding cannot be preempted; discard stale results before product IPC.
  const context=new Context(1,1,16000);let buffer;
  try{buffer=await context.decodeAudioData(bytes.slice(0));}catch{throw invalid();}
  if(!isCurrent())throw Error('已取消本地解码。');
  return toPcm(buffer);
 }
 return {decode,toPcm,MAX_MS,MAX_BYTES};
});
