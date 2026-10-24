'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const electron=require('electron'),{app}=electron,root=path.resolve(__dirname,'..'),run=path.resolve(process.env.INTERACTION04_RUN||path.join(root,'work','ui-flow-'+Date.now())),shots=path.join(run,'screenshots');
app.disableHardwareAcceleration();
const frames=new Map();
assert.ok(run.toLowerCase().startsWith((path.join(root,'work')+path.sep).toLowerCase()));
for(const [name,part]of [['userData','profile'],['sessionData','session'],['temp','tmp'],['crashDumps','crashes']]){const p=path.join(run,part);fs.mkdirSync(p,{recursive:true});app.setPath(name,p);}
app.setAppLogsPath(path.join(run,'logs'));fs.mkdirSync(shots,{recursive:true});
for(const flag of ['no-sandbox','disable-web-security','ignore-certificate-errors','use-fake-ui-for-media-stream'])assert.equal(app.commandLine.hasSwitch(flag),false);
for(const flag of ['disable-audio-input','disable-audio-output'])assert.equal(app.commandLine.hasSwitch(flag),true);
const {DEFAULTS}=require('../app/src/settings'),settings=structuredClone(DEFAULTS);settings.shortcut='';settings.refiner.enabled=true;settings.refiner.baseUrl='http://127.0.0.1:9/v1';settings.refiner.model='synthetic-model';settings.modeShortcuts={dictate:'',translate:'',ask:''};settings.modeShortcutAlternates={dictate:[],translate:[],ask:[]};
const profile=app.getPath('userData');assert.equal(fs.existsSync(path.join(profile,'settings.json')),false);
fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({version:2,settings,secrets:{},synthetic:true}));
fs.writeFileSync(path.join(profile,'recent-result.json'),JSON.stringify({id:'fixture-result-01',mode:'dictate',status:'completed',original:'明天下午三点和 OpenAI 团队开会，预算500元，不要扩写。',text:'明天下午三点和 OpenAI 团队开会，预算500元，不要扩写。',refined:false,createdAt:'2026-10-22T08:00:00.000Z',durationMs:1200}));
fs.writeFileSync(path.join(profile,'dictionary.json'),JSON.stringify([{id:'fixture-word-1',word:'OpenAI',note:'synthetic metadata to preserve',replacement:'',source:'manual'},{id:'fixture-word-2',word:'Habitat',note:'',replacement:'',source:'manual'}]));
const evidence={kind:'Electron software offscreen renderer and production preload/IPC/Store, synthetic profile and app-local DOM driver; paint-event bitmap, not native window/desktop screenshot',screenshots:[],errors:[],clipboardCalls:0,observations:{}};
let host,finished=false,clipboardFail=false; evidence.flowChecks=[];const delay=ms=>new Promise(r=>setTimeout(r,ms));
app.on('web-contents-created',(_e,w)=>{w.on('preload-error',(_e,_p,error)=>evidence.errors.push({kind:'preload',message:error.message}));w.on('console-message',event=>{if(event&&['error',3].includes(event.level))evidence.errors.push({kind:'renderer',message:event.message});});w.on('render-process-gone',(_e,d)=>evidence.errors.push({kind:'crash',reason:d.reason}));});
const watchdog=setTimeout(()=>void finish(false,Error('before UI evidence timeout')),30000);
async function finish(ok,error){
 if(finished)return;finished=true;clearTimeout(watchdog);evidence.status=ok?'passed':'failed';if(error)evidence.error={message:error.message,stack:error.stack};
 try{evidence.teardown=await require('./electron-teardown.cjs').teardownElectron({electron,host});}catch(error){evidence.teardown={ok:false,errors:[{stage:'teardown',message:error.message}]};}
 ok=ok&&evidence.teardown.ok;evidence.status=ok?'passed':'failed';
 fs.writeFileSync(path.join(run,'result.json'),JSON.stringify(evidence,null,2)+'\n');app.exit(ok?0:1);
}
async function dom(code){return host.mainWindow.webContents.executeJavaScript('(()=>{'+code+'})()');}
async function click(selector){await dom('const e=document.querySelector('+JSON.stringify(selector)+');if(!e)throw Error("Missing control");e.click();');await delay(80);}
async function waitFor(code){for(let i=0;i<100;i++){if(await dom('return ('+code+');'))return;await delay(25);}throw Error('UI condition timed out: '+code);}
async function shot(name){await host.mainWindow.webContents.executeJavaScript('document.fonts.ready');await delay(120);const wc=host.mainWindow.webContents,revision=frames.get(wc.id)?.revision||0;wc.invalidate();for(let i=0;i<100&&(frames.get(wc.id)?.revision||0)<=revision;i++)await delay(20);const frame=frames.get(wc.id);assert.ok(frame?.bytes.length>100);assert.equal(frame.size.width,626);assert.ok(frame.size.height>=443&&frame.size.height<=448);const file=path.join(shots,name+'.png');assert.equal(fs.existsSync(file),false);fs.writeFileSync(file,frame.bytes);evidence.screenshots.push({file:path.relative(root,file),size:frame.size});}
class LocalStub{constructor(){this.exe=path.join(root,'native/local-asr-worker-local03.exe');}async transcribe(){throw Error('This evidence run must not capture');}async dispose(){}}
app.whenReady().then(async()=>{
 electron.session.defaultSession.webRequest.onBeforeRequest((d,cb)=>cb({cancel:!/^(?:file|data|blob):/.test(d.url)}));
 class SoftwareWindow extends electron.BrowserWindow{constructor(options){super({...options,frame:false,minWidth:320,minHeight:112,width:options.frame===false?options.width:626,height:options.frame===false?options.height:443,useContentSize:true,webPreferences:{...options.webPreferences,offscreen:true}});this.webContents.setFrameRate(30);this.webContents.on('paint',(_event,_dirty,image)=>frames.set(this.webContents.id,{bytes:image.toPNG(),size:image.getSize(),revision:(frames.get(this.webContents.id)?.revision||0)+1}));}}
 const facade={...electron,BrowserWindow:SoftwareWindow,globalShortcut:{register:()=>false,unregister(){},isRegistered:()=>false},safeStorage:{isEncryptionAvailable:()=>false},clipboard:{writeText(){evidence.clipboardCalls++;if(clipboardFail)throw Error('合成复制失败，结果仍保留。');}}};
 host=await require('../app/src/dictation-main').start(facade,{root,LocalAsrClass:LocalStub});if(!host.mainWindow.isVisible())host.mainWindow.showInactive();

 await waitFor('document.getElementById("result-content").textContent.includes("500")');
 evidence.bounds=host.mainWindow.getBounds();evidence.contentBounds=host.mainWindow.getContentBounds();
 await dom('const badge=document.createElement("div");badge.textContent="合成验收 · Electron 软件离屏";badge.style.cssText="position:fixed;bottom:0;left:0;background:#fff0c8;color:#5c491b;padding:2px 6px;font:10px Segoe UI;z-index:9999;pointer-events:none";document.body.append(badge);');
 assert.equal(host.controller.state.phase,'idle');assert.equal(await dom('return document.querySelector("#capture-toggle").disabled;'),false);evidence.flowChecks.push('No automatic capture; explicit start available despite unregistered shortcut');
 await shot('after-final-01-recent');await click('[data-page=settings]');
 assert.equal(await dom('return document.querySelector("#provider-details").open;'),false);
 evidence.saveGeometry=await dom('const r=document.querySelector("#save-settings").getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:innerHeight};');
 assert.ok(evidence.saveGeometry.bottom<=446);await shot('after-final-02-settings');
 await click('[data-page=dictionary]');await click('#new-word');
 await dom('const e=document.querySelector("#word-input");e.value="ｏｐｅｎａｉ";e.dispatchEvent(new Event("input",{bubbles:true}));document.querySelector("#word-form").requestSubmit();');
 await waitFor('document.querySelector("#word-error").textContent.includes("已有")');
 assert.equal(await dom('return document.querySelector("#word-dialog").open&&document.activeElement.id==="word-input"&&document.querySelector("#word-input").value==="ｏｐｅｎａｉ";'),true);
 await shot('after-final-03-duplicate-word');evidence.flowChecks.push('Duplicate retains draft, dialog and input focus');await click('#cancel-word');
 const originalWord=structuredClone(host.store.dictionary.find(w=>w.id==='fixture-word-2'));
 await click('[data-word-id="fixture-word-2"] [data-word-action=delete]');await waitFor('!document.querySelector("#word-undo").hidden');
 await click('[data-page=recent]');await click('#copy-result');await waitFor('document.querySelector("#toast-text").textContent.includes("已复制")');
 await click('[data-page=dictionary]');assert.equal(await dom('return document.querySelector("#word-undo").hidden;'),false);
 clipboardFail=true;await click('[data-page=recent]');await click('#copy-result');await waitFor('document.querySelector("#toast-text").textContent.includes("失败")');clipboardFail=false;
 await click('[data-page=dictionary]');assert.equal(await dom('return document.querySelector("#word-undo").hidden;'),false);
 const restore=host.store.restoreDictionary.bind(host.store);let failUndo=true;host.store.restoreDictionary=token=>{if(failUndo){failUndo=false;throw Error('合成撤销写入失败，请重试。');}return restore(token);};
 await click('#undo-word');await waitFor('document.querySelector("#toast-text").textContent.includes("撤销写入失败")');assert.equal(await dom('return document.querySelector("#word-undo").hidden;'),false);
 await shot('after-final-04-undo-retained');await click('#undo-word');await waitFor('document.querySelectorAll(".word-row").length===2');
 assert.deepEqual(host.store.dictionary.find(w=>w.id==='fixture-word-2'),originalWord);evidence.flowChecks.push('Undo survives navigation, copy success/failure and failed save, then restores complete metadata');
 await click('[data-page=settings]');await click('#provider-details summary');
 await dom('const e=document.querySelector("#model-name");e.value="retained-synthetic-draft";e.dispatchEvent(new Event("input",{bubbles:true}));document.querySelector("#provider-details").open=false;');
 const save=host.store.save.bind(host.store);let failSave=true;host.store.save=input=>{if(failSave){failSave=false;throw Error('合成设置保存失败，草稿仍保留。');}return save(input);};
 await click('#save-settings');await waitFor('document.querySelector("#save-message").textContent.includes("保存失败")');
 assert.equal(await dom('return document.querySelector("#provider-details").open&&document.querySelector("#model-name").value==="retained-synthetic-draft";'),true);
 await shot('after-final-05-save-failure');await click('#save-settings');await waitFor('document.querySelector("#save-message").textContent==="已保存"');
 evidence.flowChecks.push('Collapsed provider retains draft; failed save reveals it; explicit retry succeeds');
 await dom('const e=document.querySelector("#model-url");e.value="not-a-url";e.dispatchEvent(new Event("input",{bubbles:true}));document.querySelector("#provider-details").open=false;');
 await click('#save-settings');await delay(100);
 assert.equal(await dom('return document.querySelector("#provider-details").open&&document.activeElement.id==="model-url"&&/检查/.test(document.querySelector("#save-message").textContent);'),true,'Collapsed invalid provider must expose its field and a clear validation message');
 evidence.flowChecks.push('Invalid collapsed provider is exposed with field focus and clear message');await shot('after-final-06-invalid-provider');
 assert.equal(evidence.errors.length,0);await finish(true);
}).catch(error=>finish(false,error));
