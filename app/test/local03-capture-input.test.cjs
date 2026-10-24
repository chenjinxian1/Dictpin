'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createCapture}=require('../renderer/dictation-capture');
function fixture(){
 const requests=[];let stopped=0,ready=0;
 const stream={getTracks:()=>[{stop(){stopped++;}}]};
 class Recorder{static isTypeSupported(){return true;}start(){this.state='recording';}stop(){this.state='inactive';this.onstop?.();}}
 const capture=createCapture({mediaDevices:{async getUserMedia(value){requests.push(value);return stream;}},Recorder,decode:async()=>{throw Error('Cancelled recording must not decode');},bridge:{async recordingReady(){ready++;return{accepted:true};},async reportRecordingError(){throw Error('Unexpected capture error');}}});
 return{capture,requests,stats:()=>({stopped,ready})};
}
test('opening capture does not request audio; explicit start bypasses communications processing',async()=>{
 const f=fixture();assert.deepEqual(f.requests,[]);
 assert.deepEqual(await f.capture.command({type:'start',sessionId:'default'}),{accepted:true});
 assert.deepEqual(f.requests,[{audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false}]);
 f.capture.dispose();assert.deepEqual(f.stats(),{stopped:1,ready:1});
});
test('selected microphone is preserved exactly while communications processing stays disabled',async()=>{
 const f=fixture();
 await f.capture.command({type:'start',sessionId:'selected',deviceId:'synthetic-headset'});
 assert.deepEqual(f.requests,[{audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false,deviceId:{exact:'synthetic-headset'}},video:false}]);
 await f.capture.command({type:'cancel',sessionId:'selected'});assert.deepEqual(f.stats(),{stopped:1,ready:1});
 assert.equal((await f.capture.command({type:'start',sessionId:'selected'})).accepted,false);assert.equal(f.requests.length,1);
 f.capture.dispose();
});
