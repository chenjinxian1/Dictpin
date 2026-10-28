'use strict';
const {normalizeAccelerator}=require('./shortcut-manager');
const {wordKey}=require('./dictionary');
function object(value,allowed){
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('操作内容无效。');
 const keys=Reflect.ownKeys(value);
 for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!allowed.includes(key)||!d||!Object.hasOwn(d,'value'))throw Error('此版本不支持该操作字段。');}
 return value;
}
function singleShortcutMap(settings){return {current:settings.shortcut||'',copy:settings.copyShortcut||''};}
function settingsPatch(settings,input){
 object(input,['deviceId','shortcut','copyShortcut','autoPaste','appendMode','refiner','expectedRefiner','textServices']);if(!Object.keys(input).length)throw Error('没有可保存的更改。');
 const next={...settings,refiner:{...settings.refiner}};
 if(Object.hasOwn(input,'textServices')){object(input.textServices,['expectedRevision','activeProfileId','changes']);next.textServices=input.textServices;}
 for(const key of ['autoPaste','appendMode'])if(Object.hasOwn(input,key)){if(typeof input[key]!=='boolean')throw Error('听写开关无效。');next[key]=input[key];if(key==='autoPaste')next.deliveryConsentVersion=input[key]?1:0;}
 if(Object.hasOwn(input,'deviceId')){if(typeof input.deviceId!=='string'||input.deviceId.length>512)throw Error('麦克风设置无效。');next.deviceId=input.deviceId;}
 if(Object.hasOwn(input,'shortcut')){normalizeAccelerator(input.shortcut);if(!input.shortcut)throw Error('请保留一个可用的听写快捷键。');next.shortcut=input.shortcut;}
 if(Object.hasOwn(input,'copyShortcut')){normalizeAccelerator(input.copyShortcut);next.copyShortcut=input.copyShortcut;}
 if(next.copyShortcut&&normalizeAccelerator(next.copyShortcut)===normalizeAccelerator(next.shortcut))throw Error('听写和复制快捷键不能重复。');
 if(Object.hasOwn(input,'refiner')){
  object(input.expectedRefiner,['baseUrl','model','endpointMode']);
  for(const field of Object.keys(input.expectedRefiner))if(input.expectedRefiner[field]!==settings.refiner[field])throw Error('模型配置已变化；密钥草稿未提交，请核对当前服务后再保存。');
  if(typeof input.expectedRefiner.baseUrl!=='string'||typeof input.expectedRefiner.model!=='string')throw Error('缺少密钥草稿的服务绑定。');
  object(input.refiner,['baseUrl','model','enabled','key','persistKey','clearKey']);
  if(!Object.keys(input.refiner).length)throw Error('模型设置为空。');
  for(const key of ['enabled','persistKey','clearKey'])if(Object.hasOwn(input.refiner,key)&&typeof input.refiner[key]!=='boolean')throw Error('模型开关无效。');
  if(Object.hasOwn(input.refiner,'key')&&(typeof input.refiner.key!=='string'||input.refiner.key.length>4096||/[\r\n\0]/.test(input.refiner.key)))throw Error('密钥格式无效。');
  next.refiner={...next.refiner,...input.refiner};
  if(Object.hasOwn(input.refiner,'baseUrl')&&input.refiner.baseUrl!==settings.refiner.baseUrl){
   next.refiner.endpointMode=/\/chat\/completions\/?$/.test(String(input.refiner.baseUrl).trim())?'endpoint':'base';
  }
 }
 return next;
}
function registerProductIpc({ipcMain,controller,store,getMainWindow,getBarWindow,mainURL,barURL,snapshot,publish,copyResult,applyShortcuts=()=>{},showMain,dismissOverlay,providerChecks,editorFlushed=()=>{},setShortcutRecording=()=>{},deliveryBusy=()=>false,onManualResult=()=>{},onStopFromMain=()=>{},openProviderHelp=()=>({opened:false})}){
 let saving=false;
 function verify(event,roles){
  const targets={main:[getMainWindow(),mainURL],bar:[getBarWindow(),barURL]};
  for(const role of roles){const [window,url]=targets[role];if(window&&window.webContents===event.sender&&event.senderFrame===event.sender.mainFrame&&event.senderFrame.url===url&&event.sender.getURL()===url)return role;}
  throw Error('拒绝未授权的窗口请求。');
 }
 function handle(name,roles,fn){ipcMain.handle(name,async(event,...args)=>{verify(event,roles);return fn(event,...args);});}
 function idle(){if(saving||controller.active()||deliveryBusy())throw Error('请先结束当前任务。');if(providerChecks?.busy?.())throw Error('请先结束当前接口检查。');}
 function captureInput(input){object(input,['sessionId']);if(typeof input.sessionId!=='string'||input.sessionId!==controller.state.sessionId||input.sessionId!==controller.session?.id)throw Error('录音操作已过期。');}
 async function toggle(source,mode='current'){
  if(saving||deliveryBusy()||mode!=='current')return {accepted:false};
  providerChecks?.cancelAll();
  if(source==='ui'&&controller.state.phase==='recording')onStopFromMain(controller.state.sessionId);
  return controller.toggle(source,{});
 }
 handle('snapshot',['main','bar'],event=>snapshot(event.sender===getBarWindow()?.webContents));
 handle('capture:start',['main'],(_event,input,...extra)=>{if(extra.length)throw Error('开始听写不接受模式或任务。');if(input!==undefined)object(input,['discardRecoveryToken','appendTo','expectedRevision']);if(saving||controller.active()||deliveryBusy())return {accepted:false};providerChecks?.cancelAll();return controller.start?controller.start(input):controller.toggle('ui',{});});
 handle('capture:toggle',['main'],(_event,input,...extra)=>{if(input!==undefined||extra.length)throw Error('听写操作不接受模式或任务。');return toggle('ui');});
 handle('capture:stop',['main','bar'],(event,input)=>{captureInput(input);if(event.sender===getMainWindow()?.webContents)onStopFromMain(input.sessionId);return {accepted:controller.stop()!==false};});
 handle('capture:cancel',['main','bar'],(_event,input)=>{captureInput(input);return {accepted:controller.cancel()};});
 handle('audio:ready',['main'],(_event,input)=>controller.recordingReady(input));
 handle('audio:submit',['main'],(_event,input)=>controller.submitAudio(input));
 handle('audio:segment',['main'],(_event,input)=>controller.submitSegment(input));
 handle('audio:seal',['main'],(_event,input)=>controller.sealSegments(input));
 handle('audio:cancelled',['main'],(_event,input)=>controller.submitCancelledAudio(input));
 handle('audio:error',['main'],(_event,input)=>controller.reportRecordingError(input));
 handle('result:copy',['main','bar'],(_event,id)=>{if(deliveryBusy())throw Error('正在投递，请先核对投递结果。');onManualResult();return copyResult(id);});
 handle('result:update',['main'],(_event,input)=>{if(deliveryBusy())throw Error('正在投递，请稍候再修改。');onManualResult();controller.updateResult(input);return snapshot(false);});
 handle('result:restore',['main'],(_event,input)=>{if(deliveryBusy())throw Error('正在投递，请稍候再修改。');onManualResult();controller.restoreResult(input);return snapshot(false);});
 handle('result:retry-cleanup',['main'],async(_event,input)=>{if(deliveryBusy())throw Error('正在投递，请稍候。');onManualResult();await controller.retryCleanup(input);return snapshot(false);});
 handle('recovery:retry',['main','bar'],async(event,input)=>{object(input,['token']);if(typeof input.token!=='string')throw Error('恢复操作无效。');await controller.retryRecovery(input.token);return snapshot(event.sender===getBarWindow()?.webContents);});
 handle('recovery:discard',['main'],(_event,input)=>{object(input,['token']);if(typeof input.token!=='string')throw Error('恢复操作无效。');controller.discardRecovery(input.token);return snapshot(false);});
 handle('editor:flushed',['main'],(_event,input)=>{object(input,['token','ok']);return editorFlushed(input);});
 handle('shortcut:recording',['main'],(_event,input)=>{object(input,['active']);if(typeof input.active!=='boolean')throw Error('快捷键录入状态无效。');return setShortcutRecording(input);});
 handle('result:view',['main','bar'],(_event,id)=>{if(typeof id!=='string'||id.length>128)throw Error('结果标识无效。');showMain('recent');return {ok:true};});
 handle('bar:dismiss',['bar'],()=>({ok:dismissOverlay()}));
 handle('settings:patch',['main'],async(_event,input)=>{
  idle();const previous=store.settings,next=settingsPatch(previous,input),hasShortcut=Object.hasOwn(input,'shortcut')||Object.hasOwn(input,'copyShortcut');saving=true;
  try{if(hasShortcut)await applyShortcuts(next);store.save(next);publish();return snapshot(false);}
  catch(error){if(hasShortcut)try{await applyShortcuts(previous);}catch{store.notices?.push('快捷键未完整恢复，请在设置中核对实际生效状态。');}throw error;}
  finally{saving=false;}
 });
 handle('provider:check-text',['main'],(_event,input)=>{
  idle();const win=getMainWindow();if(!win.isVisible()||!win.isFocused())throw Error('请在当前设置窗口明确开始测试。');
  return providerChecks.run('test',input);
 });
 handle('provider:list-models',['main'],(_event,input)=>{idle();const win=getMainWindow();if(!win.isVisible()||!win.isFocused())throw Error('请在当前设置窗口明确获取模型。');return providerChecks.run('models',input);});
 handle('provider:cancel',['main'],(_event,input)=>{object(input,['requestId']);if(typeof input.requestId!=='string'||input.requestId.length>128)throw Error('检查标识无效。');providerChecks.cancel(input.requestId);return {cancelled:true};});
 handle('provider:open-help',['main'],(_event,id)=>{if(!['qwen','deepseek','openai','siliconflow'].includes(id)||!getMainWindow().isFocused())throw Error('帮助链接无效。');return openProviderHelp(id);});
 handle('provider:cancel-text',['main'],()=>{providerChecks.cancelAll();return {cancelled:true};});
 handle('word:upsert',['main'],(_event,input)=>{if(saving)throw Error('正在保存，请稍候。');object(input,['id','word','aliases']);const words=Array.isArray(store.dictionary)?store.dictionary:[];if(Object.hasOwn(input,'id')&&!words.some(word=>word.id===input.id))throw Error('词条已变化，请重新打开编辑。');if(typeof input.word!=='string')throw Error('词语内容无效。');const duplicate=words.find(word=>word.id!==input.id&&wordKey(word.word)===wordKey(input.word.trim()));if(duplicate)throw Error('已有“'+duplicate.word+'”，请编辑现有词语。');store.upsertDictionary(input);publish();return snapshot(false);});
 handle('word:delete',['main'],(_event,id)=>{if(saving)throw Error('正在保存，请稍候。');const operation=store.removeDictionary(id);publish();return {...snapshot(false),operation};});
 handle('word:undo',['main'],(_event,token)=>{if(saving)throw Error('正在保存，请稍候。');if(typeof token!=='string'||token.length>128)throw Error('撤销标识无效。');store.restoreDictionary(token);publish();return snapshot(false);});
 const disabled=['settings:save','settings:update-section','settings:update-shortcut','settings:mode','record:toggle','record:retain','record:language','overlay:menu','text:process','text:copy','history:retry','history:clear','history:delete','audio:clear','audio:export','answer:open-current','answer:open','answer:history-get','answer:history-copy','answer:history-source-open','scenario:open'];
 for(const route of disabled)handle(route,['main','bar'],()=>{throw Error('此版本只支持本地听写、轻整理及显式复制。');});
 ipcMain.on('audio:level',(event,level)=>{try{verify(event,['main']);controller.setLevel(level);}catch{}});
 return {toggleFromTray:()=>toggle('ui'),toggleFromShortcut:mode=>toggle('shortcut',mode),isSaving:()=>saving};
}
module.exports={registerProductIpc,settingsPatch,singleShortcutMap};
