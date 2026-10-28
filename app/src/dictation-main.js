'use strict';
const path=require('node:path'),fs=require('node:fs'),{pathToFileURL}=require('node:url');
const {Store}=require('./dictation-store'),{Controller}=require('./segmented-controller'),{LocalAsr}=require('./local-asr');
const {SafePaste}=require('./safe-paste');
const {createShortcutManager}=require('./shortcut-manager'),{createTextServiceDiagnostics}=require('./provider-checks');
const {createActions,readable}=require('./dictation-actions'),{createOverlayLifecycle}=require('./dictation-overlay-lifecycle');
const {registerProductIpc,singleShortcutMap}=require('./dictation-ipc');
function configurePaths(app,root){
 const scope=path.resolve(root,'..'),work=path.join(root,'work'),profile=path.resolve(process.env.LOCAL_DICTATION_PROFILE||path.join(work,'profile'));
 if(!profile.toLowerCase().startsWith((scope+path.sep).toLowerCase()))throw Error('Profile must stay in the named test directory.');
 for(const name of ['tmp','session','logs','crashes'])fs.mkdirSync(path.join(work,name),{recursive:true});
 fs.mkdirSync(profile,{recursive:true});process.env.TEMP=process.env.TMP=process.env.TMPDIR=path.join(work,'tmp');
 app.setPath('userData',profile);app.setPath('sessionData',path.join(work,'session'));app.setPath('temp',path.join(work,'tmp'));app.setPath('crashDumps',path.join(work,'crashes'));app.setAppLogsPath?.(path.join(work,'logs'));
 return profile;
}
async function start(electron,{StoreClass=Store,LocalAsrClass=LocalAsr,SafePasteClass=SafePaste,root=path.resolve(__dirname,'../..'),uiLanguage='zh-CN'}={}){
 const english=uiLanguage==='en',languageArguments=english?['--dictpin-ui-language=en']:[],label=(zh,en)=>english?en:zh;
 const {app,BrowserWindow,ipcMain,globalShortcut,clipboard,safeStorage,session,screen,Menu,Tray,nativeImage,powerMonitor}=electron;
 const renderer=path.join(root,'app/renderer'),mainURL=pathToFileURL(path.join(renderer,'dictation.html')).href,barURL=pathToFileURL(path.join(renderer,'voice-bar.html')).href;
 app.setName('Local Dictation');
 const store=new StoreClass(app.getPath('userData'),safeStorage),localAsr=new LocalAsrClass(),controller=new Controller({store,bridge:Object.freeze({}),localAsr});
 let mainWindow,barManager,tray,host,shortcutManager,providerChecks,quitting=false,disposed=false,copiedResultId=null,copiedResultRevision=null,requestedView='recent',flushSequence=0;
 const pendingFlushes=new Map();let shortcutRecordingIntent=false,flushNotice='';
 const paste=new SafePasteClass({onStatus:()=>publish()}),deliveryBusy=()=>paste.snapshot().status==='pending';
 function manualDelivery(){paste.cancel();if(!paste.snapshot().unknownOutcome)void paste.begin('manual',{enabled:false,source:'ui'});}
 const settingsView=()=>({deviceId:store.settings.deviceId,shortcut:store.settings.shortcut,copyShortcut:store.settings.copyShortcut||'',autoPaste:store.settings.autoPaste===true,appendMode:store.settings.appendMode===true,refiner:{baseUrl:store.settings.refiner.baseUrl,endpointMode:store.settings.refiner.endpointMode,model:store.settings.refiner.model,enabled:store.settings.refiner.enabled}});
 function currentResult(){const result=controller.state.result;return readable(result)||(controller.active()&&result?.id===controller.state.sessionId&&result.original?.trim())?result:store.getRecentResult();}
 function snapshot(bar=false){
  const result=currentResult(),state={...controller.state},pipeline=controller.session?.pipeline,canUseOriginal=!!(controller.active()&&controller.session?.id===state.sessionId&&controller.session.original?.trim()&&(!pipeline||pipeline.sealed&&!pipeline.summary().pending));
  state.delivery=paste.snapshot();
  if(state.result)delete state.result;
  const recovery=controller.recoverySummary(),canRetryCleanup=controller.canRetryCleanup(result);
  if(bar){const current=readable(controller.state.result)?controller.state.result:null;return {state,canUseOriginal,canRetryCleanup,recovery,result:current?{id:current.id,revision:current.revision||1,source:current.source,status:current.status,refined:current.refined,hasText:!!current.text?.trim()}:null,copiedResultId,copiedResultRevision,escapeRegistered:false};}
  return {state,canUseOriginal,canRetryCleanup,recovery,recentResult:result,dataWritable:{settings:store.settingsReadable!==false&&store.readOnly!==true,dictionary:store.dictionaryReadable!==false&&store.readOnly!==true},settings:settingsView(),textServices:store.serviceView(),dictionary:store.dictionary.map(e=>({...e})),keyStatus:store.keyStatus().refiner,secureStorage:store.secureAvailable(),shortcutStatus:shortcutManager?.snapshot(),usage:store.usageSnapshot(),notices:[...store.notices,...(flushNotice?[flushNotice]:[]),...(controller.session?.storageWarnings||[]),...(store.settingsReadable===false?['旧配置不可读，当前只可查看；原文件与密钥保持不变。']:[]),...(store.dictionaryReadable===false?['词典当前只读；原文件保持不变。']:[])],localEngine:{workerFound:typeof localAsr.exe==='string'&&fs.existsSync(localAsr.exe),ready:localAsr.ready===true},copiedResultId,copiedResultRevision,requestedView};
 }
 function flushEditor(reason){
  if(!mainWindow||mainWindow.isDestroyed())return Promise.resolve(false);const token='flush-'+(++flushSequence);
  return new Promise(resolve=>{const timer=setTimeout(()=>{pendingFlushes.delete(token);resolve(false);},1500);pendingFlushes.set(token,{resolve,timer});mainWindow.webContents.send('command',{type:'flush-editor',token,reason});});
 }
 function clearFlushNotice(){flushNotice='';}
 function editorFlushed(input){const pending=pendingFlushes.get(input.token);if(!pending)return {accepted:false};pendingFlushes.delete(input.token);clearTimeout(pending.timer);if(input.ok===true)clearFlushNotice();pending.resolve(input.ok===true);return {accepted:true};}
 function setShortcutRecording(input){if(input.active&&!mainWindow.isVisible())throw Error('请在当前设置窗口录入快捷键。');shortcutRecordingIntent=input.active;try{shortcutManager.setRecording(input.active);}finally{publish();}return snapshot(false);}
 function resumeShortcuts(){if(!shortcutManager?.snapshot().suspended)return;try{shortcutManager.setRecording(false);}catch{store.notices.push('快捷键未能恢复，请在设置中重新启用或更换组合。');}publish();}
 function publish(){if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('state',snapshot(false));barManager?.update(snapshot(true));tray?.setToolTip(controller.state.phase==='recording'?label('本地听写 · 录音中','Dictpin · Recording'):label('本地听写','Dictpin'));}
 function secure(win){win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',event=>event.preventDefault());win.webContents.on('will-attach-webview',event=>event.preventDefault());}
 function showMain(view='recent'){requestedView=view;if(mainWindow&&!mainWindow.isDestroyed()){mainWindow.show();mainWindow.focus();publish();}}
 mainWindow=new BrowserWindow({width:640,height:480,minWidth:360,minHeight:300,show:false,title:label('本地听写','Dictpin'),autoHideMenuBar:true,backgroundColor:'#fafaf9',webPreferences:{preload:path.join(__dirname,'dictation-preload.js'),additionalArguments:languageArguments,contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,backgroundThrottling:false}});
 secure(mainWindow);
 mainWindow.on('blur',resumeShortcuts);
 mainWindow.on('focus',()=>{if(!shortcutRecordingIntent||disposed||!shortcutManager)return;try{shortcutManager.setRecording(true);}catch{store.notices.push('快捷键未能完全暂停，录入期间已禁止触发，请重试。');}publish();});
 barManager=createOverlayLifecycle({
  createWindow(){const win=new BrowserWindow({width:380,height:112,show:false,frame:false,resizable:false,transparent:true,alwaysOnTop:true,skipTaskbar:true,focusable:false,webPreferences:{preload:path.join(__dirname,'dictation-preload.js'),additionalArguments:languageArguments,contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});secure(win);return win;},
  loadWindow:win=>win.loadURL(barURL),
  positionWindow(win){const work=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;win.setBounds({x:Math.round(work.x+(work.width-380)/2),y:Math.round(work.y+work.height-132),width:Math.min(380,work.width),height:112},false);},
  onFailure(){store.notices.push('录音条未能打开，请从托盘打开最近结果。');}
 });
 shortcutManager=createShortcutManager({globalShortcut,onTrigger:async mode=>{if(deliveryBusy())return;if(mode==='copy'){paste.cancel();if(mainWindow.isFocused()&&!await flushEditor('copy'))return;const result=currentResult();if(!result)return;return actions.copyResult({id:result.id,expectedRevision:result.revision||1});}const answer=await host?.toggleFromShortcut(mode);if(answer?.reason==='recovery')controller.publish({operationFeedback:'本段仍可恢复，请先选择恢复或放弃。'});return answer;},onError:()=>{store.notices.push('听写快捷键未能执行，请从托盘开始。');publish();}});
 providerChecks=createTextServiceDiagnostics({resolveDraft:(input,options)=>store.resolveServiceDraft(input,options),getUsageObserver:metadata=>{const price=require('../renderer/token-usage').defaultPrice();return event=>{store.recordUsage({...event,...metadata,price});publish();};}});
 const actions=createActions({controller,store,writeClipboard:text=>clipboard.writeText(text),onCopied:(id,revision)=>{clearFlushNotice();copiedResultId=id;copiedResultRevision=revision;barManager.markCopied(id);publish();}});
 host=registerProductIpc({ipcMain,controller,store,getMainWindow:()=>mainWindow,getBarWindow:()=>barManager.getWindow(),mainURL,barURL,snapshot,publish,copyResult:actions.copyResult,applyShortcuts:settings=>shortcutManager.apply(singleShortcutMap(settings)),showMain,dismissOverlay:()=>barManager.dismiss(),providerChecks,editorFlushed,setShortcutRecording,deliveryBusy,onManualResult:manualDelivery,onStopFromMain:id=>paste.allowRestore(id),openProviderHelp:async id=>{const url=require('../renderer/provider-presets').KEY_URLS[id];if(!url)throw Error('帮助链接无效。');await electron.shell.openExternal(url);return {opened:true};}});
 const trustedMedia=(webContents,details)=>webContents===mainWindow.webContents&&webContents.getURL()===mainURL&&details?.isMainFrame===true&&details.requestingUrl===mainURL;
 const allowedCapture=(webContents,details)=>trustedMedia(webContents,details)&&['starting','recording'].includes(controller.state.phase);
 // Chromium checks audio permission when listing device names. Capture requests remain separately gated below.
 session.defaultSession.setPermissionCheckHandler((contents,permission,_origin,details)=>permission==='media'&&trustedMedia(contents,details)&&(details.mediaType==='audio'||details.mediaType==='unknown'&&allowedCapture(contents,details)));
 session.defaultSession.setPermissionRequestHandler((contents,permission,callback,details)=>callback(permission==='media'&&allowedCapture(contents,details)&&Array.isArray(details.mediaTypes)&&details.mediaTypes.length>0&&details.mediaTypes.every(t=>t==='audio')));
 controller.on('command',async command=>{
  if(command.type==='start'){
   const s=controller.session;await paste.begin(command.sessionId,{enabled:s?.config.autoPaste===true,source:s?.origin||'ui'});
   if(!controller.current(command.sessionId)||disposed)return;s.captureSent=true;
  }else if(command.type==='cancel-retain'&&controller.tailPending?.session?.id===command.sessionId&&!controller.tailPending.session.captureSent){controller.sealSegments({sessionId:command.sessionId,sequence:0,startSample:0});return;}
  if(!mainWindow.isDestroyed())mainWindow.webContents.send('command',command);
 });
 controller.on('result-saved',clearFlushNotice);
 controller.on('state',()=>{
  if(controller.active())providerChecks.cancelAll();
  if(['error','cancelled'].includes(controller.state.phase))paste.cancel();publish();
  const r=controller.state.result;
  if(controller.state.phase==='done'&&r?.status==='completed'){if(r.deliveryAllowed===false)paste.cancel();else void paste.finish(r,{text:r.deliveryText??r.text,isCurrent:()=>!disposed&&!controller.active()&&controller.state.result?.id===r.id&&controller.state.result.revision===r.revision&&controller.state.result.text===r.text});}
 });
 controller.on('usage',publish);controller.on('level',level=>{mainWindow.webContents.send('level',level);barManager.getWindow()?.webContents.send('level',level);});
 mainWindow.on('close',event=>{if(!quitting){event.preventDefault();void flushEditor('hide').then(ok=>{if(ok){resumeShortcuts();mainWindow.hide();providerChecks.cancelAll();}else{flushNotice='文字尚未确认保存，窗口保持打开，请先复制当前文字。';publish();}});}});
 mainWindow.webContents.on('render-process-gone',()=>{resumeShortcuts();controller.interrupt('录音页面中断，本次任务已取消。');store.notices.push('录音页面已重载，请重新开始。');void mainWindow.loadURL(mainURL);});
 powerMonitor.on('suspend',()=>{paste.cancel();controller.interrupt('系统挂起，本次录音已取消。');try{Promise.resolve(localAsr.release?.()).catch(()=>{});}catch{}});
 await mainWindow.loadURL(mainURL);
 try{shortcutManager.apply(singleShortcutMap(store.settings));}catch{store.notices.push('快捷键未生效；请从托盘开始听写或修改键位。');}
 tray=new Tray(nativeImage.createFromPath(path.join(renderer,'../assets/tray.png')));
 tray.setContextMenu(Menu.buildFromTemplate([{label:label('最近结果','Recent result'),click:()=>showMain('recent')},{label:label('开始 / 结束听写','Start / stop dictation'),click:()=>void host.toggleFromTray()},{label:label('个人词典','Personal dictionary'),click:()=>showMain('dictionary')},{label:label('设置','Settings'),click:()=>showMain('settings')},{type:'separator'},{label:label('退出','Quit'),click:()=>{quitting=true;app.quit();}}]));
 tray.on('double-click',()=>showMain('recent'));
 mainWindow.show();publish();
 async function dispose(){if(disposed)return;disposed=true;quitting=true;for(const p of pendingFlushes.values()){clearTimeout(p.timer);p.resolve(false);}pendingFlushes.clear();providerChecks.cancelAll();controller.dispose();barManager.dispose();shortcutManager.dispose();const ownedTray=tray;tray=null;ownedTray?.destroy?.();await Promise.allSettled([localAsr.dispose(),paste.dispose()]);}
 app.on('before-quit',event=>{if(!disposed){event.preventDefault();void flushEditor('quit').then(ok=>{if(ok)return dispose().finally(()=>app.quit());quitting=false;flushNotice='文字尚未确认保存，暂未退出，请先复制当前文字。';showMain('recent');});}});
 return {controller,store,mainWindow,snapshot,dispose,host};
}
function boot(electron){
 const root=path.resolve(__dirname,'../..');configurePaths(electron.app,root);
 if(!electron.app.requestSingleInstanceLock()){electron.app.quit();return;}
 let running;electron.app.on('second-instance',()=>{running?.mainWindow.show();running?.mainWindow.focus();});
 const uiLanguage=process.argv.includes('--dictpin-ui-language=en')?'en':'zh-CN';
 electron.app.whenReady().then(()=>start(electron,{root,uiLanguage})).then(result=>{running=result;}).catch(()=>{electron.dialog?.showErrorBox(uiLanguage==='en'?'Startup failed':'启动失败',uiLanguage==='en'?'Dictpin could not start. Existing data was not changed and recognition did not switch to the cloud.':'本地听写未能启动；未更改旧数据或切换到云端识别。');electron.app.quit();});
}
module.exports={start,boot,configurePaths};
if(require.main===module)boot(require('electron'));
