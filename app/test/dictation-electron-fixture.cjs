'use strict';
const path=require('node:path'),{EventEmitter}=require('node:events'),{DEFAULTS}=require('../src/settings');
function fixture(){
 const windows=[],handlers=new Map(),registered=new Map();
 class Window extends EventEmitter{
  constructor(options){super();this.options=options;this.visible=false;this.dead=false;this.webContents=new EventEmitter();this.webContents.mainFrame={url:''};this.webContents.getURL=()=>this.webContents.mainFrame.url;this.webContents.send=()=>{};this.webContents.setWindowOpenHandler=()=>{};windows.push(this);}
  loadURL(url){this.webContents.mainFrame.url=url;return Promise.resolve();}
  isDestroyed(){return this.dead;}show(){this.visible=true;}showInactive(){this.visible=true;}hide(){this.visible=false;}isVisible(){return this.visible;}isFocused(){return this.visible;}focus(){}destroy(){this.dead=true;}setBounds(){}getBounds(){return{x:0,y:0,width:360,height:96};}
 }
 class FakeStore{constructor(){this.settings=structuredClone(DEFAULTS);this.settings.mode='ask';this.keys={asr:'PRIVATE_OLD',refiner:'PRIVATE_TEXT'};this.dictionary=[];this.notices=[];}getRecentResult(){return null;}usageSnapshot(){return{available:true,records:[],summary:{requests:0}};}keyStatus(){return{refiner:{hasKey:true,hasStoredKey:true,persistent:true}};}secureAvailable(){return true;}}
 class FakeLocal{constructor(){this.exe=path.join(__dirname,'../../native/local-asr-worker.exe');}dispose(){return Promise.resolve();}}
 const electron={app:new EventEmitter(),BrowserWindow:Window,ipcMain:{handle:(n,f)=>handlers.set(n,f),on(){}},globalShortcut:{register:(key,callback)=>{registered.set(key,callback);return true;},isRegistered:key=>registered.has(key),unregister:key=>registered.delete(key)},clipboard:{writeText(){}},safeStorage:{},session:{defaultSession:{setPermissionCheckHandler(){},setPermissionRequestHandler(){}}},screen:{getCursorScreenPoint:()=>({x:10,y:10}),getDisplayNearestPoint:()=>({workArea:{x:0,y:0,width:1280,height:800}})},Menu:{buildFromTemplate:x=>x},Tray:class{setContextMenu(x){this.menu=x;}on(){}setToolTip(){}},nativeImage:{createFromPath:()=>({})},powerMonitor:new EventEmitter(),nativeTheme:{}};
 electron.app.getPath=()=>path.resolve(__dirname,'../../work/fake-profile');electron.app.setName=()=>{};electron.app.quit=()=>{};
 return {electron,windows,handlers,registered,FakeStore,FakeLocal};
}
module.exports={fixture};
