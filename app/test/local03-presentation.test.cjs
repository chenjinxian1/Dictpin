'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),ui=require('../renderer/dictation-ui-state');
test('an intentionally emptied manual draft stays empty instead of revealing the original',()=>{
 const view=ui.resultView({id:'x',original:'原文',text:'',source:'manual',status:'completed'});
 assert.equal(view.text,'');assert.equal(view.message,'已手动修改');
});
test('processing original availability describes the visible text without claiming another step is unnecessary',()=>{
 const view=ui.sessionView({state:{phase:'processing'},canUseOriginal:true});
 assert.equal(view.cancelLabel,'结束整理');assert.match(view.detail,/复制/);
});
test('optional copy shortcut is saved independently without submitting model or key drafts',()=>{
 const before={deviceId:'',shortcut:'',copyShortcut:'',enabled:false,baseUrl:'x',model:'y',key:'',remember:false};
 assert.deepEqual(ui.draftPatch(before,{...before,copyShortcut:'Ctrl+Shift+C'}),{copyShortcut:'Ctrl+Shift+C'});
});
test('key recording produces an accelerator and ignores plain typing or modifier-only keys',()=>{
 assert.equal(typeof ui.acceleratorForKey,'function');
 assert.equal(ui.acceleratorForKey({key:' ',code:'Space',ctrlKey:true,shiftKey:true}),'Ctrl+Shift+Space');
 assert.equal(ui.acceleratorForKey({key:'a'}),null);assert.equal(ui.acceleratorForKey({key:'Control',ctrlKey:true}),null);
});
test('the previous manual draft remains clearly labelled during recognition of a new segment',()=>{
 assert.match(ui.resultView({id:'old',source:'manual',text:'稿子',original:'原文',status:'completed'},true,'new').message,/上次/);
 assert.equal(ui.resultView({id:'same',source:'restored',text:'原文',original:'原文',corrections:[{}],status:'completed'}).message,'已还原文字');
});
