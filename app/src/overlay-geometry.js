'use strict';
// Pure bounds calculation: expanded language choices grow upward, never move the pill's bottom anchor.
function overlayBounds(work,anchor,expanded=false,feedback=false,retain=false){
 const width=Math.max(1,Math.min(380,work.width)),baseHeight=Math.max(1,Math.min(136,work.height));
 const bottom=Math.max(work.y+1,Math.min(work.y+work.height,anchor?.bottom??work.y+work.height-Math.min(24,Math.max(0,work.height-baseHeight))));
 const height=Math.max(1,Math.min((expanded?(feedback?340:304):(feedback?172:136))+(retain?32:0),work.height,bottom-work.y));
 const x=Math.round(Math.max(work.x,Math.min(work.x+work.width-width,anchor?.x??work.x+(work.width-width)/2)));
 return{x,y:Math.round(bottom-height),width,height};
}
function createOverlayGeometry({getWorkArea}){
 const entries=new WeakMap();
 function stateFor(win,data){
  const state=data?.state||{};let e=entries.get(win);
  if(!e||(typeof state.sessionId==='string'&&e.sessionId!==state.sessionId)){const work=getWorkArea(win,true),b=overlayBounds(work,null,false);e={sessionId:state.sessionId,anchor:{x:b.x,bottom:b.y+b.height},expanded:false,work,placed:false};entries.set(win,e);}
  if(state.mode!=='translate'||!['starting','recording'].includes(state.phase))e.expanded=false;
  return e;
 }
 function position(win,data){const e=stateFor(win,data),b=overlayBounds(e.placed?getWorkArea(win,false):e.work,e.anchor,e.expanded,!!data?.state?.languageError||data?.state?.phase==='error',data?.canRetainRecording===true&&data?.state?.phase==='recording'),old=win.getBounds();if(['x','y','width','height'].some(k=>old[k]!==b[k]))win.setBounds(b,false);e.placed=true;return b;}
 function setExpanded(win,input,data){const state=data?.state;if(!win||win.isDestroyed()||!state||!input||typeof input.open!=='boolean'||typeof input.sessionId!=='string'||input.sessionId!==state.sessionId||state.mode!=='translate'||!['starting','recording'].includes(state.phase))throw Error('语言菜单已过期，请在本次录音结束前重新打开。');const e=stateFor(win,data);e.expanded=input.open;position(win,data);return{ok:true,expanded:e.expanded,sessionId:e.sessionId};}
 return{position,setExpanded};
}
module.exports={overlayBounds,createOverlayGeometry};
