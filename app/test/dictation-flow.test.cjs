'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Controller}=require('../src/dictation-controller'),{DEFAULTS}=require('../src/settings');
function setup({refine=false,local,edit}={}){
 const calls={local:0,remote:0,edit:0},store={settings:structuredClone(DEFAULTS),dictionary:[],keys:{asr:'FAKE_OLD',refiner:'FAKE_TEXT'},notices:[],saveRecentResult(value){this.recentResult=structuredClone(value);}};
 store.settings.mode='ask';store.settings.refiner.enabled=refine;
 const controller=new Controller({store,bridge:{},localAsr:{transcribe:async(...args)=>{calls.local++;return local?local(...args):'合成原文，不删500。';}},apiImpl:{transcribe(){calls.remote++;throw Error('remote ASR forbidden');},ask(){calls.remote++;throw Error('Ask forbidden');},translate(){calls.remote++;throw Error('translate forbidden');},refine:async(...args)=>{calls.edit++;return edit?edit(...args):args[0];}}});
 return {controller,store,calls};
}
const audio=id=>({sessionId:id,bytes:new Uint8Array(1200),mimeType:'audio/webm',durationMs:100,localPcm:new Uint8Array(3200),sampleRate:16000,channels:1});
async function recording(c){await c.toggle('ui');const id=c.session.id;c.recordingReady({sessionId:id});return id;}
test('record-stop-local-recognize-light-edit persists the complete result with one model attempt',async t=>{
 const {controller:c,store,calls}=setup({refine:true});t.after(()=>c.dispose());const id=await recording(c);c.stop();c.stop();await c.submitAudio(audio(id));await c.submitAudio(audio(id));
 assert.equal(calls.local,1);assert.equal(calls.edit,1);assert.equal(calls.remote,0);assert.equal(store.recentResult.text,'合成原文，不删500。');assert.equal(c.state.phase,'done');
});
test('editing off makes no text request and keeps raw recognized output',async t=>{
 const {controller:c,store,calls}=setup();t.after(()=>c.dispose());const id=await recording(c);c.stop();await c.submitAudio(audio(id));assert.equal(calls.edit,0);assert.equal(store.recentResult.refined,false);
});
test('cancel before stop sends neither recognition nor model request and late audio is ignored',async t=>{
 const {controller:c,calls}=setup({refine:true});t.after(()=>c.dispose());const id=await recording(c);c.cancel();assert.equal((await c.submitAudio(audio(id))).accepted,false);assert.deepEqual(calls,{local:0,remote:0,edit:0});
});
test('old mode requests cannot stop or replace a running dictation',async t=>{
 const {controller:c}=setup();t.after(()=>c.dispose());const id=await recording(c);
 assert.equal((await c.toggle('shortcut',{mode:'ask'})).accepted,false);assert.equal(c.state.phase,'recording');assert.equal(c.session.id,id);
 assert.equal((await c.processText({text:'malicious',mode:'ask'})).accepted,false);assert.equal(c.state.phase,'recording');
 assert.equal((await c.retryHistory('old-ask')).accepted,false);assert.equal(c.state.phase,'recording');
});
test('late recognition cannot overwrite or charge a newer session',async t=>{
 let resolve;const pending=new Promise(r=>{resolve=r;});const {controller:c,calls}=setup({refine:true,local:()=>pending});t.after(()=>c.dispose());
 const old=await recording(c);c.stop();const submission=c.submitAudio(audio(old));c.cancel();const recovery=c.recoverySummary();assert.equal((await c.toggle('ui')).reason,'recovery');c.discardRecovery(recovery.token);const next=await recording(c);resolve('迟到的旧结果。');await submission;
 assert.equal(c.session.id,next);assert.equal(c.state.phase,'recording');assert.equal(calls.edit,0);
});
test('edit failure retains full original and reports fallback without an automatic retry',async t=>{
 const {controller:c,store,calls}=setup({refine:true,edit:()=>{throw Error('synthetic failure');}});t.after(()=>c.dispose());const id=await recording(c);c.stop();await c.submitAudio(audio(id));
 assert.equal(store.recentResult.text,store.recentResult.original);assert.match(store.recentResult.message,/原始转录/);assert.equal(calls.edit,1);
});
test('legacy recovery intent is rejected before any model request',async t=>{
 const {controller:c,calls}=setup();t.after(()=>c.dispose());c.stageRecovery({id:'old-slot',mode:'ask',task:'expand',context:'old context',config:structuredClone(DEFAULTS)},audio('old-slot'));c.offerRecovery('old-slot');
 const token=c.recoverySummary().token;assert.equal((await c.retryRecovery(token)).accepted,false);assert.deepEqual(calls,{local:0,remote:0,edit:0});
});

test('no-speech local failure makes zero model calls and saves no fabricated result',async t=>{
 const {controller:c,store,calls}=setup({refine:true,local:()=>{throw Object.assign(Error('synthetic no speech'),{code:'no_speech'});}});t.after(()=>c.dispose());
 const id=await recording(c);c.stop();await c.submitAudio(audio(id));
 assert.equal(calls.local,1);assert.equal(calls.edit,0);assert.equal(calls.remote,0);assert.equal(store.recentResult,undefined);
});
test('cancelled in-flight edit completion cannot overwrite a newer capture or its preserved raw result',async t=>{
 let resolve,started;const pending=new Promise(r=>{resolve=r;}),entered=new Promise(r=>{started=r;});
 const {controller:c,store,calls}=setup({refine:true,edit:()=>{started();return pending;}});t.after(()=>c.dispose());
 const id=await recording(c);c.stop();const submission=c.submitAudio(audio(id));await entered;c.cancel();
 const preserved=structuredClone(store.recentResult);const next=await recording(c);resolve('late edited text');await submission;
 assert.equal(c.state.phase,'recording');assert.equal(c.session.id,next);assert.deepEqual(store.recentResult,preserved);assert.equal(calls.edit,1);
});
