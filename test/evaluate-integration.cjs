'use strict';
// End-to-end computation only: public audio -> native CPU -> real API serializer with fetch mock.
// No Store instance, product window, microphone, profile, real key or real fetch.
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {performance}=require('node:perf_hooks');
const {LocalAsr}=require('../app/src/local-asr');const {Controller}=require('../app/src/controller');const api=require('../app/src/api');const {DEFAULTS,validateSettings}=require('../app/src/settings');const {createProviderChecks}=require('../app/src/provider-checks');
const root=path.resolve(__dirname,'..'),evaluation=path.resolve(root,'../local-asr-evaluation'),report={scope:'isolated computation; no GUI acceptance',scenarios:[],negativeCases:[],repeat:[],boundaries:[]};
function wav(file){const b=fs.readFileSync(file);for(let at=12;at+8<=b.length;){const n=b.readUInt32LE(at+4);if(b.toString('ascii',at,at+4)==='data')return new Uint8Array(b.subarray(at+8,at+8+n));at+=8+n+(n&1);}throw Error('WAV');}
const speech=wav(path.join(evaluation,'models/sensevoice/test_wavs/zh.wav'));
function input(pcm){return {localPcm:pcm,sampleRate:16000,channels:1};}
async function stage(local,phase){const deadline=performance.now()+15000;while(local.phase!==phase){assert.ok(local.job,'request ended before decode');assert.ok(performance.now()<deadline,'stage timeout');await new Promise(r=>setTimeout(r,5));}}
async function main(){
 const local=new LocalAsr();
 try{
  const webm=fs.readFileSync(path.join(root,'work/codec/public-stereo.webm')),pcm=fs.readFileSync(path.join(root,'work/codec/public-decoded.pcm'));
  for(const [mode,enabled]of [['dictate',false],['dictate',true],['translate',false],['ask',false]]){
   const requests=[];const fetchImpl=async(url,options)=>{assert.equal(url,'https://text-fixture.invalid/v1/chat/completions');assert.equal(typeof options.body,'string');const body=JSON.parse(options.body);assert.equal(body.model,'qwen3.8-flash');assert.ok(body.messages.every(m=>typeof m.content==='string'));assert.ok(!/input_audio|base64|audio\/webm/.test(options.body));requests.push(body);return new Response(JSON.stringify({choices:[{message:{content:'mock text result'}}]}),{status:200,headers:{'Content-Type':'application/json'}});};
   const apiImpl={...api,transcribe:async()=>{throw Error('cloud audio forbidden');}};
   for(const method of ['refine','translate','ask'])apiImpl[method]=(text,config,key,options)=>api[method](text,config,key,{...options,fetchImpl});
   const store={settings:validateSettings({...DEFAULTS,asr:{...DEFAULTS.asr,backend:'local'},refiner:{...DEFAULTS.refiner,baseUrl:'https://text-fixture.invalid/v1',model:'qwen3.8-flash',enabled},mode,saveHistory:false}),keys:{refiner:'fake-key-for-serializer-only'},dictionary:[]};
   const c=new Controller({store,bridge:{},localAsr:local,apiImpl});
   try{
    assert.equal((await c.toggle('ui')).accepted,true);const id=c.session.id;assert.equal(c.session.recordingLimits.maxDurationMs,60000);c.recordingReady({sessionId:id});c.stop();
    await c.submitAudio({sessionId:id,bytes:webm,mimeType:'audio/webm;codecs=opus',durationMs:5580,...input(pcm)});
    assert.equal(c.state.phase,'done');assert.ok(c.state.result.original.length);assert.equal(requests.length,mode==='dictate'&&!enabled?0:1);assert.equal(local.lastResult.frames,pcm.byteLength/2);
    report.scenarios.push({mode,enabled,phase:c.state.phase,textRequests:requests.length,audioRequests:0,frames:local.lastResult.frames,worker:local.lastResult});
   }finally{c.dispose();}
  }
  const cases=JSON.parse(fs.readFileSync(path.join(evaluation,'work/cases.json'),'utf8'));
  for(const row of cases.filter(x=>!x.expectedSpeech)){
   await assert.rejects(local.transcribe(input(wav(path.join(evaluation,row.path)))),{code:'no_speech'});assert.equal(local.lastResult.speech,false);report.negativeCases.push({name:row.name,rejected:true,frames:local.lastResult.frames});
  }
  for(let i=0;i<20;i++){await local.transcribe(input(speech));report.repeat.push({...local.lastResult});}
  const minute=new Uint8Array(1920000);for(let i=0;i<minute.length;i++)minute[i]=speech[i%speech.length];
  await local.transcribe(input(minute));assert.equal(local.lastResult.frames,960000);report.minute={...local.lastResult,wholeInput:true};
  const abort=new AbortController();const cancelling=local.transcribe(input(minute),{signal:abort.signal});const cancelled=assert.rejects(cancelling,{code:'cancelled'});await stage(local,'decode');const started=performance.now();abort.abort();await cancelled;assert.equal(local.pid,null);report.cancel={stage:'native decode',terminationMs:performance.now()-started};
  await local.transcribe(input(speech));report.restartAfterCancel=true;
  const crashing=local.transcribe(input(minute));const crashed=assert.rejects(crashing,{code:'worker'});await stage(local,'decode');local.child.kill();await crashed;await local.transcribe(input(speech));report.restartAfterCrash=true;
  const checks=createProviderChecks({getSettings:()=>({asr:{backend:'local'}}),getKey:()=>{throw Error('key access forbidden');},localAsr:local,fetchImpl:()=>{throw Error('network forbidden');}});
  const checked=await checks.run('asr');assert.equal(checked.category,'local_ready');assert.equal(checked.httpStatus,null);report.localDiagnostic=checked;
 }finally{await local.dispose();}
 for(const settings of [{readyTimeoutMs:1},{requestTimeoutMs:1}]){
  const local=new LocalAsr(settings);try{await assert.rejects(local.transcribe(input(speech)),{code:'timeout'});assert.equal(local.pid,null);report.boundaries.push({settings,rejected:'timeout',workerExited:true});}finally{await local.dispose();}
 }
 report.summary={scenarios:report.scenarios.length,negativeRejected:report.negativeCases.length,repeats:report.repeat.length,repeatPrivateMiB:[Math.min(...report.repeat.map(x=>x.privateBytes))/1048576,Math.max(...report.repeat.map(x=>x.privateBytes))/1048576],peakWorkingSetMiB:Math.max(...report.repeat.map(x=>x.peakWorkingSetBytes),report.minute.peakWorkingSetBytes)/1048576,modelCopies:1,actualNetworkCalls:0,realGuiTested:false};
 fs.writeFileSync(path.join(root,'work/INTEGRATION-RESULT.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({summary:report.summary,minute:report.minute,cancel:report.cancel,restartAfterCancel:report.restartAfterCancel,restartAfterCrash:report.restartAfterCrash}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
