'use strict';
// Existing model + a single pinned public sample, explicitly invoked offline.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {performance}=require('node:perf_hooks');const {LocalAsr}=require('../app/src/local-asr');
const root=path.resolve(__dirname,'../work/local03-benchmark'),corpus=path.join(root,'fleurs');
async function run(){
 const manifest=JSON.parse(fs.readFileSync(path.join(corpus,'manifest.json'))),sample=manifest.samples[0],bytes=fs.readFileSync(path.join(corpus,sample.file)+'.pcm');
 if(crypto.createHash('sha256').update(bytes).digest('hex')!==sample.pcmSha256)throw Error('Public PCM checksum mismatch');
 const report={basis:'One fixed authorized public PCM sample, no microphone or paid service. Prewarming loads without inference. Timings exclude Electron/capture and are not a general end-to-end promise.',file:sample.file,pcmSha256:sample.pcmSha256,trials:[]};
 for(let i=0;i<3;i++)for(const prewarm of [false,true]){
  const engine=new LocalAsr({numThreads:1}),trial={prewarm};let text;report.trials.push(trial);
  try{const began=performance.now();if(prewarm)await engine.ensureReady();const preparedAt=performance.now();text=await engine.transcribe({localPcm:bytes,sampleRate:16000,channels:1});Object.assign(trial,{preparationWallMs:preparedAt-began,afterStopWallMs:performance.now()-preparedAt,metrics:engine.lastResult,textSha256:crypto.createHash('sha256').update(text).digest('hex')});}
  finally{await engine.dispose();trial.released=engine.pid===null;}
 }
 bytes.fill(0);report.allExactTextEqual=new Set(report.trials.map(x=>x.textSha256)).size===1;report.allOwnedWorkersExited=report.trials.every(x=>x.released);report.status=report.allExactTextEqual&&report.allOwnedWorkersExited?'passed':'failed';
 fs.writeFileSync(path.join(root,'lifecycle-timings.json'),JSON.stringify(report,null,2));process.stdout.write(JSON.stringify(report)+'\n');if(report.status!=='passed')process.exitCode=1;
}
if(require.main===module)run().catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1;});module.exports={run};
