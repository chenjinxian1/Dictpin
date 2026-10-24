'use strict';
const MAX_SEGMENT_FRAMES=320000,MAX_SESSION_FRAMES=28800000;
class SegmentPipeline{
 constructor({sessionId,recognize,onText=()=>{},onProgress=()=>{},onFailure=()=>{},onBackpressure=()=>{},onDrain=()=>{}}){
  if(typeof sessionId!=='string'||!sessionId||typeof recognize!=='function')throw Error('Invalid segmented task');
  Object.assign(this,{sessionId,recognize,onText,onProgress,onFailure,onBackpressure,onDrain});
  this.pending=[];this.sequence=0;this.totalSamples=0;this.completed=0;this.skipped=0;this.paused=false;this.sealed=false;this.disposed=false;this.generation=0;this.lastSilent=null;this.backpressure=false;this.finalized=false;this.running=null;
  this.finished=new Promise(resolve=>{this.resolveFinished=resolve;});
 }
 summary(){return{sessionId:this.sessionId,pending:this.pending.length,completed:this.completed,skipped:this.skipped,paused:this.paused,sealed:this.sealed,totalSamples:this.totalSamples,backpressure:this.backpressure};}
 notify(){this.onProgress(this.summary());}
 enqueue(input){
  if(this.disposed||this.sealed||!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['sessionId','sequence','startSample','pcm','final'].includes(k)))return{accepted:false,reason:'closed'};
  const {sessionId,sequence,startSample,pcm,final=false}=input;
  if(sessionId!==this.sessionId||sequence!==this.sequence||startSample!==this.totalSamples||!Number.isSafeInteger(sequence)||!Number.isSafeInteger(startSample)||startSample<0||typeof final!=='boolean')return{accepted:false,reason:'sequence'};
  if(!(pcm instanceof Uint8Array)||pcm.byteLength<2||pcm.byteLength%2||pcm.byteLength>MAX_SEGMENT_FRAMES*2||this.totalSamples+pcm.byteLength/2>MAX_SESSION_FRAMES)return{accepted:false,reason:'format'};
  if(this.pending.length>=3&&(!final||this.pending.length>=4))return{accepted:false,reason:'backpressure'};
  const packet={sequence,startSample,frames:pcm.byteLength/2,pcm:new Uint8Array(pcm)};
  this.pending.push(packet);this.sequence++;this.totalSamples+=packet.frames;if(final)this.sealed=true;
  // Stop the producer early enough to reserve one normal packet plus its final tail.
  if(this.pending.length>=2&&!this.backpressure){this.backpressure=true;this.onBackpressure();}
  this.notify();this.pump();return{accepted:true,pending:this.pending.length};
 }
 seal(input){
  if(this.disposed||!input||Object.keys(input).some(k=>!['sessionId','sequence','startSample'].includes(k))||input.sessionId!==this.sessionId||input.sequence!==this.sequence||input.startSample!==this.totalSamples)return{accepted:false};
  this.sealed=true;this.notify();this.pump();return{accepted:true};
 }
 pump(){
  if(this.disposed||this.paused||this.running)return;
  if(!this.pending.length){if(this.sealed&&!this.finalized){this.onDrain(this.summary());if(this.paused||this.disposed)return;this.finalized=true;this.resolveFinished(this.summary());}return;}
  const generation=this.generation,packet=this.pending[0],abort=new AbortController();this.abort=abort;
  this.running=Promise.resolve().then(async()=>{
   if(this.disposed||generation!==this.generation)return;
   const padded=packet.frames<160?new Uint8Array(320):packet.pcm;if(padded!==packet.pcm)padded.set(packet.pcm);
   try{
    const text=await this.recognize({bytes:padded,mimeType:'audio/pcm',localPcm:padded,sampleRate:16000,channels:1,durationMs:padded.byteLength/32},{signal:abort.signal});
    if(this.disposed||generation!==this.generation)return;
    if(typeof text!=='string'||!text.trim()||text.length>20000||text.includes('\0'))throw Error('识别没有返回有效文字。');
    this.onText(text.trim(),{sequence:packet.sequence,startSample:packet.startSample,frames:packet.frames});
    this.pending.shift();packet.pcm.fill(0);this.completed++;
   }catch(error){
    if(this.disposed||generation!==this.generation)return;
    if(error?.code==='no_speech'&&error.reason!=='empty_transcript'){
     this.pending.shift();this.lastSilent?.pcm.fill(0);this.lastSilent=packet;this.completed++;this.skipped++;
    }else{this.paused=true;this.onFailure(error);}
   }finally{if(padded!==packet.pcm)padded.fill(0);}
  }).finally(()=>{this.running=null;this.abort=null;if(!this.disposed){this.notify();this.pump();}});
 }
 pause(){this.paused=true;this.generation++;this.abort?.abort();this.notify();return this.running||Promise.resolve();}
 restoreLastSilent(){if(!this.lastSilent)return false;this.pending.unshift(this.lastSilent);this.lastSilent=null;this.paused=true;this.notify();return true;}
 async resume(sessionId){
  if(this.disposed||!this.paused||typeof sessionId!=='string'||!sessionId)return{accepted:false};
  const generation=this.generation;await this.running;if(this.disposed||generation!==this.generation||!this.paused)return{accepted:false};this.sessionId=sessionId;this.paused=false;this.generation++;this.finalized=false;this.notify();this.pump();return this.finished;
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.generation++;this.abort?.abort();for(const item of this.pending)item.pcm.fill(0);this.pending=[];this.lastSilent?.pcm.fill(0);this.lastSilent=null;this.resolveFinished({disposed:true});}
}
module.exports={SegmentPipeline,MAX_SEGMENT_FRAMES,MAX_SESSION_FRAMES};
