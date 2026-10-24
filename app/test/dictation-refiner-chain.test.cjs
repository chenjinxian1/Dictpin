'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const {Store}=require('../src/dictation-store'),{Controller}=require('../src/dictation-controller'),{DEFAULTS}=require('../src/settings'),api=require('../src/api'),current=require('../src/dictation-edit');
const WORK=path.resolve(__dirname,'../../work');
function preimage(){
 const file=path.join(__dirname,'fixtures/dictation-edit-pre-review.cjs'),module={exports:{}};
 vm.runInThisContext('(function(require,module,exports){'+fs.readFileSync(file,'utf8')+'\n})',{filename:file})(createRequire(path.resolve(__dirname,'../src/dictation-edit.js')),module,module.exports);
 return module.exports;
}
async function run(t,implementation){
 const dir=fs.mkdtempSync(path.join(WORK,'refiner-chain-'));t.after(()=>{assert.equal(path.dirname(dir),WORK);fs.rmSync(dir,{recursive:true,force:true});});
 const settings=structuredClone(DEFAULTS);settings.mode='ask';settings.refiner.enabled=true;settings.refiner.baseUrl='http://127.0.0.1:9/v1';settings.refiner.model='synthetic';
 fs.writeFileSync(path.join(dir,'settings.json'),JSON.stringify({version:2,settings,secrets:{}}));fs.writeFileSync(path.join(dir,'dictionary.json'),JSON.stringify([{id:'term',word:'nowhere',source:'manual'}]));
 const store=new Store(dir,{isEncryptionAvailable:()=>false},'win32');let requests=0;
 const controller=new Controller({store,bridge:{},localAsr:{transcribe:async()=> 'He is nowhere.'},apiImpl:{...api,refine:(original,config,key,options)=>implementation.refine(original,config,key,{...options,fetchImpl:async()=>{
  requests++;return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'He is now here.'}}],usage:{prompt_tokens:11,completion_tokens:7,total_tokens:18}}),{status:200,headers:{'content-type':'application/json'}});
 }})}});
 t.after(()=>controller.dispose());await controller.toggle('ui');const id=controller.session.id;controller.recordingReady({sessionId:id});controller.stop();
 await controller.submitAudio({sessionId:id,bytes:new Uint8Array(1200),mimeType:'audio/webm',durationMs:100,localPcm:new Uint8Array(3200),sampleRate:16000,channels:1});
 return {result:store.getRecentResult(),usage:store.usageSnapshot(),requests};
}
test('frozen pre-review module reproduces nowhere splitting; fixed controller chain retains original and exactly one usage attempt',async t=>{
 const before=await run(t,preimage());assert.equal(before.result.text,'He is now here.');assert.equal(before.result.refined,true);
 const after=await run(t,current);assert.equal(after.result.text,'He is nowhere.');assert.equal(after.result.original,'He is nowhere.');assert.equal(after.result.refined,false);assert.match(after.result.message,/整理未完成/);
 for(const result of [before,after]){assert.equal(result.requests,1);assert.equal(result.usage.summary.requests,1);assert.equal(result.usage.summary.tokens.total.known,'18');assert.equal(result.usage.recent.length,1);}
});
