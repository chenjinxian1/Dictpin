'use strict';
(()=>{
 const bridge=window.dictation,model=window.DictationUiState,$=id=>document.getElementById(id),ACTIVE=new Set(['starting','recording','stopping','processing','transcribing','refining']);
 if(!bridge)return;const motion=window.DictationMotion?.createFeedbackMotion();let snapshot=null,phase='starting',pending=false,copying=false,error='',identity=null,copied=null,version=0,visualPhase=null;
 function level(value){
  if(phase!=='recording')return;const amount=Math.max(0,Math.min(1,Number(value)||0)),shape=[.25,.55,.8,.5,1,.65,.9,.5,.25];
  [...$('voice-wave').children].forEach((node,index)=>node.style.height=Math.round(4+amount*22*shape[index])+'px');
 }
 function render(data){
  if(!data?.state)return;snapshot=data;version++;const state=data.state,id=state.sessionId||data.result?.id;
  if(id!==identity){identity=id;error='';copied=null;pending=false;copying=false;}
  phase=ACTIVE.has(state.phase)?state.phase:(data.copiedResultId===data.result?.id&&data.copiedResultRevision===(data.result?.revision||1)||copied?.id===data.result?.id&&copied?.revision===(data.result?.revision||1))&&data.result?'copied':data.result?.hasText?'ready':state.phase==='error'?'error':'idle';
  $('voice-pill').hidden=phase==='idle'&&!data.recovery;$('voice-pill').dataset.phase=phase==='refining'?'refining':ACTIVE.has(phase)&&!['starting','recording','stopping'].includes(phase)?'processing':phase;
  const recording=phase==='recording',active=ACTIVE.has(phase),ready=phase==='ready',available=ready||data.canUseOriginal,session=model.sessionView(data),recovery=data.recovery;
  $('voice-wave').hidden=!recording;$('bar-status').hidden=recording;
  $('bar-status').textContent=phase==='copied'?'已复制，请自行粘贴':ready?((data.result.status!=='completed'||/整理未完成|超出轻整理/.test(state.message||''))?'原文已保留':data.result.refined?'已整理':'已就绪'):data.recovery?'本段可恢复':data.canUseOriginal?'文字已就绪':phase==='starting'?'准备中':phase==='stopping'?'结束中':active?(phase==='refining'||/整理/.test(state.message||'')?'整理中':'识别中'):'听写未完成';
  if(error){$('voice-wave').hidden=true;$('bar-status').hidden=false;$('bar-status').textContent=error;}
  $('voice-pill').title=error||state.message||'';$('voice-pill').setAttribute('aria-label',recording&&!error?'正在录音':$('bar-status').textContent);
  $('bar-cancel').hidden=!active;$('bar-cancel').disabled=pending;$('bar-cancel').textContent=session.cancelLabel;$('bar-cancel').setAttribute('aria-label',session.cancelLabel);$('bar-cancel').title=data.canUseOriginal?'结束整理并保留完整识别原文；已发出的请求仍可能计费。':data.escapeRegistered?'取消 (Esc)':'取消本次听写';$('bar-stop').hidden=!recording;$('bar-stop').disabled=pending;
  $('bar-ready-actions').hidden=!available&&phase!=='error'&&!recovery;$('bar-copy').hidden=!available;$('bar-copy').disabled=copying;$('bar-copy').textContent=copying?'复制中':'复制';$('bar-view').disabled=copying||!recovery&&typeof(data.result?.id||state.sessionId)!=='string';$('bar-view').textContent=recovery?'恢复':'查看';
  $('bar-dismiss').hidden=active||phase==='copied';$('bar-feedback').hidden=true;$('bar-feedback').textContent=error||(phase==='error'?state.message||'听写失败，请从托盘查看最近结果。':'');$('bar-feedback').title=$('bar-feedback').textContent;level(state.level);
  if(phase!==visualPhase){motion?.respond($('voice-center'));visualPhase=phase;}
 }
 async function action(method){
  if(pending||!snapshot||!ACTIVE.has(phase))return;const sessionId=snapshot.state.sessionId,revision=identity;pending=true;error='';render(snapshot);
  try{await bridge[method]({sessionId});}catch{if(identity===revision)error=method==='stop'?'结束未确认，请重试。':'取消未确认，请重试。';}finally{if(identity===revision)pending=false;if(snapshot)render(snapshot);}
 }
 $('bar-stop').addEventListener('click',()=>void action('stop'));$('bar-cancel').addEventListener('click',()=>void action('cancel'));
 $('bar-copy').addEventListener('click',async()=>{
  if(copying||!snapshot.result?.id||(!snapshot.canUseOriginal&&phase!=='ready'))return;const id=snapshot.result.id,revision=identity,textRevision=snapshot.result.revision||1;copying=true;error='';render(snapshot);
  try{const result=await bridge.copyResult({id,expectedRevision:textRevision});if(result?.ok===true&&snapshot.result?.id===id&&(snapshot.result.revision||1)===result.revision)copied={id,revision:result.revision};}catch{if(snapshot.result?.id===id)error='复制失败，请重试。';}finally{if(identity===revision){copying=false;render(snapshot);}}
 });
 $('bar-view').addEventListener('click',async()=>{const id=identity;try{if(snapshot.recovery){await bridge.retryRecovery({token:snapshot.recovery.token});return;}await bridge.showRecent(snapshot.result?.id||snapshot.state.sessionId);}catch{if(identity!==id)return;error=snapshot.recovery?'恢复未完成，请重试。':'无法打开，请从托盘重试。';render(snapshot);}});
 $('bar-dismiss').addEventListener('click',async()=>{const id=identity;try{await bridge.dismissBar();}catch{if(identity!==id)return;error='未能收起，请重试。';render(snapshot);}});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.repeat){event.preventDefault();if(ACTIVE.has(phase))void action('cancel');else $('bar-dismiss').click();}});
 bridge.onState(render);bridge.onLevel(level);const initialVersion=version;Promise.resolve(bridge.getSnapshot()).then(data=>{if(version===initialVersion)render(data);}).catch(()=>render({state:{phase:'error',message:'未连接桌面程序，请从托盘重新打开。'}}));window.addEventListener('beforeunload',()=>motion?.dispose());
})();
