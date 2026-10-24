'use strict';
(()=>{
 const bridge=window.dictation,model=window.DictationUiState,$=id=>document.getElementById(id),ACTIVE=new Set(['starting','recording','stopping','processing','transcribing','refining']);
 if(!bridge||!model){$('notice').hidden=false;$('notice').textContent='未连接桌面程序，无法开始听写。';return;}
 const motion=window.DictationMotion?.createFeedbackMotion();
 let snapshot=null,version=0,page='recent',lastRequested=null,initial=null,dirty=false,saving=false,testing=false,wordBusy=false,copying=false,wordId=null,wordOpener=null,undoToken=null,undoEntryId=null,wordSignature='',deviceRevision=0,discardFocus=null,discardDestination='recent',capturePending=false,copyRevision=0,copyAck=null,copyTimer=null,toastTimer=null,toastOwner=null,resultSignature='';
 const busy=()=>ACTIVE.has(snapshot?.state?.phase);
 const deliveryPending=()=>snapshot?.state?.delivery?.status==='pending';
 function restoreFocus(target,ownerPage,from=null){const current=document.activeElement,ownedUnavailable=current===from&&(from?.disabled||!from?.getClientRects().length);if(page===ownerPage&&(current===document.body||ownedUnavailable)&&!document.querySelector('dialog[open]')&&target?.isConnected&&!target.disabled)target.focus({preventScroll:true});}
 function confirmDiscard(destination){if(!dirty||saving||document.querySelector('dialog[open]'))return;discardDestination=destination;discardFocus=document.activeElement;$('draft-dialog').showModal();sync();$('keep-editing').focus();}
 function toast(text,owner=null,duration=0){if(toastTimer!==null)clearTimeout(toastTimer);toastTimer=null;toastOwner=owner;$('toast-text').textContent=text;$('toast').hidden=false;motion?.respond($('toast'));if(duration)toastTimer=setTimeout(()=>clearToast(owner),duration);}
 function clearToast(owner){if(toastOwner===owner){$('toast').hidden=true;toastOwner=null;if(toastTimer!==null)clearTimeout(toastTimer);toastTimer=null;}}
 function failure(error,fallback){console.warn('听写操作未完成',error);return model.errorMessage(error,fallback);}
 function resetCopy(){if(toastOwner?.kind==='copy')clearToast(toastOwner);copyRevision++;copying=false;copyAck=null;if(copyTimer!==null)clearTimeout(copyTimer);copyTimer=null;}
 function showUndo(operation){undoToken=operation.undoToken;$('word-undo-text').textContent='已移除“'+operation.word+'”';$('word-undo').hidden=false;motion?.respond($('word-undo'));}
 function clearSaveError(){for(const id of ['save-error-report','save-error-link','model-url-error'])$(id).hidden=true;$('save-error-detail').textContent='';$('save-message').classList.remove('error');}
 function saveError(message,summary='保存失败，草稿已保留。'){$('save-message').textContent=summary;$('save-message').classList.add('error');$('save-message').tabIndex=0;$('save-error-detail').textContent=message;$('save-error-report').hidden=false;$('save-error-report').open=false;$('save-error-link').hidden=true;}
 function form(){return {autoPaste:$('auto-paste').checked,appendMode:$('append-mode').checked,copyShortcut:$('copy-shortcut').value.trim(),deviceId:$('microphone').value,shortcut:$('shortcut').value.trim(),enabled:$('light-edit').checked,baseUrl:$('model-url').value.trim(),model:$('model-name').value.trim(),key:$('model-key').value.trim(),remember:$('remember-key').checked};}
 function savedForm(data){return {autoPaste:data.settings.autoPaste===true,appendMode:data.settings.appendMode===true,copyShortcut:data.settings.copyShortcut||'',deviceId:data.settings.deviceId||'',shortcut:data.settings.shortcut||'',enabled:data.settings.refiner.enabled===true,baseUrl:data.settings.refiner.baseUrl||'',endpointMode:data.settings.refiner.endpointMode,model:data.settings.refiner.model||'',key:'',remember:data.keyStatus?.persistent===true};}
 let deviceInputs=null,deviceFeedback='';
 function microphoneChanged(){return !!snapshot&&$('microphone').value!==(snapshot.settings.deviceId||'');}
 function microphoneHint(){
  const selected=$('microphone').value,missing=selected&&deviceInputs&&!deviceInputs.has(selected),explanation=deviceFeedback||(missing?'所选麦克风当前未找到，可改用系统默认设备。':deviceInputs?.size===0?'暂未列出麦克风，可尝试系统默认设备或刷新。':'');
  const action=microphoneChanged()?'麦克风尚未生效，请保存更改后开始听写。':$('save-message').dataset.saved==='true'?(missing?'此选择已保存，连接设备后可开始听写。':'下次听写使用：'+$('microphone').selectedOptions[0]?.textContent+'。'):'开始听写时才启用。';
  $('device-message').textContent=[explanation,action].filter(Boolean).join(' ');
 }
 function alignScroll(){const node=$('page-'+page).querySelector('.page-body');if(node?.offsetWidth)document.documentElement.style.setProperty('--scroll-gutter',(node.offsetWidth-node.clientWidth)+'px');}
 function setForm(value){
  $('auto-paste').checked=value.autoPaste===true;$('append-mode').checked=value.appendMode===true;
  if(![...$('microphone').options].some(option=>option.value===value.deviceId)){const option=document.createElement('option');option.value=value.deviceId;option.textContent='已保存的麦克风（当前未找到）';$('microphone').append(option);}
  $('microphone').value=value.deviceId;$('shortcut').value=value.shortcut;$('copy-shortcut').value=value.copyShortcut||'';$('light-edit').checked=value.enabled;$('model-url').value=value.baseUrl;$('model-name').value=value.model;$('model-key').value='';$('remember-key').checked=value.remember;
  for(const field of $('settings-form').querySelectorAll('[aria-invalid]'))field.removeAttribute('aria-invalid');
 }
 function setPage(next,focus=false){
  if(!['recent','dictionary','settings'].includes(next))return;const changed=page!==next;page=next;$('content').classList.toggle('settings-page',next==='settings');if(changed){$('content').scrollTop=0;clearToast(toastOwner);}
  for(const button of document.querySelectorAll('[data-page]')){if(button.dataset.page===next)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}
  for(const name of ['recent','dictionary','settings'])$('page-'+name).hidden=name!==next;
  alignScroll();if(changed){const body=$('page-'+next).querySelector('.page-body');body.scrollTop=0;motion?.enter(body);}
  if(next==='settings')void devices();if(focus)$('content').focus({preventScroll:true});
 }
 function sync(){
  if(!microphoneChanged()&&toastOwner?.kind==='microphone-draft')clearToast(toastOwner);
  const locked=!snapshot||saving||wordBusy||deliveryPending()||!!snapshot?.state?.pipeline&&(!snapshot.state.pipeline.sealed||snapshot.state.pipeline.pending>0),formLocked=!snapshot||saving||wordBusy||testing||deliveryPending()||snapshot?.dataWritable?.settings===false,wordsLocked=!snapshot||saving||wordBusy||snapshot?.dataWritable?.dictionary===false;
  for(const input of $('settings-form').querySelectorAll('input,select'))input.disabled=formLocked;
  $('remember-key').disabled=formLocked||snapshot?.secureStorage!==true;
   const settingsTab=document.querySelector('[data-page=settings]');settingsTab.dataset.dirty=String(dirty);settingsTab.setAttribute('aria-label',dirty?'设置，有未保存的更改':'设置');
   $('reset-settings').hidden=!dirty;$('reset-settings').disabled=formLocked;
   $('retry-shortcut').hidden=!snapshot?.settings?.shortcut||snapshot?.shortcutStatus?.statuses?.current?.registered===true;$('retry-shortcut').disabled=formLocked||dirty;
  $('save-settings').disabled=formLocked||busy()||!dirty;$('test-model').disabled=formLocked||busy()||dirty;$('refresh-devices').disabled=formLocked;
  $('cancel-test').hidden=!testing;
  $('new-word').disabled=wordsLocked;for(const button of $('word-list').querySelectorAll('button'))button.disabled=wordsLocked;
  $('save-word').disabled=wordBusy||wordsLocked;$('cancel-word').disabled=wordBusy;$('word-input').disabled=wordBusy||wordsLocked;$('word-aliases').disabled=wordBusy||wordsLocked;$('undo-word').disabled=wordBusy||wordsLocked;
   const capture=model.captureView(snapshot),session=model.sessionView(snapshot),modal=!!document.querySelector('dialog[open]');$('capture-label').textContent=capture.label;$('capture-toggle').disabled=capture.disabled||capturePending||saving||testing||wordBusy||copying||modal;$('capture-toggle').dataset.active=String(capture.action==='stop');$('capture-cancel').hidden=!capture.cancel;$('capture-cancel').disabled=capturePending||saving||modal;$('capture-cancel').textContent=session.cancelLabel;$('capture-cancel').title=snapshot?.canUseOriginal?'结束整理并保留完整识别原文；已发出的请求仍可能计费。':'取消本次听写';
  const previousBusy=busy()&&snapshot?.recentResult?.id!==snapshot?.state?.sessionId;for(const id of ['copy-original','restore-original','undo-text','undo-corrections'])$(id).disabled=locked||previousBusy;
  $('copy-result').disabled=locked||previousBusy||copying||!snapshot?.recentResult||!$('result-content').value?.trim();$('copy-result').textContent=copying?'复制中…':copyAck?.id===snapshot?.recentResult?.id&&copyAck?.revision===(snapshot?.recentResult?.revision||1)?'已复制':'复制文字';$('copy-result').setAttribute('aria-busy',String(copying));
  $('append-result').disabled=locked||busy()||capturePending||!snapshot?.recentResult?.text?.trim()||snapshot?.recovery?.tailPending===true;
  if(saving||!$('save-message').classList.contains('error'))$('save-message').textContent=saving?'正在保存…':dirty&&busy()?'任务结束后可保存':dirty?'有未保存的更改':$('save-message').dataset.saved==='true'?'已保存':'';
  $('save-message').tabIndex=$('save-message').classList.contains('error')?0:-1;$('save-settings').textContent=$('save-message').classList.contains('error')?'重试保存':'保存更改';
  microphoneHint();
 }
 function usage(result){
  const recent=Array.isArray(snapshot.usage?.recent)?snapshot.usage.recent:[],attempts=recent.filter(item=>item.operationId===result.id&&item.kind==='refiner');
  const node=$('usage-detail');node.replaceChildren();
  if(!attempts.length){node.textContent=result.refined?'用量未报告，费用未知。':'没有本次调用记录。';return;}
  const entry=attempts.at(-1),u=entry.usage||{},value=x=>x===null||x===undefined?'未知':String(x);
  const line=document.createElement('p');line.textContent='输入 '+value(u.input)+' │ 输出 '+value(u.output)+' │ 合计 '+value(u.total);node.append(line);
  const cost=document.createElement('p');cost.textContent=entry.estimate?.picoUnits===null||entry.estimate?.picoUnits===undefined?'费用未知':window.TokenUsage.formatMoney(entry.estimate.picoUnits,entry.estimate.currency);node.append(cost);
  if(snapshot.usage?.available===false){const error=document.createElement('p');error.className='error';error.textContent='用量账本当前不可读，原文件保持不变。';node.append(error);}
 }
 let editorId=null,editorRevision=0,editorDirty=false,editorVersion=0,editorTimer=null,editorFlight=null,editorError='',composition=false;
 async function flushEditor(claim=false){
  if(editorTimer!==null){clearTimeout(editorTimer);editorTimer=null;}
  if(composition)throw Error('请先完成中文输入，文字仍保留。');
  if(editorFlight){await editorFlight;if(editorDirty)return flushEditor(claim);return;}
  if(!editorDirty||!editorId||!bridge.updateResult)return;
  const id=editorId,text=$('result-content').value,version=editorVersion,expectedRevision=editorRevision;
  editorFlight=(async()=>{
   try{const next=await bridge.updateResult({id,expectedRevision,text,...claim?{editing:true}:{}});const r=next?.recentResult;
    if(editorId===id){if(r?.id===id)editorRevision=r.revision||1;if(version===editorVersion)editorDirty=false;editorError='';accept(next);}
   }catch(error){if(snapshot?.recentResult?.id===id)editorRevision=snapshot.recentResult.revision||editorRevision;editorDirty=true;editorError=failure(error,'修改暂未保存，请先复制。');showEditState();throw error;}
  })();
  try{await editorFlight;}finally{editorFlight=null;}
  if(editorDirty&&!composition){editorTimer=setTimeout(()=>void flushEditor().catch(()=>{}),400);}
 }
 function showEditState(){const node=$('edit-state');node.hidden=!editorError;node.textContent=editorError;}
 function claimComposingEditor(){
  if(editorFlight||!snapshot?.canUseOriginal||snapshot.recentResult?.id!==editorId)return;
  const id=editorId,expectedRevision=editorRevision,text=snapshot.recentResult.text;
  editorFlight=Promise.resolve(bridge.updateResult({id,expectedRevision,text,editing:true})).then(next=>{
   if(editorId===id){editorRevision=Math.max(editorRevision,next?.recentResult?.revision||1);accept(next);}
  }).catch(error=>{editorError=failure(error,'修改暂未保存，请先完成输入。');showEditState();}).finally(()=>{editorFlight=null;});
 }
 function confirmAction(title,description,apply){
  const dialog=$('confirm-dialog');if(dialog.open)return;$('confirm-title').textContent=title;$('confirm-description').textContent=description;dialog.showModal();
  const cancel=()=>{dialog.close();cleanup();},run=async()=>{dialog.close();cleanup();try{await apply();}catch(error){toast(failure(error,'操作未完成，请重试。'));}};
  const cleanup=()=>{$('confirm-keep').removeEventListener('click',cancel);$('confirm-apply').removeEventListener('click',run);dialog.removeEventListener('cancel',cancel);};
  $('confirm-keep').addEventListener('click',cancel);$('confirm-apply').addEventListener('click',run);dialog.addEventListener('cancel',cancel,{once:true});$('confirm-keep').focus();
 }
 function renderResult(){
  const delivery=snapshot.state.delivery;$('delivery-message').hidden=!delivery||delivery.status==='manual';$('delivery-message').textContent=delivery?.message||'';
  const task=model.sessionView(snapshot);$('task-status').hidden=!task.active;$('task-status-title').textContent=task.title;$('task-status-detail').textContent=task.detail;
  const steps=['recording','recognition','cleanup'],current=steps.indexOf(task.step);for(const step of $('task-status').querySelectorAll('[data-step]')){const index=steps.indexOf(step.dataset.step);step.hidden=true;step.dataset.complete=String(index<current);if(index===current)step.setAttribute('aria-current','step');else step.removeAttribute('aria-current');}
  const r=snapshot.recentResult;$('result-content').dataset.resultId=r?.id||'';$('result-content').dataset.revision=String(r?.revision||1);const view=model.resultView(r,busy(),snapshot.state.sessionId);$('shortcut-guide').hidden=!view.showShortcut||busy();$('effective-shortcut').textContent=model.effectiveShortcut(snapshot);const hasShortcut=snapshot?.shortcutStatus?.statuses?.current?.registered===true;$('effective-shortcut').hidden=!hasShortcut;$('shortcut-prefix').textContent=hasShortcut?'按':'';$('shortcut-suffix').textContent=hasShortcut?'开始说话，再按一次结束':'';$('empty-result').hidden=!!r||busy();$('result-content').hidden=!r;$('result-details').hidden=!r;$('usage-details').hidden=!r;$('setup-shortcut').hidden=hasShortcut;$('empty-start').disabled=model.captureView(snapshot).disabled;$('undo-text').hidden=typeof r?.previousText!=='string';$('retry-cleanup').hidden=!snapshot.canRetryCleanup||!/整理未完成|整理失败|超时/.test(r?.message||'');const changes=r?.corrections||[];$('correction-details').hidden=!changes.length;$('correction-summary').textContent=(['restored','manual'].includes(r?.source)?'词典纠正记录：':'词典已纠正 ')+changes.length+' 处';$('correction-list').replaceChildren(...changes.map(change=>{const li=document.createElement('li');li.textContent=change.from+' → '+change.to;return li;}));
  const recovery=snapshot.recovery;$('recovery-strip').hidden=!recovery;$('recovery-message').textContent=recovery?(recovery.reason==='cancelled'?'已取消，本段仅在内存保留30秒。':'本段识别失败，录音仅在内存保留5分钟。'):'';$('retry-segment').textContent=recovery?.reason==='cancelled'?'恢复本段识别':'重试本段';
  if(!r){$('result-content').value='';$('result-content').textContent='';$('result-message').textContent='';$('recent-time').textContent='';return;}
  const signature=JSON.stringify([r.id,view.text]);if(editorId!==r.id){editorId=r.id;editorRevision=r.revision||1;editorDirty=false;editorError='';$('result-content').value=view.text;$('result-content').textContent=view.text;}else if(!editorDirty&&!editorFlight&&!composition){editorRevision=r.revision||1;if($('result-content').value!==view.text)$('result-content').value=view.text;$('result-content').textContent=view.text;}showEditState();$('original-text').textContent=r.original||'';if(signature!==resultSignature){resultSignature=signature;motion?.respond($('result-content'));}
  $('result-message').classList.toggle('warning',view.warning);$('result-message').textContent=snapshot.state.phase==='error'&&snapshot.state.message?snapshot.state.message:view.message;$('result-content').readOnly=deliveryPending()||busy()&&(r.id!==snapshot.state.sessionId||!!snapshot.state.pipeline&&(!snapshot.state.pipeline.sealed||snapshot.state.pipeline.pending>0));
  $('recent-time').textContent=view.metadata;usage(r);
 }
 function renderWords(){
  const words=Array.isArray(snapshot.dictionary)?snapshot.dictionary:[],query=$('word-search').value.trim().toLocaleLowerCase(),signature=JSON.stringify([words,query]);$('clear-word-search').hidden=!$('word-search').value;
  $('word-count').textContent=String(words.length);if(signature===wordSignature)return;wordSignature=signature;
  const previous=document.activeElement,row=previous?.closest?.('[data-word-id]'),focus=row?{id:row.dataset.wordId,action:previous.dataset.wordAction}:null,list=$('word-list'),existing=new Map([...list.children].map(node=>[node.dataset.wordId,node])),before=new Map([...list.children].map(node=>[node.dataset.wordId,node.getBoundingClientRect().top]));
  const filtered=words.filter(word=>[word.word,...(word.aliases||[])].some(value=>value.toLocaleLowerCase().includes(query))),kept=new Set(filtered.map(word=>word.id)),allIds=new Set(words.map(word=>word.id));$('empty-words').hidden=filtered.length>0;$('empty-words').textContent=query?'没有匹配的词语。':'添加常用人名、产品名和术语。';
  for(const [id,node]of existing)if(!kept.has(id)){if(!allIds.has(id))motion?.retire(node);node.remove();}
  let position=0;
  for(const word of filtered){
   let item=existing.get(word.id),created=!item;
   if(created){item=document.createElement('div');item.className='word-row';item.dataset.wordId=word.id;item.setAttribute('role','listitem');const title=document.createElement('span');title.className='word-title';const aliases=document.createElement('small');aliases.className='word-aliases';const actions=document.createElement('div');actions.className='word-actions';const edit=document.createElement('button');edit.type='button';edit.textContent='编辑';edit.dataset.wordAction='edit';edit.addEventListener('click',()=>openWord(item.wordData,edit));const remove=document.createElement('button');remove.type='button';remove.textContent='删除';remove.className='delete';remove.dataset.wordAction='delete';remove.addEventListener('click',()=>void removeWord(item.wordData.id));actions.append(edit,remove);const wording=document.createElement('div');wording.className='word-wording';wording.append(title,aliases);item.append(wording,actions);}
   item.wordData=word;const title=item.querySelector('.word-title');if(title.textContent!==word.word)title.textContent=word.word;item.querySelector('.word-aliases').textContent=word.aliases?.length?word.aliases.join('、')+' → '+word.word:'英文大小写参考';item.querySelector('[data-word-action=edit]').setAttribute('aria-label','编辑 '+word.word);item.querySelector('[data-word-action=delete]').setAttribute('aria-label','删除 '+word.word);
   if(list.children[position]!==item)list.insertBefore(item,list.children[position]||null);if(position<40){if(created)motion?.enter(item);else motion?.reflow(item,before.get(word.id));}position++;
  }
  if(focus&&!wordBusy&&document.activeElement!==previous&&!document.querySelector('dialog[open]')){
   const targetRow=[...$('word-list').children].find(node=>node.dataset.wordId===focus.id),target=targetRow?.querySelector('[data-word-action="'+focus.action+'"]')||$('word-search');
   if(document.activeElement===document.body||!document.activeElement)target.focus({preventScroll:true});
  }
 }
 function accept(data){
  if(!data?.state||!data.settings)return;const previousId=snapshot?.recentResult?.id,previousRevision=snapshot?.recentResult?.revision||1,wasBusy=busy();snapshot=data;version++;if(previousId!==data.recentResult?.id||previousRevision!==(data.recentResult?.revision||1)||(!wasBusy&&busy()))resetCopy();if(editorId===data.recentResult?.id)editorRevision=Math.max(editorRevision,data.recentResult.revision||1);if(!wasBusy&&busy())clearToast(toastOwner);
  if(!initial||(!dirty&&!saving)){initial=savedForm(data);setForm(initial);}
  const phase=data.state.phase;$('session-status').textContent=phase==='recording'?'正在录音':ACTIVE.has(phase)?'正在处理':model.engineStatus(data);
  $('copy-shortcut-message').textContent=data.shortcutStatus?.suspended?'录入中，复制快捷键已暂停':data.shortcutStatus?.statuses?.copy?.registered?'已启用':data.settings.copyShortcut?'未生效':'未设置，不占用系统组合';
  const provider=data.settings.refiner;$('provider-summary').textContent=provider.model||'未配置';$('provider-summary').title=$('provider-summary').textContent;
  const notices=[...(data.notices||[]),...(data.usage?.available===false?['用量账本当前不可读，原文件保持不变；用量与费用未知。']:[]),...(phase==='error'||phase==='cancelled'&&!data.recovery?[data.state.message]:[]),...(data.state.operationFeedback?[data.state.operationFeedback]:[]),...(dirty&&busy()?['本次听写使用已保存的设置，草稿仍保留。']:[])].filter(Boolean);$('notice').hidden=!notices.length;$('notice').textContent=notices.join(' ');
  $('key-message').textContent=data.secureStorage!==true?'系统安全存储当前不可用；原配置保留，新密钥只能用于本次会话。':data.keyStatus?.hasKey?'已有可用密钥，留空保持。':'未设置密钥；本地匿名模型服务可不填。';
  $('shortcut-message').textContent=data.shortcutStatus?.suspended?'录入中，听写快捷键已暂停':data.shortcutStatus?.statuses?.current?.registered===true?'已启用':data.settings.shortcut?'未生效':'未设置';renderResult();renderWords();sync();
  if(data.requestedView!==lastRequested){lastRequested=data.requestedView;if(lastRequested)setPage(lastRequested);}
 }
 async function devices(){
  if(!navigator.mediaDevices?.enumerateDevices)return;
  const revision=++deviceRevision;
  deviceFeedback='正在读取设备列表…';microphoneHint();
  try{const entries=await navigator.mediaDevices.enumerateDevices();if(revision!==deviceRevision)return;const selected=$('microphone').value;
   const inputs=entries.filter(item=>item.kind==='audioinput'),defaultName=(inputs.find(device=>device.deviceId==='default')?.label||'').replace(/^(?:(?:default|默认(?:设备)?)\s*[-–—:：]\s*)+/i,'').trim();
   const fragment=document.createDocumentFragment(),def=document.createElement('option');def.value='';def.textContent=defaultName?'系统默认 · '+defaultName:'系统默认麦克风';fragment.append(def);let count=0;
   for(const device of inputs){if(device.deviceId==='default'&&selected!=='default')continue;const option=document.createElement('option');option.value=device.deviceId;option.textContent=device.label||'麦克风 '+(++count);fragment.append(option);}
   if(selected&&![...fragment.children].some(node=>node.value===selected)){const option=document.createElement('option');option.value=selected;option.textContent='已选择的麦克风（当前未找到）';fragment.append(option);}
   deviceInputs=new Set(inputs.map(device=>device.deviceId));deviceFeedback='';$('microphone').replaceChildren(fragment);$('microphone').value=selected;microphoneHint();
  }catch{if(revision===deviceRevision){deviceFeedback='无法读取设备列表；已保留当前选择。';microphoneHint();}}
 }
 function openWord(word,opener){
  if(!snapshot||wordBusy)return;const query=$('word-search').value.trim(),missing=query&&!(snapshot.dictionary||[]).some(entry=>entry.word.toLocaleLowerCase().includes(query.toLocaleLowerCase()));wordId=word?.id||null;wordOpener=opener;$('word-dialog-title').textContent=word?'编辑词语':'添加词语';$('word-input').value=word?.word||(!word&&missing?query:'');$('word-aliases').value=(word?.aliases||[]).join('\n');$('word-error').textContent='';$('word-input').removeAttribute('aria-invalid');$('word-dialog').showModal();sync();$('word-input').focus();
 }
 function closeWord(){
  // Re-enable the opener before native close restores focus after a completed save.
  if(wordBusy)return;sync();motion?.retireDialog($('word-dialog'));$('word-dialog').close();sync();const opener=wordOpener;wordOpener=null;
  queueMicrotask(()=>{if(document.activeElement!==document.body&&document.activeElement?.tagName==='INPUT')return;const target=opener?.isConnected?opener:$('new-word');target.focus({preventScroll:true});});
 }
 async function removeWord(id){
  if(wordBusy)return;const owned=document.activeElement.closest?.('[data-word-id]')?.dataset.wordId===id;let removed=false;wordBusy=true;sync();
  try{const next=await bridge.removeWord(id);accept(next);undoEntryId=id;clearToast(toastOwner);showUndo(next.operation);removed=true;}catch(error){toast(failure(error,'删除未完成，词语仍保留，请重试。'));}finally{wordBusy=false;sync();if(owned){const row=[...$('word-list').children].find(node=>node.dataset.wordId===id);restoreFocus(removed?$('undo-word'):row?.querySelector('[data-word-action=delete]'),'dictionary');}}
 }
 for(const button of document.querySelectorAll('[data-page]'))button.addEventListener('click',async()=>{try{await flushEditor();setPage(button.dataset.page);}catch{toast('修改暂未保存，已保留当前文字，请先复制。');}});
 $('word-search').addEventListener('input',()=>{if(snapshot){renderWords();sync();}});
 $('clear-word-search').addEventListener('click',()=>{$('word-search').value='';renderWords();sync();$('word-search').focus({preventScroll:true});});
 $('new-word').addEventListener('click',event=>openWord(null,event.currentTarget));$('cancel-word').addEventListener('click',closeWord);
 $('word-dialog').addEventListener('cancel',event=>{event.preventDefault();closeWord();});
 $('word-form').addEventListener('submit',async event=>{
  event.preventDefault();if(wordBusy)return;const word=$('word-input').value.trim();if(!word){$('word-error').textContent='请输入词语。';return;}
  const duplicate=model.duplicateWord(snapshot.dictionary,word,wordId);if(duplicate){$('word-error').textContent='已有“'+duplicate.word+'”，请编辑现有词语。';$('word-input').setAttribute('aria-invalid','true');$('word-input').focus();return;}
  wordBusy=true;sync();try{const next=await bridge.upsertWord({...wordId?{id:wordId}:{},word,aliases:$('word-aliases').value.split(/\r?\n/).map(value=>value.trim()).filter(Boolean)});accept(next);wordBusy=false;closeWord();}catch(error){$('word-error').textContent=failure(error,'词语未保存，草稿仍保留，请重试。');$('word-input').setAttribute('aria-invalid','true');queueMicrotask(()=>{if($('word-dialog').open)$('word-input').focus();});}finally{wordBusy=false;sync();}
 });
 $('undo-word').addEventListener('click',async()=>{
  if(!undoToken||wordBusy)return;const owned=document.activeElement===$('undo-word'),id=undoEntryId;let restored=false;wordBusy=true;sync();try{const next=await bridge.undoWord(undoToken);accept(next);undoToken=null;$('word-undo').hidden=true;toast('已恢复词语。',{kind:'word-restored'},2200);restored=true;}catch(error){toast(failure(error,'未能恢复，仍可重试撤销。'));}finally{wordBusy=false;sync();if(owned){const row=[...$('word-list').children].find(node=>node.dataset.wordId===id);restoreFocus(restored?row?.querySelector('[data-word-action=edit]'):$('undo-word'),'dictionary',$('undo-word'));}}
 });
 $('word-input').addEventListener('input',()=>{$('word-error').textContent='';$('word-input').removeAttribute('aria-invalid');});
 $('dismiss-undo').addEventListener('click',()=>{$('word-undo').hidden=true;});
 $('dismiss-toast').addEventListener('click',()=>clearToast(toastOwner));
 $('settings-form').addEventListener('invalid',event=>{event.preventDefault();const field=event.target;if(field.closest('#provider-fields'))$('provider-details').open=true;const label=field.id==='model-url'?'API 地址':'设置字段',message='请检查'+label+'，草稿仍保留。';saveError(message,message);if(field.id==='model-url'){$('model-url-error').hidden=false;$('model-url-error').textContent='请输入完整地址，例如 https://example.com/v1。';}field.setAttribute('aria-invalid','true');queueMicrotask(()=>field.focus());},true);
 $('settings-form').addEventListener('input',event=>{if(!initial||saving)return;clearSaveError();event.target.removeAttribute('aria-invalid');dirty=Object.keys(model.draftPatch(initial,form())).length>0;$('save-message').dataset.saved='false';sync();});
 $('save-error-link').addEventListener('click',()=>{$('save-error-report').open=true;$('save-error-report').scrollIntoView({block:'start'});$('save-error-report').querySelector('summary').focus({preventScroll:true});});
 $('refresh-devices').addEventListener('click',()=>void devices());
 $('settings-form').addEventListener('submit',async event=>{
  event.preventDefault();if(!dirty||saving||busy()||testing)return;await applySettings(model.draftPatch(initial,form()));
 });
 async function applySettings(patch,retry=false){
  const focused=document.activeElement;saving=true;sync();
  try{const next=await bridge.saveSettings(patch);saving=false;dirty=false;initial=null;clearSaveError();accept(next);$('save-message').dataset.saved='true';sync();}
  catch(error){saving=false;sync();saveError(failure(error,'保存失败，草稿仍保留，请重试。'),retry?'快捷键未启用，可重试或换组合。':undefined);if(patch.refiner&&Object.keys(patch.refiner).some(key=>['baseUrl','model','key','persistKey','clearKey'].includes(key))){$('provider-details').open=true;const target=Object.hasOwn(patch.refiner,'key')?$('model-key'):Object.hasOwn(patch.refiner,'model')?$('model-name'):$('model-url');target.focus();target.scrollIntoView({block:'nearest'});}else $('save-error-report').scrollIntoView({block:'start'});sync();}
  restoreFocus(retry?$('shortcut'):focused,'settings',focused);
 }
 $('retry-shortcut').addEventListener('click',async()=>{if(dirty||saving||testing||busy()||snapshot?.dataWritable?.settings===false||!snapshot?.settings.shortcut)return;await applySettings({shortcut:snapshot.settings.shortcut},true);});
 $('reset-settings').addEventListener('click',()=>confirmDiscard('settings'));
 $('test-model').addEventListener('click',async()=>{
  if(testing||dirty||saving||busy())return;testing=true;sync();$('test-message').textContent='正在测试已保存模型…';
  try{const result=await bridge.checkTextService();$('test-message').textContent=result.message||'测试已结束，请核对服务状态。';}catch(error){$('test-message').textContent=failure(error,'测试未完成，请检查模型设置后重试。');}finally{testing=false;sync();}
 });
 $('cancel-test').addEventListener('click',async()=>{try{await bridge.cancelTextCheck();$('test-message').textContent='已请求取消；服务端仍可能计费。';}catch{ $('test-message').textContent='取消未确认，请等待测试结束。';}});
 async function captureAction(cancel=false){
  if(capturePending||!snapshot)return;const view=model.captureView(snapshot),method=cancel?'cancel':view.action,sessionId=snapshot.state.sessionId;
  if(cancel?!view.cancel:view.disabled||!method)return;
  capturePending=true;sync();
  try{if(method==='start'){await flushEditor();if(microphoneChanged()){setPage('settings');sync();toast('麦克风尚未生效，请先保存更改。',{kind:'microphone-draft'});if(!$('save-settings').disabled)$('save-settings').focus({preventScroll:true});return;}if(snapshot.recovery){const token=snapshot.recovery.token;confirmAction('开始新的听写？','上一段临时录音将被清除，已有文字仍保留。',async()=>{await bridge.start({discardRecoveryToken:token});});return;}}const response=await(method==='start'?bridge.start():bridge[method]({sessionId}));if(response?.accepted===false&&!busy())toast('状态已变化，请重新开始听写。');}
  catch(error){if(method==='start'?!busy():snapshot.state.sessionId===sessionId)toast(failure(error,'操作未确认，请重试。'));}
  finally{capturePending=false;sync();}
 }
 $('capture-toggle').addEventListener('click',()=>void captureAction());$('capture-cancel').addEventListener('click',()=>void captureAction(true));
 $('append-result').addEventListener('click',async()=>{
  if(busy()||deliveryPending()||capturePending||!snapshot?.recentResult)return;
  try{await flushEditor();if(microphoneChanged()){setPage('settings');toast('麦克风尚未生效，请先保存更改。');return;}
   const r=snapshot.recentResult,run=async()=>{capturePending=true;sync();try{const answer=await bridge.start({appendTo:r.id,expectedRevision:r.revision||1,...snapshot.recovery?{discardRecoveryToken:snapshot.recovery.token}:{}});if(answer?.accepted===false)toast('上一段仍在结束，请稍候再追加。');}finally{capturePending=false;sync();}};
   if(snapshot.recovery)confirmAction('继续追加？','未处理的临时录音将清除，已有文字仍保留。',run);else await run();
  }catch(error){toast(failure(error,'追加未开始，已有文字仍保留。'));}
 });
 async function copyCurrent(source){
  const id=snapshot?.recentResult?.id;if(!id||copying||busy()&&id!==snapshot.state.sessionId)return;const localVersion=editorVersion;copying=true;sync();
  try{try{await flushEditor();}catch(error){if(snapshot?.recentResult?.id!==id||snapshot.recentResult.text!==$('result-content').value)throw error;}const r=snapshot.recentResult;const ack=await bridge.copyResult({id,expectedRevision:r.revision||1,...source?{source}:{}});if(ack?.ok&&snapshot.recentResult?.id===id&&(snapshot.recentResult.revision||1)===ack.revision&&editorVersion===localVersion){copyAck=source?null:{id,revision:ack.revision};toast(source?'已复制识别原文。':'已复制，请自行粘贴。',{kind:'copy',id},2200);}}
  catch(error){toast(failure(error,'复制未完成，文字仍保留，请重试。'));}finally{copying=false;sync();}
 }
 $('copy-result').addEventListener('click',()=>void copyCurrent());$('retry-cleanup').addEventListener('click',()=>confirmAction('重新轻整理？','会发送当前识别文字，可能计费；本次只请求一次。',async()=>{await flushEditor();const r=snapshot.recentResult;accept(await bridge.retryCleanup({id:r.id,expectedRevision:r.revision||1}));}));$('undo-corrections').addEventListener('click',()=>confirmAction('撤销词典纠正？','恢复未经词典纠正的识别原文，当前稿可撤销恢复。',()=>restoreText('original')));$('copy-original').addEventListener('click',()=>void copyCurrent('original'));
 async function restoreText(source){await flushEditor();const r=snapshot.recentResult;if(!r)return;const next=await bridge.restoreResult({id:r.id,expectedRevision:r.revision||1,source});accept(next);}
 $('restore-original').addEventListener('click',()=>confirmAction('还原识别原文？','当前稿会保留为可撤销的上一稿。',()=>restoreText('original')));
 $('undo-text').addEventListener('click',()=>void restoreText('previous').catch(error=>toast(failure(error,'未能撤销，文字仍保留。'))));
 $('retry-segment').addEventListener('click',async()=>{const token=snapshot.recovery?.token;if(!token)return;try{accept(await bridge.retryRecovery({token}));}catch(error){toast(failure(error,'本段未能恢复，请重试。'));}});
 $('clear-segment').addEventListener('click',async()=>{const token=snapshot.recovery?.token;if(!token)return;try{accept(await bridge.discardRecovery({token}));}catch(error){toast(failure(error,'清除未确认，请重试。'));}});
 $('empty-start').addEventListener('click',()=>void captureAction());$('setup-shortcut').addEventListener('click',()=>{setPage('settings');$('shortcut').focus();});
 $('result-content').addEventListener('compositionstart',()=>{composition=true;});$('result-content').addEventListener('compositionend',()=>{composition=false;editorTimer=setTimeout(()=>void flushEditor().catch(()=>{}),400);});
 $('result-content').addEventListener('input',()=>{if(!editorId||$('result-content').readOnly)return;const first=!editorDirty;editorDirty=true;editorVersion++;copyAck=null;if(editorTimer!==null)clearTimeout(editorTimer);sync();if(first&&snapshot.canUseOriginal){if(composition)claimComposingEditor();else void flushEditor(true).catch(()=>{});}else if(!composition)editorTimer=setTimeout(()=>void flushEditor().catch(()=>{}),400);});
 for(const id of ['shortcut','copy-shortcut'])$(id).addEventListener('keydown',event=>{if(event.key==='Tab')return;event.preventDefault();if(event.key==='Escape'){event.currentTarget.blur();return;}const key=model.acceleratorForKey(event);if(key){event.currentTarget.value=key;event.currentTarget.dispatchEvent(new Event('input',{bubbles:true}));}});
 for(const id of ['shortcut','copy-shortcut']){
  $(id).addEventListener('focus',()=>void bridge.setShortcutRecording?.({active:true}).then(accept).catch(error=>toast(failure(error,'快捷键录入未就绪，请先离开此输入框。'))));
  $(id).addEventListener('blur',()=>queueMicrotask(()=>{if(!['shortcut','copy-shortcut'].includes(document.activeElement?.id))void bridge.setShortcutRecording?.({active:false}).then(accept).catch(error=>toast(failure(error,'快捷键恢复未确认，请检查状态。')));}));
 }
 $('clear-copy-shortcut').addEventListener('click',()=>{$('copy-shortcut').value='';$('copy-shortcut').dispatchEvent(new Event('input',{bubbles:true}));});
 $('keep-editing').addEventListener('click',()=>{motion?.retireDialog($('draft-dialog'));$('draft-dialog').close();sync();discardFocus?.focus({preventScroll:true});discardFocus=null;});
 $('discard-draft').addEventListener('click',()=>{motion?.retireDialog($('draft-dialog'));$('draft-dialog').close();dirty=false;clearSaveError();initial=savedForm(snapshot);setForm(initial);$('save-message').dataset.saved='false';sync();setPage(discardDestination);discardFocus=null;if(discardDestination==='settings')$('shortcut').focus({preventScroll:true});});
 $('draft-dialog').addEventListener('cancel',event=>{event.preventDefault();$('keep-editing').click();});
 document.addEventListener('keydown',event=>{
  if(event.defaultPrevented||event.isComposing||composition)return;const modal=!!document.querySelector('dialog[open]');if((event.ctrlKey||event.metaKey)&&event.key==='Enter'&&page==='recent'&&!modal&&!event.repeat){event.preventDefault();void copyCurrent();return;}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'&&page==='settings'&&!modal){event.preventDefault();if(!event.repeat&&dirty&&!saving&&!testing&&!busy())$('settings-form').requestSubmit();return;}
  if(event.key==='Escape'&&!event.repeat&&!modal&&page==='settings'&&dirty&&!saving){event.preventDefault();confirmDiscard('recent');}
 });
 let capture=null;
 if(window.DictationCapture&&window.LocalAudio)capture=window.DictationCapture.createCapture({bridge,mediaDevices:navigator.mediaDevices,Recorder:window.MediaRecorder,decode:window.LocalAudio.decode,AudioContextClass:window.AudioContext,requestFrame:callback=>requestAnimationFrame(callback),cancelFrame:id=>cancelAnimationFrame(id)});
 sync();bridge.onState(accept);bridge.onCommand(async command=>{if(command.type==='flush-editor'){let ok=true;try{await flushEditor();}catch{ok=false;}await bridge.editorFlushed?.({token:command.token,ok});return;}if(command.type==='start')try{await flushEditor();}catch{await bridge.cancel({sessionId:command.sessionId});toast('上一段修改尚未保存，请先复制或重试保存。');return;}if(capture)void capture.command(command);});const initialVersion=version;
 Promise.resolve(bridge.getSnapshot()).then(data=>{if(version===initialVersion)accept(data);}).catch(()=>{$('notice').hidden=false;$('notice').textContent='无法连接桌面程序，请从托盘重新打开。';});
 for(const details of document.querySelectorAll('details'))details.addEventListener('toggle',()=>{if(details.open)motion?.enter(details.querySelector('.details-body'));});
 const resize=new ResizeObserver(alignScroll);resize.observe($('content'));alignScroll();window.addEventListener('beforeunload',()=>{void flushEditor().catch(()=>{});if(editorTimer!==null)clearTimeout(editorTimer);if(copyTimer!==null)clearTimeout(copyTimer);if(toastTimer!==null)clearTimeout(toastTimer);resize.disconnect();motion?.dispose();capture?.dispose();});
})();
