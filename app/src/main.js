'use strict';
const {readHistoryAnswer,historyCopyText}=require('./history-answer');
const {mergeSettingsSection}=require('./settings-sections');
const {createProviderChecks}=require('./provider-checks');
const {LocalAsr}=require('./local-asr');
const {desktopChrome,updateDesktopChrome}=require('./desktop-window');
const {mergeShortcutRow}=require('./shortcut-row-update');
const {createSourceActions,readPayloadSource}=require('./source-actions');
const {createScenarioActions}=require('./scenario-actions');
const {app,BrowserWindow,ipcMain,globalShortcut,Tray,Menu,nativeImage,clipboard,safeStorage,session,screen,powerMonitor,dialog,shell,nativeTheme}=require('electron');
const {createFileActions}=require('./file-actions');const {errorForClient}=require('./client-errors');
const path=require('node:path');const {pathToFileURL}=require('node:url');
const {createAnswerWindow}=require('./answer-window');
const {createOverlayGeometry}=require('./overlay-geometry');
const {createShortcutManager,normalizeAccelerator}=require('./shortcut-manager');
const {createShortcutCapture}=require('./shortcut-capture');
const {createOverlayLifecycle}=require('./overlay-lifecycle');
const {Store}=require('./store');const {Controller}=require('./controller');const {validateSettings}=require('./settings');const bridge=Object.freeze({}); // Copy-only: no native helper is loaded or started.
let providerChecks;let localAsr;let mainWindow,overlayManager,overlayGeometry,answerManager,tray,store,controller,quitting=false,shortcutManager,shortcutCapture;let retentionTimer,fileActions,sourceRevision=0,sourceSession=null;
const rendererDir=path.join(__dirname,'..','renderer');
const mainURL=pathToFileURL(path.join(rendererDir,'index.html')).href;
const overlayURL=pathToFileURL(path.join(rendererDir,'overlay.html')).href;
const answerURL=pathToFileURL(path.join(rendererDir,'answer.html')).href;
const isLocalURL=url=>url===mainURL||url===overlayURL;
if(!app.requestSingleInstanceLock()){app.quit();}else{
app.on('second-instance',()=>{mainWindow?.show();mainWindow?.focus();});
app.whenReady().then(start).catch(()=>{dialog.showErrorBox('启动失败','本地听写无法启动，请检查安装文件和本地数据目录权限。');app.quit();});
}
function snapshot(){return{canRetainRecording:controller.canRetainRecording?.()===true,shortcutCapture:shortcutCapture?.snapshot(),shortcutStatus:shortcutManager?.snapshot(),settings:store.settings,usage:store.usageSnapshot(),keyStatus:store.keyStatus(),secureStorage:store.secureAvailable(),state:controller.state,recovery:controller.recoverySummary(),history:store.history,dictionary:store.dictionary,audioStats:store.audioStats(),notices:store.notices,platform:process.platform};}
function overlaySnapshot(){
  const {phase,sessionId,message,level,mode,startedAt,durationMs,recordingLimits}=controller.state;
  return{canRetainRecording:controller.canRetainRecording?.()===true,state:{phase,sessionId,message,level,mode,startedAt,durationMs,recordingLimits,recordingElapsedMs:phase==='recording'&&Number.isFinite(controller.session?.startedMono)?Math.max(0,controller.monotonicNow()-controller.session.startedMono):0,retaining:controller.state.retaining===true,languageError:controller.state.languageError,errorId:controller.state.result?.id||controller.state.errorId,targetLanguage:controller.session?.config.targetLanguage??controller.state.result?.targetLanguage??store.settings.targetLanguage,targetLanguages:controller.session?.config.targetLanguages??store.settings.targetLanguages},settings:{shortcut:store.settings.shortcut,targetLanguage:store.settings.targetLanguage,targetLanguages:store.settings.targetLanguages},platform:process.platform};
}
function publishUsage(){if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('usage:state',store.usageSnapshot());}
function windowChrome(){updateDesktopChrome(mainWindow,process.platform,store?.settings.appearance,nativeTheme?.shouldUseDarkColors===true);}
function publish(){
  const data=snapshot();if(data.state.sessionId&&data.state.sessionId!==sourceSession){sourceSession=data.state.sessionId;sourceRevision++;}if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('state',data);
  mainWindow?.webContents.setBackgroundThrottling(!['starting','recording','stopping'].includes(controller.state.phase));
  overlayManager?.update(overlaySnapshot());
  // Results stay in the workbench; the existing explicit answer-window action remains available.
  tray?.setToolTip(`本地听写 · ${data.state.phase==='recording'?'正在录音':data.state.phase==='processing'?'正在处理':'就绪'}`);
}
function shortcutMap(settings){return{current:settings.shortcut,...Object.fromEntries(['dictate','translate','ask'].map(mode=>[mode,[settings.modeShortcuts?.[mode]||'',...(settings.modeShortcutAlternates?.[mode]||[])].filter(Boolean)]))};}
function verify(event,mainOnly=true){
  const allowed=mainOnly?[mainWindow]:[mainWindow,overlayManager?.getWindow()];
  if(!allowed.some(w=>w&&w.webContents===event.sender)||event.senderFrame!==event.sender.mainFrame||!isLocalURL(event.senderFrame.url))throw Error('拒绝未授权的界面请求');
}
function handle(channel,fn,mainOnly=true){ipcMain.handle(channel,async(event,...args)=>{verify(event,mainOnly);try{return await fn(...args);}catch(error){throw errorForClient(error);}});}
function secureWindow(win){
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event)=>event.preventDefault());
  win.webContents.on('will-attach-webview',event=>event.preventDefault());
}
async function start(){
  app.setName('Local Dictation');
  store=new Store(app.getPath('userData'),safeStorage);
  localAsr=new LocalAsr();
  controller=new Controller({store,bridge,localAsr});
  providerChecks=createProviderChecks({getSettings:()=>store.settings,getKey:kind=>store.keys[kind],localAsr,getUsageObserver:metadata=>{const price=structuredClone(store.settings.usagePrices[metadata.kind]);return event=>{store.recordUsage({...event,...metadata,price});publishUsage();};}});
  shortcutManager=createShortcutManager({globalShortcut,onTrigger:mode=>shortcutCapture?.snapshot().active?undefined:controller.toggle('shortcut',mode==='current'?{}:{mode}),onError:error=>{store.notices=[error.message];publish();}});
  session.defaultSession.setPermissionCheckHandler((webContents,permission,_origin,details)=>webContents===mainWindow?.webContents && permission==='media' && (details.mediaType==='audio'||details.mediaType==='unknown') && isLocalURL(webContents.getURL()) && ['starting','recording'].includes(controller.state.phase));
  session.defaultSession.setPermissionRequestHandler((webContents,permission,callback,details)=>callback(webContents===mainWindow?.webContents&&isLocalURL(webContents.getURL())&&permission==='media'&&Array.isArray(details.mediaTypes)&&details.mediaTypes.length>0&&details.mediaTypes.every(t=>t==='audio')&&['starting','recording'].includes(controller.state.phase)));
  mainWindow=new BrowserWindow({...desktopChrome(process.platform,store.settings.appearance,nativeTheme?.shouldUseDarkColors===true),width:1180,height:840,minWidth:900,minHeight:680,show:false,backgroundColor:'#ffffff',title:'本地听写',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,backgroundThrottling:true}});
  secureWindow(mainWindow);
  nativeTheme?.on?.('updated',()=>{if(store?.settings.appearance==='system')windowChrome();});
  shortcutCapture=createShortcutCapture({manager:shortcutManager,getBindings:()=>shortcutMap(store.settings),canStart:()=>!controller.active()&&mainWindow.isVisible()&&mainWindow.isFocused(),onChange:publish,onFailure:()=>{store.notices=['快捷键设置操作未完成，请检查当前生效状态并重试。'];}});
  mainWindow.on('blur',()=>shortcutCapture.cancel());mainWindow.on('hide',()=>{providerChecks.cancelAll();sourceRevision++;shortcutCapture.cancel();});
  mainWindow.webContents.on('did-start-loading',()=>{providerChecks.cancelAll();sourceRevision++;});
  mainWindow.on('closed',()=>{providerChecks.cancelAll();sourceRevision++;});
  overlayGeometry=createOverlayGeometry({getWorkArea:(win,first)=>first?screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea:screen.getDisplayMatching(win.getBounds()).workArea});
  overlayManager=createOverlayLifecycle({
    createWindow(){const win=new BrowserWindow({width:380,height:136,show:false,frame:false,resizable:false,transparent:true,alwaysOnTop:true,skipTaskbar:true,focusable:true,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});win.setIgnoreMouseEvents(false);secureWindow(win);return win;},
    loadWindow:win=>win.loadURL(overlayURL),positionWindow:(win,data)=>overlayGeometry.position(win,data),
    onFailure(){store.notices=['录音浮条无法打开，请在主窗口查看状态。'];mainWindow.show();mainWindow.webContents.send('state',snapshot());}
  });
  answerManager=createAnswerWindow({
    createWindow(){const win=new BrowserWindow({width:800,height:800,show:false,frame:false,resizable:false,minWidth:1,minHeight:1,autoHideMenuBar:true,title:'本地听写 · 回答',transparent:true,alwaysOnTop:true,minimizable:false,maximizable:false,backgroundColor:'#00000000',webPreferences:{preload:path.join(__dirname,'answer-preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});secureWindow(win);return win;},
    loadWindow:win=>win.loadURL(answerURL),getWorkArea:win=>win?screen.getDisplayMatching(win.getBounds()).workArea:screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea,
    writeClipboard:text=>clipboard.writeText(text),onFailure(){store.notices=['回答窗口未能打开，请在主窗口复制结果。'];mainWindow.show();publish();}
  });
  const sourceActions=createSourceActions({confirm:async(win,source)=>{const result=await dialog.showMessageBox(win,{type:'question',buttons:['取消','打开网页'],defaultId:0,cancelId:0,noLink:true,title:'打开来源网页',message:'访问服务商提供的来源？',detail:`${source.title}\n\n完整目的地：${source.url}\n\n确认后系统浏览器将访问此地址。来源由服务商提供，应用未核实内容或访问该站点；网址可能包含查询参数。`});return result.response===1;},open:url=>shell.openExternal(url)});
  const scenarioActions=createScenarioActions({confirm:async(win,scenario)=>{
    const result=await dialog.showMessageBox(win,{type:'question',buttons:['取消','打开网页版'],defaultId:0,cancelId:0,noLink:true,title:'打开场景网页',message:`打开 ${scenario.name} 网页版？`,detail:`完整目的地：${scenario.url}\n\n这是本应用额外的安全确认。确认后仅请求系统浏览器打开固定网页，不会启动录音、发送文字或连接网页输入框。地址保留原固定字面值；当前可达性、跳转和登录状态未经验证。`});
    return result.response===1;
  },open:url=>shell.openExternal(url)});
  function readScenarioOwner(event,owner,revision){
    if(!owner||owner!==mainWindow||owner.isDestroyed()||owner.webContents.isDestroyed()||quitting||sourceRevision!==revision)throw Error('界面或当前任务已变化，未打开网页，请重新确认。');
    const contents=owner.webContents;
    if(event?.sender!==contents||!event.senderFrame||event.senderFrame!==contents.mainFrame||event.senderFrame.url!==mainURL||contents.getURL()!==mainURL)throw Error('拒绝未授权的场景请求。');
    if(!owner.isVisible()||!owner.isFocused()||contents.isLoadingMainFrame()||controller.active())throw Error('请在可见且聚焦的主窗口、当前任务结束后打开场景网页。');
    return sourceRevision;
  }
  ipcMain.handle('scenario:open',async(event,input,...extra)=>{
    try{
      if(extra.length)throw Error('场景请求只接受固定场景标识。');
      const owner=mainWindow,revision=sourceRevision;
      readScenarioOwner(event,owner,revision);
      return await scenarioActions.open({input,window:owner,readOwner:()=>readScenarioOwner(event,owner,revision)});
    }catch(error){throw errorForClient(error);}
  });
  function answerHandle(channel,fn){ipcMain.handle(channel,async(event,input)=>{const win=answerManager.getWindow();if(!win||event.sender!==win.webContents||event.senderFrame!==event.sender.mainFrame||event.senderFrame.url!==answerURL)throw Error('拒绝未授权的回答窗口请求');try{return await fn(input);}catch(error){throw errorForClient(error);}});}
  answerHandle('answer:get',()=>answerManager.getPayload());answerHandle('answer:resize',input=>answerManager.resize(input));answerHandle('answer:close',input=>answerManager.close(input));answerHandle('answer:copy',input=>answerManager.copy(input));
  answerHandle('answer:source-open',input=>{const revision=sourceRevision;return sourceActions.open({key:'answer',window:answerManager.getWindow(),read:()=>{if(controller.active()||sourceRevision!==revision)throw Error('当前任务已变化，请结束后重新选择来源。');return answerManager.readSource(input);}});});
  handle('answer:history-source-open',input=>{const revision=sourceRevision;return sourceActions.open({key:'history',window:mainWindow,read:()=>{if(!mainWindow.isVisible()||controller.active()||sourceRevision!==revision)throw Error('界面或当前任务已变化，请重新选择来源。');return liveHistory(()=>readPayloadSource(readHistoryAnswer(store,input?.id),input?.sourceId));}});});
  mainWindow.on('close',event=>{if(!quitting){event.preventDefault();shortcutCapture.cancel();mainWindow.hide();}});
  mainWindow.webContents.on('render-process-gone',()=>{providerChecks.cancelAll();sourceRevision++;shortcutCapture.cancel();controller.interrupt('界面进程意外退出，当前录音已中止。');store.notices.push('界面进程意外退出，当前录音已中止。');void mainWindow.loadURL(mainURL);mainWindow.show();});
  ipcMain.handle('snapshot',event=>{verify(event,false);return event.sender===overlayManager.getWindow()?.webContents?overlaySnapshot():snapshot();});
  handle('shortcut:capture-begin',()=>shortcutCapture.begin());
  handle('shortcut:capture-end',input=>shortcutCapture.end(input));
  function commitSettings(input,updateShortcuts=true){
    if(shortcutCapture.snapshot().active)throw Error('请先结束快捷键捕获，再保存设置。');
    if(controller.active())throw Error('请先结束或取消当前录音，再保存设置。');
    const validated=validateSettings(input);const previous=shortcutMap(store.settings);
    // In-flight diagnostics belong to the exact saved settings revision.
    providerChecks.cancelAll();
    if(updateShortcuts)try{shortcutManager.apply(shortcutMap(validated));}catch(error){publish();throw error;}
    try{store.save(input);}catch(error){if(updateShortcuts)try{shortcutManager.apply(previous);}catch{store.notices=['配置未保存，部分快捷键未恢复，请重新检查设置。'];}publish();throw error;}
    windowChrome();publish();return snapshot();
  }
  handle('settings:save',commitSettings);
  handle('provider:check',kind=>{
    if(!mainWindow.isVisible()||!mainWindow.isFocused()||controller.active()||shortcutCapture.snapshot().active)throw Error('请在空闲且聚焦的设置窗口开始测试。');
    return providerChecks.run(kind);
  });
  handle('provider:cancel',kind=>{providerChecks.cancel(kind);return {cancelled:true};});

  handle('settings:update-section',input=>commitSettings(mergeSettingsSection(store.settings,input),input.section==='shortcuts'));
  handle('settings:update-shortcut',input=>{if(!mainWindow.isVisible()||!mainWindow.isFocused())throw Error('请在可见且聚焦的设置窗口修改快捷键。');const next=mergeShortcutRow(store.settings,input);if(input.action==='set'&&normalizeAccelerator(input.accelerator).split('+').length>3)throw Error('原位快捷键每组最多3个按键。');return commitSettings(next,true);});
  handle('settings:mode',input=>{
    if(controller.active())throw Error('请先结束或取消当前任务，再切换默认模式。');
    if(!input||typeof input!=='object'||!['dictate','translate','ask'].includes(input.mode))throw Error('模式无效。');
    store.save({...store.settings,mode:input.mode,targetLanguage:input.targetLanguage??store.settings.targetLanguage});
    publish();return snapshot();
  });
  handle('record:toggle',options=>{if(shortcutCapture.snapshot().active)throw Error('请先结束快捷键捕获，再开始录音。');return controller.toggle('ui',options);});
  handle('text:process',async input=>{await controller.processText(input);return snapshot();});
  handle('record:retain',input=>controller.retainRecording(input),false);
  // Overlay commands are tied to the displayed session. Reusing its BrowserWindow
  // must never let a queued click from A stop/cancel a later session B.
  for(const [channel,method] of [['record:stop','stop'],['record:cancel','cancel']])ipcMain.handle(channel,(event,input)=>{
    verify(event,false);
    const fromOverlay=event.sender===overlayManager.getWindow()?.webContents;
    if(fromOverlay||input!==undefined){
      if(!input||typeof input!=='object'||Array.isArray(input)||typeof input.sessionId!=='string'||input.sessionId!==controller.state.sessionId||!controller.current(input.sessionId))return false;
      if(method==='stop'&&controller.state.phase!=='recording')return false;
      if(method==='cancel'&&!controller.active())return false;
    }
    try{return controller[method]();}catch(error){throw errorForClient(error);}
  });
  handle('record:ready',input=>controller.recordingReady(input));
  handle('record:language',input=>controller.setSessionTarget(input),false);
  handle('overlay:menu',input=>overlayGeometry.setExpanded(overlayManager.getWindow(),input,overlaySnapshot()),false);
  handle('recovery:retry',async token=>{await controller.retryRecovery(token);return snapshot();});
  handle('recovery:discard',token=>{controller.discardRecovery(token);return snapshot();});
  handle('window:show-main',()=>{mainWindow.show();mainWindow.focus();return{ok:true};},false);
  handle('overlay:dismiss',()=>({ok:overlayManager.dismiss()}),false);
  handle('record:submit',audio=>{providerChecks.cancelAll();return controller.submitAudio(audio);});
  handle('record:error',error=>controller.reportRecordingError(error));
  handle('text:copy',text=>{if(typeof text!=='string'||text.length>100000)throw Error('复制文本无效');clipboard.writeText(text);return{ok:true};});
  const ensureIdle=()=>{if(controller.active())throw Error('请先结束或取消当前任务，再修改本地数据。');};
  fileActions=createFileActions({store,dialog,getWindow:()=>mainWindow,ensureIdle});
  handle('history:clear',()=>{ensureIdle();store.clearHistory();publish();return snapshot();});
  handle('history:delete',id=>{ensureIdle();store.deleteHistory(id);publish();return snapshot();});
  handle('answer:open-current',()=>{
    if(controller.active())throw Error('请先结束或取消当前任务，再查看回答。');
    const {phase,result}=controller.state;
    if(phase!=='done'||result?.mode!=='ask'||result.status!=='completed')throw Error('当前没有可查看的完整回答。');
    // Read only the trusted current result. Reopening must never create history or repeat an API request.
    return answerManager.show(result,store.settings.appearance);
  });
  function liveHistory(fn){const before=store.history;try{return fn();}finally{if(store.history!==before)publish();}}
  handle('answer:history-get',id=>liveHistory(()=>readHistoryAnswer(store,id)));
  handle('answer:history-copy',input=>liveHistory(()=>{clipboard.writeText(historyCopyText(store,input));return{ok:true};}));
  handle('answer:open',id=>{if(typeof id!=='string'||!id||id.length>128)throw Error('记录标识无效');store.pruneHistory();const result=store.getHistory(id);return answerManager.show(result,store.settings.appearance);});
  handle('history:retry',async(id,options)=>{await controller.retryHistory(id,options);return snapshot();});
  handle('audio:clear',()=>{ensureIdle();store.clearAudio();publish();return snapshot();});
  handle('audio:export',id=>fileActions.exportAudio(id));
  handle('dictionary:upsert',input=>{ensureIdle();store.upsertDictionary(input);publish();return snapshot();});
  handle('dictionary:delete',id=>{ensureIdle();store.deleteDictionary(id);publish();return snapshot();});
  handle('dictionary:delete-many',ids=>{ensureIdle();store.deleteDictionaryMany(ids);publish();return snapshot();});
  handle('dictionary:import',async()=>{const {cancelled,importPreview}=await fileActions.importDictionary();return{...snapshot(),operation:{cancelled},...(importPreview?{importPreview}:{})};});
  handle('dictionary:import-commit',token=>{const operation=fileActions.commitDictionary(token);publish();return{...snapshot(),operation:{cancelled:false,...operation}};});
  handle('dictionary:import-cancel',token=>fileActions.cancelDictionary(token));
  handle('dictionary:export',()=>fileActions.exportDictionary());
  retentionTimer=setInterval(()=>{if(controller.active())return;try{const result=store.pruneHistory();if(result.deleted||result.audioDeleted)publish();}catch{store.notices=['自动清理本地记录失败，请检查数据目录权限。'];publish();}},60000);
  retentionTimer.unref();
  ipcMain.on('record:level',(event,level)=>{try{verify(event);controller.setLevel(level);}catch{}});
  controller.on('usage',publishUsage);
  controller.on('command',command=>mainWindow.webContents.send('command',command));controller.on('state',()=>{if(controller.active())providerChecks.cancelAll();publish();});controller.on('level',level=>{for(const w of [mainWindow,overlayManager.getWindow()])if(w&&!w.isDestroyed())w.webContents.send('level',level);});
  await mainWindow.loadURL(mainURL);
  try{shortcutManager.apply(shortcutMap(store.settings));}catch(e){store.notices.push(e.message);}
  const trayIcon=nativeImage.createFromPath(path.join(__dirname,'..','assets','tray.png'));
  tray=new Tray(trayIcon);tray.setContextMenu(Menu.buildFromTemplate([
    {label:'打开本地听写',click:()=>{mainWindow.show();mainWindow.focus();}},
    {label:'开始 / 结束录音',click:()=>{shortcutCapture.cancel();void controller.toggle('ui');}},
    {label:'取消当前录音',click:()=>controller.cancel()},
    {type:'separator'},{label:'退出',click:()=>{quitting=true;app.quit();}}
  ]));tray.on('double-click',()=>{mainWindow.show();mainWindow.focus();});
  powerMonitor.on('suspend',()=>{shortcutCapture.cancel();controller.interrupt('系统进入挂起，当前录音已中止。');});
  mainWindow.show();publish();

}
let cleanupComplete=false;
app.on('before-quit',event=>{quitting=true;sourceRevision++;if(!cleanupComplete){event.preventDefault();shortcutCapture?.dispose();controller?.dispose();overlayManager?.dispose();answerManager?.dispose();clearInterval(retentionTimer);fileActions?.dispose();Promise.all([bridge.dispose?.(),localAsr?.dispose()]).finally(()=>{cleanupComplete=true;app.quit();});}});
app.on('will-quit',()=>{providerChecks?.cancelAll();shortcutManager?.dispose();});
app.on('window-all-closed',()=>{if(quitting)app.quit();});
