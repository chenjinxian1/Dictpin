'use strict';
const assert=require('node:assert/strict');
module.exports=async function local02({host,electron,facade,dom,click,check,waitFor,viewport,shot,result,text,evidence,delay,bar}){
 const c=host.controller,wc=host.mainWindow.webContents;
 const input=(selector,value)=>dom('const e=document.querySelector('+JSON.stringify(selector)+');e.value='+JSON.stringify(value)+';e.dispatchEvent(new Event("input",{bubbles:true}));');
 const visible=selector=>dom('const e=document.querySelector('+JSON.stringify(selector)+');return !!e&&!e.hidden&&e.getBoundingClientRect().height>0;');
 const idle=()=>{if(c.session)c.cancel();c.publish({phase:'idle',sessionId:null,result:null,message:''});};
 evidence.local02={kind:'Additional production-page interactions. All content, devices, registration and clipboard adapters are synthetic.',checksBefore:evidence.checks.length,commands:[]};
 c.on('command',command=>evidence.local02.commands.push(command.type));
 await viewport(626,443);electron.nativeTheme.themeSource='light';host.store.notices=[];host.store.settingsReadable=true;host.store.dictionaryReadable=true;host.store.settings.refiner.model='synthetic-model';host.store.dictionary=[{id:'word-1',word:'OpenAI',source:'manual',note:'keep'},{id:'word-2',word:'Habitat',source:'manual'}];host.store.saveRecentResult(result);idle();await click('[data-page=recent]');

 let resolveEdit;const originalRefine=c.api.refine;c.api.refine=()=>new Promise(resolve=>{resolveEdit=resolve;});
 const originalText='本次原文：'+text,session=c.begin(c.prepare({}),'recording');session.original=originalText;c.publish({phase:'processing',sessionId:session.id,result:null,message:'正在识别语音…'});const completion=c.finishText(session,false);
 await waitFor('document.querySelector("#capture-label").textContent.includes("整理")');await shot('local02-waiting-original');
 await check('Local02: cleanup shows the complete current original, truthful status and Use original',async()=>{
  assert.equal(await dom('return document.querySelector("#result-content").textContent;'),originalText);
  assert.equal(await dom('return document.querySelector("#capture-cancel").textContent;'),'结束整理');
  assert.equal(await dom('return document.querySelector("#task-status-title")?.textContent||"";'),'文字已就绪，正在轻整理');
  assert.doesNotMatch(await dom('return document.querySelector("#result-message").textContent;'),/上次/);
  assert.equal(host.store.getRecentResult().id,session.id);
 });
 await check('Local02: bar offers the same original action inside a constant footprint',async()=>{
  // The main result and the independently loaded bar need separate readiness checks.
  const started=Date.now();let win,ready=false,attempts=0,missing=0;
  while(Date.now()-started<3000){attempts++;win=bar();if(win){ready=await win.webContents.executeJavaScript('document.readyState==="complete"&&document.querySelector("#bar-cancel")?.textContent==="结束整理"');if(ready)break;}else missing++;await delay(20);}
  evidence.local02.barReadiness={elapsedMs:Date.now()-started,attempts,missing,ready};
  assert.ok(win,'The recording bar did not finish navigation within 3 seconds');assert.equal(ready,true,'The recording bar did not render the active cleanup action within 3 seconds');const state=await win.webContents.executeJavaScript('(()=>{const b=document.querySelector("#bar-cancel"),p=document.querySelector("#voice-pill").getBoundingClientRect(),r=b.getBoundingClientRect();return {label:b.textContent,width:p.width,height:p.height,left:r.left,right:r.right,pillLeft:p.left,pillRight:p.right};})()');
  assert.equal(state.label,'结束整理');assert.equal(state.width,336);assert.equal(state.height,54);assert.ok(state.left>=state.pillLeft&&state.right<=state.pillRight);await shot('local02-bar-original',win);
 });
 await check('Local02: active original and both header actions fit 360x300 in either theme',async()=>{
  await viewport(360,300);for(const theme of ['light','dark']){electron.nativeTheme.themeSource=theme;await delay(50);assert.equal(await dom('return document.documentElement.scrollWidth<=innerWidth;'),true);for(const id of ['capture-cancel','capture-toggle','copy-result'])assert.equal(await dom('const r=document.querySelector('+JSON.stringify('#'+id)+').getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;'),true,id);await shot('local02-small-original-'+theme);}electron.nativeTheme.themeSource='light';await viewport(626,443);
 });
 await check('Local02: repeated Use original cancels once and a late cleanup cannot replace a new capture',async()=>{
  await dom('document.querySelector("#capture-cancel").click();document.querySelector("#capture-cancel").click();');await waitFor('!document.querySelector("#capture-cancel").offsetHeight');
  const kept=host.store.getRecentResult();assert.equal(kept.id,session.id);assert.equal(kept.text,originalText);
  const next=c.begin(c.prepare({}),'recording');c.publish({phase:'recording',sessionId:next.id,result:null,level:.3});resolveEdit('迟到的内容不能覆盖500元。');await completion;
  assert.equal(c.session.id,next.id);assert.deepEqual(host.store.getRecentResult(),kept);c.cancel();
 });
 if(c.session)c.cancel();resolveEdit?.(text);await completion;c.api.refine=originalRefine;idle();host.store.saveRecentResult(result);idle();

 host.store.recentResult=null;idle();await click('[data-page=recent]');await shot('local02-empty');
 await check('Local02: first use names the available action and does not claim a registered shortcut',async()=>{assert.equal(await visible('#empty-result'),true);assert.equal(await dom('return document.querySelector("#capture-toggle").disabled;'),false);assert.equal(await dom('return document.querySelector("#effective-shortcut").hidden;'),true);});
 c.publish({phase:'processing',sessionId:'synthetic-recognition',result:null,message:'正在识别语音…'});await delay(60);await shot('local02-recognizing');
 await check('Local02: recognition hides empty-result teaching and names local work',async()=>{assert.equal(await visible('#empty-result'),false);assert.equal(await dom('return document.querySelector("#task-status-title")?.textContent||"";'),'正在本机识别');assert.equal(await dom('return document.querySelector("#capture-toggle").disabled;'),true);});
 idle();host.store.saveRecentResult(result);idle();

 await click('[data-page=dictionary]');await input('#word-search','SenseVoice');await shot('local02-dictionary-no-match');
 await check('Local02: no-match search can be cleared without retyping',async()=>{assert.equal(await visible('#clear-word-search'),true);await click('#clear-word-search');assert.equal(await dom('return document.querySelector("#word-search").value;'),'');assert.equal(await dom('return document.activeElement.id;'),'word-search');assert.equal(await dom('return document.querySelectorAll("#word-list>.word-row").length;'),2);});
 await input('#word-search','SenseVoice');await click('#new-word');
 await check('Local02: adding a missing searched word starts with that exact draft',async()=>{assert.equal(await dom('return document.querySelector("#word-input").value;'),'SenseVoice');assert.equal(await dom('return document.activeElement.id;'),'word-input');});await click('#cancel-word');await input('#word-search','');
 await check('Local02: keyboard deletion moves to Undo and restoration returns to the restored word',async()=>{
  await dom('const b=document.querySelector("[data-word-id=word-2] [data-word-action=delete]");b.focus();b.click();');await waitFor('!document.querySelector("#word-undo").hidden');
  assert.equal(await dom('return document.activeElement.id;'),'undo-word');await click('#undo-word');await waitFor('document.querySelector("#word-undo").hidden&&document.querySelectorAll("#word-list>.word-row").length===2');
  evidence.local02.undoFocus=await dom('return {tag:document.activeElement.tagName,elementId:document.activeElement.id,id:document.activeElement.closest("[data-word-id]")?.dataset.wordId,action:document.activeElement.dataset.wordAction};');
  assert.deepEqual({id:evidence.local02.undoFocus.id,action:evidence.local02.undoFocus.action},{id:'word-2',action:'edit'});
 });
 // Bring the baseline fixture back even when the focus assertion above failed.
 await check('Local02: completed word feedback clears on navigation and never covers the next page',async()=>{await waitFor('document.querySelector("#toast-text").textContent.includes("已恢复词语")');assert.equal(await visible('#toast'),true);await click('[data-page=recent]');assert.equal(await visible('#toast'),false);});
 if(!host.store.dictionary.some(word=>word.id==='word-2')){const archived=host.store.archive.entries.findLast(entry=>entry.entry.id==='word-2');if(archived)host.store.restoreDictionary(archived.undoToken);idle();}

 await click('[data-page=settings]');await input('#shortcut','Ctrl+Shift+F8');await shot('local02-settings-draft');
 await check('Local02: a settings draft stays marked across page navigation',async()=>{assert.equal(await dom('return document.querySelector("[data-page=settings]").dataset.dirty;'),'true');await click('[data-page=dictionary]');await click('[data-page=settings]');assert.equal(await dom('return document.querySelector("#shortcut").value;'),'Ctrl+Shift+F8');});
 await check('Local02: Reset is explicit, keeps editing by default and restores draft focus',async()=>{
  assert.equal(await visible('#reset-settings'),true);await dom('document.querySelector("#shortcut").focus();');await click('#reset-settings');assert.equal(await dom('return document.querySelector("#draft-dialog").open;'),true);assert.equal(await dom('return document.activeElement.id;'),'keep-editing');await click('#keep-editing');assert.equal(await dom('return document.querySelector("#shortcut").value;'),'Ctrl+Shift+F8');
 });
 const keys=new Set(),native={...facade.globalShortcut};facade.globalShortcut.register=key=>{keys.add(key);return true;};facade.globalShortcut.isRegistered=key=>keys.has(key);facade.globalShortcut.unregister=key=>keys.delete(key);
 await check('Local02: Ctrl+S saves one draft once within settings',async()=>{
  await dom('const e=document.querySelector("#microphone");e.focus();e.dispatchEvent(new KeyboardEvent("keydown",{key:"s",ctrlKey:true,bubbles:true,cancelable:true}));e.dispatchEvent(new KeyboardEvent("keydown",{key:"s",ctrlKey:true,repeat:true,bubbles:true,cancelable:true}));');
  await waitFor('document.querySelector("#save-message").textContent==="已保存"');assert.equal(host.store.settings.shortcut,'Ctrl+Shift+F8');assert.equal(await dom('return document.querySelector("[data-page=settings]").dataset.dirty;'),'false');
 });
 // If the old UI lacks Ctrl+S, save through its existing button so remaining assertions are independent.
 if(host.store.settings.shortcut!=='Ctrl+Shift+F8'){await click('#save-settings');await waitFor('document.querySelector("#save-message").textContent==="已保存"');}
 keys.clear();idle();await delay(60);await shot('local02-settings-shortcut');
 await check('Local02: a failed saved shortcut can be retried without editing a key or changing credentials',async()=>{
  const before=structuredClone(host.store.secrets);assert.equal(await visible('#retry-shortcut'),true);await dom('document.querySelector("#retry-shortcut").click();document.querySelector("#retry-shortcut").click();');
  await waitFor('document.querySelector("#shortcut-message").textContent==="已启用"');assert.deepEqual(host.store.secrets,before);assert.equal(host.store.settings.shortcut,'Ctrl+Shift+F8');
 });
 await check('Local02: a dirty draft blocks shortcut retry rather than submitting another field',async()=>{await input('#model-name','draft-not-submitted');assert.equal(await dom('return document.querySelector("#retry-shortcut")?.disabled;'),true);assert.equal(host.store.settings.refiner.model,'synthetic-model');});
 await click('#save-settings');await waitFor('document.querySelector("#save-message").textContent==="已保存"');
 const changedModel=host.store.settings.refiner.model;assert.equal(changedModel,'draft-not-submitted');
 await check('Local02: reset discards only after confirmation and stays on the settings page',async()=>{
  await input('#model-name','discard-this-draft');assert.equal(await visible('#reset-settings'),true);await click('#reset-settings');await click('#discard-draft');
  assert.equal(await visible('#page-settings'),true);assert.equal(await dom('return document.querySelector("#model-name").value;'),changedModel);assert.equal(await dom('return document.querySelector("[data-page=settings]").dataset.dirty;'),'false');
 });
 // Restore fixture settings without reading or writing any user profile.
 host.store.settings.refiner.model='synthetic-model';host.store.settings.shortcut='';Object.assign(facade.globalShortcut,native);idle();
 await check('Local02: device enumeration explains an unavailable saved selection without changing it',async()=>{
  await dom('window.local02Enumerate=navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);navigator.mediaDevices.enumerateDevices=async()=>[{kind:"audioinput",deviceId:"available",label:"合成可用麦克风"}];');
  await input('#microphone','');await dom('const s=document.querySelector("#microphone"),o=new Option("合成离线设备","offline");s.append(o);s.value="offline";s.dispatchEvent(new Event("input",{bubbles:true}));');await click('#refresh-devices');
  await waitFor('document.querySelector("#device-message").textContent.includes("未找到")');assert.equal(await dom('return document.querySelector("#microphone").value;'),'offline');await shot('local02-device-missing');
 });
 await dom('if(window.local02Enumerate)navigator.mediaDevices.enumerateDevices=window.local02Enumerate;');
 // Full final states: snapshots are generated fixtures, not native-device acceptance.
 for(const theme of ['light','dark']){
  electron.nativeTheme.themeSource=theme;host.store.saveRecentResult(result);idle();await viewport(626,443);
  for(const page of ['recent','dictionary','settings']){await click('[data-page='+page+']');await shot('local02-'+theme+'-'+page);}
 }
 await check('Local02: all new actions fit a small window in both themes',async()=>{
  for(const theme of ['light','dark']){electron.nativeTheme.themeSource=theme;await viewport(360,300);for(const page of ['recent','dictionary','settings']){await click('[data-page='+page+']');assert.equal(await dom('return document.documentElement.scrollWidth<=innerWidth;'),true);const action=page==='recent'?'copy-result':page==='settings'?'save-settings':'new-word';assert.equal(await dom('const r=document.querySelector('+JSON.stringify('#'+action)+').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;'),true);await shot('local02-small-'+theme+'-'+page);}}
 });
 if(wc.debugger.isAttached())await wc.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await check('Local02: reduced motion and focus remain visible with no looping effects',async()=>{
  assert.equal(await dom('return document.getAnimations().some(a=>a.playState==="running"&&a.effect?.getTiming().iterations===Infinity);'),false);
  await click('[data-page=dictionary]');await dom('document.querySelector("#word-search").focus();');for(const type of ['keyDown','keyUp'])wc.sendInputEvent({type,keyCode:'Tab'});await delay(50);
  assert.equal(await dom('const e=document.activeElement;return e.matches(":focus-visible")&&parseFloat(getComputedStyle(e).outlineWidth)>=2;'),true);await shot('local02-reduced-focus');
 });
 idle();assert.equal(evidence.local02.commands.includes('start'),false);assert.equal(evidence.externalRequests.length,0);assert.equal(evidence.errors.length,0);evidence.local02.checksAdded=evidence.checks.length-evidence.local02.checksBefore;
};
