'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {start}=require('../src/dictation-main'),{fixture}=require('./dictation-electron-fixture.cjs');
const ui=require('../renderer/dictation-ui-state');
async function hostFixture(t){
 const f=fixture(),calls={words:0};
 class S extends f.FakeStore{constructor(){super();this.dictionary=[{id:'word-1',word:'OpenAI',note:'keep unknown metadata',extra:7}];}upsertDictionary(){calls.words++;}}
 const h=await start(f.electron,{StoreClass:S,LocalAsrClass:f.FakeLocal});t.after(()=>h.dispose());
 const event={sender:h.mainWindow.webContents,senderFrame:h.mainWindow.webContents.mainFrame};
 return {f,h,calls,rpc:(name,...args)=>{assert.equal(f.handlers.has(name),true,'registered route '+name);return f.handlers.get(name)(event,...args);}};
}
test('explicit Start starts once and never toggles an existing session',async t=>{
 const x=await hostFixture(t);assert.equal((await x.rpc('capture:start')).accepted,true);const id=x.h.controller.state.sessionId;
 assert.equal((await x.rpc('capture:start')).accepted,false);assert.equal(x.h.controller.state.phase,'starting');assert.equal(x.h.controller.state.sessionId,id);
 x.h.controller.recordingReady({sessionId:id});assert.equal((await x.rpc('capture:start')).accepted,false);assert.equal(x.h.controller.state.phase,'recording');assert.equal(x.h.controller.state.sessionId,id);
});
test('explicit Start accepts no mode, task, expected session or extra arguments',async t=>{
 const x=await hostFixture(t);
 for(const payload of [{mode:'ask'},{task:'expand'},{sessionId:'old'}])await assert.rejects(x.rpc('capture:start',payload));
 await assert.rejects(x.rpc('capture:start',undefined,'extra'));assert.equal(x.h.controller.state.phase,'idle');
});
test('new normalized duplicate word reports conflict without rewriting metadata',async t=>{
 const x=await hostFixture(t),before=structuredClone(x.h.store.dictionary);
 await assert.rejects(x.rpc('word:upsert',{word:'ｏｐｅｎａｉ'}),/已存在|已有/);
 assert.equal(x.calls.words,0);assert.deepEqual(x.h.store.dictionary,before);
});
test('stale edit identifier cannot silently become a new word',async t=>{
 const x=await hostFixture(t);await assert.rejects(x.rpc('word:upsert',{id:'deleted-id',word:'New term'}),/变化|不存在/);assert.equal(x.calls.words,0);
});
test('editing a word to another normalized duplicate is rejected at the boundary',async t=>{
 const x=await hostFixture(t);x.h.store.dictionary.push({id:'word-2',word:'Habitat'});
 await assert.rejects(x.rpc('word:upsert',{id:'word-2',word:'openai'}),/已存在|已有/);assert.equal(x.calls.words,0);
});
test('in-app recording remains available when shortcut registration failed',()=>{
 assert.equal(typeof ui.captureView,'function');const v=ui.captureView({state:{phase:'idle'},shortcutStatus:{statuses:{current:{registered:false}}}});
 assert.equal(v.action,'start');assert.equal(v.disabled,false);
});
test('processing has no start/stop action and exposes cancellation',()=>{
 assert.equal(typeof ui.captureView,'function');const v=ui.captureView({state:{phase:'processing',message:'正在整理文字…'}});
 assert.equal(v.disabled,true);assert.equal(v.cancel,true);assert.match(v.label,/整理/);
});
test('recording stop belongs to the active session, with no mode selector',()=>{
 assert.equal(typeof ui.captureView,'function');const v=ui.captureView({state:{phase:'recording',sessionId:'capture-b'}});
 assert.equal(v.action,'stop');assert.equal(v.label,'结束听写');assert.equal(v.cancel,true);
});
test('dictionary duplicate feedback uses the same normalization while allowing its own edit',()=>{
 assert.equal(typeof ui.duplicateWord,'function');const entries=[{id:'w',word:'OpenAI'}];
 assert.equal(ui.duplicateWord(entries,'ｏｐｅｎａｉ').word,'OpenAI');assert.equal(ui.duplicateWord(entries,'OpenAI','w'),null);
});

test('missing ASR component disables explicit start instead of suggesting a working shortcut',()=>{
 const v=ui.captureView({state:{phase:'idle'},localEngine:{workerFound:false,ready:false}});assert.equal(v.disabled,true);assert.equal(v.action,null);assert.match(v.label,/识别器|组件/);
});
test('available cold ASR may load on deliberate start but is not labeled ready',()=>{
 assert.equal(typeof ui.engineStatus,'function');const s={state:{phase:'idle'},localEngine:{workerFound:true,ready:false}};assert.match(ui.engineStatus(s),/待加载/);assert.equal(ui.captureView(s).action,'start');
});
test('saving the same own dictionary word remains legal',async t=>{
 const x=await hostFixture(t);await x.rpc('word:upsert',{id:'word-1',word:'OpenAI'});assert.equal(x.calls.words,1);
});
