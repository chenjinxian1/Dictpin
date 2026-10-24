'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createOverlayLifecycle}=require('../src/dictation-overlay-lifecycle');
function fixture(){let timer,dead=false,created=0;const manager=createOverlayLifecycle({createWindow(){dead=false;created++;return {isDestroyed:()=>dead,webContents:{send(){}},showInactive(){},destroy(){dead=true;}};},loadWindow:async()=>{},positionWindow(){},schedule(fn){timer=fn;return 1;},unschedule(){timer=null;}});return {manager,get timer(){return timer;},get dead(){return dead;},get created(){return created;}};}
test('editing the same result invalidates the old copied dismissal, including an already queued callback',async()=>{
 const f=fixture();f.manager.update({state:{phase:'recording',sessionId:'a'}});await Promise.resolve();await Promise.resolve();f.manager.update({state:{phase:'done'},result:{id:'a',hasText:true,revision:1}});f.manager.markCopied('a');const old=f.timer;assert.equal(typeof old,'function');f.manager.update({state:{phase:'done'},result:{id:'a',hasText:true,revision:2}});assert.equal(f.timer,null);old();assert.equal(f.dead,false);f.manager.dispose();
});
test('a dismissed recovery does not reappear until a new token exists',async()=>{
 const f=fixture(),state={phase:'cancelled',sessionId:null};f.manager.update({state,recovery:{token:'one'}});await Promise.resolve();await Promise.resolve();f.manager.dismiss();f.manager.update({state,recovery:{token:'one'}});assert.equal(f.created,1);f.manager.update({state,recovery:{token:'two'}});assert.equal(f.created,2);f.manager.dispose();
});
