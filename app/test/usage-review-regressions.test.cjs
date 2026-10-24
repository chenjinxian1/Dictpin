'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Store}=require('../src/store'),{UsageLedger}=require('../src/usage-ledger'),{DEFAULTS,validateSettings}=require('../src/settings'),{mergeSettingsSection}=require('../src/settings-sections'),core=require('../renderer/token-usage');
const safe={isEncryptionAvailable:()=>true,encryptString:value=>Buffer.from('SYNTHETIC:'+value),decryptString:value=>value.toString().slice(10)};
const price=model=>({model,currency:'USD',inputPerMillion:'2',outputPerMillion:'8',cacheReadPerMillion:'0.5'});
function fixture(t){const root=path.resolve(__dirname,'../../work');fs.mkdirSync(root,{recursive:true});const directory=fs.mkdtempSync(path.join(root,'usage-review-'));t.after(()=>{assert.equal(path.dirname(directory),root);assert.ok(path.basename(directory).startsWith('usage-review-'));fs.rmSync(directory,{recursive:true,force:true});});return new Store(directory,safe,'win32');}
function configure(store,{withKey=false}={}){
 store.save({...store.settings,asr:{...store.settings.asr,model:'asr-model'},refiner:{...store.settings.refiner,baseUrl:'https://first.invalid/v1',model:'text-model',...(withKey?{key:'SYNTHETIC_KEY',persistKey:true}:{})}});
 store.save({...store.settings,usagePrices:{asr:price('asr-model'),refiner:price('text-model')}});
}
function update(store,kind,values){return store.save(mergeSettingsSection(store.settings,{section:'services',values:{[kind]:values}}));}
const begin={phase:'start',attemptId:'attempt',operationId:'operation',kind:'refiner',mode:'dictate',model:'text-model',at:1000,price:price('text-model')};
const usage=core.normalizeUsage({prompt_tokens:100,completion_tokens:20,total_tokens:120,prompt_tokens_details:{cached_tokens:40}});

