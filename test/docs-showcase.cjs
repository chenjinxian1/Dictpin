'use strict';
// Documentation capture: genuine renderer + preload + IPC + Store; isolated demo data.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),vm=require('node:vm');
const {EventEmitter}=require('node:events');
const electron=require('electron'),{app}=electron,root=path.resolve(__dirname,'..');
const run=path.resolve(process.env.DICTPIN_DOCS_RUN||''),shots=path.join(run,'screenshots');
assert.ok(run.toLowerCase().startsWith((path.join(root,'work')+path.sep).toLowerCase()),'Capture stays in this checkout work directory');
app.disableHardwareAcceleration();
for(const flag of ['no-sandbox','disable-web-security','ignore-certificate-errors','use-fake-ui-for-media-stream'])assert.equal(app.commandLine.hasSwitch(flag),false);
for(const flag of ['disable-audio-input','disable-audio-output'])assert.equal(app.commandLine.hasSwitch(flag),true);
for(const [name,part]of [['userData','profile'],['sessionData','session'],['temp','tmp'],['crashDumps','crashes']]){fs.mkdirSync(path.join(run,part),{recursive:true});app.setPath(name,path.join(run,part));}
app.setAppLogsPath(path.join(run,'logs'));fs.mkdirSync(shots,{recursive:true});
const original='Review dict pin on Tuesday at 3 PM.\nKeep the budget at $500. Do not move the deadline.\n\nUse sense voice for local recognition.';
const dictionary=[{id:'demo-dictpin',word:'Dictpin',aliases:['dict pin'],source:'manual',note:''},{id:'demo-sensevoice',word:'SenseVoice',aliases:['sense voice'],source:'manual',note:''}];
const correction=require('../app/src/local-dictionary').correctText(original,dictionary);
assert.equal(correction.changes.length,2);assert.ok(correction.text.includes('$500'));assert.ok(correction.text.includes('Do not move the deadline.'));
const settings=structuredClone(require('../app/src/settings').DEFAULTS);
settings.asr.backend='local';settings.deviceId='demo-input';settings.shortcut='';settings.copyShortcut='';settings.refiner={...settings.refiner,enabled:false,baseUrl:'https://dashscope.aliyuncs.com/compatible-mode/v1',model:'qwen-plus'};
settings.modeShortcuts={dictate:'',translate:'',ask:''};settings.modeShortcutAlternates={dictate:[],translate:[],ask:[]};settings.saveAudio=false;settings.saveHistory=false;
const result={id:'docs-demo-result',mode:'dictate',status:'completed',original,corrected:correction.text,text:correction.text,revision:1,source:'dictionary',corrections:correction.changes,refined:false,createdAt:'2026-10-24T09:00:00Z',durationMs:0};
const profile=app.getPath('userData');
for(const [name,value]of [['settings.json',{version:2,settings,secrets:{},demo:true}],['recent-result.json',result],['dictionary.json',dictionary]])fs.writeFileSync(path.join(profile,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const evidence={kind:'Actual production English renderer/preload/IPC/Store. Seeded English demo transcript with real local dictionary correction; no acoustic recognition or paid service. Native adapters simulated.',uiLanguage:'en',viewport:{width:640,height:480},checks:[],screenshots:[],networkAttempts:[],microphoneCommands:[],asrCalls:0,clipboard:{adapter:'in-memory demo only',writes:0,systemClipboardRead:false,systemClipboardWritten:false},profileIsolated:true,errors:[]};
const denyNetwork=target=>{evidence.networkAttempts.push(String(target).slice(0,300));throw Error('Network disabled for documentation capture');};
globalThis.fetch=(url)=>Promise.reject((()=>{try{denyNetwork(url);}catch(error){return error;}})());
for(const module of ['node:http','node:https']){const api=require(module);api.request=(url)=>denyNetwork(url);api.get=(url)=>denyNetwork(url);}
const mediaAdapter=`(()=>{window.__docsMedia={getUserMediaCalls:0,enumerations:0};const devices={enumerateDevices:async()=>{window.__docsMedia.enumerations++;return [{kind:'audioinput',deviceId:'default',groupId:'demo',label:'Demo microphone (simulated)'},{kind:'audioinput',deviceId:'demo-input',groupId:'demo',label:'Demo microphone (simulated)'}];},getUserMedia:async()=>{window.__docsMedia.getUserMediaCalls++;throw Error('Physical microphone disabled for documentation capture');},addEventListener(){},removeEventListener(){}};Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:devices});window.fetch=async()=>{throw Error('Network disabled for documentation capture');};})();`;
let host,finished=false;const windows=[],clipboardTexts=[];
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function evaluate(contents,source){new vm.Script(source);return contents.executeJavaScript(source);}
const dom=source=>evaluate(host.mainWindow.webContents,'(()=>{'+source+'})()');
async function waitFor(source){for(let i=0;i<200;i++){if(await dom('return ('+source+');'))return;await delay(20);}throw Error('Documentation state timeout: '+source);}
async function click(selector){await dom('document.querySelector('+JSON.stringify(selector)+').click();');await delay(60);}
function passed(name,details){evidence.checks.push({name,status:'passed',...(details?{details}:{})});}
function progress(stage){fs.writeFileSync(path.join(run,'progress.json'),JSON.stringify({stage,checks:evidence.checks.length})+'\n');}
async function visibleEnglish(){
 const state=await dom(String.raw`const visible=e=>{const s=getComputedStyle(e);return e.getClientRects().length>0&&s.display!=='none'&&s.visibility!=='hidden'&&!e.closest('[hidden]');};return {lang:document.documentElement.lang,language:window.dictation.uiLanguage,text:document.body.innerText,attributes:[...document.querySelectorAll('button,input,textarea,select,summary,nav')].filter(visible).flatMap(e=>['aria-label','placeholder','title'].map(a=>e.getAttribute(a)||'')).join('\n'),width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth};`);
 assert.equal(state.lang,'en');assert.equal(state.language,'en');assert.doesNotMatch(state.text+state.attributes,/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u);
 assert.equal(state.width,640);assert.equal(state.height,480);assert.ok(state.scrollWidth<=640);return state;
}
async function shot(name){
 const wc=host.mainWindow.webContents;
 await evaluate(wc,'document.fonts.ready');
 await evaluate(wc,'Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))');
 await evaluate(wc,'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
 await visibleEnglish();
 const image=await wc.capturePage({x:0,y:0,width:640,height:480}),bytes=image.toPNG(),size=image.getSize();
 assert.equal(size.width,640);assert.equal(size.height,480);
 fs.writeFileSync(path.join(shots,name+'.png'),bytes,{flag:'wx'});evidence.screenshots.push({file:name+'.png',width:size.width,height:size.height,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
}
async function finish(ok,error){
 if(finished)return;finished=true;clearTimeout(watchdog);if(error)evidence.error={message:error.message,stack:error.stack};
 try{if(host)evidence.media=await dom('return window.__docsMedia;');}catch{}
 try{evidence.teardown=await require('./electron-teardown.cjs').teardownElectron({electron,host,windows});}catch(error){evidence.teardown={ok:false,error:error.message};}
 evidence.status=ok&&evidence.teardown.ok?'passed':'failed';fs.writeFileSync(path.join(run,'result.json'),JSON.stringify(evidence,null,2)+'\n');app.exit(evidence.status==='passed'?0:1);
}
const watchdog=setTimeout(()=>finish(false,Error('Documentation capture watchdog')),45000);
app.on('web-contents-created',(_event,wc)=>{wc.on('preload-error',(_e,_p,error)=>evidence.errors.push(error.message));wc.on('render-process-gone',(_e,details)=>evidence.errors.push(details.reason));wc.on('console-message',event=>{if(['error',3].includes(event.level))evidence.errors.push(event.message);});});
class LocalStub{constructor(){this.exe=path.join(root,'native/local-asr-worker-local03.exe');this.ready=false;}async transcribe(){evidence.asrCalls++;throw Error('Recognition disabled for documentation capture');}async ensureReady(){throw Error('Recognition disabled for documentation capture');}async dispose(){}}
app.whenReady().then(async()=>{
 electron.nativeTheme.themeSource='light';
 electron.session.defaultSession.webRequest.onBeforeRequest((details,callback)=>{const remote=details.url!=='about:blank'&&!/^(file|data|blob):/.test(details.url);if(remote)evidence.networkAttempts.push(details.url);callback({cancel:remote});});
 class SoftwareWindow extends electron.BrowserWindow{
  constructor(options){super({...options,frame:false,show:false,useContentSize:true,...(!options.transparent?{width:640,height:480}:{}),webPreferences:{...options.webPreferences,offscreen:true}});windows.push(this);this.webContents.setFrameRate(30);this.webContents.on('dom-ready',()=>progress('renderer DOM ready'));}
  async loadURL(url){if(!this.adapterPrepared){progress('initialize blank renderer for CDP');await super.loadURL('about:blank');this.webContents.debugger.attach('1.3');await this.webContents.debugger.sendCommand('Page.enable');new vm.Script(mediaAdapter);await this.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:mediaAdapter});this.adapterPrepared=true;}progress('load production renderer');return super.loadURL(url);}
 }
 class FakeTray{setContextMenu(){}setToolTip(){}on(){}destroy(){}}
 const facade={...electron,BrowserWindow:SoftwareWindow,Tray:FakeTray,globalShortcut:{register:()=>false,unregister(){},isRegistered:()=>false},clipboard:{writeText(text){clipboardTexts.push(text);evidence.clipboard.writes++;}},powerMonitor:new EventEmitter()};
 progress('start production host');host=await require('../app/src/dictation-main').start(facade,{root,LocalAsrClass:LocalStub,uiLanguage:'en'});progress('production host ready');
 host.mainWindow.webContents.enableDeviceEmulation({screenPosition:'desktop',deviceScaleFactor:1,viewSize:{width:640,height:480},scale:1});
 host.controller.on('command',command=>evidence.microphoneCommands.push(command.type));
 await waitFor('document.documentElement.lang==="en"&&document.querySelector("#capture-label").textContent==="Start dictation"&&document.querySelector("#result-content").value.includes("Dictpin")');
 assert.equal(host.store.getRecentResult().text,correction.text);assert.equal(host.store.getRecentResult().original,original);assert.equal(host.store.getRecentResult().corrections.length,2);
 assert.equal(await dom('return document.querySelector("#result-content").readOnly;'),false);await visibleEnglish();passed('English production UI with real local dictionary corrections preserves numbers and negation');
 // Verify real edit/save/copy through production IPC, but store clipboard output in memory.
 const edited=correction.text+'\nKeep this note concise.';
 await dom('const e=document.querySelector("#result-content");e.value='+JSON.stringify(edited)+';e.dispatchEvent(new Event("input",{bubbles:true}));');
 await waitFor('document.querySelector("#result-content").dataset.revision!=="1"');
 assert.equal(host.store.getRecentResult().text,edited);assert.equal(host.store.getRecentResult().original,original);
 await click('#copy-result');await waitFor('document.querySelector("#copy-result").textContent==="Copied"');assert.equal(clipboardTexts.at(-1),edited);passed('Editing saves a new version and Copy uses only the in-memory clipboard adapter');
 // Return to the genuinely corrected demo state before taking the documentation picture.
 const restored={...result,revision:(host.store.getRecentResult().revision||1)+1};host.store.saveRecentResult(restored);host.controller.publish({phase:'idle',result:null});
 await waitFor('document.querySelector("#result-content").value==='+JSON.stringify(correction.text)+'&&document.querySelector("#copy-result").textContent==="Copy text"');
 await click('#dismiss-toast');await waitFor('document.querySelector("#toast").hidden');
 await click('[data-page=recent]');await shot('results');passed('Main screenshot is unedited English renderer pixels');
 await click('[data-page=settings]');await click('#provider-details>summary');
 await dom('const form=document.querySelector("#settings-form"),details=document.querySelector("#provider-details");form.scrollTop+=details.getBoundingClientRect().top-form.getBoundingClientRect().top;');await delay(100);
 const api=await dom('return {url:document.querySelector("#model-url").value,model:document.querySelector("#model-name").value,key:document.querySelector("#model-key").value,test:document.querySelector("#test-message").textContent,providerOpen:document.querySelector("#provider-details").open,keyBounds:document.querySelector("#model-key").getBoundingClientRect().toJSON(),saveBounds:document.querySelector("#save-settings").getBoundingClientRect().toJSON()};');
 assert.equal(api.url,settings.refiner.baseUrl);assert.equal(api.model,'qwen-plus');assert.equal(api.key,'');assert.equal(api.test,'');assert.equal(api.providerOpen,true);assert.ok(api.keyBounds.top>=46&&api.keyBounds.bottom<=480);assert.ok(api.saveBounds.top>=46&&api.saveBounds.bottom<=480);
 assert.equal(host.store.keys.refiner,'');await shot('settings');passed('API settings show example endpoint/model and an empty key without a service-test result');
 const media=await dom('return window.__docsMedia;');assert.equal(media.getUserMediaCalls,0);assert.equal(evidence.microphoneCommands.length,0);assert.equal(evidence.asrCalls,0);assert.equal(evidence.networkAttempts.length,0);assert.equal(evidence.errors.length,0);assert.equal(app.getPath('userData'),profile);passed('No microphone, recognition, network, real clipboard or private profile was used');
 await finish(true);
}).catch(error=>finish(false,error));
