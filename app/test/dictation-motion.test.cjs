'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createFeedbackMotion}=require('../renderer/dictation-motion');
function fixture(reduced=false){
 const animations=[],listeners=new Set(),media={matches:reduced,addEventListener(_n,fn){listeners.add(fn);},removeEventListener(_n,fn){listeners.delete(fn);}};
 const node={isConnected:true,getClientRects:()=>[{}],animate(frames,options){let finish;const animation={frames,options,cancelled:false,finished:new Promise(resolve=>{finish=resolve;}),cancel(){this.cancelled=true;finish();},finish};animations.push(animation);return animation;}};
 return {node,media,animations,listeners,motion:createFeedbackMotion({media})};
}
test('a newer response cancels its previous visual effect without changing content or focus',async()=>{
 const f=fixture();f.node.textContent='new result';f.motion.enter(f.node);f.motion.respond(f.node);assert.equal(f.animations.length,2);assert.equal(f.animations[0].cancelled,true);assert.equal(f.animations[1].cancelled,false);await Promise.resolve();f.motion.respond(f.node);assert.equal(f.animations[1].cancelled,true);assert.equal(f.node.textContent,'new result');f.motion.dispose();assert.equal(f.animations[2].cancelled,true);
});
test('enabling reduced motion cancels running effects and prevents future effects',()=>{
 const f=fixture();f.motion.enter(f.node);f.media.matches=true;for(const fn of f.listeners)fn();assert.equal(f.animations[0].cancelled,true);f.motion.enter(f.node);assert.equal(f.animations.length,1);f.motion.dispose();assert.equal(f.listeners.size,0);
});
test('hidden and disconnected elements never animate or delay an operation',()=>{
 const f=fixture();f.node.isConnected=false;f.motion.enter(f.node);f.node.isConnected=true;f.node.getClientRects=()=>[];f.motion.respond(f.node);assert.equal(f.animations.length,0);f.motion.dispose();
});
test('list reflow uses measured displacement and leaves unchanged rows stationary',()=>{
 const f=fixture();f.node.getBoundingClientRect=()=>({top:20});f.motion.reflow(f.node,52);assert.equal(f.animations[0].frames[0].transform,'translateY(32px)');f.motion.reflow(f.node,20);assert.equal(f.animations.length,1);f.motion.dispose();
});
