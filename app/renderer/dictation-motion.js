'use strict';
(function(root){
 function createFeedbackMotion({media=root.matchMedia?.('(prefers-reduced-motion: reduce)')}={}){
  const byNode=new WeakMap(),running=new Set();let disposed=false;
  function stopAll(){for(const animation of running)animation.cancel();running.clear();}
  function changed(){if(media?.matches)stopAll();}
  media?.addEventListener('change',changed);
  function play(node,frames,duration=180){
   if(disposed||media?.matches||!node?.isConnected||!node.getClientRects().length||typeof node.animate!=='function')return;
   byNode.get(node)?.cancel();
   const animation=node.animate(frames,{duration,easing:'cubic-bezier(.16,1,.3,1)'});byNode.set(node,animation);running.add(animation);
   const done=()=>{running.delete(animation);if(byNode.get(node)===animation)byNode.delete(node);};animation.finished.then(done,done);return animation;
  }
  return {
   enter:node=>play(node,[{opacity:0,transform:'translateY(4px)'},{opacity:1,transform:'none'}]),
   respond:node=>play(node,[{opacity:.45},{opacity:1}],140),
   reflow(node,previousTop){const delta=previousTop-node.getBoundingClientRect().top;if(Math.abs(delta)>.5)return play(node,[{transform:'translateY('+delta+'px)'},{transform:'none'}]);},
   retire(node){
    if(disposed||media?.matches||!node?.isConnected||!node.getClientRects().length)return;
    const rect=node.getBoundingClientRect(),ghost=node.cloneNode(true);ghost.removeAttribute('id');ghost.removeAttribute('data-word-id');ghost.removeAttribute('role');ghost.setAttribute('aria-hidden','true');ghost.inert=true;
    for(const child of ghost.querySelectorAll('[id],[tabindex],button')){child.removeAttribute('id');child.tabIndex=-1;if(child.tagName==='BUTTON')child.disabled=true;}
    ghost.classList.add('retiring-row');Object.assign(ghost.style,{position:'fixed',left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',zIndex:'30',pointerEvents:'none'});node.ownerDocument.body.append(ghost);
    const animation=play(ghost,[{opacity:.8},{opacity:0}],120);if(animation)animation.finished.then(()=>ghost.remove(),()=>ghost.remove());else ghost.remove();
   },
   retireDialog(node){
    if(disposed||media?.matches||!node?.open||!node.isConnected)return;
    const document=node.ownerDocument,rect=node.getBoundingClientRect(),ghost=node.cloneNode(true),scrim=document.createElement('div');
    ghost.removeAttribute('id');ghost.removeAttribute('open');ghost.removeAttribute('aria-labelledby');ghost.setAttribute('aria-hidden','true');ghost.inert=true;ghost.classList.add('dialog-exit-ghost');
    for(const child of ghost.querySelectorAll('[id],[tabindex],input,button')){child.removeAttribute('id');child.tabIndex=-1;if(['INPUT','BUTTON'].includes(child.tagName))child.disabled=true;}
    Object.assign(ghost.style,{position:'fixed',inset:'auto',left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',margin:'0',display:'block',opacity:'1',transform:'none',zIndex:'51',pointerEvents:'none',transition:'none'});
    scrim.className='dialog-exit-scrim';scrim.setAttribute('aria-hidden','true');scrim.inert=true;document.body.append(scrim,ghost);
    for(const [element,frames]of [[ghost,[{opacity:1,transform:'none'},{opacity:0,transform:'translateY(3px)'}]],[scrim,[{opacity:1},{opacity:0}]]]){const animation=play(element,frames,120);if(animation)animation.finished.then(()=>element.remove(),()=>element.remove());else element.remove();}
   },
   dispose(){disposed=true;stopAll();media?.removeEventListener('change',changed);}
  };
 }
 if(typeof module==='object'&&module.exports)module.exports={createFeedbackMotion};else root.DictationMotion={createFeedbackMotion};
})(typeof window==='object'?window:globalThis);
