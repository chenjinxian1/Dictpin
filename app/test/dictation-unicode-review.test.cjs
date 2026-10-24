'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {checkDictationEdit:check}=require('../src/dictation-edit');
const dictionary=[{source:'manual',word:'OpenAI'}];
test('changed term case must equal the dictionary canonical spelling',()=>{
 for(const [before,after]of [['openai','OPENAI'],['OpenAI','openai'],['OPENAI','OpenAi']])
  assert.throws(()=>check(before,after,dictionary),{code:'light_edit'});
});
test('a Unicode letter before a Latin fragment cannot create a whole-term match',()=>{
 assert.throws(()=>check('préopenai','préOpenAI',dictionary),{code:'light_edit'});
});
test('a Unicode letter after a Latin fragment cannot create a whole-term match',()=>{
 assert.throws(()=>check('openaié','OpenAIé',dictionary),{code:'light_edit'});
});
test('combining marks and non-ASCII digits are part of term boundaries',()=>{
 for(const [before,after]of [['e\u0301openai','e\u0301OpenAI'],['openai\u0301','OpenAI\u0301'],['openai١','OpenAI١']])
  assert.throws(()=>check(before,after,dictionary),{code:'light_edit'});
});
test('exact preserved raw text and exact canonical correction remain allowed',()=>{
 assert.equal(check('openai','openai',dictionary),'openai');
 assert.equal(check('Contact openai.','Contact OpenAI.',dictionary),'Contact OpenAI.');
 assert.equal(check('préopenai','préopenai',dictionary),'préopenai');
});

test('Unicode case-fold aliases do not expand ASCII-only correction',()=>{
 assert.throws(()=>check('Kb','KB',[{source:'manual',word:'KB'}]),{code:'light_edit'});
});

for(const [before,after]of [
 ['Use openai','Use openai.'],
 ['Use openai please','Use openai, please.'],
 ['嗯，Use openai','Use openai.']
])test('legal baseline cleanup keeps noncanonical dictionary case: '+JSON.stringify(before),()=>{
 assert.equal(check(before,after,dictionary),after);
});
