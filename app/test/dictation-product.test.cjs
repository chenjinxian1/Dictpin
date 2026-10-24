'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Store}=require('../src/dictation-store');
const {Controller}=require('../src/dictation-controller');
const {DEFAULTS}=require('../src/settings');
const digest=b=>require('node:crypto').createHash('sha256').update(b).digest('hex');
const WORK=path.resolve(__dirname,'../../work');
function fixture(t,{mode='ask',history=[]}={}){
 const dir=fs.mkdtempSync(path.join(WORK,'dictation-fixture-'));
 t.after(()=>{assert.equal(path.dirname(path.resolve(dir)),WORK);assert.ok(path.basename(dir).startsWith('dictation-fixture-'));fs.rmSync(dir,{recursive:true,force:true});});
 const settings=structuredClone(DEFAULTS);settings.mode=mode;settings.refiner.enabled=false;settings.futurePreference={keep:'opaque'};
 const envelope={version:2,futureEnvelope:{keep:true},settings,secrets:{asr:'opaque-asr',refiner:'opaque-refiner'}};
 fs.writeFileSync(path.join(dir,'settings.json'),JSON.stringify(envelope));fs.writeFileSync(path.join(dir,'history.json'),JSON.stringify(history));
 fs.writeFileSync(path.join(dir,'dictionary.json'),JSON.stringify([{id:'legacy-word',word:'OpenAI',replacement:'',note:'keep old note',source:'manual',futureWord:{keep:true},createdAt:'2020-01-01T00:00:00.000Z',updatedAt:'2020-01-01T00:00:00.000Z'}]));
 const safe={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:()=> 'FAKE_SYNTHETIC_KEY'};
 const before=Object.fromEntries(['settings.json','history.json','dictionary.json'].map(n=>[n,fs.readFileSync(path.join(dir,n))]));
 return {dir,before,store:new Store(dir,safe,'win32')};
}
test('legacy Ask config migrates effective mode without resetting saved provider or ciphertext',t=>{
 const {dir,before,store}=fixture(t);assert.equal(store.settings.mode,'dictate');assert.equal(store.settings.refiner.model,DEFAULTS.refiner.model);assert.deepEqual(fs.readFileSync(path.join(dir,'settings.json')),before['settings.json']);
});
test('opening and saving preserves all legacy history bytes even beyond old cap and retention',t=>{
 const history=Array.from({length:205},(_,i)=>({id:'old-'+i,createdAt:'2000-01-01T00:00:00.000Z',mode:i%2?'ask':'translate',status:'completed',original:'synthetic original '+i,text:'synthetic result '+i,refined:true,durationMs:1,audioAvailable:false}));
 const {dir,before,store}=fixture(t,{history});store.save({...store.settings,deviceId:'synthetic-device'});assert.equal(digest(fs.readFileSync(path.join(dir,'history.json'))),digest(before['history.json']));
});
test('narrow settings save keeps unknown envelope/settings/provider fields and opaque secrets',t=>{
 const {dir,store}=fixture(t);store.save({...store.settings,deviceId:'synthetic-device'});const after=JSON.parse(fs.readFileSync(path.join(dir,'settings.json'),'utf8'));
 assert.deepEqual(after.futureEnvelope,{keep:true});assert.deepEqual(after.settings.futurePreference,{keep:'opaque'});assert.deepEqual(after.secrets,{asr:'opaque-asr',refiner:'opaque-refiner'});
});
function engine({mode='ask'}={}){
 const settings=structuredClone(DEFAULTS);settings.mode=mode;settings.refiner.enabled=false;
 const store={settings,dictionary:[],keys:{asr:'FAKE',refiner:'FAKE'},notices:[],addHistory(){assert.fail('legacy history must not be written');}};
 let remote=0;const controller=new Controller({store,bridge:{},localAsr:{transcribe:async()=> '合成原文。'},apiImpl:{transcribe:async()=>{remote++;return 'REMOTE';},ask:async()=>{remote++;return 'ANSWER';},translate:async()=>{remote++;return 'TRANSLATION';},refine:async text=>text}});
 return {controller,store,remote:()=>remote};
}
test('old tray/common shortcut configuration always prepares local dictate',async t=>{
 const {controller}=engine();t.after(()=>controller.dispose());const result=await controller.toggle('ui');assert.equal(result.accepted,true);assert.equal(controller.session.mode,'dictate');assert.equal(controller.session.config.asr.backend,'local');assert.equal(controller.session.context,'');
});
test('explicit old modes reject before capture or any model request',async t=>{
 const {controller,remote}=engine();t.after(()=>controller.dispose());let captures=0;controller.on('command',()=>captures++);
 for(const mode of ['ask','translate'])assert.equal((await controller.toggle('shortcut',{mode})).accepted,false);
 assert.equal(captures,0);assert.equal(remote(),0);
});
test('direct text task is disabled rather than translated into another model task',async t=>{
 const {controller,remote}=engine();t.after(()=>controller.dispose());assert.equal((await controller.processText({text:'synthetic request',mode:'ask',task:'expand'})).accepted,false);assert.equal(remote(),0);
});

test('a new common shortcut may reuse a dormant old Ask key without losing its migration record',t=>{
 const {dir,store}=fixture(t);const old=structuredClone(DEFAULTS.modeShortcuts);assert.doesNotThrow(()=>store.save({...store.settings,shortcut:old.ask}));
 const saved=JSON.parse(fs.readFileSync(path.join(dir,'settings.json'),'utf8'));assert.deepEqual(saved.compatibility.disabledModeShortcuts,old);assert.equal(store.settings.modeShortcuts.ask,'');
});
