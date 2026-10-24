'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{EventEmitter}=require('node:events');
const file=path.resolve(__dirname,'../../test/electron-teardown.cjs');
function teardown(options){assert.ok(fs.existsSync(file),'offscreen tests need explicit owned-resource teardown');return require(file).teardownElectron(options);}
function fixture(){
 const events=[],windows=[];
 function create(id,{detached=false,destroyed=false,failStop=false}={}){
  let dead=destroyed,attached=!detached;const wc=new EventEmitter();wc.id=id+100;wc.isDestroyed=()=>dead;wc.stopPainting=()=>{events.push('stop:'+id);if(failStop)throw Error('synthetic stop failure');};wc.disableDeviceEmulation=()=>events.push('emulation:'+id);wc.debugger={isAttached:()=>attached,detach(){events.push('detach:'+id);attached=false;}};wc.on('paint',()=>{});
  const window={id,webContents:wc,isDestroyed:()=>dead,destroy(){events.push('destroy:'+id);dead=true;}};windows.push(window);return window;
 }
 const electron={BrowserWindow:{getAllWindows:()=>windows.filter(w=>!w.isDestroyed())}};
 return {events,windows,electron,create};
}
test('offscreen paint and debugger resources stop before host disposal and all owned windows close',async()=>{
 const f=fixture(),main=f.create(1),overlay=f.create(2),host={mainWindow:main,async dispose(){f.events.push('dispose');assert.equal(main.webContents.listenerCount('paint'),0);assert.equal(overlay.webContents.listenerCount('paint'),0);assert.ok(f.events.includes('stop:1'));assert.ok(f.events.includes('stop:2'));assert.ok(f.events.includes('detach:1'));}};
 const result=await teardown({electron:f.electron,host,windows:[main]});assert.equal(result.ok,true);assert.equal(result.mainWindowDestroyed,true);assert.equal(result.hostDisposed,true);assert.equal(result.eventLoopDrained,true);assert.deepEqual(result.remainingWindowIds,[]);assert.ok(f.events.indexOf('destroy:1')>f.events.indexOf('dispose'));assert.equal(overlay.isDestroyed(),true);assert.equal(result.windows.length,2);
});
test('a host-disposal failure is reported as failure while windows are still destroyed',async()=>{
 const f=fixture(),main=f.create(1),result=await teardown({electron:f.electron,host:{mainWindow:main,async dispose(){throw Error('synthetic dispose failed');}}});assert.equal(result.ok,false);assert.equal(result.hostDisposed,false);assert.equal(main.isDestroyed(),true);assert.ok(result.errors.some(e=>e.stage==='host.dispose'&&/synthetic dispose/.test(e.message)));
});
test('a stopPainting failure does not skip debugger detachment or window cleanup',async()=>{
 const f=fixture(),main=f.create(1,{failStop:true}),result=await teardown({electron:f.electron,host:{mainWindow:main,async dispose(){}}});assert.equal(result.ok,false);assert.equal(main.isDestroyed(),true);assert.ok(f.events.includes('detach:1'));assert.equal(main.webContents.listenerCount('paint'),0);assert.ok(result.errors.some(e=>e.stage==='stopPainting'));
});
test('already destroyed windows are not touched while newly discovered owned windows are cleaned',async()=>{
 const f=fixture(),old=f.create(1,{destroyed:true}),main=f.create(2,{detached:true});const host={mainWindow:main,async dispose(){f.create(3);}};const result=await teardown({electron:f.electron,host,windows:[old,main]});assert.equal(result.ok,true);assert.equal(f.events.includes('stop:1'),false);assert.equal(f.events.includes('destroy:1'),false);assert.equal(f.events.includes('detach:2'),false);assert.ok(f.events.includes('stop:3'));assert.ok(f.events.includes('destroy:3'));assert.equal(result.windows.length,3);
});
test('teardown yields to the event loop before allowing the caller to exit',async()=>{
 const f=fixture(),main=f.create(1);let observed=false;const host={mainWindow:main,async dispose(){setImmediate(()=>{observed=true;});}};const result=await teardown({electron:f.electron,host});assert.equal(observed,true);assert.equal(result.eventLoopDrained,true);
});
test('teardown never exits or kills a process and leaves failed cleanup visibly failed',async()=>{
 const f=fixture(),main=f.create(1);let exits=0;f.electron.app={exit(){exits++;}};main.destroy=()=>{throw Error('synthetic destroy blocked');};const result=await teardown({electron:f.electron,host:{mainWindow:main,async dispose(){}}});assert.equal(exits,0);assert.equal(result.ok,false);assert.deepEqual(result.remainingWindowIds,[1]);assert.equal(result.mainWindowDestroyed,false);
});
test('a never-settling host disposal reaches a bounded failure rather than hanging teardown',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture(),main=f.create(1);const pending=teardown({electron:f.electron,host:{mainWindow:main,dispose:()=>new Promise(()=>{})},disposeTimeoutMs:50});await Promise.resolve();t.mock.timers.tick(50);const result=await pending;assert.equal(result.ok,false);assert.ok(result.errors.some(e=>e.stage==='host.dispose'&&/timeout/.test(e.message)));assert.equal(main.isDestroyed(),true);
});
