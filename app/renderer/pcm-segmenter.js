'use strict';
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.DictpinPcm=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 class PcmSegmenter{
  constructor({sessionId,onSegment,onSeal,maxFrames=320000,minFrames=48000,silenceFrames=9600}={}){this.id=sessionId;this.onSegment=onSegment;this.onSeal=onSeal;this.maxFrames=maxFrames;this.minFrames=minFrames;this.silenceFrames=silenceFrames;this.parts=[];this.bufferedSamples=0;this.startSample=0;this.sequence=0;this.quiet=0;this.closed=false;}
  push(input){
   if(this.closed)return;if(!(input instanceof Int16Array))throw Error('PCM16 required');
   let offset=0;
   while(offset<input.length){
    const count=Math.min(input.length-offset,this.maxFrames-this.bufferedSamples),part=new Int16Array(input.subarray(offset,offset+count));let power=0;
    for(const sample of part)power+=(sample/32768)**2;
    this.parts.push(part);this.bufferedSamples+=count;offset+=count;this.quiet=power/count<.003**2?this.quiet+count:0;
    if(this.bufferedSamples>=this.maxFrames||this.bufferedSamples>=this.minFrames&&this.quiet>=this.silenceFrames)this.emit(false);
   }
  }
  emit(final){
   if(!this.bufferedSamples)return;const pcm=new Uint8Array(this.bufferedSamples*2),view=new DataView(pcm.buffer);let at=0;
   for(const part of this.parts){for(const sample of part){view.setInt16(at,sample,true);at+=2;}part.fill(0);}
   const packet={sessionId:this.id,sequence:this.sequence++,startSample:this.startSample,pcm,final};this.startSample+=this.bufferedSamples;this.parts=[];this.bufferedSamples=0;this.quiet=0;this.onSegment(packet);
  }
  finish(){if(this.closed)return;this.closed=true;this.emit(true);this.onSeal({sessionId:this.id,sequence:this.sequence,startSample:this.startSample});}
  dispose(){this.closed=true;for(const part of this.parts)part.fill(0);this.parts=[];this.bufferedSamples=0;}
 }
 return{PcmSegmenter};
});
