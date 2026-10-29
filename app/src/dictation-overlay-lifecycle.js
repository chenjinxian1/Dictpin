'use strict';
function loadOverlayWindow(window,url,{schedule=setTimeout,unschedule=clearTimeout,timeoutMs=5000}={}){
 return new Promise((resolve,reject)=>{
  let loaded=false,painted=false,settled=false,timer;
  const finish=error=>{if(settled)return;settled=true;unschedule(timer);window.removeListener('ready-to-show',ready);window.removeListener('closed',closed);if(error)reject(error);else resolve();};
  const complete=()=>{if(loaded&&painted)finish();};
  const ready=()=>{painted=true;complete();},closed=()=>finish(Error('Overlay closed before its first paint.'));
  window.once('ready-to-show',ready);window.once('closed',closed);
  timer=schedule(()=>finish(Error('Overlay first paint was not ready in time.')),timeoutMs);timer?.unref?.();
  Promise.resolve().then(()=>window.loadURL(url)).then(()=>{loaded=true;complete();},finish);
 });
}
function createOverlayLifecycle({createWindow,loadWindow,positionWindow,onFailure=()=>{},schedule=setTimeout,unschedule=clearTimeout}){
 const active=new Set(['starting','recording','stopping','processing','transcribing','refining']);
 let window=null,latest=null,loading=null,taskId=null,copiedId=null,copiedRevision=null,timer=null,generation=0,disposed=false,closedTaskId=null,closedErrorKey=null,closedRecoveryToken=null,positioned=false,positionedTaskId=null,repairQueued=false;
 const alive=()=>window&&!window.isDestroyed();
 function clearTimer(){if(timer!==null)unschedule(timer);timer=null;}
 function destroy(){clearTimer();const old=window;window=null;loading=null;positioned=false;positionedTaskId=null;if(old&&!old.isDestroyed())old.destroy();}
 function ready(){return latest?.result?.id===taskId&&latest.result.hasText===true&&taskId!==closedTaskId;}
 function errorKey(){return JSON.stringify([taskId,latest?.state?.errorId||null,latest?.state?.message||'']);}
 function render(){
  if(!alive()||loading||!latest||disposed)return;
  try{
   window.webContents.send('state',{...latest,copiedResultId:copiedId,copiedResultRevision:copiedRevision});
   const first=!positioned||positionedTaskId!==taskId;
   if(first){positionWindow(window,latest);positioned=true;positionedTaskId=taskId;}
   if(window.isAlwaysOnTop?.()===false)window.setAlwaysOnTop?.(true,'pop-up-menu');
   if(first||window.isVisible?.()===false){window.showInactive();window.setAlwaysOnTop?.(true,'pop-up-menu');}
  }catch{destroy();onFailure();}
 }
 function repair(candidate){
  if(repairQueued||disposed||window!==candidate||!active.has(latest?.state?.phase))return;
  repairQueued=true;queueMicrotask(()=>{repairQueued=false;if(window===candidate&&active.has(latest?.state?.phase))render();});
 }
 function update(data){
  if(disposed||!data?.state)return;latest=data;if(copiedId&&(data.result?.id!==copiedId||(data.result.revision||1)!==copiedRevision)){copiedId=null;copiedRevision=null;generation++;clearTimer();}
  if(active.has(data.state.phase)&&data.state.sessionId!==taskId){taskId=data.state.sessionId;copiedId=null;copiedRevision=null;generation++;clearTimer();}
  const show=active.has(data.state.phase)||ready()||(data.recovery?.token&&data.recovery.token!==closedRecoveryToken)||(data.state.phase==='error'&&errorKey()!==closedErrorKey);
  if(!show){destroy();return;}
  if(!alive()){
   const candidate=createWindow();window=candidate;
   candidate.on?.('hide',()=>repair(candidate));
   candidate.on?.('always-on-top-changed',(_event,flag)=>{if(flag===false)repair(candidate);});
   const pending=Promise.resolve().then(()=>loadWindow(candidate));loading=pending;
   pending.then(()=>{if(disposed||window!==candidate||loading!==pending)return;loading=null;render();},()=>{if(window===candidate){destroy();onFailure();}});
  }
  render();
 }
 function markCopied(id){
  if(disposed||active.has(latest?.state?.phase)||id!==taskId||!ready())return false;
  copiedId=id;copiedRevision=latest.result.revision||1;render();clearTimer();const revision=generation;
  timer=schedule(()=>{if(revision!==generation||taskId!==id||active.has(latest?.state?.phase))return;timer=null;closedTaskId=id;destroy();},650);timer?.unref?.();return true;
 }
 // A confirmed paste needs no follow-up action, so the strip leaves after a short acknowledgement.
 function markDelivered(){
  if(disposed||active.has(latest?.state?.phase)||!ready())return false;
  const id=taskId,revision=generation;clearTimer();
  timer=schedule(()=>{if(revision!==generation||taskId!==id||active.has(latest?.state?.phase))return;timer=null;closedTaskId=id;destroy();},1000);timer?.unref?.();return true;
 }
 function dismiss(){if(active.has(latest?.state?.phase))return false;closedTaskId=taskId;if(latest?.recovery)closedRecoveryToken=latest.recovery.token;if(latest?.state?.phase==='error')closedErrorKey=errorKey();generation++;destroy();return true;}
 return {update,markCopied,markDelivered,dismiss,getWindow:()=>alive()?window:null,dispose(){disposed=true;generation++;destroy();}};
}
module.exports={createOverlayLifecycle,loadOverlayWindow};
