'use strict';
// A 16 kHz AudioContext performs device-rate resampling before this processor.
// No encoded recorder/container restarts and no input samples are deliberately skipped.
class DictpinPcmProcessor extends AudioWorkletProcessor{
 constructor(){super();this.buffer=new Int16Array(1600);this.used=0;this.closed=false;this.outstanding=0;this.port.onmessage=event=>{if(event.data?.type==='flush')this.finish();else if(event.data?.type==='ack')this.outstanding=Math.max(0,this.outstanding-1);};}
 send(){if(!this.used)return;const pcm=this.buffer.slice(0,this.used);this.port.postMessage({type:'pcm',pcm},[pcm.buffer]);this.outstanding++;this.used=0;}
 finish(){if(this.closed)return;this.send();this.closed=true;this.port.postMessage({type:'closed'});}
 process(inputs,outputs){
  for(const output of outputs)for(const channel of output)channel.fill(0);
  if(this.closed)return false;
  if(sampleRate!==16000){this.closed=true;this.port.postMessage({type:'error',message:'需要 16 kHz 音频上下文。'});return false;}
  const channels=inputs[0];if(!channels?.length)return true;
  for(let i=0;i<channels[0].length;i++){
   let value=0;for(const channel of channels)value+=channel[i];value/=channels.length;
   if(!Number.isFinite(value)){this.finish();this.port.postMessage({type:'error',message:'音频设备返回了无效样本。'});return false;}
   value=Math.max(-1,Math.min(1,value));this.buffer[this.used++]=Math.round(value*(value<0?32768:32767));
   if(this.used===this.buffer.length)this.send();
  }
  if(this.outstanding>=200){this.finish();this.port.postMessage({type:'error',message:'页面无法及时接收音频，已停止分段采集。'});return false;}
  return true;
 }
}
registerProcessor('dictpin-pcm',DictpinPcmProcessor);
