'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../renderer/app.js'),'utf8');
function fn(name,context){const start=source.search(new RegExp('^  (?:async )?function '+name+'\\(','m'));assert.ok(start>=0,'function '+name);const tail=source.slice(start),next=tail.slice(1).search(/^  (?:async )?function /m);return vm.runInNewContext('('+ (next<0?tail:tail.slice(0,next+1))+')',context);}
test('closing dirty settings can keep editing without losing independent drafts',async()=>{
 let closed=0,hydrated=0,decisions=0;
 const context={savingSettings:false,settingsDismissPending:false,settingsDirty:true,dirtySettingsSections:new Set(['services','usage']),shortcutCapture:null,setupReturn:false,closeSelector(){},cancelInlinePending(){},providerDiagnostics:{discard(){assert.fail('must not discard');}},hydrateSettings(){hydrated++;},applyTheme(){},$:()=>({textContent:'',classList:{remove(){}}}),closeDialog(){closed++;},requestConfirmation:async()=>{decisions++;return false;}};
 assert.equal(await fn('dismissSettings',context)(),false);assert.equal(context.settingsDirty,true);assert.equal(context.dirtySettingsSections.size,2);assert.equal(decisions,1);assert.equal(closed+hydrated,0);
});
test('workbench navigation stays on the single workbench and never opens an overview layer',()=>{
 const context={listScrollPositions:{},currentView:'history',navigationRevision:0,workspaceOpen:true,document:{body:{classList:{toggle(){}}},querySelectorAll:()=>[],querySelector:()=>({scrollTop:99})},window:{scrollTo(){}},renderWorkspaceAccess(){},$:()=>({scrollTop:0}),openSettings(){}};
 fn('showView',context)('dictation');assert.equal(context.currentView,'dictation');assert.equal(context.workspaceOpen,true);
});
test('busy capture action cannot issue another toggle while processing',async()=>{
 let requests=0;const context={bridge:{},commandPending:false,cancelPending:false,processingRequestPending:false,modePending:false,savingSettings:false,operationPending:false,preferencePending:false,snapshot:{state:{phase:'processing'}},ACTIVE_PHASES:new Set(['processing']),RECORDING_PHASES:new Set(['starting','recording']),renderState(){},invoke:async()=>{requests++;},modeOptions:()=>({mode:'dictate'}),errorMessage:e=>e.message,toast(){}};
 await fn('requestToggle',context)();assert.equal(requests,0);
});

test('capture stays blocked during an in-flight preference save',async()=>{
 let requests=0;const context={bridge:{},commandPending:false,cancelPending:false,processingRequestPending:false,modePending:false,savingSettings:false,operationPending:false,preferencePending:true,snapshot:{state:{phase:'idle'}},ACTIVE_PHASES:new Set(),RECORDING_PHASES:new Set(),selectedMode:'dictate',needService:()=>false,modeOptions:()=>({}),renderState(){},invoke:async()=>{requests++;},toast(){},errorMessage:e=>e.message};
 await fn('requestToggle',context)();assert.equal(requests,0);
});
test('closing a dialog restores a connected visible opener without stealing a newer input focus',()=>{
 let returned=0;const body={},dialog={close(){}},opener={isConnected:true,matches:()=>true,focus(){returned++;}},heading={matches:()=>true,focus(){assert.fail('opener was available');}};
 const context={$:id=>id==='settings-dialog'?{open:false}:id==='settings-heading'?heading:dialog,dialogOpeners:new Map([['test',opener]]),document:{body,activeElement:body},queueMicrotask:callback=>callback(),visibleFocusTarget:()=>true,currentView:'dictation'};
 fn('closeDialog',context)('test');assert.equal(returned,1);
 context.dialogOpeners.set('test',opener);context.document.activeElement={tagName:'TEXTAREA'};fn('closeDialog',context)('test');assert.equal(returned,1);
});

test('unconfigured endpoint keeps settings and first-use hydration available with a stable binding',()=>{
 const endpoint=require('../renderer/provider-endpoint');
 const context={snapshot:{settings:{refiner:{model:'synthetic-model',baseUrl:'',endpointMode:'base'}}},window:{ProviderEndpoint:endpoint}};
 const binding=fn('usagePriceBinding',context);
 assert.doesNotThrow(()=>binding('refiner'));const empty=binding('refiner');assert.ok(empty.includes('unconfigured'));
 context.snapshot.settings.refiner.baseUrl='http://127.0.0.1:9/v1';assert.notEqual(binding('refiner'),empty);
});

test('publishing a completed Ask keeps the result in the workbench without opening another window',()=>{
 const mainSource=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8');
 const start=mainSource.indexOf('function publish(){'),end=mainSource.indexOf('\nfunction shortcutMap(',start);
 assert.ok(start>=0&&end>start);
 let published=0,overlays=0,answers=0;
 const data={state:{phase:'done',sessionId:'synthetic-session',result:{id:'synthetic-result',mode:'ask',status:'completed',original:'Synthetic question',text:'Synthetic answer'}}};
 const context={snapshot:()=>data,sourceSession:null,sourceRevision:0,mainWindow:{isDestroyed:()=>false,webContents:{send(channel,payload){assert.equal(channel,'state');assert.equal(payload,data);published++;},setBackgroundThrottling(){}}},controller:{state:{phase:'done'}},overlayManager:{update(){overlays++;}},overlaySnapshot:()=>({}),answerManager:{show(){answers++;}},tray:{setToolTip(){}}};
 vm.runInNewContext('('+mainSource.slice(start,end)+')',context)();
 assert.equal(published,1);assert.equal(overlays,1);assert.equal(answers,0);
});
