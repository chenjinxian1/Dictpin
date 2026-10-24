'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Controller}=require('../src/dictation-controller'),{DEFAULTS}=require('../src/settings');
const audio=id=>({sessionId:id,bytes:new Uint8Array(1200),mimeType:'audio/webm',durationMs:100,localPcm:new Uint8Array(3200),sampleRate:16000,channels:1});
function fixture(t){let time=0,recent=null,edits=0;const settings=structuredClone(DEFAULTS);settings.refiner.enabled=true;settings.refiner.baseUrl='http://127.0.0.1:9/v1';const store={settings,dictionary:[{id:'term',word:'OpenAI',aliases:[]}],keys:{refiner:'SYNTHETIC_PRIVATE_KEY'},saveRecentResult:r=>recent=structuredClone(r),getRecentResult:()=>recent};let local;
 const c=new Controller({store,bridge:{},monotonicNow:()=>time,localAsr:local={ensureReady:async()=>true,transcribe:async()=>{time=150;local.lastResult={waitReadyMs:5,asrMs:12,vadMs:2,elapsedMs:14,loadMs:50,threads:2};return '私人合成识别正文。';}},apiImpl:{refine:async text=>{edits++;time=180;return text;}}});t.after(()=>c.dispose());return {c,store,local,setTime:value=>time=value,edits:()=>edits};}
test('Local03 task performance records combine measured capture, IPC, ASR, correction and cleanup durations',async t=>{
 const f=fixture(t),{c}=f;await c.toggle();const id=c.session.id;f.setTime(7);c.recordingReady({sessionId:id});f.setTime(100);c.stop();f.setTime(125);await c.submitAudio({...audio(id),timings:{deviceReadyMs:4,recordingStopMs:3,decodeMs:20}});const [record]=c.getPerformanceRecords();assert.equal(record.id,id);assert.equal(record.status,'completed');assert.equal(record.audioBytes,1200);assert.equal(record.threads,2);
 assert.deepEqual(record.durations,{deviceReadyMs:4,recordingStopMs:3,decodeMs:20,beginToDeviceReadyMs:7,stopToSubmitMs:25,asrWaitMs:5,recognitionMs:12,modelLoadMs:50,vadMs:2,asrElapsedMs:14,asrWallMs:25,dictionaryMs:0,cleanupMs:30,textReadyMs:150,totalMs:180});assert.equal(f.edits(),1);
});
test('Local03 performance timings reject unknown fields and invalid values before audio processing',t=>{
 const {c}=fixture(t),config=c.prepare({}).config;for(const timings of [{text:'PRIVATE_TEXT'},{decodeMs:-1},{decodeMs:Infinity},{decodeMs:NaN},{decodeMs:'12'},{decodeMs:600001},[],null])assert.throws(()=>c.validAudio({...audio('x'),timings},config),/计时/);
 const accessor={};Object.defineProperty(accessor,'decodeMs',{enumerable:true,get(){throw Error('must not execute');}});assert.throws(()=>c.validAudio({...audio('x'),timings:accessor},config),/计时/);assert.doesNotThrow(()=>c.validAudio({...audio('x'),timings:{decodeMs:0}},config));
});
test('Local03 performance records are bounded detached numeric diagnostics without text, rules or keys',async t=>{
 const {c,store}=fixture(t);store.settings.refiner.enabled=false;for(let i=0;i<105;i++){const s=c.begin(c.prepare({}),'recording');s.original='机密正文与词典不得进入记录。';c.publish({phase:'processing',sessionId:s.id});await c.finishText(s);}
 const records=c.getPerformanceRecords();assert.equal(records.length,100);assert.deepEqual(Object.keys(records[0]).sort(),['audioBytes','durations','id','status','threads']);assert.equal(records[0].durations.deviceReadyMs,null);assert.equal(records[0].durations.recognitionMs,null);const serialized=JSON.stringify(records);for(const secret of ['机密','正文','词典','OpenAI','SYNTHETIC_PRIVATE_KEY','localPcm','bytes'])assert.equal(serialized.includes(secret),false);records[0].durations.totalMs=999;assert.notEqual(c.getPerformanceRecords()[0].durations.totalMs,999);
});
test('Local03 cancelled complete audio adds safe capture metrics without recognition or cleanup',async t=>{
 const {c,edits,setTime}=fixture(t);await c.toggle();const id=c.session.id;setTime(10);c.recordingReady({sessionId:id});setTime(50);c.cancel();setTime(60);assert.equal(c.submitCancelledAudio({...audio(id),timings:{deviceReadyMs:8,recordingStopMs:2,decodeMs:6}}).accepted,true);const record=c.getPerformanceRecords()[0];assert.equal(record.status,'cancelled');assert.equal(record.audioBytes,1200);assert.equal(record.durations.decodeMs,6);assert.equal(record.durations.recognitionMs,null);assert.equal(record.durations.cleanupMs,null);assert.equal(edits(),0);
});
