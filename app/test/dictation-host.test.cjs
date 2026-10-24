'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createActions}=require('../src/dictation-actions');
const {createOverlayLifecycle}=require('../src/dictation-overlay-lifecycle');
function actions({write=()=>{},phase='done'}={}){
 assert.equal(typeof createActions,'function','trusted product action factory must exist');
 const recent={id:'result-1',mode:'dictate',status:'completed',original:'完整原文。',text:'完整结果。'};
 let copied=0;const controller={state:{phase,result:recent},active:()=>['recording','processing'].includes(phase)};
 return {recent,controller,getCopied:()=>copied,api:createActions({controller,store:{getRecentResult:()=>recent},writeClipboard:write,onCopied:()=>copied++})};
}
test('clipboard failure never acknowledges success or dismisses the voice bar',async()=>{
 const a=actions({write:()=>{throw Error('clipboard unavailable');}});await assert.rejects(a.api.copyResult('result-1'),/clipboard/);assert.equal(a.getCopied(),0);
});
test('copy uses trusted result text and acknowledges only after actual clipboard completion',async()=>{
 let resolve,written;const pending=new Promise(r=>{resolve=r;});const a=actions({write:text=>{written=text;return pending;}});
 const request=a.api.copyResult('result-1');assert.equal(a.getCopied(),0);assert.equal(written,a.recent.text);resolve();assert.deepEqual(await request,{ok:true,id:'result-1',revision:1});assert.equal(a.getCopied(),1);
});
test('stale result identity and concurrent capture cannot copy another result',async()=>{
 const a=actions();await assert.rejects(a.api.copyResult('result-old'));assert.equal(a.getCopied(),0);
 const busy=actions({phase:'recording'});await assert.rejects(busy.api.copyResult('result-1'));assert.equal(busy.getCopied(),0);
});
function bar(){
 assert.equal(typeof createOverlayLifecycle,'function','copy-aware lifecycle must exist');
 let destroyed=0,shows=0,callback;const win={isDestroyed:()=>false,webContents:{send(){}},showInactive(){shows++;},destroy(){destroyed++;}};
 const manager=createOverlayLifecycle({createWindow:()=>win,loadWindow:()=>Promise.resolve(),positionWindow(){},schedule:fn=>{callback=fn;return 1;},unschedule:()=>{callback=null;}});
 return {manager,get destroyed(){return destroyed;},get shows(){return shows;},timer:()=>callback};
}
test('ready bar remains until matching copied acknowledgement instead of an old terminal timeout',async()=>{
 const b=bar();b.manager.update({state:{phase:'recording',sessionId:'task-1'}});await Promise.resolve();await Promise.resolve();
 b.manager.update({state:{phase:'done'},result:{id:'task-1',hasText:true}});assert.equal(b.destroyed,0);assert.equal(b.timer(),undefined);
 b.manager.markCopied('stale');assert.equal(b.destroyed,0);b.manager.markCopied('task-1');assert.equal(typeof b.timer(),'function');b.timer()();assert.equal(b.destroyed,1);
});
test('an older copy dismissal cannot close a new recording bar',async()=>{
 const b=bar();b.manager.update({state:{phase:'recording',sessionId:'task-1'}});await Promise.resolve();await Promise.resolve();b.manager.update({state:{phase:'done'},result:{id:'task-1',hasText:true}});
 b.manager.markCopied('task-1');const oldTimer=b.timer();b.manager.update({state:{phase:'recording',sessionId:'task-2'}});oldTimer();assert.equal(b.destroyed,0);
});
