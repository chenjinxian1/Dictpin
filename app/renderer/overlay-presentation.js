'use strict';
// Independent renderer presentation derived from the documented visible states.
// This module neither drives recording nor infers successful delivery.
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.OverlayPresentation=api;
})(typeof window!=='undefined'?window:globalThis,function(){
 const MAX_RECORDING_MS=540000,COUNTDOWN_MS=60000;
 const labels={idle:'准备就绪',starting:'准备麦克风',recording:'正在录音',stopping:'结束录音',processing:'Thinking',transcribing:'Thinking',refining:'Thinking',delivering:'准备结果',done:'文字已就绪',retained:'片段已保留 · 未上传',cancelled:'已取消',error:'处理未完成'};
 function countdown(state,now=Date.now()){
  if(state?.phase!=='recording')return null;
  const start=typeof state.startedAt==='number'?state.startedAt:typeof state.startedAt==='string'?Date.parse(state.startedAt):NaN;
  if(!Number.isFinite(start)||!Number.isFinite(now))return null;
  const limit=Number.isFinite(state.recordingLimits?.stopAfterMs)&&state.recordingLimits.stopAfterMs>0&&state.recordingLimits.stopAfterMs<=MAX_RECORDING_MS?state.recordingLimits.stopAfterMs:MAX_RECORDING_MS;
  const remaining=limit-Math.max(0,now-start);
  if(remaining<=0||remaining>COUNTDOWN_MS)return null;
  const seconds=Math.ceil(remaining/1000);
  return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
 }
 function present(state={},now=Date.now()){
  const phase=state.phase||'idle',time=countdown(state,now);
  let kind='terminal',width=null,height=34;
  if(phase==='idle'){kind='idle';width=40;height=6;}
  else if(phase==='starting'){kind='starting';width=54;height=12;}
  // The app exposes toggle/hands-free recording, not a reachable hold-to-talk state.
  else if(phase==='recording'){kind='hands-free';width=time?156:116;}
  else if(['processing','transcribing','refining'].includes(phase)){kind='processing';width=92;}
  else if(phase==='error'){kind='error';width=70;}
  else if(['stopping','delivering'].includes(phase)){kind='pending';width=92;}
  return {phase,kind,width,height,countdown:time,label:labels[phase]||'正在处理',accent:state.mode==='translate'?'translate':state.mode==='ask'?'ask':'none',wave:kind==='hands-free'||kind==='error',labelVisible:!['idle','starting','hands-free','error'].includes(kind),cancelInPill:phase==='recording',canCancel:!['idle','done','retained','error','cancelled','delivering'].includes(phase),canDismiss:['idle','done','retained','error','cancelled'].includes(phase)};
 }
 function barHeights(value,recording=true){
  const level=recording?Math.max(0,Math.min(1,Number(value)||0)):0;
  // Ten 2px bars with 2px gaps form a 38px input-level display. No synthetic loop.
  return [.32,.55,.78,.94,1,.87,.64,.98,.72,.42].map(weight=>2+22*level*weight);
 }
 return Object.freeze({MAX_RECORDING_MS,COUNTDOWN_MS,countdown,present,barHeights});
});
