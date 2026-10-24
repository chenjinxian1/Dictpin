'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{errorMessage}=require('../renderer/dictation-ui-state');
test('storage full keeps cause and a retry action without IPC or local path',()=>{const text=errorMessage(Error("Error invoking remote method 'settings:patch': Error: ENOSPC: no space left on device, open K:\\synthetic.json"),'保存失败，草稿仍保留，请重试。');assert.match(text,/空间/);assert.match(text,/重试/);assert.doesNotMatch(text,/ENOSPC|remote method|synthetic/);});
test('permission and missing file retain distinct user causes',()=>{assert.match(errorMessage(Error('EPERM: write denied'),'保存未完成，请重试。'),/权限/);assert.match(errorMessage(Error('ENOENT: missing file'),'保存未完成，请重试。'),/文件.*不存在/);});
test('known actionable Chinese failure survives Electron wrapper',()=>assert.equal(errorMessage(Error("Error invoking remote method 'word:upsert': Error: 词条已不存在，请重新添加。"),'词语未保存，请重试。'),'词条已不存在，请重新添加。'));
test('unknown technical errors use contextual fallback',()=>assert.equal(errorMessage(Error('TypeError: undefined at K:\\synthetic.cjs:4'),'撤销未完成，仍可重试。'),'撤销未完成，仍可重试。'));
