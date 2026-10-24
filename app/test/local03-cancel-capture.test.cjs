'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createCapture}=require('../renderer/dictation-capture');
test('cancel-retain stops the microphone and submits a complete recovery fragment without recognition',async()=>{
 let stopped=0,submitted=0,retained=null;
 class Recorder{static isTypeSupported(){return true;}constructor(){this.state='inactive';this.mimeType='audio/webm';}start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable({data:new Blob([new Uint8Array(200)])});this.onstop();}}
 const capture=createCapture({bridge:{recordingReady:async()=>({accepted:true}),submitAudio:async()=>{submitted++;},submitCancelledAudio:async value=>{retained={...value,localPcm:new Uint8Array(value.localPcm)};return {accepted:true};}},mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){stopped++;}}]})},Recorder,now:(()=>{let t=0;return()=>t+=100;})(),decode:async()=>({localPcm:new Uint8Array(320),sampleRate:16000,channels:1})});
 await capture.command({type:'start',sessionId:'owned'});
 await capture.command({type:'cancel-retain',sessionId:'owned'});
 assert.equal(stopped,1);assert.equal(submitted,0);assert.equal(retained?.sessionId,'owned');assert.equal(retained.localPcm.length,320);assert.deepEqual(Object.keys(retained.timings).sort(),['decodeMs','deviceReadyMs','recordingStopMs']);for(const value of Object.values(retained.timings))assert.ok(Number.isFinite(value)&&value>=0);capture.dispose();
});
