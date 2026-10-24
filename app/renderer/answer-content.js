'use strict';
(() => {
 const TASK_LABELS=Object.freeze({ask:'回答',write:'草稿',shorten:'精简结果',expand:'扩写结果',rewrite:'改写结果',translate:'翻译结果',explain:'回答'});
 const SOURCE_LIMITS=Object.freeze({sources:20,citations:100,ids:20,groups:100,references:512,id:128,title:500,hostname:253});
 function sourceText(value,limit){
  if(typeof value!=='string')return '';
  let text=value.slice(0,limit).replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,' ').trim();
  if(/[\ud800-\udbff]$/.test(text))text=text.slice(0,-1);
  return text;
 }
 const LEGACY_IDS=Object.freeze({'task-label':'card-task-label',close:'close-answer-card',scroll:'card-scroll',request:'card-request','request-label':'card-request-label','request-content':'card-request-content',question:'card-question','context-wrap':'card-context-wrap','context-separator':'card-context-separator',context:'card-context','toggle-request':'toggle-card-request','response-label':'card-response-label',answer:'card-answer',error:'card-error'});
 // Static, independently authored markup only. Payload text is always assigned
 // with textContent, never interpolated into markup, attributes or URLs.
 const MARKUP=`
  <header class="answer-content-header"><strong data-answer="task-label">本地听写 · 回答</strong><button type="button" data-answer="close" aria-label="关闭回答">关闭 ×</button></header>
  <div data-answer="scroll">
   <section data-answer="request" class="answer-content-request">
    <div class="answer-content-section-label"><span data-answer="request-label">你的请求</span><button type="button" data-copy="request">复制请求</button></div>
    <div data-answer="request-content" data-expanded="false" tabindex="-1"><span data-answer="question"></span><span data-answer="context-wrap" hidden><span data-answer="context-separator" aria-hidden="true"></span><span data-answer="context"></span></span></div>
    <button type="button" data-answer="toggle-request" class="answer-content-toggle" aria-expanded="false" hidden>展开请求</button>
   </section>
   <section class="answer-content-response">
    <div class="answer-content-section-label"><span data-answer="response-label">回答</span><button type="button" data-copy="answer">复制回答</button></div>
    <div data-answer="answer" tabindex="0"></div>
   </section>
  </div>
  <p data-answer="error" role="status" aria-live="polite" hidden></p>
  <footer class="answer-content-footer">模型内容请自行核对 · 复制保留原文标记 · 不自动执行链接或命令</footer>`;
 function create(root,callbacks={},options={}) {
  if(!root||root.nodeType!==1)throw new TypeError('Answer content needs a root element');
  const doc=root.ownerDocument,view=doc.defaultView,embedded=options.embedded===true;
  const prefix='answer-content-'+(view.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
  root.classList.add('answer-content');root.dataset.answerHost=embedded?'embedded':'standalone';
  root.innerHTML=MARKUP;root.dataset.ready='false';root.setAttribute('aria-busy','true');
  const $=name=>root.querySelector('[data-answer="'+name+'"]');
  for(const [name,id]of Object.entries(LEGACY_IDS))$(name).id=embedded?prefix+'-'+name:id;
  root.setAttribute('aria-labelledby',$('task-label').id);
  $('request').setAttribute('aria-labelledby',$('request-label').id);
  root.querySelector('.answer-content-response').setAttribute('aria-labelledby',$('response-label').id);
  $('toggle-request').setAttribute('aria-controls',$('request-content').id);
  const request=$('request-content'),toggle=$('toggle-request'),scroll=$('scroll'),closeButton=$('close'),copyButtons=[...root.querySelectorAll('[data-copy]')];
  const theme=view.matchMedia?.('(prefers-color-scheme: dark)'),copyStates=new Map(),sourceButtons=new Map(),sourceOperations=new Map(),sourceDetails=new Map();
  let payload=null,observer=null,frame=null,disposed=false,revision=0,lastHeight=null,expanded=false,closing=false;
  let revealTimer=null,fallbackTimer=null,feedbackOwner=null,readyRevision=-1;
  let sourceTooltip=null,hoveredSource=null,focusedSource=null,sourceFocusFrame=null;
  const current=(generation,token)=>!disposed&&payload?.generation===generation&&revision===token;
  function showError(message,success=false){$('error').dataset.kind=success?'success':'error';$('error').hidden=!message;$('error').textContent=message||'';}
  function applyTheme(){if(!disposed)root.dataset.theme=payload?.appearance==='dark'||(payload?.appearance==='system'&&theme?.matches)?'dark':'light';}
  function clearReveal(){if(revealTimer!==null)view.clearTimeout(revealTimer);if(fallbackTimer!==null)view.clearTimeout(fallbackTimer);revealTimer=null;fallbackTimer=null;}
  function reveal(generation,token){
   if(!current(generation,token)||readyRevision===token)return;
   clearReveal();root.dataset.ready='true';root.setAttribute('aria-busy','false');readyRevision=token;
   // Hosts can focus controls only after visibility is restored. Mark this
   // revision before invoking the host so reentrant renders remain isolated.
   if(typeof callbacks.ready==='function')try{Promise.resolve(callbacks.ready({generation})).catch(()=>{});}catch{}
  }
  function clearCopies(){for(const state of copyStates.values())if(state.timer!==null)view.clearTimeout(state.timer);copyStates.clear();feedbackOwner=null;}
  function hideSourceTooltip(){
   if(!sourceTooltip)return;
   sourceTooltip.button.removeAttribute('aria-describedby');sourceTooltip.node.remove();sourceTooltip=null;
  }
  function clearSourceTooltip(){hideSourceTooltip();hoveredSource=null;focusedSource=null;if(sourceFocusFrame!==null)view.cancelAnimationFrame(sourceFocusFrame);sourceFocusFrame=null;}
  function positionSourceTooltip(){
   if(!sourceTooltip)return;
   const {node,button,generation,token}=sourceTooltip;
   if(!current(generation,token)||!root.isConnected||!$('answer').contains(button)||button.disabled||button.closest('[hidden]')||root.closest('[hidden]')){clearSourceTooltip();return;}
   const card=root.getBoundingClientRect(),anchor=button.getBoundingClientRect(),scroller=scroll.getBoundingClientRect();
   const left=Math.max(4,card.left+6),right=Math.min(view.innerWidth-4,card.right-6),top=Math.max(4,card.top+6),bottom=Math.min(view.innerHeight-4,card.bottom-6);
   // A scrolled-out citation must not leave a floating label over another line.
   const visibleLeft=Math.max(left,scroller.left),visibleRight=Math.min(right,scroller.right),visibleTop=Math.max(top,scroller.top),visibleBottom=Math.min(bottom,scroller.bottom);
   if(right-left<24||bottom-top<24||anchor.right<=visibleLeft||anchor.left>=visibleRight||anchor.bottom<=visibleTop||anchor.top>=visibleBottom){clearSourceTooltip();return;}
   node.style.maxWidth=Math.min(280,right-left)+'px';node.style.maxHeight=Math.min(126,bottom-top)+'px';
   const size=node.getBoundingClientRect(),width=Math.min(size.width,right-left),height=Math.min(size.height,bottom-top);
   const x=Math.max(left,Math.min(right-width,anchor.left+anchor.width/2-width/2));
   const preferredY=anchor.top-6-height>=top?anchor.top-6-height:anchor.bottom+6;
   node.style.left=x+'px';node.style.top=Math.max(top,Math.min(bottom-height,preferredY))+'px';
  }
  function showSourceTooltip(button){
   const details=sourceDetails.get(button);
   if(!details||disposed||!payload||button.disabled||!$('answer').contains(button))return;
   if(sourceTooltip?.button===button){positionSourceTooltip();return;}
   hideSourceTooltip();
   const node=doc.createElement('span'),title=doc.createElement('span');
   node.className='answer-source-tooltip';node.id=prefix+'-source-tooltip';node.dataset.answerReference='true';node.setAttribute('role','tooltip');
   title.className='answer-source-title';title.textContent=details.title;node.append(title);
   // Stay in this host's modal top layer, outside both content scrollers. The
   // host ancestors do not establish transformed fixed-position containers.
   root.append(node);button.setAttribute('aria-describedby',node.id);
   sourceTooltip={node,button,generation:payload.generation,token:revision};positionSourceTooltip();
  }
  function sourceTarget(event){const button=event.target?.closest?.('button[data-source-action="open"]');return button&&$('answer').contains(button)&&sourceDetails.has(button)?button:null;}
  function sourceHover(event){const button=sourceTarget(event);if(!button||button.contains(event.relatedTarget))return;if(sourceFocusFrame!==null)view.cancelAnimationFrame(sourceFocusFrame);sourceFocusFrame=null;hoveredSource=button;showSourceTooltip(button);}
  function sourceLeave(event){const button=sourceTarget(event);if(!button||button.contains(event.relatedTarget))return;if(hoveredSource===button)hoveredSource=null;if(focusedSource)showSourceTooltip(focusedSource);else hideSourceTooltip();}
  function sourceFocus(event){
   const button=sourceTarget(event);if(!button)return;clearSourceTooltip();focusedSource=button;showSourceTooltip(button);
   // Native keyboard focus may scroll its citation after focusin. One bounded
   // next-frame reveal lets that scroll settle; this is not a hover timer/poll.
   const generation=payload.generation,token=revision,scheduled=view.requestAnimationFrame(()=>{
    if(sourceFocusFrame!==scheduled)return;sourceFocusFrame=null;
    if(!current(generation,token)||doc.activeElement!==button)return;focusedSource=button;showSourceTooltip(button);
   });sourceFocusFrame=scheduled;
  }
  function sourceBlur(event){if(sourceTarget(event))clearSourceTooltip();}
  function sourceKey(event){if(event.key==='Escape')clearSourceTooltip();} // Preserve each host's existing Escape-to-close behavior.
  function sourceScroll(event){const target=event.target;if(target===view||target===doc||(target?.nodeType===1&&(root.contains(target)||target.contains(root)))){if(sourceFocusFrame!==null){hideSourceTooltip();hoveredSource=null;}else clearSourceTooltip();}}
  function renderSources(metadata){
   if(!metadata||metadata.version!==1||!['none','openai','local-v1'].includes(metadata.format)||!Array.isArray(metadata.sources))return;
   const warnings=Array.isArray(metadata.warnings)?metadata.warnings.slice(0,32).filter(code=>typeof code==='string'&&code.length>0&&code.length<=80):[];
   function notice(text){const node=doc.createElement('span');node.className='answer-source-notice';node.dataset.answerReference='true';node.setAttribute('role','note');node.textContent=text;$('answer').append(node);}
   const sources=new Map();
   for(const item of metadata.sources.slice(0,SOURCE_LIMITS.sources)){
    if(!item||typeof item.id!=='string'||!item.id||item.id.length>SOURCE_LIMITS.id||sources.has(item.id))continue;
    const hostname=sourceText(item.hostname,SOURCE_LIMITS.hostname),title=sourceText(item.title,SOURCE_LIMITS.title)||hostname;
    if(!hostname||typeof item.url!=='string'||item.url.length>8192||!/^https?:\/\//i.test(item.url))continue;
    let url;try{url=new view.URL(item.url).href;}catch{continue;}
    sources.set(item.id,{id:item.id,title,hostname,url});
   }
   if(!sources.size){if(warnings.length)notice('服务商来源数据不可用，回答正文已保留');return;}
   const answer=$('answer'),blocks=[...answer.querySelectorAll('[data-source-start][data-source-end]')].slice(0,512).map(node=>({node,start:Number(node.dataset.sourceStart),end:Number(node.dataset.sourceEnd)})).filter(block=>Number.isSafeInteger(block.start)&&Number.isSafeInteger(block.end)&&block.start>=0&&block.end>block.start&&block.end<=payload.answer.length);
   const groups=new Map(),placed=new Set();let referenceCount=0,groupIndex=0;
   // Only local-v1 specifies UTF-16 half-open offsets. Provider offsets whose
   // unit or endpoint semantics are unspecified must remain unplaced.
   for(const citation of (metadata.format==='local-v1'&&Array.isArray(metadata.citations)?metadata.citations:[]).slice(0,SOURCE_LIMITS.citations)){
    if(!citation||!Number.isSafeInteger(citation.start)||!Number.isSafeInteger(citation.end)||citation.start<0||citation.end<=citation.start||citation.end>payload.answer.length||!Array.isArray(citation.sourceIds))continue;
    // end is exclusive: a citation ending on a block boundary belongs to the
    // preceding block. Only original-source spans participate in placement.
    let target=null;
    for(const block of blocks)if(block.start<citation.end&&citation.end<=block.end&&(!target||block.end-block.start<target.end-target.start||(block.end-block.start===target.end-target.start&&block.node.tagName==='LI')))target=block;
    if(!target||(!groups.has(target.node)&&groups.size===SOURCE_LIMITS.groups))continue;
    let ids=groups.get(target.node);
    if(!ids){ids=new Map();groups.set(target.node,ids);}
    for(const id of citation.sourceIds.slice(0,SOURCE_LIMITS.ids)){
     const source=sources.get(id);
     if(source&&!ids.has(source.url)&&referenceCount<SOURCE_LIMITS.references){ids.set(source.url,id);placed.add(source.url);referenceCount++;}
    }
   }
   function appendGroup(parent,ids,unplaced){
    if(!ids.length)return;
    const group=doc.createElement('span'),list=doc.createElement('span');
    group.className='answer-source-group';group.dataset.answerReference='true';group.dataset.sourcePlacement=unplaced?'unplaced':'block';group.setAttribute('role','group');group.setAttribute('aria-label',unplaced?'未定位来源':'本段来源');
    if(unplaced){const label=doc.createElement('span');label.className='answer-source-label';label.textContent='未定位来源';group.append(label);}
    else if(/[\u3000-\u303f\uff00-\uffef\u2018-\u201f\u2014\u2026]$/.test(parent.textContent.trimEnd()))group.dataset.sourceSpacing='punctuation';
    list.className='answer-source-list';list.id=prefix+'-sources-'+(++groupIndex);list.setAttribute('role','list');group.append(list);
    const items=[];
    for(const id of ids){
     const source=sources.get(id),item=doc.createElement('span'),button=doc.createElement('button');
     item.className='answer-source-item';item.setAttribute('role','listitem');item.hidden=items.length>=3;items.push(item);
     button.type='button';button.className='answer-source-button';button.dataset.sourceAction='open';button.dataset.sourceId=id;
     button.setAttribute('aria-label','查看来源并确认打开：'+source.title+'（'+source.hostname+'）');
     // Locally authored link mark only: no provider image, URL attribute or
     // payload HTML can enter the icon. Host opening still receives just an ID.
     const icon=doc.createElementNS('http://www.w3.org/2000/svg','svg'),path=doc.createElementNS('http://www.w3.org/2000/svg','path');
     icon.setAttribute('class','answer-source-icon');icon.setAttribute('width','14');icon.setAttribute('height','14');icon.setAttribute('viewBox','0 0 14 14');icon.setAttribute('aria-hidden','true');icon.setAttribute('focusable','false');
     path.setAttribute('d','M5.2 8.8 8.8 5.2M4.3 6.1l-1 1a2.55 2.55 0 0 0 3.6 3.6l1-1M5.9 4.3l1-1a2.55 2.55 0 0 1 3.6 3.6l-1 1');icon.append(path);button.append(icon);item.append(button);list.append(item);sourceDetails.set(button,source);
     if(!sourceButtons.has(id))sourceButtons.set(id,[]);sourceButtons.get(id).push(button);
    }
    if(items.length>3){
     const more=doc.createElement('button'),remaining=items.length-3;more.type='button';more.className='answer-source-more';more.dataset.answerReference='true';more.textContent='+'+remaining+' more';more.setAttribute('aria-label','展开另外 '+remaining+' 个来源');more.setAttribute('aria-expanded','false');more.setAttribute('aria-controls',list.id);
     const generation=payload.generation,token=revision;
     function expandSources(){if(!current(generation,token)||more.hidden)return;clearSourceTooltip();more.setAttribute('aria-expanded','true');more.hidden=true;for(const item of items.slice(3))item.hidden=false;const added=items.slice(3).map(item=>item.querySelector('button')),focusTarget=added.find(button=>!button.disabled)||list.querySelector('button:not(:disabled)')||$('answer');focusTarget.focus({preventScroll:true});changed();}
     more.addEventListener('click',expandSources);more.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();if(!event.repeat)expandSources();}});group.append(more);
    }
    parent.append(group);
   }
   for(const [node,ids]of groups)appendGroup(node,[...ids.values()],false);
   // A plain-text fallback has no fine-grained spans. Unknown positions and
   // otherwise unused source records remain explicitly unplaced, never guessed.
   const unplaced=[],seenUrls=new Set();
   for(const source of sources.values())if(!placed.has(source.url)&&!seenUrls.has(source.url)){unplaced.push(source.id);seenUrls.add(source.url);}
   appendGroup(answer,unplaced,true);
   notice('服务商提供，未独立核实'+(warnings.some(code=>!['openai-offset-semantics-unverified','openai-non-bmp-offsets-unverified'].includes(code))?' · 部分来源未显示':''));
  }
  async function source(event){
   const button=event.target?.closest?.('button[data-source-action="open"]');
   if(disposed||!payload||!button||!$('answer').contains(button)||button.disabled)return;
   const id=button.dataset.sourceId,buttons=sourceButtons.get(id);if(!buttons||sourceOperations.has(id))return;
   clearSourceTooltip();
   const generation=payload.generation,token=revision,operation={kind:'source'};sourceOperations.set(id,operation);
   if(feedbackOwner?.kind==='source'){showError('');feedbackOwner=null;}
   for(const entry of buttons){entry.disabled=true;entry.setAttribute('aria-busy','true');}
   try{
    if(typeof callbacks.source!=='function')throw Error('Source opening is unavailable');
    const result=await callbacks.source({generation,sourceId:id});
    if(!current(generation,token)||sourceOperations.get(id)!==operation)return;
    if(result?.cancelled===true||result?.canceled===true)return;
    if(result?.ok!==true)throw Error('Source opening was not confirmed');
    // A click or successful IPC is not evidence that a browser loaded the page.
   }catch{
    if(current(generation,token)&&sourceOperations.get(id)===operation){showError('无法打开来源，请重试。');feedbackOwner=operation;}
   }finally{
    if(current(generation,token)&&sourceOperations.get(id)===operation){sourceOperations.delete(id);for(const entry of buttons){entry.disabled=false;entry.removeAttribute('aria-busy');}changed();}
   }
  }
  function selectionCopy(event){
   // Only intercept a selection wholly within this answer. Toolbar copying
   // remains host IPC and preserves the exact raw answer, including Markdown.
   if(disposed||event.defaultPrevented||!event.clipboardData)return;
   const selection=view.getSelection?.(),answer=$('answer');
   if(!selection||selection.isCollapsed||!selection.rangeCount||selection.rangeCount>16)return;
   const ranges=Array.from({length:selection.rangeCount},(_,index)=>selection.getRangeAt(index));
   if(ranges.some(range=>!answer.contains(range.startContainer)||!answer.contains(range.endContainer)))return;
   const controls=[...answer.querySelectorAll('[data-answer-reference]')];
   if(!ranges.some(range=>controls.some(control=>range.intersectsNode(control))))return;
   function bodyText(range){
    const ancestor=range.commonAncestorContainer.nodeType===1?range.commonAncestorContainer:range.commonAncestorContainer.parentElement;
    if(ancestor?.closest('[data-answer-reference]'))return '';
    let text='',pendingBreak=0;
    function visit(node){
     if(node.nodeType===3){
      if(!node.data)return;
      if(text&&pendingBreak){const trailing=/\n*$/.exec(text)[0].length,leading=/^\n*/.exec(node.data)[0].length;text+='\n'.repeat(Math.max(0,pendingBreak-trailing-leading));}
      text+=node.data;pendingBreak=0;return;
     }
     if(node.nodeType!==1&&node.nodeType!==11)return;
     if(node.nodeType===1&&node.hasAttribute('data-answer-reference'))return;
     const breaks=node.nodeType===1?(/^(?:P|H[1-6]|PRE|UL|OL|DIV)$/.test(node.tagName)?2:node.tagName==='LI'?1:0):0;
     if(node.nodeName==='BR'){pendingBreak=Math.max(pendingBreak,1);return;}
     pendingBreak=Math.max(pendingBreak,breaks);for(const child of node.childNodes)visit(child);pendingBreak=Math.max(pendingBreak,breaks);
    }
    visit(range.cloneContents());return text;
   }
   try{event.clipboardData.setData('text/plain',ranges.map(bodyText).join('\n'));event.preventDefault();}catch{} // Leave native copying available if the platform rejects interception.
  }
  function updateToggle(){
   const overflow=!!(payload?.question||payload?.context)&&request.scrollHeight>45;
   toggle.hidden=!overflow;request.tabIndex=expanded&&overflow?0:-1;
   if(!overflow&&expanded){expanded=false;request.dataset.expanded='false';}
   toggle.textContent=expanded?'收起请求':'展开请求';toggle.setAttribute('aria-expanded',String(expanded));
  }
  function measure(generation,token){
   if(!current(generation,token))return;
   positionSourceTooltip();
   updateToggle();
   // Request and answer share this bounded content scroller. Its overflow gives
   // the desired height without letting long answers grow a native window.
   const natural=(root.getBoundingClientRect().height||root.scrollHeight||400)+Math.max(0,scroll.scrollHeight-scroll.clientHeight);
   let height;
   if(embedded){height=Math.ceil(Math.min(Math.max(0,view.innerHeight-48),Math.min(700,Math.max(400,natural))));}
   else{
    const style=view.getComputedStyle(doc.documentElement),top=parseFloat(style.getPropertyValue('--outer-top')),bottom=parseFloat(style.getPropertyValue('--outer-bottom'));
    const padding=(Number.isFinite(top)?top:24)+(Number.isFinite(bottom)?bottom:64);
    height=Math.ceil(Math.min(800,Math.min(700,Math.max(400,natural))+padding));
   }
   if(Number.isFinite(height)&&height>=1&&height<=32000&&(lastHeight===null||Math.abs(height-lastHeight)>10)){
    lastHeight=height;
    if(typeof callbacks.resize==='function')try{Promise.resolve(callbacks.resize({generation,height})).catch(()=>{});}catch{}
   }
   if(revealTimer===null&&root.dataset.ready!=='true')revealTimer=view.setTimeout(()=>reveal(generation,token),150);
  }
  function changed(){
   if(disposed||!payload)return;
   if(frame!==null)view.cancelAnimationFrame(frame);
   const generation=payload.generation,token=revision;
   const scheduled=view.requestAnimationFrame(()=>{if(!current(generation,token)||frame!==scheduled)return;frame=null;measure(generation,token);});frame=scheduled;
  }
  function render(next){
   if(disposed||!next||!Number.isSafeInteger(next.generation)||next.generation<0||next.generation<=(payload?.generation??-1)||typeof next.answer!=='string'||next.answer.length>100000)return false;
   revision++;observer?.disconnect();observer=null;if(frame!==null)view.cancelAnimationFrame(frame);frame=null;clearReveal();clearCopies();clearSourceTooltip();sourceButtons.clear();sourceOperations.clear();sourceDetails.clear();
   payload={generation:next.generation,question:typeof next.question==='string'?next.question.slice(0,100000):'',context:typeof next.context==='string'?next.context.slice(0,20000):'',answer:next.answer,task:Object.hasOwn(TASK_LABELS,next.task)?next.task:'ask',appearance:next.appearance};
   expanded=false;closing=false;lastHeight=null;request.dataset.expanded='false';request.scrollTop=0;scroll.scrollTop=0;root.scrollTop=0;
   toggle.hidden=true;toggle.textContent='展开请求';toggle.setAttribute('aria-expanded','false');request.tabIndex=-1;
   root.dataset.ready='false';root.setAttribute('aria-busy','true');root.dataset.task=payload.task;
   $('question').textContent=payload.question;$('context').textContent=payload.context;
   try { if(typeof view.SafeAnswerMarkdown?.renderInto==='function')view.SafeAnswerMarkdown.renderInto($('answer'),payload.answer);else $('answer').textContent=payload.answer; }
   catch { $('answer').textContent=payload.answer; } // Unexpected renderer errors preserve exact readable source.
   renderSources(next.sourceMetadata);
   $('context-wrap').hidden=!payload.context;$('context-separator').textContent=payload.question&&payload.context?'\n\n':'';$('request').hidden=!(payload.question||payload.context);
   $('request-label').textContent=payload.context?'请求与参考文字（用户主动提供）':'你的请求';
   const label=TASK_LABELS[payload.task];$('task-label').textContent='本地听写 · '+label;$('response-label').textContent=label;
   closeButton.disabled=false;closeButton.setAttribute('aria-label','关闭'+label);
   for(const button of copyButtons){
    const part=button.dataset.copy,base=part==='answer'?'复制'+label:payload.context?'复制请求与参考文字':'复制请求';
    button.title=part==='answer'?'复制回答原文，保留 Markdown 标记':'复制原始请求与主动提供的参考文字';
    button.textContent=base;button.disabled=part==='answer'?!payload.answer:!(payload.question||payload.context);
    copyStates.set(part,{button,base,pending:false,timer:null,operation:null});
   }
   showError('');applyTheme();
   const generation=payload.generation,token=revision;
   if(typeof view.ResizeObserver==='function'){observer=new view.ResizeObserver(()=>{if(current(generation,token))changed();});observer.observe(root);observer.observe(request);observer.observe(scroll);}
   fallbackTimer=view.setTimeout(()=>reveal(generation,token),300);changed();return true;
  }
  async function copy(event){
   const button=event.currentTarget,part=button.dataset.copy,state=copyStates.get(part);
   if(disposed||!payload||!state||state.pending||button.disabled)return;
   const generation=payload.generation,token=revision,operation={};state.operation=operation;state.pending=true;
   if(state.timer!==null)view.clearTimeout(state.timer);state.timer=null;button.disabled=true;button.textContent='复制中…';
   try{
    const result=await callbacks.copy({generation,part});if(result?.ok!==true)throw Error('copy was not confirmed');
    if(!current(generation,token)||state.operation!==operation)return;
    button.textContent='已复制';showError('已复制',true);feedbackOwner=operation;
    state.timer=view.setTimeout(()=>{
     if(!current(generation,token)||state.operation!==operation)return;
     state.timer=null;button.textContent=state.base;if(feedbackOwner===operation){showError('');feedbackOwner=null;changed();}
    },3000);
   }catch{
    if(current(generation,token)&&state.operation===operation){button.textContent=state.base;showError('复制失败，请重试，或选择文字后手动复制。');feedbackOwner=operation;}
   }finally{
    if(current(generation,token)&&state.operation===operation){state.pending=false;button.disabled=false;changed();}
   }
  }
  async function close(){
   if(disposed||!payload||closing)return;
   const generation=payload.generation,token=revision;closing=true;closeButton.disabled=true;
   try{const result=await callbacks.close({generation});if(result?.ok===false)throw Error('close failed');}
   catch{if(current(generation,token)){closing=false;closeButton.disabled=false;showError('关闭失败，请重试。');changed();}}
  }
  function onToggle(){if(disposed||!payload||toggle.hidden)return;expanded=!expanded;request.dataset.expanded=String(expanded);request.scrollTop=0;toggle.setAttribute('aria-expanded',String(expanded));toggle.textContent=expanded?'收起请求':'展开请求';changed();}
  function dispose(){
   if(disposed)return;disposed=true;revision++;observer?.disconnect();observer=null;if(frame!==null)view.cancelAnimationFrame(frame);frame=null;clearReveal();clearCopies();clearSourceTooltip();sourceButtons.clear();sourceOperations.clear();sourceDetails.clear();
   theme?.removeEventListener?.('change',applyTheme);view.removeEventListener('resize',changed);toggle.removeEventListener('click',onToggle);closeButton.removeEventListener('click',close);
   for(const button of copyButtons)button.removeEventListener('click',copy);
   $('answer').removeEventListener('click',source);doc.removeEventListener('copy',selectionCopy);
   $('answer').removeEventListener('pointerover',sourceHover);$('answer').removeEventListener('pointerout',sourceLeave);$('answer').removeEventListener('focusin',sourceFocus);$('answer').removeEventListener('focusout',sourceBlur);root.removeEventListener('keydown',sourceKey,true);view.removeEventListener('scroll',sourceScroll,true);view.removeEventListener('resize',positionSourceTooltip);view.removeEventListener('blur',clearSourceTooltip);
  }
  for(const button of copyButtons)button.addEventListener('click',copy);
  $('answer').addEventListener('click',source);doc.addEventListener('copy',selectionCopy);
  $('answer').addEventListener('pointerover',sourceHover);$('answer').addEventListener('pointerout',sourceLeave);$('answer').addEventListener('focusin',sourceFocus);$('answer').addEventListener('focusout',sourceBlur);root.addEventListener('keydown',sourceKey,true);view.addEventListener('scroll',sourceScroll,true);view.addEventListener('resize',positionSourceTooltip);view.addEventListener('blur',clearSourceTooltip);
  toggle.addEventListener('click',onToggle);closeButton.addEventListener('click',close);view.addEventListener('resize',changed);theme?.addEventListener?.('change',applyTheme);applyTheme();
  return Object.freeze({render,close,dispose});
 }
 window.AnswerCardContent=Object.freeze({create});
})();
