'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ui=require('../renderer/dictation-ui-state'),{createOverlayLifecycle}=require('../src/dictation-overlay-lifecycle');
const {Controller}=require('../src/dictation-controller'),{Store}=require('../src/dictation-store'),{DEFAULTS}=require('../src/settings');
const WORK=path.resolve(__dirname,'../../work/local02'),safe={isEncryptionAvailable:()=>false};
test('capture stays unavailable until the desktop snapshot is connected',()=>{
 const view=ui.captureView(null);assert.equal(view.disabled,true);assert.equal(view.action,null);assert.equal(view.label,'连接中');assert.equal(view.cancel,false);
});
test('forced termination of an owned synthetic child still recovers the original',async t=>{
 const {fork}=require('node:child_process');fs.mkdirSync(WORK,{recursive:true});const dir=fs.mkdtempSync(path.join(WORK,'crash-')),settings=structuredClone(DEFAULTS);settings.refiner.enabled=true;settings.refiner.baseUrl='http://127.0.0.1:9/v1';
 fs.writeFileSync(path.join(dir,'settings.json'),JSON.stringify({version:2,settings,secrets:{}}));const store=new Store(dir,safe,'win32');store.saveRecentResult({id:'previous',mode:'dictate',status:'completed',original:'上次。',text:'上次。'});
 const child=fork(path.join(__dirname,'fixtures/local02-crash-child.cjs'),[dir],{windowsHide:true,env:{SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,TEMP:dir,TMP:dir},stdio:['ignore','ignore','pipe','ipc']});
 const exit=new Promise((resolve,reject)=>{child.once('exit',(code,signal)=>resolve({code,signal}));child.once('error',reject);});
 t.after(async()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await exit;assert.equal(path.dirname(dir),WORK);fs.rmSync(dir,{recursive:true,force:true});});
 const ready=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Synthetic checkpoint child timed out')),5000);child.once('message',data=>{clearTimeout(timeout);data.error?reject(Error(data.error)):resolve(data);});child.once('error',reject);});
 assert.equal(ready.ready,true);assert.equal(child.kill('SIGKILL'),true);await exit;
 const recovered=new Store(dir,safe,'win32').getRecentResult();assert.equal(recovered.id,ready.id);assert.equal(recovered.text,ready.original);assert.equal(recovered.original,ready.original);
});
test('checkpoint write failure keeps the visible original and warns while cleanup still runs once',async t=>{
 const settings=structuredClone(DEFAULTS);settings.refiner.enabled=true;settings.refiner.baseUrl='http://127.0.0.1:9/v1';let edits=0;
 const store={settings,dictionary:[],keys:{},saveRecentResult(){throw Error('synthetic readonly');}},c=new Controller({store,bridge:{},localAsr:{},apiImpl:{refine:async original=>{edits++;return original;}}});t.after(()=>c.dispose());
 const session=c.begin(c.prepare({}),'recording');session.original='完整原文500。';c.publish({phase:'processing',sessionId:session.id});await c.finishText(session,false);
 assert.equal(edits,1);assert.equal(c.state.result.text,session.original);assert.match(c.state.result.message,/原文.*(?:未保存|无法保存|暂未)/);
});
test('a known original changes the secondary action from discard to Use original',()=>{
 assert.equal(typeof ui.sessionView,'function');
 const view=ui.sessionView({state:{phase:'processing',sessionId:'new'},canUseOriginal:true});
 assert.equal(view.title,'文字已就绪，正在轻整理');assert.equal(view.cancelLabel,'结束整理');assert.equal(view.step,'cleanup');assert.equal(view.active,true);
});
test('recognition waiting never claims an available original or a measured percentage',()=>{
 assert.equal(typeof ui.sessionView,'function');const view=ui.sessionView({state:{phase:'processing',sessionId:'new'},canUseOriginal:false});
 assert.equal(view.title,'正在本机识别');assert.equal(view.cancelLabel,'取消');assert.equal(view.step,'recognition');assert.equal(/\d+%/.test(view.detail),false);
});
test('a current original is distinguished from the previous result during cleanup',()=>{
 const result={id:'new',text:'完整原文。',original:'完整原文。',status:'cancelled',refined:false};
 assert.equal(ui.resultView(result,true,'new').message,'本次文字');assert.doesNotMatch(ui.resultView(result,true,'new').message,/上次|正在/);
 assert.match(ui.resultView({...result,id:'old'},true,'new').message,/上次/);
});
test('one task pins its native anchor and only the next task chooses a new one',async()=>{
 let positions=0,shows=0,destroyed=false;const win={isDestroyed:()=>destroyed,webContents:{send(){}},showInactive(){shows++;},destroy(){destroyed=true;}};
 const manager=createOverlayLifecycle({createWindow:()=>win,loadWindow:async()=>{},positionWindow(){positions++;}});
 manager.update({state:{phase:'starting',sessionId:'a'}});for(let i=0;i<6;i++)await Promise.resolve();
 for(const phase of ['recording','stopping','processing','refining'])manager.update({state:{phase,sessionId:'a'}});
 manager.update({state:{phase:'done'},result:{id:'a',hasText:true}});
 assert.equal(positions,1);assert.equal(shows,1);manager.update({state:{phase:'starting',sessionId:'b'}});assert.equal(positions,2);assert.equal(shows,2);manager.dispose();
});
test('dismissed error stays closed for the same failure and a new failure can appear',async()=>{
 let created=0;const manager=createOverlayLifecycle({createWindow(){created++;let dead=false;return {isDestroyed:()=>dead,webContents:{send(){}},showInactive(){},destroy(){dead=true;}};},loadWindow:async()=>{},positionWindow(){}});
 const failure={state:{phase:'error',errorId:'failure-a',message:'合成设备错误。'}};manager.update(failure);for(let i=0;i<6;i++)await Promise.resolve();assert.equal(created,1);manager.dismiss();manager.update(failure);assert.equal(created,1);
 manager.update({state:{phase:'error',errorId:'failure-b',message:'另一合成设备错误。'}});assert.equal(created,2);manager.dispose();
});
test('the full original is durable before cleanup completes, without orderly disposal',async t=>{
 fs.mkdirSync(WORK,{recursive:true});const dir=fs.mkdtempSync(path.join(WORK,'checkpoint-'));const settings=structuredClone(DEFAULTS);settings.refiner.enabled=true;settings.refiner.baseUrl='http://127.0.0.1:9/v1';
 fs.writeFileSync(path.join(dir,'settings.json'),JSON.stringify({version:2,settings,secrets:{}}));const store=new Store(dir,safe,'win32');
 store.saveRecentResult({id:'previous',mode:'dictate',status:'completed',original:'上次。',text:'上次。'});
 let resolve,entered;const pending=new Promise(r=>{resolve=r;}),started=new Promise(r=>{entered=r;});const original='完整新原文：预算500元，不要扩写。😀';
 const c=new Controller({store,bridge:{},localAsr:{transcribe:async()=>original},apiImpl:{refine:()=>{entered();return pending;}}});
 t.after(async()=>{c.dispose();resolve(original);await submission;assert.equal(path.dirname(dir),WORK);fs.rmSync(dir,{recursive:true,force:true});});
 await c.toggle();const id=c.session.id;c.recordingReady({sessionId:id});c.stop();const submission=c.submitAudio({sessionId:id,bytes:new Uint8Array(1200),mimeType:'audio/webm',durationMs:100,localPcm:new Uint8Array(3200),sampleRate:16000,channels:1});await started;
 const recovered=new Store(dir,safe,'win32').getRecentResult();assert.equal(recovered.id,id);assert.equal(recovered.original,original);assert.equal(recovered.text,original);assert.equal(recovered.refined,false);assert.match(recovered.message,/原文/);
});
