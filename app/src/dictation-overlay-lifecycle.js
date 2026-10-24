'use strict';
function createOverlayLifecycle({createWindow,loadWindow,positionWindow,onFailure=()=>{},schedule=setTimeout,unschedule=clearTimeout}){
 const active=new Set(['starting','recording','stopping','processing','transcribing','refining']);
 let window=null,latest=null,loading=null,taskId=null,copiedId=null,copiedRevision=null,timer=null,generation=0,disposed=false,closedTaskId=null,closedErrorKey=null,closedRecoveryToken=null,positioned=false,positionedTaskId=null;
 const alive=()=>window&&!window.isDestroyed();
 function clearTimer(){if(timer!==null)unschedule(timer);timer=null;}
 function destroy(){clearTimer();const old=window;window=null;loading=null;positioned=false;positionedTaskId=null;if(old&&!old.isDestroyed())old.destroy();}
 function ready(){return latest?.result?.id===taskId&&latest.result.hasText===true&&taskId!==closedTaskId;}
 function errorKey(){return JSON.stringify([taskId,latest?.state?.errorId||null,latest?.state?.message||'']);}
 function render(){
  if(!alive()||loading||!latest||disposed)return;
  window.webContents.send('state',{...latest,copiedResultId:copiedId,copiedResultRevision:copiedRevision});
  if(!positioned||positionedTaskId!==taskId){positionWindow(window,latest);window.showInactive();positioned=true;positionedTaskId=taskId;}
 }
 function update(data){
  if(disposed||!data?.state)return;latest=data;if(copiedId&&(data.result?.id!==copiedId||(data.result.revision||1)!==copiedRevision)){copiedId=null;copiedRevision=null;generation++;clearTimer();}
  if(active.has(data.state.phase)&&data.state.sessionId!==taskId){taskId=data.state.sessionId;copiedId=null;copiedRevision=null;generation++;clearTimer();}
  const show=active.has(data.state.phase)||ready()||(data.recovery?.token&&data.recovery.token!==closedRecoveryToken)||(data.state.phase==='error'&&errorKey()!==closedErrorKey);
  if(!show){destroy();return;}
  if(!alive()){
   const candidate=createWindow();window=candidate;
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
 function dismiss(){if(active.has(latest?.state?.phase))return false;closedTaskId=taskId;if(latest?.recovery)closedRecoveryToken=latest.recovery.token;if(latest?.state?.phase==='error')closedErrorKey=errorKey();generation++;destroy();return true;}
 return {update,markCopied,dismiss,getWindow:()=>alive()?window:null,dispose(){disposed=true;generation++;destroy();}};
}
module.exports={createOverlayLifecycle};
