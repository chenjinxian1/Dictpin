'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const product=require('../src/dictation-main'),{fixture}=require('./dictation-electron-fixture.cjs');
async function setup(t){
 const f=fixture();let check,request;
 f.electron.session.defaultSession.setPermissionCheckHandler=value=>{check=value;};
 f.electron.session.defaultSession.setPermissionRequestHandler=value=>{request=value;};
 const h=await product.start(f.electron,{StoreClass:f.FakeStore,LocalAsrClass:f.FakeLocal});t.after(()=>h.dispose());
 const contents=h.mainWindow.webContents,url=contents.getURL(),details={isMainFrame:true,requestingUrl:url};
 return {h,contents,details,check:(permission='media',extra={},sender=contents)=>check(sender,permission,'file://',{...details,...extra}),request:(types=['audio'],extra={},sender=contents,permission='media')=>{let answer;request(sender,permission,value=>{answer=value;},{...details,mediaTypes:types,...extra});return answer;}};
}
test('trusted idle audio metadata can name and list microphones without enabling capture',async t=>{
 const f=await setup(t);assert.equal(f.h.controller.state.phase,'idle');assert.equal(f.check('media',{mediaType:'audio'}),true);assert.equal(f.check('media',{mediaType:'unknown'}),false);assert.equal(f.request(),false);
});
test('microphone capture permission remains limited to active explicit recording phases',async t=>{
 const f=await setup(t);for(const phase of ['idle','stopping','processing','done','error','cancelled']){f.h.controller.publish({phase});assert.equal(f.request(),false,phase);assert.equal(f.check('media',{mediaType:'unknown'}),false,phase);}
 for(const phase of ['starting','recording']){f.h.controller.publish({phase});assert.equal(f.request(),true,phase);assert.equal(f.check('media',{mediaType:'unknown'}),true,phase);}
 f.h.controller.publish({phase:'idle'});assert.equal(f.request(),false);
});
test('audio metadata and capture reject foreign windows, child frames and foreign requesting pages',async t=>{
 const f=await setup(t);f.h.controller.publish({phase:'starting'});
 for(const extra of [{isMainFrame:false},{isMainFrame:undefined},{requestingUrl:'file:///untrusted.html'},{requestingUrl:undefined}]){assert.equal(f.check('media',{mediaType:'audio',...extra}),false);assert.equal(f.request(['audio'],extra),false);}
 const foreign={getURL:()=>f.contents.getURL()};assert.equal(f.check('media',{mediaType:'audio'},foreign),false);assert.equal(f.request(['audio'],{},foreign),false);
 const getURL=f.contents.getURL;f.contents.getURL=()=> 'file:///different.html';assert.equal(f.check('media',{mediaType:'audio'}),false);assert.equal(f.request(),false);f.contents.getURL=getURL;
});
test('microphone policy rejects video, mixed media and unrelated permissions',async t=>{
 const f=await setup(t);f.h.controller.publish({phase:'starting'});for(const mediaType of ['video',undefined,'screen'])assert.equal(f.check('media',{mediaType}),false);
 for(const types of [[],['video'],['audio','video'],null])assert.equal(f.request(types),false);assert.equal(f.request(['audio'],{mediaTypes:undefined}),false);for(const permission of ['speaker-selection','notifications']){assert.equal(f.check(permission,{mediaType:'audio'}),false);assert.equal(f.request(['audio'],{},f.contents,permission),false);}
});
