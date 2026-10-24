'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {registerProductIpc}=require('../src/dictation-ipc');
function fixture(){
 assert.equal(typeof registerProductIpc,'function');
 const handlers=new Map(),listeners=new Map(),mainFrame={url:'file:///fixture/dictation.html'},barFrame={url:'file:///fixture/voice-bar.html'};
 const main={webContents:{mainFrame,getURL:()=>mainFrame.url},isVisible:()=>true,isFocused:()=>true},bar={webContents:{mainFrame:barFrame,getURL:()=>barFrame.url}};
 const calls={toggle:0,save:0,old:0};let settings={shortcut:'Ctrl+Shift+Space',refiner:{model:'synthetic',baseUrl:'http://127.0.0.1:9/v1',enabled:false}};
 const controller={state:{phase:'idle'},active:()=>false,toggle:async()=>{calls.toggle++;return{accepted:true};}};
 const store={get settings(){return settings;},save(value){settings=value;calls.save++;}};
 registerProductIpc({ipcMain:{handle:(name,fn)=>handlers.set(name,fn),on:(name,fn)=>listeners.set(name,fn)},controller,store,getMainWindow:()=>main,getBarWindow:()=>bar,mainURL:mainFrame.url,barURL:barFrame.url,snapshot:()=>({settings}),publish(){},copyResult:async id=>({ok:true,id}),applyShortcuts(){},showMain(){},dismissOverlay(){},providerChecks:{run(){calls.old++;},cancel(){}}});
 const event=role=>{const window=role==='main'?main:bar;return{sender:window.webContents,senderFrame:window.webContents.mainFrame};};
 return {handlers,calls,event,main,bar,controller};
}
test('legacy direct IPC routes reject without executing a model or altering current state',async()=>{
 const f=fixture();for(const route of ['text:process','settings:mode','history:retry','answer:open-current','record:retain','scenario:open'])await assert.rejects(f.handlers.get(route)(f.event('main'),{mode:'ask',text:'synthetic'}));
 assert.equal(f.calls.toggle+f.calls.save+f.calls.old,0);
});
test('capture toggle accepts no mode/task payload even from the trusted page',async()=>{
 const f=fixture();await assert.rejects(f.handlers.get('capture:toggle')(f.event('main'),{mode:'ask'}));assert.equal(f.calls.toggle,0);
 await f.handlers.get('capture:toggle')(f.event('main'));assert.equal(f.calls.toggle,1);
});
test('foreign frame cannot invoke trusted clipboard or capture actions',async()=>{
 const f=fixture(),event={sender:f.main.webContents,senderFrame:{url:'file:///fixture/dictation.html'}};
 await assert.rejects(f.handlers.get('result:copy')(event,'result-1'));await assert.rejects(f.handlers.get('capture:toggle')(event));assert.equal(f.calls.toggle,0);
});
test('overlay may copy a trusted result but cannot patch settings or edit dictionary',async()=>{
 const f=fixture();assert.deepEqual(await f.handlers.get('result:copy')(f.event('bar'),'result-1'),{ok:true,id:'result-1'});
 await assert.rejects(f.handlers.get('settings:patch')(f.event('bar'),{deviceId:'synthetic'}));await assert.rejects(f.handlers.get('word:upsert')(f.event('bar'),{word:'OpenAI'}));
});
test('unsupported settings fields and legacy mode shortcuts cannot re-enable old tasks',async()=>{
 const f=fixture();for(const value of [{mode:'ask'},{modeShortcuts:{ask:'Ctrl+9'}},{refiner:{citationFormat:'openai'}},{asr:{backend:'cloud'}}])await assert.rejects(f.handlers.get('settings:patch')(f.event('main'),value));assert.equal(f.calls.save,0);
});

test('credential changes are bound to the saved provider shown when drafting',()=>{
 const {settingsPatch}=require('../src/dictation-ipc'),saved={refiner:{baseUrl:'http://127.0.0.1:9/v1',model:'m'}};
 assert.throws(()=>settingsPatch(saved,{refiner:{key:'FAKE'},expectedRefiner:{baseUrl:'http://127.0.0.1:8/v1',model:'m'}}));
 assert.equal(settingsPatch(saved,{refiner:{key:'FAKE'},expectedRefiner:{baseUrl:saved.refiner.baseUrl,model:'m'}}).refiner.key,'FAKE');
});
