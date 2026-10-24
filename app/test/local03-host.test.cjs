'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const product=require('../src/dictation-main'),{fixture}=require('./dictation-electron-fixture.cjs');
const tick=()=>new Promise(r=>setImmediate(r));
async function host(t,configure=()=>{}){const f=fixture();configure(f);const h=await product.start(f.electron,{StoreClass:f.FakeStore,LocalAsrClass:f.FakeLocal});t.after(()=>h.dispose());const win=h.mainWindow,event={sender:win.webContents,senderFrame:win.webContents.mainFrame};return {f,h,rpc:(name,...args)=>f.handlers.get(name)(event,...args)};}
test('Local03 production main window permits the small layout checked by the page harness',async t=>{const {h}=await host(t);assert.equal(h.mainWindow.options.minWidth,360);assert.equal(h.mainWindow.options.minHeight,300);});
test('Local03 host exposes draft revision and current raw to bar without exposing text or keys',async t=>{
 const {f,h}=await host(t);const s=h.controller.begin(h.controller.prepare({}),'recording');s.original='合成可立即复制原文。';s.corrected=s.original;s.text=s.original;s.revision=1;h.controller.publish({phase:'processing',sessionId:s.id,result:h.controller.result(s,'processing')});await tick();
 const snapshot=h.snapshot(true);assert.equal(snapshot.result.id,s.id);assert.equal(snapshot.result.revision,1);assert.equal(snapshot.result.hasText,true);assert.equal(snapshot.canUseOriginal,true);assert.equal('text' in snapshot.result,false);assert.equal('original' in snapshot.result,false);assert.equal(JSON.stringify(snapshot).includes('PRIVATE_'),false);assert.equal(f.registered.has('Escape'),false);assert.equal(f.windows.at(-1).options.focusable,false);
});
test('Local03 optional copy key uses explicit clipboard and a failed new key restores saved keys',async t=>{
 const {f,h,rpc}=await host(t,f=>{const Base=f.FakeStore;f.FakeStore=class extends Base{save(value){this.settings=value;}};});
 await rpc('settings:patch',{copyShortcut:'Ctrl+Shift+Enter'});assert.equal(h.snapshot(false).shortcutStatus.statuses.copy.registered,true);assert.equal(f.registered.size,2);
 const previous=f.electron.globalShortcut.register;f.electron.globalShortcut.register=(key,fn)=>key==='Alt+Control+C'?false:previous(key,fn);
 await assert.rejects(rpc('settings:patch',{copyShortcut:'Ctrl+Alt+C'}));assert.equal(h.store.settings.copyShortcut,'Ctrl+Shift+Enter');assert.equal(h.snapshot(false).shortcutStatus.statuses.copy.registered,true);assert.equal(f.registered.has('Alt+Control+C'),false);
});
test('Local03 closing management waits for an explicit editor flush acknowledgement',async t=>{
 const {h,rpc}=await host(t);let command;h.mainWindow.webContents.send=(channel,value)=>{if(channel==='command')command=value;};let prevented=false;h.mainWindow.emit('close',{preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(h.mainWindow.isVisible(),true);assert.equal(command.type,'flush-editor');assert.equal(command.reason,'hide');
 assert.deepEqual(await rpc('editor:flushed',{token:'stale',ok:true}),{accepted:false});await rpc('editor:flushed',{token:command.token,ok:true});await tick();assert.equal(h.mainWindow.isVisible(),false);
});
test('Local03 failed editor flush leaves the management window open and current draft visible',async t=>{
 const {h,rpc}=await host(t);let command;h.mainWindow.webContents.send=(channel,value)=>{if(channel==='command')command=value;};h.mainWindow.emit('close',{preventDefault(){}});await rpc('editor:flushed',{token:command.token,ok:false});await tick();assert.equal(h.mainWindow.isVisible(),true);assert.match(h.snapshot(false).notices.at(-1),/尚未确认保存/);assert.deepEqual(h.store.notices,[]);
});
test('Local03 explicit quit flushes before owned host disposal',async t=>{
 const {f,h,rpc}=await host(t);let command,quit=0;f.electron.app.quit=()=>quit++;h.mainWindow.webContents.send=(channel,value)=>{if(channel==='command')command=value;};f.electron.app.emit('before-quit',{preventDefault(){}});assert.equal(h.controller.disposed,false);assert.equal(command.reason,'quit');await rpc('editor:flushed',{token:command.token,ok:true});await tick();assert.equal(h.controller.disposed,true);assert.equal(quit,1);assert.equal(f.registered.size,0);
});
test('Local03 dictionary maintenance is writable during a frozen task but settings apply waits',async t=>{
 const {h,rpc}=await host(t,f=>{const Base=f.FakeStore;f.FakeStore=class extends Base{upsertDictionary(value){this.dictionary.push({id:'new-word',...value});}save(value){this.settings=value;}};});await h.controller.toggle();const before=JSON.stringify(h.controller.session.config.dictionary);await rpc('word:upsert',{word:'王明',aliases:['汪明']});assert.equal(h.store.dictionary.length,1);assert.equal(JSON.stringify(h.controller.session.config.dictionary),before);await assert.rejects(rpc('settings:patch',{deviceId:'next-device'}));
});
test('Local03 editable results and recovery routes remain restricted to the trusted main frame',async t=>{
 const {f,h}=await host(t);await h.controller.toggle();h.controller.recordingReady({sessionId:h.controller.session.id});await tick();const bar=f.windows.find(w=>w.options.frame===false),event={sender:bar.webContents,senderFrame:bar.webContents.mainFrame};for(const route of ['result:update','result:restore','result:retry-cleanup','recovery:retry','recovery:discard','editor:flushed'])await assert.rejects(f.handlers.get(route)(event,{}));
});
test('Local03 a successful result write clears only its temporary failed-close warning',async t=>{
 const {h,rpc}=await host(t,f=>{const Base=f.FakeStore;f.FakeStore=class extends Base{saveRecentResult(r){this.recent=structuredClone(r);}getRecentResult(){return this.recent||null;}};});h.store.notices.push('不可清理的独立配置警告。');h.store.saveRecentResult({id:'flush-draft',mode:'dictate',status:'completed',original:'原文。',text:'原文。'});let command;h.mainWindow.webContents.send=(channel,value)=>{if(channel==='command')command=value;};h.mainWindow.emit('close',{preventDefault(){}});await rpc('editor:flushed',{token:command.token,ok:false});await tick();assert.equal(h.snapshot(false).notices.some(s=>/尚未确认保存/.test(s)),true);
 const saved=h.store.saveRecentResult;h.store.saveRecentResult=()=>{throw Error('synthetic readonly');};assert.throws(()=>h.controller.updateResult({id:'flush-draft',expectedRevision:1,text:'尚未写盘的新稿。'}));assert.equal(h.snapshot(false).notices.some(s=>/尚未确认保存/.test(s)),true);h.store.saveRecentResult=saved;h.controller.updateResult({id:'flush-draft',expectedRevision:2,text:'已成功写盘的新稿。'});assert.equal(h.snapshot(false).notices.some(s=>/尚未确认保存/.test(s)),false);assert.deepEqual(h.store.notices,['不可清理的独立配置警告。']);
});
test('Local03 successful explicit copy clears a failed-close warning without clearing persistent notices',async t=>{
 const {h,rpc}=await host(t,f=>{const Base=f.FakeStore;f.FakeStore=class extends Base{getRecentResult(){return {id:'copy-draft',mode:'dictate',status:'completed',original:'原文。',text:'当前完整稿。',revision:1};}};});h.store.notices.push('仍需保留的配置提醒。');let command;h.mainWindow.webContents.send=(channel,value)=>{if(channel==='command')command=value;};h.mainWindow.emit('close',{preventDefault(){}});await rpc('editor:flushed',{token:command.token,ok:false});await tick();await rpc('result:copy',{id:'copy-draft',expectedRevision:1});assert.equal(h.snapshot(false).notices.some(s=>/尚未确认保存/.test(s)),false);assert.deepEqual(h.store.notices,['仍需保留的配置提醒。']);
});
test('Local03 a later successful flush clears its temporary warning and then hides normally',async t=>{
 const {h,rpc}=await host(t);h.store.notices.push('无关持久提醒。');let command;h.mainWindow.webContents.send=(channel,value)=>{if(channel==='command')command=value;};h.mainWindow.emit('close',{preventDefault(){}});await rpc('editor:flushed',{token:command.token,ok:false});await tick();h.mainWindow.emit('close',{preventDefault(){}});await rpc('editor:flushed',{token:command.token,ok:true});await tick();assert.equal(h.mainWindow.isVisible(),false);assert.deepEqual(h.snapshot(false).notices,['无关持久提醒。']);
});
