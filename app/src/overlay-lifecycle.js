'use strict';
// A single lazy status window. No worker, polling, or idle renderer is required.
function createOverlayLifecycle({createWindow,loadWindow,positionWindow,onFailure=()=>{},schedule=setTimeout,unschedule=clearTimeout,terminalMs=4500}){
  let window=null,loading=null,timer=null,latest=null,disposed=false,dismissed=null;
  const active=new Set(['starting','recording','stopping','processing','transcribing','refining','delivering']);
  const signature=data=>`${data?.state?.phase}|${data?.state?.sessionId??''}|${data?.state?.errorId??''}|${data?.state?.message??''}`;
  const alive=()=>window&&!window.isDestroyed();
  function clearTimer(){if(timer!==null)unschedule(timer);timer=null;}
  function destroy(){clearTimer();const old=window;window=null;loading=null;if(old&&!old.isDestroyed())old.destroy();}
  function render(){
    if(!alive()||loading||!latest||disposed)return;
    window.webContents.send('state',latest);
    positionWindow(window,latest);
    if(active.has(latest.state.phase)||(latest.state.phase==='error'&&dismissed!==signature(latest))){window.showInactive();}
  }
  function update(data){
    if(disposed||!data?.state)return;latest=data;const phase=data.state.phase;
    if(active.has(phase))dismissed=null;
    const needsWindow=active.has(phase)||(phase==='error'&&dismissed!==signature(data));
    if(needsWindow){
      clearTimer();
      if(!alive()){
        let candidate;
        try{candidate=createWindow();window=candidate;}catch{onFailure();return;}
        const task=Promise.resolve().then(()=>loadWindow(candidate));loading=task;
        task.then(()=>{if(disposed||window!==candidate||loading!==task)return;loading=null;render();},()=>{if(window===candidate){destroy();onFailure();}});
      }
    }else if(alive()&&timer===null){timer=schedule(()=>{timer=null;if(!latest||(!active.has(latest.state.phase)&&latest.state.phase!=='error'))destroy();},terminalMs);timer?.unref?.();}
    render();
  }
  function dismiss(){if(latest&&active.has(latest.state.phase))return false;dismissed=signature(latest);destroy();return true;}
  return{update,dismiss,getWindow:()=>alive()?window:null,dispose(){disposed=true;destroy();}};
}
module.exports={createOverlayLifecycle};
