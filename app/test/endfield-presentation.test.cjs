'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ui = require('../renderer/dictation-ui-state');

test('populated result uses compact status while preserving every Unicode character', () => {
  const result = {status:'completed', text:'预算500元。\nOpenAI 😀', original:'预算500元。\nOpenAI 😀', refined:false};
  const view = ui.resultView(result);
  assert.equal(view.text, result.text);
  assert.equal(view.characters, Array.from(result.text).length);
  assert.equal(view.message, '识别原文');
  assert.equal(view.showShortcut, false);
  assert.equal(view.warning, false);
});

test('failed light edit retains its specific recovery message and original text', () => {
  const message = '整理未完成，已保留原文，请检查服务后重新听写。';
  const view = ui.resultView({status:'partial', original:'不要扩写。', message});
  assert.equal(view.text, '不要扩写。');
  assert.equal(view.message, message);
  assert.equal(view.warning, true);
});

test('starting a new dictation keeps the previous result and explains its ownership', () => {
  const view = ui.resultView({status:'completed', text:'之前的结果', refined:true}, true);
  assert.equal(view.text, '之前的结果');
  assert.equal(view.message, '正在处理新听写，上次结果仍保留。');
  assert.equal(view.warning, false);
});

test('empty result keeps its start instruction without invented metadata', () => {
  const view = ui.resultView(null);
  assert.equal(view.showShortcut, true);
  assert.equal(view.text, '');
  assert.equal(view.metadata, '');
});

test('invalid result timestamp remains readable without displaying Invalid Date', () => {
  const view = ui.resultView({status:'completed', text:'合成文字', refined:true, createdAt:'invalid'});
  assert.equal(view.message, '已轻整理');
  assert.equal(view.metadata, '4 字符');
  assert.doesNotMatch(view.metadata, /Invalid|NaN/);
});

test('missing timestamp never invents a date at the Unix epoch', () => {
  for(const createdAt of [null,undefined,'']){
    assert.equal(ui.resultView({status:'completed',text:'合成文字',createdAt}).metadata,'4 字符');
  }
});
