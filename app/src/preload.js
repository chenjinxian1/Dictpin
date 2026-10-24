'use strict';
const {contextBridge,ipcRenderer}=require('electron');
// Validate before IPC cloning can discard symbols, extra properties or accessors.
// The main process independently resolves this identifier against the fixed catalog.
async function openScenario(input){
  if(!input||typeof input!=='object'||Object.getPrototypeOf(input)!==Object.prototype)throw Error('场景请求无效。');
  const keys=Reflect.ownKeys(input),id=Object.getOwnPropertyDescriptor(input,'id');
  if(keys.length!==1||keys[0]!=='id'||!id||!Object.hasOwn(id,'value')||typeof id.value!=='string')throw Error('场景请求只接受固定场景标识。');
  return ipcRenderer.invoke('scenario:open',{id:id.value});
}
function providerKind(kind){if(typeof kind!=='string'||!['asr','refiner'].includes(kind))throw Error('Invalid service.');return kind;}
function subscribe(channel,callback){if(typeof callback!=='function')return()=>{};const handler=(_event,data)=>callback(data);ipcRenderer.on(channel,handler);return()=>ipcRenderer.removeListener(channel,handler);}
contextBridge.exposeInMainWorld('dictation',Object.freeze({
  getSnapshot:()=>ipcRenderer.invoke('snapshot'),
  checkProvider:kind=>ipcRenderer.invoke('provider:check',providerKind(kind)),
  cancelProviderCheck:kind=>ipcRenderer.invoke('provider:cancel',providerKind(kind)),
  saveSettings:settings=>ipcRenderer.invoke('settings:save',settings),
  updateSettingsSection:input=>ipcRenderer.invoke('settings:update-section',input),
  updateShortcut:input=>ipcRenderer.invoke('settings:update-shortcut',input),
  beginShortcutCapture:()=>ipcRenderer.invoke('shortcut:capture-begin'),
  endShortcutCapture:input=>ipcRenderer.invoke('shortcut:capture-end',input),
  setMode:options=>ipcRenderer.invoke('settings:mode',options),
  selectSessionLanguage:input=>ipcRenderer.invoke('record:language',input),
  setOverlayMenu:input=>ipcRenderer.invoke('overlay:menu',input),
  toggle:options=>ipcRenderer.invoke('record:toggle',options),
  processText:input=>ipcRenderer.invoke('text:process',input),
  retainRecording:input=>ipcRenderer.invoke('record:retain',input),
  stop:input=>input===undefined?ipcRenderer.invoke('record:stop'):ipcRenderer.invoke('record:stop',input),
  cancel:input=>input===undefined?ipcRenderer.invoke('record:cancel'):ipcRenderer.invoke('record:cancel',input),
  recordingReady:input=>ipcRenderer.invoke('record:ready',input),
  retryRecovery:token=>ipcRenderer.invoke('recovery:retry',token),
  discardRecovery:token=>ipcRenderer.invoke('recovery:discard',token),
  showMain:()=>ipcRenderer.invoke('window:show-main'),
  openScenario,
  dismissOverlay:()=>ipcRenderer.invoke('overlay:dismiss'),
  submitAudio:audio=>ipcRenderer.invoke('record:submit',audio),
  reportRecordingError:error=>ipcRenderer.invoke('record:error',error),
  copyText:text=>ipcRenderer.invoke('text:copy',text),
  openCurrentAnswer:()=>ipcRenderer.invoke('answer:open-current'),
  getHistoryAnswer:id=>ipcRenderer.invoke('answer:history-get',id),
  copyHistoryAnswer:input=>ipcRenderer.invoke('answer:history-copy',input),
  openHistorySource:input=>ipcRenderer.invoke('answer:history-source-open',input),
  openAnswer:id=>ipcRenderer.invoke('answer:open',id),
  clearHistory:()=>ipcRenderer.invoke('history:clear'),
  deleteHistory:id=>ipcRenderer.invoke('history:delete',id),
  retryHistory:(id,options)=>ipcRenderer.invoke('history:retry',id,options),
  clearAudio:()=>ipcRenderer.invoke('audio:clear'),
  exportAudio:id=>ipcRenderer.invoke('audio:export',id),
  upsertDictionary:input=>ipcRenderer.invoke('dictionary:upsert',input),
  deleteDictionary:id=>ipcRenderer.invoke('dictionary:delete',id),
  deleteDictionaryMany:ids=>ipcRenderer.invoke('dictionary:delete-many',ids),
  importDictionaryCSV:()=>ipcRenderer.invoke('dictionary:import'),
  commitDictionaryImport:token=>ipcRenderer.invoke('dictionary:import-commit',token),
  cancelDictionaryImport:token=>ipcRenderer.invoke('dictionary:import-cancel',token),
  exportDictionaryCSV:()=>ipcRenderer.invoke('dictionary:export'),
  reportLevel:level=>ipcRenderer.send('record:level',level),
  onUsage:cb=>subscribe('usage:state',cb),
  onCommand:cb=>subscribe('command',cb),
  onLevel:cb=>subscribe('level',cb),
  onState:cb=>subscribe('state',cb)
}));
