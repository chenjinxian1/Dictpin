'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createCapture}=require('../renderer/dictation-capture');
function fixture({media,decode}={}){
 assert.equal(typeof createCapture,'function');
 let stopped=0,ready=0,submits=0,errors=0,clock=0;
 const stream={getTracks:()=>[{stop(){stopped++;}}]},bridge={recordingReady:async()=>{ready++;return{accepted:true};},submitAudio:async value=>{submits++;assert.equal(value.localPcm.byteLength,3200);return{accepted:true};},reportRecordingError:async()=>{errors++;}};
 class Recorder{static isTypeSupported(){return true;}constructor(){this.state='inactive';this.mimeType='audio/webm';}start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable?.({data:new Blob([new Uint8Array(200)])});void this.onstop?.();}}
 const capture=createCapture({bridge,mediaDevices:{getUserMedia:media||(()=>Promise.resolve(stream))},Recorder,decode:decode||(async()=>({localPcm:new Uint8Array(3200),sampleRate:16000,channels:1})),now:()=>clock});
 return {capture,stream,setClock:n=>clock=n,stats:()=>({stopped,ready,submits,errors})};
}
test('cancel while microphone permission is pending closes late stream without ready or submit',async()=>{
 let resolve;const media=new Promise(r=>{resolve=r;}),f=fixture({media:()=>media});const start=f.capture.command({type:'start',sessionId:'one'});await f.capture.command({type:'cancel',sessionId:'one'});resolve(f.stream);await start;assert.deepEqual(f.stats(),{stopped:1,ready:0,submits:0,errors:0});
});
test('duplicate stop submits exactly one complete buffer and releases microphone',async()=>{
 const f=fixture();await f.capture.command({type:'start',sessionId:'one'});f.setClock(100);await Promise.all([f.capture.command({type:'stop',sessionId:'one'}),f.capture.command({type:'stop',sessionId:'one'})]);assert.equal(f.stats().submits,1);assert.equal(f.stats().stopped,1);assert.equal(f.stats().errors,0);
});
test('cancel after recorder start never turns stop event into a paid submission',async()=>{
 const f=fixture();await f.capture.command({type:'start',sessionId:'one'});f.setClock(100);await f.capture.command({type:'cancel',sessionId:'one'});assert.equal(f.stats().submits,0);assert.equal(f.stats().stopped,1);
});
test('decode failure reports input failure but does not submit partial audio',async()=>{
 const f=fixture({decode:async()=>{throw Error('decode failed');}});await f.capture.command({type:'start',sessionId:'one'});f.setClock(100);await f.capture.command({type:'stop',sessionId:'one'});assert.equal(f.stats().submits,0);assert.equal(f.stats().errors,1);assert.equal(f.stats().stopped,1);
});

test('denied or missing microphone reports input error without ready or submission',async()=>{
 for(const name of ['NotAllowedError','NotFoundError']){
  const f=fixture({media:async()=>{throw Object.assign(Error('synthetic device failure'),{name});}});
  await f.capture.command({type:'start',sessionId:'denied-'+name});
  assert.deepEqual(f.stats(),{stopped:0,ready:0,submits:0,errors:1});
 }
});
