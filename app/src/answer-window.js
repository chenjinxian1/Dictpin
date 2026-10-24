'use strict';
const {validateMetadata}=require('./source-citations');
const {readPayloadSource}=require('./source-actions');
const {TASKS}=require('./settings');
const WINDOW_WIDTH=800,MAX_WINDOW_HEIGHT=800,BOTTOM_MARGIN=20,RESIZE_DELAY_MS=80;
const requestText=payload=>[payload.question,payload.context].filter(Boolean).join('\n\n');

function createAnswerWindow({createWindow,loadWindow,getWorkArea,writeClipboard,onFailure=()=>{},schedule=setTimeout,unschedule=clearTimeout,firstPaintMs=5000}){
 let window=null,loading=null,payload=null,generation=0,disposed=false,paintReady=false;
 let paintTimer=null,paintRevision=0,resizeTimer=null,resizeRevision=0;
 const alive=()=>window&&!window.isDestroyed();
 const validResult=result=>result?.mode==='ask'&&result.status==='completed'&&typeof result.id==='string'&&result.id.length>0&&result.id.length<=128&&typeof result.text==='string'&&!!result.text.trim()&&result.text.length<=100000;
 function workArea(first=false){
  const work=getWorkArea(first?null:window);
  if(!work||!['x','y','width','height'].every(key=>Number.isFinite(work[key]))||work.width<1||work.height<1)throw Error('无法取得回答窗口的可用显示区域。');
  return{x:Math.round(work.x),y:Math.round(work.y),width:Math.max(1,Math.floor(work.width)),height:Math.max(1,Math.floor(work.height))};
 }
 function bounds(height,work=workArea()){
  const width=Math.min(WINDOW_WIDTH,work.width),margin=work.height>BOTTOM_MARGIN?BOTTOM_MARGIN:0;
  const actualHeight=Math.max(1,Math.min(MAX_WINDOW_HEIGHT,work.height-margin,Math.ceil(height)));
  return{x:work.x+Math.floor((work.width-width)/2),y:work.y+work.height-actualHeight-margin,width,height:actualHeight};
 }
 function clearPaintTimer(){paintRevision++;if(paintTimer!==null)unschedule(paintTimer);paintTimer=null;}
 function clearResizeTimer(){resizeRevision++;if(resizeTimer!==null)unschedule(resizeTimer);resizeTimer=null;}
 function destroy(){
  clearPaintTimer();clearResizeTimer();paintReady=false;
  const old=window;window=null;loading=null;payload=null;generation++;
  if(old&&!old.isDestroyed())old.destroy();
 }
 function publish(){
  if(!alive()||loading||!payload||disposed)return;
  window.webContents.send('answer:payload',{...payload});
  if(paintReady){clearPaintTimer();window.show();}
 }
 function show(result,appearance='light'){
  if(disposed||!validResult(result))throw Error('这条记录没有可查看的完整回答。');
  clearResizeTimer();
  payload={generation:++generation,id:result.id,...(result.sourceMetadata?{sourceMetadata:validateMetadata(result.text,result.sourceMetadata)}:{}),question:typeof result.original==='string'?result.original.slice(0,100000):'',answer:result.text,context:typeof result.context==='string'?result.context.slice(0,20000):'',task:TASKS.includes(result.task)?result.task:'ask',appearance:['light','dark','system'].includes(appearance)?appearance:'light'};
  if(!alive()){
   const win=createWindow();window=win;paintReady=false;
   const paintToken=++paintRevision;
   paintTimer=schedule(()=>{if(window!==win||disposed||paintToken!==paintRevision)return;paintTimer=null;destroy();onFailure();},firstPaintMs);paintTimer?.unref?.();
   win.once('ready-to-show',()=>{if(window===win&&!disposed){paintReady=true;publish();}});
   const work=workArea(true);win.setBounds(bounds(work.height>=800?800:Math.min(500,work.height),work),false);
   win.on('closed',()=>{if(window===win){clearPaintTimer();clearResizeTimer();paintReady=false;window=null;loading=null;payload=null;generation++;}});
   win.webContents.on('render-process-gone',()=>{if(window===win){destroy();onFailure();}});
   win.webContents.on('before-input-event',(event,input)=>{if(input.type==='keyDown'&&input.key==='Escape'&&window===win){event.preventDefault();destroy();}});
   const task=Promise.resolve().then(()=>loadWindow(win));loading=task;
   task.then(()=>{if(window!==win||loading!==task||disposed)return;loading=null;publish();},()=>{if(window===win){destroy();onFailure();}});
  }else publish();
  return{ok:true,generation};
 }
 function current(input){return !disposed&&!!payload&&alive()&&input&&input.generation===payload.generation;}
 function resize(input){
  if(!current(input)||!Number.isFinite(input.height)||input.height<1||input.height>32000)return{ok:false};
  clearResizeTimer();
  const token=resizeRevision,win=window,requested={generation:input.generation,height:Math.ceil(input.height)};
  resizeTimer=schedule(()=>{
   if(token!==resizeRevision||window!==win||!current(requested))return;
   resizeTimer=null;
   const next=bounds(requested.height),old=win.getBounds();
   if(['x','y','width','height'].some(key=>Math.abs(old[key]-next[key])>2))win.setBounds(next,false);
  },RESIZE_DELAY_MS);resizeTimer?.unref?.();
  return{ok:true};
 }
 function close(input){if(!current(input))return{ok:false};destroy();return{ok:true};}
 async function copy(input){
  if(!current(input)||!['answer','request','question','context'].includes(input.part))throw Error('回答已更新，请重试。');
  const win=window,text=input.part==='request'?requestText(payload):payload[input.part];
  if(!text)throw Error('没有可复制的文字。');
  await writeClipboard(text);
  if(window!==win||!current(input))throw Error('回答已更新，请重试。');
  return{ok:true};
 }
 function readSource(input){if(!current(input))throw Error('回答已更新或关闭，请重新选择来源。');return readPayloadSource(payload,input.sourceId);}
 return{show,resize,close,copy,readSource,getWindow:()=>alive()?window:null,getPayload:()=>payload?{...payload}:null,dispose(){disposed=true;destroy();}};
}
module.exports={createAnswerWindow};
