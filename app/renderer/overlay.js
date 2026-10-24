'use strict';
(()=>{
 const bridge=window.dictation,presentation=window.OverlayPresentation;if(!bridge||!presentation)return;
 const $=id=>document.getElementById(id),host=$('overlay-host'),pill=$('overlay-pill'),bars=[...$('overlay-wave').children];
 let recordingClock=null;
 let snapshot=null,pending=false,timer=null,actionError=null,menuOpen=false,menuPending=false,languagePending=false,menuSignature='',version=0,seenEvent=false,menuToken=0,languageToken=0,actionToken=0,openToken=0,dismissToken=0;
 const languageName=code=>window.OutputLanguages?.label(code)||String(code||'');
 const currentId=()=>snapshot?.state?.sessionId;
 const canSelect=()=>snapshot?.state?.mode==='translate'&&['starting','recording'].includes(snapshot.state.phase)&&typeof currentId()==='string';
 const targets=()=>{const raw=snapshot?.state?.targetLanguages??snapshot?.settings?.targetLanguages??[snapshot?.state?.targetLanguage??snapshot?.settings?.targetLanguage??'zh'];return Array.isArray(raw)?raw.filter(x=>typeof x==='string').slice(0,3):[];};
 function timingNow(){
  return snapshot?.state?.phase==='recording'&&recordingClock?recordingClock.wallAt+Math.max(0,performance.now()-recordingClock.monoAt):Date.now();
 }
 function updateTimer(){
  const view=presentation.present(snapshot?.state,timingNow());
  pill.style.width=view.width===null?'':`${view.width}px`;pill.style.height=`${view.height}px`;host.style.setProperty('--pill-height',`${view.height}px`);
  $('overlay-time').hidden=true;$('overlay-time').textContent='';
  $('overlay-countdown').hidden=!view.countdown;$('overlay-countdown').textContent=view.countdown||'';
  $('overlay-countdown').setAttribute('aria-label',view.countdown?`剩余 ${view.countdown}`:'');
 }
 function renderLevel(value){const heights=presentation.barHeights(value,snapshot?.state?.phase==='recording');bars.forEach((bar,i)=>bar.style.height=`${heights[i]}px`);}
 function renderMenu(){
  const s=snapshot.state,selected=s.targetLanguage||snapshot.settings?.targetLanguage||'zh',list=targets().slice().sort((a,b)=>(a===selected?-1:b===selected?1:0)),key=JSON.stringify([currentId(),list,selected]);
  if(key!==menuSignature){menuSignature=key;const fragment=document.createDocumentFragment();for(const code of list){const button=document.createElement('button');button.type='button';button.dataset.language=code;button.setAttribute('role','menuitemradio');button.setAttribute('aria-checked',String(code===selected));button.textContent=languageName(code);button.addEventListener('click',()=>selectLanguage(code));fragment.append(button);}$('overlay-language-options').replaceChildren(fragment);}
  for(const button of $('overlay-language-options').children)button.disabled=languagePending||!canSelect();
  $('overlay-language-menu').hidden=!menuOpen;$('overlay-mode').setAttribute('aria-expanded',String(menuOpen));
  host.dataset.auxVisible=String(menuOpen||menuPending||languagePending||snapshot.state.phase==='error'||!!actionError||!!snapshot.state.languageError);
 }
 function render(value){
  if(!value?.state)return;
  const previousId=currentId();snapshot=value;const s=value.state;
  if(s.phase==='recording'){
   const start=typeof s.startedAt==='number'?s.startedAt:Date.parse(s.startedAt);
   const elapsed=Number.isFinite(s.recordingElapsedMs)?s.recordingElapsedMs:Math.max(0,Date.now()-start);
   recordingClock=Number.isFinite(start)?{monoAt:performance.now(),wallAt:start+elapsed}:null;
  }else recordingClock=null;
  const view=presentation.present(s,timingNow()),phase=view.phase;
  if(previousId!==currentId()){menuToken++;languageToken++;actionToken++;openToken++;dismissToken++;menuPending=false;languagePending=false;pending=false;actionError=null;}
  if(!canSelect()||previousId!==currentId())menuOpen=false;
  pill.dataset.phase=phase;pill.dataset.presentation=view.kind;pill.dataset.mode=view.accent;
  pill.setAttribute('aria-label',view.label);pill.tabIndex=phase==='idle'?-1:0;host.dataset.error=String(phase==='error');
  $('overlay-label').textContent=view.label;$('overlay-label').hidden=!view.labelVisible;$('overlay-wave').hidden=!view.wave;
  const mode=s.mode||'dictate',language=s.targetLanguage||value.settings?.targetLanguage||'zh';
  $('overlay-mode').textContent=mode==='translate'?`翻译为 ${languageName(language)}${!canSelect()?' · 已锁定':''}`:'问一问';
  $('overlay-mode').hidden=mode==='dictate';$('overlay-mode').disabled=!canSelect()||targets().length<2||menuPending||languagePending;
  $('overlay-stop').hidden=phase!=='recording';$('overlay-stop').disabled=pending;
  $('overlay-retain').hidden=phase!=='recording'||value.canRetainRecording!==true;$('overlay-retain').disabled=pending;
  const cancel=$('overlay-cancel'),cancelParent=view.cancelInPill?pill:$('overlay-toolbar'),cancelBefore=view.cancelInPill?$('overlay-body'):$('overlay-retain');
  if(cancel.parentElement!==cancelParent)cancelParent.insertBefore(cancel,cancelBefore);
  cancel.hidden=!view.canCancel;cancel.disabled=pending||s.retaining===true;
  $('overlay-dismiss').hidden=!view.canDismiss;
  const error=phase==='error'||!!actionError||!!s.languageError;
  $('overlay-errors').hidden=!error;
  $('overlay-hint').textContent=actionError||s.languageError||(phase==='error'?(s.message||'打开主窗口查看详情'):s.message||'');
  $('overlay-hint').classList.toggle('action-error',!!(actionError||s.languageError));
  $('overlay-feedback').hidden=!error&&!$('overlay-hint').textContent;
  if(phase==='recording'&&timer===null)timer=setInterval(updateTimer,1000);
  else if(phase!=='recording'&&timer!==null){clearInterval(timer);timer=null;}
  renderMenu();renderLevel(s.level);updateTimer();
 }
 async function setMenu(open,focus=true){
  if(menuPending||!canSelect()||typeof bridge.setOverlayMenu!=='function')return;
  const sessionId=currentId(),token=++menuToken;let restoreFocus=false;menuPending=true;render(snapshot);
  try{const result=await bridge.setOverlayMenu({sessionId,open});if(token===menuToken&&currentId()===sessionId&&canSelect()&&result?.ok){menuOpen=open;renderMenu();if(focus){if(open)($('overlay-language-options').querySelector('[aria-checked="true"]')||$('overlay-language-options').firstElementChild)?.focus();else restoreFocus=true;}}}
  catch{if(token===menuToken&&currentId()===sessionId&&canSelect())actionError='语言菜单未打开，请重新点击。';}
  finally{if(token===menuToken)menuPending=false;if(snapshot)render(snapshot);if(restoreFocus&&token===menuToken&&currentId()===sessionId&&canSelect())$('overlay-mode').focus();}
 }
 async function selectLanguage(targetLanguage){
  if(languagePending||!canSelect()||!targets().includes(targetLanguage)||typeof bridge.selectSessionLanguage!=='function')return;
  const sessionId=currentId(),token=++languageToken;let restoreFocus=false;languagePending=true;render(snapshot);
  try{const result=await bridge.selectSessionLanguage({sessionId,targetLanguage});if(token!==languageToken||currentId()!==sessionId||!canSelect())return;if(result?.accepted!==true)throw Error('stale');actionError=null;menuOpen=false;try{await bridge.setOverlayMenu?.({sessionId,open:false});}catch{}if(token===languageToken&&currentId()===sessionId&&canSelect())restoreFocus=true;}
  catch{if(token===languageToken&&currentId()===sessionId&&canSelect())actionError=snapshot?.state?.languageError||'语言未切换，请重试；停止后目标语言会锁定。';}
  finally{if(token===languageToken)languagePending=false;if(snapshot)render(snapshot);if(restoreFocus&&token===languageToken&&currentId()===sessionId&&canSelect())$('overlay-mode').focus();}
 }
 async function action(method){
  if(pending||!snapshot||typeof bridge[method]!=='function')return;
  const phase=snapshot.state.phase;
  if(method==='stop'&&phase!=='recording')return;
  if(method==='retainRecording'&&(phase!=='recording'||snapshot.canRetainRecording!==true))return;
  if(method==='cancel'&&(!presentation.present(snapshot.state).canCancel||snapshot.state.retaining===true))return;
  const sessionId=currentId(),before=version,token=++actionToken;pending=true;render(snapshot);
  try{const next=await bridge[method]({sessionId});if(method==='retainRecording'&&next?.accepted!==true)throw Error('retain rejected');if(token===actionToken&&currentId()===sessionId&&next?.state&&version===before)render(next);}
  catch{if(token===actionToken&&currentId()===sessionId&&version===before)actionError='操作未完成，请打开主窗口查看。';}
  finally{if(token===actionToken)pending=false;if(snapshot)render(snapshot);}
 }
 $('overlay-mode').addEventListener('click',()=>setMenu(!menuOpen));
 document.addEventListener('keydown',event=>{if(!menuOpen)return;if(event.key==='Escape'){event.preventDefault();void setMenu(false);}else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const buttons=[...$('overlay-language-options').querySelectorAll('button:not(:disabled)')];if(!buttons.length)return;const index=buttons.indexOf(document.activeElement),next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();}});
 document.addEventListener('click',event=>{if(menuOpen&&!$('overlay-language-menu').contains(event.target)&&!$('overlay-mode').contains(event.target))void setMenu(false,false);});
 $('overlay-open').addEventListener('click',async()=>{const sessionId=currentId(),before=version,token=++openToken;try{await bridge.showMain?.();}catch{if(token===openToken&&currentId()===sessionId&&version===before){actionError='无法打开主窗口，请从托盘重试。';render(snapshot);}}});
 $('overlay-dismiss').addEventListener('click',async()=>{if(!snapshot||!presentation.present(snapshot.state).canDismiss)return;const sessionId=currentId(),before=version,token=++dismissToken;try{await bridge.dismissOverlay?.();}catch{if(token===dismissToken&&currentId()===sessionId&&version===before){actionError='无法关闭，请从托盘查看。';render(snapshot);}}});
 $('overlay-retain').addEventListener('click',()=>action('retainRecording'));
 $('overlay-stop').addEventListener('click',()=>action('stop'));$('overlay-cancel').addEventListener('click',()=>action('cancel'));
 const unsubscribe=bridge.onState(value=>{seenEvent=true;version++;actionError=null;render(value);}),unsubscribeLevel=typeof bridge.onLevel==='function'?bridge.onLevel(renderLevel):null;
 Promise.resolve(bridge.getSnapshot()).then(value=>{if(!seenEvent)render(value);}).catch(()=>{if(!seenEvent)render({state:{phase:'error',message:'等待连接，请打开主窗口查看。'}});});
 window.addEventListener('beforeunload',()=>{if(timer!==null)clearInterval(timer);unsubscribe?.();unsubscribeLevel?.();});
})();
