'use strict';
// Test-only cleanup for resources belonging to this Electron main process.
// Calling app.exit, observing the child exit and classifying its code remain the
// caller's responsibility. This helper never kills or claims a process exited.
async function teardownElectron({electron,host,windows=[],disposeTimeoutMs=5000,onStage=()=>{}}){
 const errors=[],records=new Map(),prepared=new Set();
 const attempt=(stage,fn,id)=>{onStage('teardown: '+stage+' '+(id??''));try{return fn();}catch(error){errors.push({stage,...(id===undefined?{}:{windowId:id}),message:String(error?.message||error)});}};
 function discover(){
  const candidates=[...windows,host?.mainWindow,...(attempt('getAllWindows',()=>electron.BrowserWindow.getAllWindows())||[])];
  for(const window of candidates){if(!window||records.has(window))continue;records.set(window,{id:window.id,paintingStopped:false,paintListenersRemoved:false,debuggerDetached:false,destroyed:window.isDestroyed()});}
 }
 function prepare(){
  discover();
  for(const [window,record]of records){
   if(prepared.has(window))continue;prepared.add(window);if(window.isDestroyed())continue;
   const wc=window.webContents;if(!wc||wc.isDestroyed())continue;
   if(typeof wc.stopPainting==='function')attempt('stopPainting',()=>{wc.stopPainting();record.paintingStopped=true;},record.id);
   attempt('removePaintListeners',()=>{wc.removeAllListeners('paint');record.paintListenersRemoved=true;},record.id);
   if(wc.debugger)attempt('debugger.detach',()=>{if(wc.debugger.isAttached()){wc.debugger.detach();record.debuggerDetached=true;}},record.id);
   if(typeof wc.disableDeviceEmulation==='function')attempt('disableDeviceEmulation',()=>wc.disableDeviceEmulation(),record.id);
  }
 }
 prepare();let hostDisposed=!host;
 if(host){
  onStage('teardown: host.dispose');let timer;try{
   await Promise.race([Promise.resolve().then(()=>host.dispose()),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('host dispose timeout')),disposeTimeoutMs);})]);hostDisposed=true;
  }catch(error){errors.push({stage:'host.dispose',message:String(error?.message||error)});}finally{clearTimeout(timer);}
 }
 const mainWindowAliveAfterHostDispose=host?.mainWindow?!host.mainWindow.isDestroyed():false;
 // Disposal may create/close an overlay. Inspect the actual process inventory again.
 prepare();
 for(const [window,record]of records){if(!window.isDestroyed())attempt('window.destroy',()=>window.destroy(),record.id);record.destroyed=window.isDestroyed();}
 // Give pending paint/destroy callbacks a main-loop turn before app.exit.
 await new Promise(resolve=>setImmediate(resolve));
 const remaining=attempt('getAllWindows.after',()=>electron.BrowserWindow.getAllWindows())||[];
 const remainingWindowIds=remaining.filter(window=>!window.isDestroyed()).map(window=>window.id);
 const mainWindowDestroyed=host?.mainWindow?host.mainWindow.isDestroyed():true;
 return {ok:errors.length===0&&remainingWindowIds.length===0&&mainWindowDestroyed,hostDisposed,mainWindowAliveAfterHostDispose,mainWindowDestroyed,eventLoopDrained:true,windows:[...records.values()],remainingWindowIds,errors};
}
module.exports={teardownElectron};
