'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Controller}=require('../src/dictation-controller'),{Store}=require('../src/dictation-store'),{DEFAULTS}=require('../src/settings');
const WORK=path.resolve(__dirname,'../../work'),safe={isEncryptionAvailable:()=>false};
const original='完整识别原文：预算500元，周五15:30开会，不要扩写。😀';
const audio=id=>({sessionId:id,bytes:new Uint8Array(1200),mimeType:'audio/webm',durationMs:100,localPcm:new Uint8Array(3200),sampleRate:16000,channels:1});
async function pendingEdit(t){
 fs.mkdirSync(WORK,{recursive:true});const dir=fs.mkdtempSync(path.join(WORK,'shutdown-'));
 const settings=structuredClone(DEFAULTS);settings.asr.backend='local';settings.refiner.enabled=true;settings.refiner.baseUrl='http://127.0.0.1:9/v1';
 fs.writeFileSync(path.join(dir,'settings.json'),JSON.stringify({version:2,settings,secrets:{}}));
 const store=new Store(dir,safe,'win32');const old={id:'previous-result',mode:'dictate',status:'completed',original:'上次原文。',text:'上次原文。',refined:false};store.saveRecentResult(old);
 let resolve,entered;const waiting=new Promise(r=>{resolve=r;}),started=new Promise(r=>{entered=r;});
 const controller=new Controller({store,bridge:{},localAsr:{transcribe:async()=>original},apiImpl:{refine:()=>{entered();return waiting;}}});
 t.after(()=>{controller.dispose();assert.equal(path.dirname(dir),WORK);fs.rmSync(dir,{recursive:true,force:true});});
 await controller.toggle('ui');const id=controller.session.id;controller.recordingReady({sessionId:id});controller.stop();const submission=controller.submitAudio(audio(id));await started;
 return {controller,store,dir,id,submission,resolve,read:()=>new Store(dir,safe,'win32').getRecentResult()};
}
test('shutdown during pending light edit preserves the complete new original for a fresh Store',async t=>{
 const f=await pendingEdit(t);f.controller.dispose();const saved=f.read();
 assert.equal(saved.id,f.id);assert.equal(saved.original,original);assert.equal(saved.text,original);assert.equal(saved.refined,false);assert.equal(saved.status,'cancelled');
 assert.match(saved.message,/关闭|退出/);assert.equal(fs.existsSync(path.join(f.dir,'history.json')),false);
 f.resolve('迟到的整理内容。');await f.submission;
});
test('late edit completion after shutdown and repeated dispose cannot overwrite the preserved original',async t=>{
 const f=await pendingEdit(t);f.controller.dispose();const before=f.read();
 assert.equal(before.id,f.id);f.controller.dispose();f.resolve('迟到的整理内容。');await f.submission;
 assert.deepEqual(f.read(),before);assert.equal(f.controller.disposed,true);assert.equal(f.controller.session,null);
});
test('shutdown while recognition is pending leaves the previous saved result intact',async t=>{
 let resolve;const pending=new Promise(r=>{resolve=r;}),saved=[];const store={settings:structuredClone(DEFAULTS),dictionary:[],keys:{},saveRecentResult:r=>saved.push(structuredClone(r))};
 const c=new Controller({store,bridge:{},localAsr:{transcribe:()=>pending}});t.after(()=>c.dispose());await c.toggle('ui');const id=c.session.id;c.recordingReady({sessionId:id});c.stop();const submission=c.submitAudio(audio(id));c.dispose();resolve(original);await submission;
 assert.deepEqual(saved,[]);assert.equal(c.session,null);
});
