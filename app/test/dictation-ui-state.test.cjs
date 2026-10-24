'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const api=require('../renderer/dictation-ui-state');
test('a microphone-only save never clears or replaces a stored credential',()=>{
 assert.equal(typeof api.draftPatch,'function');const before={deviceId:'',shortcut:'Ctrl+Shift+Space',enabled:true,baseUrl:'http://127.0.0.1:9/v1',model:'synthetic',key:'',remember:false};
 assert.deepEqual(api.draftPatch(before,{...before,deviceId:'synthetic-mic'}),{deviceId:'synthetic-mic'});
});
test('unchanged empty key and remember checkbox produce no credential mutation',()=>{
 assert.equal(typeof api.draftPatch,'function');const form={deviceId:'',shortcut:'Ctrl+Shift+Space',enabled:false,baseUrl:'http://127.0.0.1:9/v1',model:'synthetic',key:'',remember:false};assert.deepEqual(api.draftPatch(form,{...form,enabled:true}),{refiner:{enabled:true},expectedRefiner:{baseUrl:form.baseUrl,model:form.model}});
});
test('new key is explicit and carries only the chosen persistence policy',()=>{
 assert.equal(typeof api.draftPatch,'function');const form={deviceId:'',shortcut:'Ctrl+Shift+Space',enabled:true,baseUrl:'x',model:'m',key:'',remember:false};assert.deepEqual(api.draftPatch(form,{...form,key:'FAKE',remember:true}),{refiner:{key:'FAKE',persistKey:true},expectedRefiner:{baseUrl:form.baseUrl,model:form.model}});
});
test('displayed shortcut comes only from registered status',()=>{
 assert.equal(typeof api.effectiveShortcut,'function');assert.equal(api.effectiveShortcut({settings:{shortcut:'RightAlt'},shortcutStatus:{}}),'快捷键未生效');assert.match(api.effectiveShortcut({shortcutStatus:{statuses:{current:{registered:true,accelerator:'Control+Shift+Space'}}}}),/Ctrl/);
});
