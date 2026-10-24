'use strict';
const {randomUUID}=require('node:crypto');

/** Temporarily releases only this manager's bindings so the main window can capture a key. */
function createShortcutCapture({manager,getBindings,canStart,onChange,onFailure,schedule=setTimeout,unschedule=clearTimeout,timeoutMs=15000}={}){
  if(!manager||typeof manager.apply!=='function'||typeof getBindings!=='function'||typeof canStart!=='function'||typeof schedule!=='function'||typeof unschedule!=='function')throw new TypeError('需要快捷键管理器、当前绑定和捕获状态检查。');
  const delay=Number.isFinite(timeoutMs)&&timeoutMs>0?Math.min(timeoutMs,15000):15000;
  let token=null,timer=null,disposed=false,changing=false;
  const snapshot=()=>({active:token!==null,token});
  function report(error){try{onFailure?.(error);}catch{/* Reporting cannot interrupt restoration. */}}
  function notify(){try{onChange?.(snapshot());}catch(error){report(error);}}
  function stopTimer(){const previous=timer;timer=null;if(previous!==null){try{unschedule(previous);}catch(error){report(error);}}}
  function end(input={}){
    if(disposed||changing||!token||!input||typeof input!=='object'||Array.isArray(input)||input.token!==token)return{ended:false,restored:false};
    changing=true;token=null;stopTimer();let restored=false,error;
    try{manager.apply(getBindings());restored=true;}catch(caught){error=caught;}
    finally{changing=false;}
    if(error)report(error);notify();
    return{ended:true,restored};
  }
  function begin(){
    if(disposed)throw new Error('快捷键捕获已关闭。');
    if(changing)throw new Error('快捷键正在更新，请稍后重试。');
    if(token)throw new Error('已有快捷键正在捕获，请先完成或取消。');
    changing=true;
    let allowed;
    try{allowed=canStart();}catch(error){changing=false;report(error);throw error;}
    if(disposed||allowed!==true){changing=false;throw new Error('请在主窗口可见、聚焦且空闲时设置快捷键。');}
    try{
      manager.apply({current:'',dictate:[],translate:[],ask:[]});
    }catch(error){changing=false;report(error);notify();throw error;}
    if(disposed){changing=false;throw new Error('快捷键捕获已关闭。');}
    const generation=randomUUID();token=generation;changing=false;
    try{
      const handle=schedule(()=>{end({token:generation});},delay);
      if(token===generation&&!disposed){timer=handle;try{timer?.unref?.();}catch{/* Unref is optional. */}}
      else{try{unschedule(handle);}catch(error){report(error);}}
    }catch(error){end({token:generation});report(error);throw error;}
    if(token!==generation||disposed)throw new Error('快捷键捕获已结束，请重试。');
    notify();return{token:generation};
  }
  function cancel(){return end({token});}
  function dispose(){if(disposed)return;disposed=true;token=null;stopTimer();notify();}
  return{begin,end,cancel,snapshot,dispose};
}

module.exports={createShortcutCapture};