test('same-model provider change clears only its prices and never rewrites historical estimates',t=>{
 const store=fixture(t);configure(store);
 assert.equal(store.recordUsage(begin),true);assert.equal(store.recordUsage({phase:'finish',attemptId:'attempt',status:'responded',at:1100,usage}),true);
 const history=store.usageSnapshot(),oldAsr=structuredClone(store.settings.usagePrices.asr);
 update(store,'refiner',{baseUrl:'https://second.invalid/v1'});
 assert.deepEqual(store.settings.usagePrices.refiner,core.defaultPrice());assert.deepEqual(store.settings.usagePrices.asr,oldAsr);
 assert.equal(core.estimateCost(usage,store.settings.usagePrices.refiner,store.settings.refiner.model).picoUnits,null);
 assert.deepEqual(store.usageSnapshot(),history);assert.deepEqual(new Store(store.dir,safe,'win32').settings.usagePrices.refiner,core.defaultPrice());
 assert.equal(fs.readFileSync(path.join(store.dir,'token-usage.json'),'utf8').includes('.invalid'),false);
});
test('same-host request path and ASR protocol changes invalidate their own prices',t=>{
 const store=fixture(t);configure(store);update(store,'refiner',{baseUrl:'https://first.invalid/other-v1'});
 assert.deepEqual(store.settings.usagePrices.refiner,core.defaultPrice());const unchanged=structuredClone(store.settings.usagePrices.refiner);
 update(store,'asr',{protocol:'qwen-input-audio'});assert.deepEqual(store.settings.usagePrices.asr,core.defaultPrice());assert.deepEqual(store.settings.usagePrices.refiner,unchanged);
});
test('equivalent base and full endpoint spellings preserve their prices',t=>{
 const store=fixture(t);configure(store);const expected=structuredClone(store.settings.usagePrices);
 update(store,'refiner',{baseUrl:'https://first.invalid/v1/chat/completions',endpointMode:'endpoint'});assert.deepEqual(store.settings.usagePrices,expected);
 update(store,'refiner',{baseUrl:'https://FIRST.INVALID:443/v1/',endpointMode:'base'});assert.deepEqual(store.settings.usagePrices,expected);
});
test('switching local/cloud or enabling a service preserves unchanged provider prices',t=>{
 const store=fixture(t);configure(store);const expected=structuredClone(store.settings.usagePrices);
 update(store,'asr',{backend:'local'});assert.deepEqual(store.settings.usagePrices,expected);
 update(store,'asr',{backend:'cloud'});update(store,'refiner',{enabled:true});assert.deepEqual(store.settings.usagePrices,expected);
});
test('rejected endpoint, credential binding, and write failures preserve old prices in memory and on disk',t=>{
 const store=fixture(t);configure(store,{withKey:true});const settings=structuredClone(store.settings),data=fs.readFileSync(store.file),keys=structuredClone(store.keys),secrets=structuredClone(store.secrets);
 assert.throws(()=>update(store,'refiner',{baseUrl:'https://second.invalid/v1?key=FORBIDDEN'}));
 assert.throws(()=>update(store,'refiner',{baseUrl:'https://second.invalid/v1'}),/密钥/);
 const rename=fs.renameSync;fs.renameSync=(from,to)=>{if(to===store.file)throw Error('SYNTHETIC_WRITE_FAILURE');return rename(from,to);};
 try{assert.throws(()=>update(store,'refiner',{baseUrl:'https://second.invalid/v1',key:'SYNTHETIC_REPLACEMENT'}),/SYNTHETIC_WRITE_FAILURE/);}finally{fs.renameSync=rename;}
 assert.deepEqual(store.settings,settings);assert.deepEqual(fs.readFileSync(store.file),data);assert.deepEqual(store.keys,keys);assert.deepEqual(store.secrets,secrets);
});
test('changing provider with replacement key clears its price while preserving credential behavior',t=>{
 const store=fixture(t);configure(store,{withKey:true});update(store,'refiner',{baseUrl:'https://second.invalid/v1',key:'SYNTHETIC_REPLACEMENT',persistKey:true});
 assert.equal(store.keys.refiner,'SYNTHETIC_REPLACEMENT');assert.equal(new Store(store.dir,safe,'win32').keys.refiner,'SYNTHETIC_REPLACEMENT');assert.deepEqual(store.settings.usagePrices.refiner,core.defaultPrice());
});
test('all C0 control characters in either service model fail validation before a request can start',()=>{
 for(const kind of ['asr','refiner'])for(let code=0;code<32;code++)for(const model of ['model'+String.fromCharCode(code)+'alias',String.fromCharCode(code)+'model']){
  const input=structuredClone(DEFAULTS);input[kind].model=model;assert.throws(()=>validateSettings(input),/模型/);
 }
 assert.equal(validateSettings({...structuredClone(DEFAULTS),refiner:{...DEFAULTS.refiner,model:'  valid-model  '}}).refiner.model,'valid-model');
});
test('revision overflow fails closed before a write and retains the last safe ledger file',t=>{
 const store=fixture(t),file=path.join(store.dir,'token-usage.json');
 const input={version:1,revision:Number.MAX_SAFE_INTEGER,startedAt:null,archive:core.emptySummary(),records:[]};fs.writeFileSync(file,JSON.stringify(input));const before=fs.readFileSync(file);let writes=0;
 const ledger=new UsageLedger(file,{write:()=>{writes++;}});assert.equal(ledger.snapshot().available,true);assert.equal(ledger.record(begin),false);assert.equal(writes,0);
 assert.equal(ledger.snapshot().available,false);assert.equal(ledger.snapshot().revision,Number.MAX_SAFE_INTEGER);assert.equal(ledger.snapshot().summary.requests,0);assert.deepEqual(fs.readFileSync(file),before);
 const restarted=new UsageLedger(file);assert.equal(restarted.snapshot().available,true);assert.equal(restarted.snapshot().revision,Number.MAX_SAFE_INTEGER);assert.equal(restarted.record(begin),false);assert.deepEqual(fs.readFileSync(file),before);
});
test('last safe revision can be committed; its following completion does not overwrite pending state unsafely',t=>{
 const store=fixture(t),file=path.join(store.dir,'token-usage.json');fs.writeFileSync(file,JSON.stringify({version:1,revision:Number.MAX_SAFE_INTEGER-1,startedAt:null,archive:core.emptySummary(),records:[]}));
 const ledger=new UsageLedger(file);assert.equal(ledger.record(begin),true);const before=fs.readFileSync(file);assert.equal(JSON.parse(before).revision,Number.MAX_SAFE_INTEGER);
 assert.equal(ledger.record({phase:'finish',attemptId:'attempt',status:'responded',at:1100,usage}),false);assert.equal(ledger.snapshot().available,false);assert.deepEqual(fs.readFileSync(file),before);assert.equal(ledger.snapshot().summary.pending,1);
 const restarted=new UsageLedger(file);assert.equal(restarted.snapshot().available,false);assert.deepEqual(fs.readFileSync(file),before);
});
