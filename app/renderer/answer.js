'use strict';
(() => {
 const api=window.answerCard,root=document.getElementById('answer-card');if(!api||!root||!window.AnswerCardContent)return;
 const instance=window.AnswerCardContent.create(root,{source:input=>api.openSource(input),copy:input=>api.copy(input),close:input=>api.close(input),resize:input=>api.resize(input)},{embedded:false});
 let seenEvent=false,disposed=false;
 function render(next){if(!disposed&&instance.render(next))document.title=root.querySelector('[data-answer="task-label"]').textContent;}
 function onKey(event){if(event.key==='Escape'){event.preventDefault();void instance.close();}}
 function dispose(){if(disposed)return;disposed=true;instance.dispose();unsubscribe?.();document.removeEventListener('keydown',onKey);window.removeEventListener('beforeunload',dispose);}
 document.addEventListener('keydown',onKey);
 const unsubscribe=api.onPayload(next=>{seenEvent=true;render(next);});
 Promise.resolve().then(()=>api.getPayload()).then(next=>{if(!seenEvent&&!disposed)render(next);}).catch(()=>{
  if(!seenEvent&&!disposed){const error=root.querySelector('[data-answer="error"]');error.dataset.kind='error';error.hidden=false;error.textContent='无法加载回答，请从历史记录重新打开。';root.dataset.ready='true';root.setAttribute('aria-busy','false');}
 });
 window.addEventListener('beforeunload',dispose,{once:true});
})();
