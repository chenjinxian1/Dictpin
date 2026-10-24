'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{EventEmitter}=require('node:events');
const file=path.join(__dirname,'../src/dictation-main.js'),product=fs.existsSync(file)?require(file):{};
const {DEFAULTS}=require('../src/settings');
const {fixture}=require('./dictation-electron-fixture.cjs');

test('new product entry is selected and boots a compact management host with no automatic recording',async()=>{
 assert.equal(require('../package.json').main,'src/dictation-entry.cjs');assert.equal(typeof product.start,'function');
 const f=fixture(),host=await product.start(f.electron,{StoreClass:f.FakeStore,LocalAsrClass:f.FakeLocal});try{
 assert.equal(f.windows.length,1);assert.equal(f.windows[0].options.width,640);assert.equal(f.windows[0].options.height,480);assert.equal(host.controller.state.phase,'idle');assert.equal(f.registered.size,1);
 const snapshot=host.snapshot(false);assert.ok(!JSON.stringify(snapshot).includes('PRIVATE_'));assert.equal(snapshot.settings.refiner.key,undefined);
 }finally{await host.dispose();}
});
test('the selected host rejects an old direct task and registers only the common recording key',async()=>{
 assert.equal(typeof product.start,'function');const f=fixture(),host=await product.start(f.electron,{StoreClass:f.FakeStore,LocalAsrClass:f.FakeLocal});
 try{const win=f.windows[0],event={sender:win.webContents,senderFrame:win.webContents.mainFrame};await assert.rejects(f.handlers.get('text:process')(event,{mode:'ask',text:'synthetic'}));assert.equal(host.controller.state.phase,'idle');assert.equal(f.registered.size,1);}finally{await host.dispose();}
});

test('cached old result is available in management but never masks a new bar input error',async()=>{
 const f=fixture();f.FakeStore.prototype.getRecentResult=()=>({id:'old',mode:'dictate',status:'completed',original:'old synthetic',text:'old synthetic'});const host=await product.start(f.electron,{StoreClass:f.FakeStore,LocalAsrClass:f.FakeLocal});
 try{assert.equal(host.snapshot(false).recentResult.id,'old');assert.equal(host.snapshot(true).result,null);}finally{await host.dispose();}
});

test('Escape remains available to the target application and explicit cancel sends no audio',async()=>{
 const f=fixture(),host=await product.start(f.electron,{StoreClass:f.FakeStore,LocalAsrClass:f.FakeLocal});
 try{assert.equal(f.registered.has('Escape'),false);await host.host.toggleFromTray();assert.equal(f.registered.has('Escape'),false);host.controller.cancel();assert.equal(host.controller.state.phase,'cancelled');assert.equal(f.registered.has('Escape'),false);assert.equal(f.registered.size,1);}finally{await host.dispose();}
});
