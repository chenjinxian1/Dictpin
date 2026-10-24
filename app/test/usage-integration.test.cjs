'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createProviderChecks}=require('../src/provider-checks'),{Store}=require('../src/store'),{DEFAULTS}=require('../src/settings'),{mergeSettingsSection}=require('../src/settings-sections'),core=require('../renderer/token-usage'),panel=require('../renderer/usage-panel');
const ROOT=path.join(__dirname,'..');
const config=()=>({...structuredClone(DEFAULTS),asr:{...DEFAULTS.asr,baseUrl:'https://unit.invalid/v1',model:'unit-asr'},refiner:{...DEFAULTS.refiner,baseUrl:'https://unit.invalid/v1',model:'unit-text'}});
const usage={prompt_tokens:12,completion_tokens:4,total_tokens:16,prompt_tokens_details:{cached_tokens:3}};
test('diagnostic requests retain actual usage with separate attempt/operation IDs and no body',async()=>{
 const observed=[],metadata=[];
 const checks=createProviderChecks({getSettings:config,getKey:()=> 'FAKE_TEST_KEY',getUsageObserver:m=>{metadata.push(m);return event=>observed.push({...event,...m});},fetchImpl:async()=>new Response(JSON.stringify({choices:[{message:{content:'BODY_SENTINEL'}}],usage}),{status:200})});
 for(let i=0;i<2;i++)assert.equal((await checks.run('refiner')).category,'chat_success');
 assert.equal(observed.length,4);assert.notEqual(metadata[0].operationId,metadata[1].operationId);assert.equal(metadata[0].mode,'diagnostic');
 assert.equal(observed[0].attemptId,observed[1].attemptId);assert.notEqual(observed[1].attemptId,observed[3].attemptId);assert.deepEqual(observed[1].usage,core.normalizeUsage(usage));
 assert.ok(!/BODY_SENTINEL|FAKE_TEST_KEY|unit.invalid/.test(JSON.stringify(observed)));
});
test('local diagnostics and local-only dictate never become remote token requests',async()=>{
 let observed=0,keys=0,network=0;
 const settings=config();settings.asr.backend='local';
 const checks=createProviderChecks({getSettings:()=>settings,getKey:()=>{keys++;throw Error();},getUsageObserver:()=>{observed++;},fetchImpl:()=>{network++;throw Error();},localAsr:{transcribe:async()=>{const e=Error();e.code='no_speech';throw e;}}});
 assert.equal((await checks.run('asr')).category,'local_ready');assert.equal(keys+network+observed,0);
 const {Controller}=require('../src/controller'),events=[];
 settings.refiner.enabled=false;settings.saveHistory=false;
 const c=new Controller({store:{settings,keys:{},dictionary:[],recordUsage:e=>events.push(e)},bridge:{},localAsr:{transcribe:async()=>'合成内容'}});
 try{await c.toggle('ui');const id=c.state.sessionId;c.recordingReady({sessionId:id});c.stop();await c.submitAudio({sessionId:id,bytes:new Uint8Array(200),mimeType:'audio/webm',durationMs:1000,localPcm:new Uint8Array(32000),sampleRate:16000,channels:1});assert.equal(c.state.phase,'done');assert.equal(c.state.result.original,'合成内容');assert.equal(events.length,0);}finally{c.dispose();}
});
test('usage settings and independent ledger preserve synthetic encrypted credentials and history, even when text history is cleared',()=>{
 const directory=fs.mkdtempSync(path.join(__dirname,'scratch-usage-store-'));
 try{
  const safe={isEncryptionAvailable:()=>true,encryptString:v=>Buffer.from('fake:'+v),decryptString:v=>v.toString().replace(/^fake:/,'')},store=new Store(directory,safe,'win32');
  store.save({...store.settings,asr:{...store.settings.asr,baseUrl:'https://unit.invalid/v1',model:'unit-asr',key:'SYNTHETIC_ASR_KEY',persistKey:true},refiner:{...store.settings.refiner,baseUrl:'https://unit.invalid/v1',model:'unit-text',key:'SYNTHETIC_TEXT_KEY',persistKey:true}});
  store.addHistory({id:'synthetic-history',createdAt:new Date().toISOString(),text:'SYNTHETIC_PRIVATE_TEXT',original:'SYNTHETIC_PRIVATE_ORIGINAL',mode:'dictate',status:'completed'});
  const history=fs.readFileSync(store.historyFile),secrets=structuredClone(store.secrets),keys=structuredClone(store.keys);
  const price={model:'unit-text',currency:'CNY',inputPerMillion:'0.5',outputPerMillion:'2',cacheReadPerMillion:'0.1'};
  store.save(mergeSettingsSection(store.settings,{section:'usage',values:{usagePrices:{...store.settings.usagePrices,refiner:price}}}));
  assert.deepEqual(store.secrets,secrets);assert.deepEqual(store.keys,keys);assert.deepEqual(fs.readFileSync(store.historyFile),history);
  store.recordUsage({phase:'start',attemptId:'attempt-1',operationId:'op-1',kind:'refiner',mode:'dictate',model:'unit-text',at:1000,price});
  store.recordUsage({phase:'finish',attemptId:'attempt-1',status:'responded',at:1200,usage:core.normalizeUsage(usage),text:'SYNTHETIC_PRIVATE_TEXT',key:'SYNTHETIC_TEXT_KEY'});
  const before=store.usageSnapshot().summary;store.clearHistory();assert.deepEqual(store.usageSnapshot().summary,before);
  const restarted=new Store(directory,safe,'win32');assert.deepEqual(restarted.usageSnapshot().summary,before);assert.equal(restarted.settings.usagePrices.refiner.currency,'CNY');
  assert.ok(!/SYNTHETIC_|PRIVATE_|https:/.test(fs.readFileSync(path.join(directory,'token-usage.json'),'utf8')));
 }finally{assert.equal(path.dirname(path.resolve(directory)),path.resolve(__dirname));fs.rmSync(directory,{recursive:true,force:true});}
});
function rendererFunction(name){const source=fs.readFileSync(path.join(ROOT,'renderer/app.js'),'utf8'),start=source.search(new RegExp('^  (?:async )?function '+name+'\\(','m'));assert.ok(start>=0);const tail=source.slice(start),next=tail.slice(1).search(/^  (?:async )?function /m);return next<0?tail:tail.slice(0,next+1);}
test('unsaved price fields cannot be silently rebound when the saved model changes',()=>{
 const nodes={};for(const kind of ['asr','refiner']){nodes['usage-'+kind+'-model']={value:'old-model'};nodes['usage-'+kind+'-currency']={value:'USD'};for(const field of ['inputPerMillion','outputPerMillion','cacheReadPerMillion'])nodes['usage-'+kind+'-'+field]={value:'1'};}
 const fn=vm.runInNewContext('('+rendererFunction('readUsagePrices')+')',{$:id=>nodes[id],snapshot:{settings:{asr:{model:'new-model'},refiner:{model:'new-model'}}},window:{TokenUsage:core},usagePriceBindings:{asr:'owner',refiner:'owner'},usagePriceBinding:()=> 'owner'});
 assert.throws(fn,/模型/);for(const kind of ['asr','refiner'])nodes['usage-'+kind+'-model'].value='new-model';assert.equal(fn().refiner.model,'new-model');
});
test('usage IPC state resists stale snapshots and renders arbitrary model names as plain text',()=>{
 class Node{constructor(){this.dataset={};this.children=[];this.textContent='';}append(n){this.children.push(n);}replaceChildren(n){this.children=[n];}}
 const nodes=new Map(),doc={getElementById:id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);},createElement:()=>new Node(),createDocumentFragment:()=>new Node()};
 const mounted=panel.mount(doc),row={at:1000,kind:'refiner',model:'<img src=x onerror=leak()>',status:'responded',usage:core.normalizeUsage(usage),estimate:{currency:'USD',picoUnits:null,reason:'price_missing'}};
 const state={available:true,revision:4,summary:core.aggregate([row]),recent:[row]};assert.equal(mounted.accept(state),true);
 assert.equal(mounted.accept({...state,revision:3,recent:[]}),false);assert.ok(nodes.get('usage-latest-model').textContent.includes('<img'));
 assert.equal(nodes.get('usage-current-input').textContent,'12');assert.ok(nodes.get('usage-total-cost').textContent.includes('可核验'));
 assert.ok(nodes.get('usage-recent-body').children[0].children[0].children[1].textContent.includes('<img'));
 assert.equal(mounted.accept({...state,revision:5,available:false,error:'fixed'}),true);assert.equal(nodes.get('usage-panel').dataset.state,'error');
});
