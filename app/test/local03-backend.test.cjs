'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Controller}=require('../src/dictation-controller'),{createActions}=require('../src/dictation-actions'),{Store}=require('../src/dictation-store'),{DEFAULTS,validateSettings}=require('../src/settings');
const audio=id=>({sessionId:id,bytes:new Uint8Array(1200),mimeType:'audio/webm',durationMs:100,localPcm:new Uint8Array(3200),sampleRate:16000,channels:1});
function engine(t,{refine=async s=>s,enabled=false,transcribe=async()=> '合成原文500元。',cleanupTimeoutMs=12000,now=()=>Date.now()}={}){
 let recent=null;const settings=structuredClone(DEFAULTS);settings.refiner.enabled=enabled;settings.refiner.baseUrl='http://127.0.0.1:9/v1';
 const store={settings,dictionary:[],keys:{},notices:[],saveRecentResult(value){recent=structuredClone(value);return recent;},getRecentResult:()=>recent&&structuredClone(recent)};
 const c=new Controller({store,bridge:{},localAsr:{transcribe,ensureReady:async()=>true},apiImpl:{refine},cleanupTimeoutMs,now});t.after(()=>c.dispose());return {c,store};
}
async function record(c){await c.toggle();const id=c.session.id;c.recordingReady({sessionId:id});c.stop();return c.submitAudio(audio(id));}
test('Local03 result stores immutable original, editable text and monotonic revisions',async t=>{
 const {c,store}=engine(t);await record(c);const r=c.state.result;assert.equal(r.corrected,r.original);assert.equal(r.revision,1);assert.equal(r.source,'original');
 const changed=c.updateResult({id:r.id,expectedRevision:r.revision,text:'人工修正700元。'});assert.equal(changed.text,'人工修正700元。');assert.equal(changed.original,'合成原文500元。');assert.equal(changed.revision,2);assert.equal(changed.source,'manual');assert.equal(store.getRecentResult().text,changed.text);
 assert.throws(()=>c.updateResult({id:r.id,expectedRevision:1,text:'迟到草稿'}),/变化|版本/);
 const restored=c.restoreResult({id:r.id,expectedRevision:2,source:'original'});assert.equal(restored.text,r.original);assert.equal(restored.previousText,'人工修正700元。');
 assert.equal(c.restoreResult({id:r.id,expectedRevision:3,source:'previous'}).text,'人工修正700元。');
});
test('Local03 copy freezes current raw immediately and late cleanup cannot overwrite it',async t=>{
 let resolve,entered;const pending=new Promise(r=>{resolve=r;}),started=new Promise(r=>{entered=r;});const {c,store}=engine(t,{enabled:true,refine:()=>{entered();return pending;}});
 const submission=record(c);await started;const r=c.state.result;let copied='';const actions=createActions({controller:c,store,writeClipboard:text=>{copied=text;}});
 const ack=await actions.copyResult({id:r.id,expectedRevision:r.revision});assert.equal(ack.ok,true);assert.equal(ack.revision,r.revision);assert.equal(copied,r.text);assert.equal(c.active(),false);resolve('迟到错误结果');await submission;assert.equal(c.state.result.text,copied);assert.equal(c.state.result.original,r.original);
});
test('Local03 editing intent aborts cleanup before debounce and preserves later draft',async t=>{
 let resolve,entered;const pending=new Promise(r=>{resolve=r;}),started=new Promise(r=>{entered=r;});const {c}=engine(t,{enabled:true,refine:()=>{entered();return pending;}});const submission=record(c);await started;
 const r=c.state.result,owned=c.updateResult({id:r.id,expectedRevision:r.revision,text:r.text,editing:true});assert.equal(c.active(),false);const updated=c.updateResult({id:r.id,expectedRevision:owned.revision,text:'用户正在输入。'});resolve('迟到文本');await submission;assert.equal(c.state.result.text,updated.text);
});
test('Local03 original-only copy leaves manual text and revision untouched',async t=>{
 const {c,store}=engine(t);await record(c);let r=c.state.result;r=c.updateResult({id:r.id,expectedRevision:r.revision,text:'手写文本。'});let copied;const a=createActions({controller:c,store,writeClipboard:t=>{copied=t;}});
 await a.copyResult({id:r.id,expectedRevision:r.revision,source:'original'});assert.equal(copied,r.original);assert.equal(c.state.result.text,r.text);await assert.rejects(a.copyResult({id:r.id,expectedRevision:1}),/变化|版本/);
});
test('Local03 failed clipboard retains the frozen draft without restarting cleanup',async t=>{
 let entered;const started=new Promise(r=>{entered=r;});const {c,store}=engine(t,{enabled:true,refine:(_s,_c,_k,{signal})=>{entered();return new Promise((_r,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));}});const submission=record(c);await started;const r=c.state.result;const a=createActions({controller:c,store,writeClipboard(){throw Error('synthetic clipboard failure');}});
 await assert.rejects(a.copyResult({id:r.id,expectedRevision:r.revision}));await submission;assert.equal(c.active(),false);assert.equal(store.getRecentResult().text,r.text);
});
test('Local03 cleanup has a bounded deadline and never loses source text',{timeout:300},async t=>{
 const {c}=engine(t,{enabled:true,cleanupTimeoutMs:20,refine:()=>new Promise(()=>{})});await record(c);assert.equal(c.active(),false);assert.equal(c.state.result.text,c.state.result.corrected);assert.match(c.state.result.message,/超时/);
});
test('Local03 recognition retry is explicit, memory-only and does not reissue cleanup',async t=>{
 let attempts=0,edits=0;const {c}=engine(t,{enabled:true,transcribe:async()=>{if(++attempts===1)throw Error('合成识别失败');return '恢复原文。';},refine:async s=>{edits++;return s;}});await record(c);const recovery=c.recoverySummary();assert.equal(recovery.reason,'recognition-failed');assert.equal(recovery.expiresAt> Date.now(),true);await c.retryRecovery(recovery.token);assert.equal(c.state.result.text,'恢复原文。');assert.equal(edits,0);assert.equal(c.recoverySummary(),null);
});
test('Local03 complete cancelled audio is retained thirty seconds without recognition',async t=>{
 let time=1000,recognitions=0;const {c}=engine(t,{now:()=>time,transcribe:async()=>{recognitions++;return 'never';}});const commands=[];c.on('command',x=>commands.push(x));await c.toggle();const id=c.session.id;c.recordingReady({sessionId:id});assert.equal(c.cancel(),true);assert.equal(commands.at(-1).type,'cancel-retain');assert.equal(recognitions,0);
 assert.equal(c.submitCancelledAudio(audio(id)).accepted,true);assert.equal(c.recoverySummary().expiresAt,time+30000);assert.equal(c.recoverySummary().reason,'cancelled');time+=30001;assert.equal(c.recoverySummary(),null);
});
test('Local03 starting over requires the exact current recovery token',async t=>{
 const {c}=engine(t,{transcribe:async()=>{throw Error('合成识别失败');}});await record(c);const recovery=c.recoverySummary();assert.equal((await c.start()).reason,'recovery');assert.equal((await c.start({discardRecoveryToken:'stale'})).accepted,false);assert.equal((await c.start({discardRecoveryToken:recovery.token})).accepted,true);assert.equal(c.recoverySummary(),null);
});
test('Local03 copied shortcut is optional and colliding physical keys are rejected',()=>{
 assert.equal(validateSettings(structuredClone(DEFAULTS)).copyShortcut,'');const s=structuredClone(DEFAULTS);s.copyShortcut='Control+Shift+Space';assert.throws(()=>validateSettings(s),/重复/);s.copyShortcut='Ctrl+Shift+Enter';assert.equal(validateSettings(s).copyShortcut,s.copyShortcut);
});
test('Local03 new result schema round trips extra fields while old files migrate in memory',t=>{
 const root=path.resolve(__dirname,'../../work/local03/backend-tests');fs.mkdirSync(root,{recursive:true});const dir=fs.mkdtempSync(path.join(root,'result-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const safe={isEncryptionAvailable:()=>false},store=new Store(dir,safe,'win32');const old={id:'synthetic-result',mode:'dictate',status:'completed',original:'原文。',text:'原文。',future:{keep:true}};
 store.saveRecentResult({...old,corrected:'纠正。',text:'修改。',revision:4,source:'manual',corrections:[],previousText:'此前。'});const restored=new Store(dir,safe,'win32').getRecentResult();assert.equal(restored.revision,4);assert.equal(restored.corrected,'纠正。');assert.equal(restored.previousText,'此前。');assert.deepEqual(restored.future,{keep:true});
});
test('Local03 local dictionary corrections precede one cleanup call and frozen rules cannot change mid-task',async t=>{
 let input;const {c,store}=engine(t,{enabled:true,transcribe:async()=> '请联系汪明。',refine:async text=>{input=text;return text;}});store.dictionary=[{id:'person',source:'manual',word:'王明',aliases:['汪明']}];
 await c.toggle();const id=c.session.id;store.dictionary[0].word='李红';store.dictionary[0].aliases.push('王明');assert.equal(Object.isFrozen(c.session.config.dictionary),true);c.recordingReady({sessionId:id});c.stop();await c.submitAudio(audio(id));
 assert.equal(input,'请联系王明。');assert.equal(c.state.result.original,'请联系汪明。');assert.equal(c.state.result.corrected,input);assert.deepEqual(c.state.result.corrections,[{from:'汪明',to:'王明',start:3,end:5,wordId:'person'}]);
});
test('Local03 an abandoned cleanup attempt cannot overwrite an explicit retry sharing result identity',async t=>{
 let first,entered,attempts=0;const initial=new Promise(r=>{first=r;}),started=new Promise(r=>{entered=r;});const {c}=engine(t,{enabled:true,refine:()=>{if(++attempts===1){entered();return initial;}return Promise.resolve('新的明确整理稿。');}});
 const submission=record(c);await started;const raw=c.state.result;c.freezeResult(raw.id,raw.revision);await c.retryCleanup({id:raw.id,expectedRevision:raw.revision});const expected=structuredClone(c.state.result);first('迟到旧稿。');await submission;assert.deepEqual(c.state.result,expected);assert.equal(c.state.result.text,'新的明确整理稿。');assert.equal(attempts,2);
});
test('Local03 stale clipboard completion never marks a newer manual revision as copied',async t=>{
 let resolve,acks=0;const {c,store}=engine(t);await record(c);const old=c.state.result;const a=createActions({controller:c,store,writeClipboard:()=>new Promise(r=>{resolve=r;}),onCopied(){acks++;}}),pending=a.copyResult({id:old.id,expectedRevision:old.revision});
 c.updateResult({id:old.id,expectedRevision:old.revision,text:'复制期间的新修改。'});resolve();const ack=await pending;assert.equal(ack.revision,old.revision);assert.equal(acks,0);
});
test('Local03 flush of the previous result during new capture does not cancel or replace the new session',async t=>{
 const {c,store}=engine(t);await record(c);const old=c.state.result;await c.start();const id=c.session.id;
 c.updateResult({id:old.id,expectedRevision:old.revision,text:'上一段最后一个字。'});assert.equal(c.session.id,id);assert.equal(c.state.phase,'starting');assert.equal(c.state.result,null);assert.equal(store.getRecentResult().text,'上一段最后一个字。');
});
test('Local03 recognition cancellation offers thirty second recovery instead of failure retention',async t=>{
 let resolve;let time=1000;const {c}=engine(t,{now:()=>time,transcribe:()=>new Promise(r=>{resolve=r;})});const submission=record(c);await new Promise(r=>setImmediate(r));c.cancel();const recovery=c.recoverySummary();assert.equal(recovery.reason,'cancelled');assert.equal(recovery.expiresAt,time+30000);resolve('迟到的识别。');await submission;assert.equal(c.state.result,null);
});
test('Local03 a failed edit write keeps the in-memory draft and original with a visible warning',async t=>{
 const {c,store}=engine(t);await record(c);const r=c.state.result;store.saveRecentResult=()=>{throw Error('synthetic readonly');};assert.throws(()=>c.updateResult({id:r.id,expectedRevision:r.revision,text:'仍在内存的新稿。'}),/尚未保存/);assert.equal(c.state.result.text,'仍在内存的新稿。');assert.equal(c.state.result.original,r.original);assert.match(c.state.result.message,/保存失败/);assert.equal(c.state.result.persistenceFailed,true);
});
test('Local03 valid legacy text without original remains editable and copyable without inventing original',async t=>{
 const {c,store}=engine(t);store.saveRecentResult({id:'legacy-text-only',mode:'dictate',status:'completed',original:'',text:'旧结果正文。'});let copied;const a=createActions({controller:c,store,writeClipboard:t=>{copied=t;}});
 const edited=c.updateResult({id:'legacy-text-only',expectedRevision:1,text:'旧结果手改。'});assert.equal(edited.original,'');await a.copyResult({id:edited.id,expectedRevision:edited.revision});assert.equal(copied,edited.text);assert.equal(c.canRetryCleanup(edited),false);await assert.rejects(a.copyResult({id:edited.id,expectedRevision:edited.revision,source:'original'}),/为空/);
});
test('Local03 a valid explicit cancelled-audio retry gets five-minute failure retention and no cleanup request',async t=>{
 let now=1000,edits=0;const {c}=engine(t,{now:()=>now,enabled:true,transcribe:async()=>{throw Error('合成识别失败');},refine:async text=>{edits++;return text;}});await c.toggle();const id=c.session.id;c.recordingReady({sessionId:id});c.cancel();c.submitCancelledAudio(audio(id));const cancelled=c.recoverySummary();assert.equal(cancelled.reason,'cancelled');assert.equal(cancelled.expiresAt,31000);now+=5000;await c.retryRecovery(cancelled.token);const failed=c.recoverySummary();assert.equal(failed.reason,'recognition-failed');assert.equal(failed.expiresAt,now+300000);assert.notEqual(failed.token,cancelled.token);assert.equal(edits,0);
});
test('Local03 expired cancelled-audio recovery cannot gain a fresh retention period',async t=>{
 let now=1000,recognitions=0;const {c}=engine(t,{now:()=>now,transcribe:async()=>{recognitions++;return '不得恢复';}});await c.toggle();const id=c.session.id;c.recordingReady({sessionId:id});c.cancel();c.submitCancelledAudio(audio(id));const recovery=c.recoverySummary();now=recovery.expiresAt+1;assert.equal((await c.retryRecovery(recovery.token)).accepted,false);assert.equal(c.recoverySummary(),null);assert.equal(recognitions,0);
});
