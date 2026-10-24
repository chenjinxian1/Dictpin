'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {start}=require('../src/dictation-main'),{registerProductIpc}=require('../src/dictation-ipc');
const {fixture}=require('./dictation-electron-fixture.cjs');
async function mediaFixture(t){
 const f=fixture();let check,request;
 f.electron.session.defaultSession.setPermissionCheckHandler=fn=>check=fn;
 f.electron.session.defaultSession.setPermissionRequestHandler=fn=>request=fn;
 const h=await start(f.electron,{StoreClass:f.FakeStore,LocalAsrClass:f.FakeLocal});t.after(()=>h.dispose());
 const contents=h.mainWindow.webContents,url=contents.getURL();
 const details={isMainFrame:true,requestingUrl:url,mediaType:'audio',mediaTypes:['audio']};
 return {f,h,contents,url,details,check:(d=details,c=contents,p='media')=>check(c,p,'file://',d),request:(d=details,c=contents,p='media')=>{let result;request(c,p,v=>{result=v;},d);return result;}};
}
test('registered media callbacks expose device metadata but allow capture only during starting/recording',async t=>{
 const f=await mediaFixture(t);assert.equal(f.check(),true);assert.equal(f.check({...f.details,mediaType:'unknown'}),false);assert.equal(f.request(),false);
 await f.h.host.toggleFromTray();assert.equal(f.h.controller.state.phase,'starting');assert.equal(f.check(),true);assert.equal(f.request(),true);
 f.h.controller.recordingReady({sessionId:f.h.controller.state.sessionId});assert.equal(f.check(),true);assert.equal(f.request(),true);
 f.h.controller.stop();assert.equal(f.check(),true);assert.equal(f.check({...f.details,mediaType:'unknown'}),false);assert.equal(f.request(),false);
});
test('registered media callbacks deny a subframe even inside the trusted active management webContents',async t=>{
 const f=await mediaFixture(t);await f.h.host.toggleFromTray();const d={...f.details,isMainFrame:false};
 assert.equal(f.check(d),false);assert.equal(f.request(d),false);
});
test('registered media callbacks deny unexpected or missing requesting URL and missing main-frame proof',async t=>{
 const f=await mediaFixture(t);await f.h.host.toggleFromTray();
 for(const change of [{requestingUrl:f.url+'?other'},{requestingUrl:'https://example.invalid/'},{requestingUrl:undefined},{isMainFrame:undefined}]){
  const d={...f.details,...change};assert.equal(f.check(d),false);assert.equal(f.request(d),false);
 }
});
test('registered media callbacks still deny foreign contents, video and mixed requests',async t=>{
 const f=await mediaFixture(t);await f.h.host.toggleFromTray();
 assert.equal(f.check(f.details,{getURL:()=>f.url}),false);assert.equal(f.request(f.details,{getURL:()=>f.url}),false);
 assert.equal(f.check({...f.details,mediaType:'video'}),false);assert.equal(f.request({...f.details,mediaTypes:['audio','video']}),false);
 assert.equal(f.check(f.details,f.contents,'notifications'),false);
});
function settingsFixture(){
 const handlers=new Map(),frame={url:'file:///fixture/dictation.html'},contents={mainFrame:null,getURL:()=>frame.url};contents.mainFrame=frame;
 const window={webContents:contents},calls={apply:0,save:0};let failRegistration=true,failSave=false;
 let settings={deviceId:'old',shortcut:'Ctrl+Shift+Space',refiner:{baseUrl:'http://127.0.0.1:9/v1',model:'m',enabled:false}};
 const store={get settings(){return settings;},save(value){calls.save++;if(failSave)throw Error('disk fixture');settings=value;}};
 registerProductIpc({ipcMain:{handle:(name,fn)=>handlers.set(name,fn),on(){}},controller:{active:()=>false},store,getMainWindow:()=>window,getBarWindow:()=>null,mainURL:frame.url,barURL:'',snapshot:()=>({settings}),publish(){},applyShortcuts(){calls.apply++;if(failRegistration)throw Error('synthetic OS registration failed');}});
 return {calls,save:patch=>handlers.get('settings:patch')({sender:contents,senderFrame:frame},patch),settings:()=>settings,registrationFails:value=>failRegistration=value,saveFails:value=>failSave=value};
}
test('device-only settings save succeeds despite unrelated OS shortcut registration failure',async()=>{
 const f=settingsFixture();await f.save({deviceId:'new-virtual-microphone'});
 assert.equal(f.settings().deviceId,'new-virtual-microphone');assert.deepEqual(f.calls,{apply:0,save:1});
});
test('refiner enabled-only save succeeds despite unrelated OS shortcut registration failure',async()=>{
 const f=settingsFixture();await f.save({refiner:{enabled:true},expectedRefiner:{baseUrl:f.settings().refiner.baseUrl,model:'m'}});
 assert.equal(f.settings().refiner.enabled,true);assert.deepEqual(f.calls,{apply:0,save:1});
});
test('explicit same-shortcut submission still retries registration and rollback',async()=>{
 const f=settingsFixture(),same=f.settings().shortcut;
 await assert.rejects(f.save({shortcut:same}),/registration failed/);assert.deepEqual(f.calls,{apply:2,save:0});
 f.registrationFails(false);await f.save({shortcut:same});assert.deepEqual(f.calls,{apply:3,save:1});
});
test('unrelated disk failure does not attempt any shortcut rollback',async()=>{
 const f=settingsFixture();f.saveFails(true);await assert.rejects(f.save({deviceId:'new-virtual'}),/disk fixture/);assert.deepEqual(f.calls,{apply:0,save:1});
});
