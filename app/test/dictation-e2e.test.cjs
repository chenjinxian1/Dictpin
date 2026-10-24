'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {fixture}=require('./dictation-electron-fixture.cjs'),product=require('../src/dictation-main'),{Store}=require('../src/dictation-store'),{DEFAULTS}=require('../src/settings'),{createCapture}=require('../renderer/dictation-capture');
const WORK=path.resolve(__dirname,'../../work');
function phase(controller,wanted){if(controller.state.phase===wanted)return Promise.resolve();return new Promise(resolve=>{const listener=value=>{if(value.phase===wanted){controller.off('state',listener);resolve();}};controller.on('state',listener);});}
test('selected product entry runs shortcut→capture→local recognition→one localhost edit→persist→copy failure/retry', {timeout:10000},async t=>{
 let requests=0,authHeaders=0,localCalls=0,stops=0,tracksStopped=0,copyAttempts=0,copied='',clock=0;
 const server=http.createServer(async(req,res)=>{let body='';for await(const chunk of req){body+=chunk;if(body.length>100000){res.destroy();return;}}const payload=JSON.parse(body);requests++;if(req.headers.authorization)authHeaders++;assert.equal(payload.messages[1].content,'预算500元，不要扩写。');res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'预算500元，不要扩写。'}}],usage:{prompt_tokens:8,completion_tokens:5,total_tokens:13}}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const dir=fs.mkdtempSync(path.join(WORK,'product-e2e-'));t.after(()=>{assert.equal(path.dirname(dir),WORK);fs.rmSync(dir,{recursive:true,force:true});});
 const settings=structuredClone(DEFAULTS);settings.mode='ask';settings.refiner.enabled=true;settings.refiner.baseUrl='http://127.0.0.1:'+server.address().port+'/v1';settings.refiner.model='synthetic-model';
 fs.writeFileSync(path.join(dir,'settings.json'),JSON.stringify({version:2,settings,secrets:{},futureEnvelope:{keep:true}}));
 const oldHistory=JSON.stringify([{id:'old-ask',mode:'ask',status:'completed',original:'invented old question',text:'invented old answer'}]);fs.writeFileSync(path.join(dir,'history.json'),oldHistory);
 const f=fixture();f.electron.app.getPath=()=>dir;f.electron.safeStorage={isEncryptionAvailable:()=>false};f.electron.clipboard.writeText=text=>{copyAttempts++;if(copyAttempts===1)throw Error('synthetic clipboard busy');copied=text;};
 class Local{constructor(){this.exe=path.resolve(__dirname,'../../native/local-asr-worker.exe');}async transcribe(){localCalls++;return '预算500元，不要扩写。';}async dispose(){}}
 const host=await product.start(f.electron,{StoreClass:Store,LocalAsrClass:Local});t.after(()=>host.dispose());
 const event={sender:host.mainWindow.webContents,senderFrame:host.mainWindow.webContents.mainFrame},rpc=(name,...args)=>f.handlers.get(name)(event,...args);
 class Recorder{static isTypeSupported(){return true;}constructor(){this.state='inactive';this.mimeType='audio/webm';}start(){this.state='recording';}stop(){stops++;this.state='inactive';this.ondataavailable?.({data:new Blob([new Uint8Array(200)])});void this.onstop?.();}}
 const capture=createCapture({bridge:{recordingReady:input=>rpc('audio:ready',input),submitAudio:input=>rpc('audio:submit',input),reportRecordingError:input=>rpc('audio:error',input)},mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){tracksStopped++;}}]})},Recorder,decode:async()=>({localPcm:new Uint8Array(3200),sampleRate:16000,channels:1}),now:()=>clock});t.after(()=>capture.dispose());
 host.mainWindow.webContents.send=(channel,value)=>{if(channel==='command')void capture.command(value);};
 const trigger=[...f.registered.values()][0],recording=phase(host.controller,'recording');trigger();await recording;
 await assert.rejects(rpc('text:process',{mode:'ask',text:'invented'}));assert.equal(host.controller.state.phase,'recording');
 const done=phase(host.controller,'done');clock=100;trigger();trigger();await done;
 assert.equal(localCalls,1);assert.equal(requests,1);assert.equal(authHeaders,0);assert.equal(stops,1);assert.equal(tracksStopped,1);
 const result=host.snapshot(false).recentResult;assert.equal(result.text,'预算500元，不要扩写。');assert.equal(result.refined,true);assert.equal(fs.readFileSync(path.join(dir,'history.json'),'utf8'),oldHistory);
 const bar=f.windows.find(window=>window.options.frame===false);assert.equal(bar.dead,false);
 await assert.rejects(rpc('result:copy',result.id),/clipboard/);assert.equal(bar.dead,false);assert.equal(host.snapshot(true).copiedResultId,null);
 assert.deepEqual(await rpc('result:copy',result.id),{ok:true,id:result.id,revision:result.revision});assert.equal(copyAttempts,2);assert.equal(copied,result.text);assert.equal(host.snapshot(true).copiedResultId,result.id);
 const usage=host.store.usageSnapshot();assert.equal(usage.summary.requests,1);assert.equal(usage.summary.tokens.total.known,'13');
 const reopened=new Store(dir,f.electron.safeStorage,'win32');assert.equal(reopened.recentResult.original,result.original);assert.equal(reopened.recentResult.text,result.text);
});
