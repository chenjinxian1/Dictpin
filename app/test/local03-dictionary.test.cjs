'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const dictionary=require('../src/dictionary');
const localFile=path.join(__dirname,'../src/local-dictionary.js');
function correct(text,entries){assert.ok(fs.existsSync(localFile),'the local correction module must exist');const module=require(localFile);assert.equal(typeof module.correctText,'function');return module.correctText(text,entries);}
function validate(entries){assert.equal(typeof dictionary.validateRules,'function','dictionary rules must be validated before saving');return dictionary.validateRules(entries);}
function aliases(value,word){assert.equal(typeof dictionary.normalizeAliases,'function','explicit misspellings need a bounded normalizer');return dictionary.normalizeAliases(value,word);}
const entry=(id,word,list)=>({id,word,...(list===undefined?{}:{aliases:list})});

test('an explicit multi-character Chinese misspelling is corrected locally with original offsets',()=>{
 assert.deepEqual(correct('请联系阿理巴吧团队。',[entry('alibaba','阿里巴巴',['阿理巴吧'])]),{text:'请联系阿里巴巴团队。',changes:[{from:'阿理巴吧',to:'阿里巴巴',start:3,end:7,wordId:'alibaba'}]});
});
test('legacy Chinese words and the old replacement field do not invent correction rules',()=>{
 const words=[{id:'old',word:'阿里巴巴',replacement:'阿理巴吧',future:{keep:true}}];assert.deepEqual(correct('阿理巴吧与阿里巴巴',words),{text:'阿理巴吧与阿里巴巴',changes:[]});
});
test('the longest explicit match wins independently of entry order',()=>{
 const words=[entry('short','阿里科技',['阿理']),entry('long','阿里巴巴',['阿理巴吧'])];for(const values of [words,[...words].reverse()])assert.equal(correct('阿理巴吧和阿理',values).text,'阿里巴巴和阿里科技');
});
test('generated output is never fed into another correction in the same scan',()=>{
 assert.equal(correct('阿理巴吧，阿里巴巴',[entry('first','阿里巴巴',['阿理巴吧']),entry('second','阿里科技',['阿里巴巴'])]).text,'阿里巴巴，阿里科技');
});
test('multiple changes keep source offsets even when output lengths differ',()=>{
 assert.deepEqual(correct('😀欧喷爱，欧喷爱',[entry('openai','OpenAI',['欧喷爱'])]).changes,[{from:'欧喷爱',to:'OpenAI',start:2,end:5,wordId:'openai'},{from:'欧喷爱',to:'OpenAI',start:6,end:9,wordId:'openai'}]);
});
test('explicit Latin aliases respect Unicode letters marks digits and underscores at both boundaries',()=>{
 const words=[entry('openai','OpenAI',['open ay'])];for(const text of ['préopen ay','open ayé','open ay١','open ay\u0301','e\u0301open ay','open ay_','中open ay','open ay𐐀'])assert.deepEqual(correct(text,words),{text,changes:[]});
 assert.equal(correct('Use (open ay), please.',words).text,'Use (OpenAI), please.');
});
test('explicit Unicode Latin spellings are literal and do not use compatibility case folding',()=>{
 assert.equal(correct('cafe café caféteria Kb',[entry('accent','Café',['cafe']),entry('kb','KB')]).text,'Café café caféteria Kb');
});
test('legacy complete ASCII terms retain safe canonical case without merging words',()=>{
 assert.equal(correct('Use openai, OPENAI; open ai; préopenai openaié.',[entry('openai','OpenAI')]).text,'Use OpenAI, OpenAI; open ai; préopenai openaié.');
});
test('normalizing aliases trims and deduplicates without changing the supplied array',()=>{
 const input=[' 阿理巴吧 ','阿理巴吧','阿理巴巴'];assert.deepEqual(aliases(input,'阿里巴巴'),['阿理巴吧','阿理巴巴']);assert.deepEqual(input,[' 阿理巴吧 ','阿理巴吧','阿理巴巴']);
});
test('aliases must be explicit arrays bounded to twelve entries and two hundred characters',()=>{
 for(const value of ['阿理巴吧',null,{},[1],[''],['line\nbreak'],['a'.repeat(201)],Array.from({length:13},(_,i)=>'term'+String.fromCharCode(97+i))])assert.throws(()=>aliases(value,'Correct'),/错写|纠正|字符|12/);
 assert.deepEqual(aliases([],'Correct'),[]);assert.equal(aliases(['a'.repeat(200)],'Correct')[0].length,200);
});
test('single-character Chinese sources and targets cannot become broad replacement rules',()=>{
 for(const [word,list] of [['阿里',['阿']],['阿',['阿里']],['阿里',['A阿']]])assert.throws(()=>validate([entry('single',word,list)]),/单字|汉字/);
});
test('one misspelling cannot resolve to different target spellings',()=>{
 assert.throws(()=>validate([entry('one','阿里巴巴',['阿理巴吧']),entry('two','阿里科技',['阿理巴吧'])]),/冲突|不同/);
 assert.equal(validate([entry('one','阿里巴巴',['阿理巴吧']),entry('two','阿里巴巴',['阿理巴吧'])]),true);
});
test('case and Unicode-equivalent aliases cannot bypass conflicting-target validation',()=>{
 for(const pair of [['typless','TYPLESS'],['café','cafe\u0301'],['KB','KB']])assert.throws(()=>validate([entry('one','Typeless',[pair[0]]),entry('two','Other',[pair[1]])]),/冲突|不同/);
});
test('numeric amounts dates and negations cannot be changed by ordinary saved rules',()=>{
 for(const [from,to] of [['500元','5000元'],['五月','六月'],['今天','明天'],['周三','周四'],['下午','上午'],['一千','一万'],['١٢','١٣'],['$USD','USD'],['美元','人民币'],['不要','需要'],['可行','不可行'],['no way','noway'],["don't",'do'],['nothing','something'],['without','with']])assert.throws(()=>validate([entry('unsafe',to,[from])]),/数字|金额|日期|否定|普通/);
});
test('unsafe raw rules are ignored without preventing an unrelated safe correction',()=>{
 const original='阿理巴吧费用500元，今天不要付款。';const result=correct(original,[entry('safe','阿里巴巴',['阿理巴吧']),entry('money','5000元',['500元']),entry('date','明天',['今天']),entry('negative','需要',['不要'])]);assert.equal(result.text,'阿里巴巴费用500元，今天不要付款。');assert.equal(result.changes.length,1);
});
test('ambiguous raw dictionaries fail closed instead of choosing an arbitrary spelling',()=>{
 const original='阿理巴吧';assert.deepEqual(correct(original,[entry('one','阿里巴巴',[original]),entry('two','阿里科技',[original])]),{text:original,changes:[]});
});
test('normalization retains unknown metadata when creating and updating dictionary entries',()=>{
 const created=dictionary.normalizeEntry({word:'阿里巴巴',aliases:['阿理巴吧'],future:{keep:true},extraFlag:7},null,'2026-10-23T00:00:00.000Z');assert.deepEqual(created.future,{keep:true});assert.equal(created.extraFlag,7);assert.deepEqual(created.aliases,['阿理巴吧']);
 const updated=dictionary.normalizeEntry({word:'阿里科技',note:'new',additional:{value:9}},created,'2026-10-23T01:00:00.000Z');assert.equal(updated.id,created.id);assert.equal(updated.createdAt,created.createdAt);assert.deepEqual(updated.future,{keep:true});assert.deepEqual(updated.additional,{value:9});assert.deepEqual(updated.aliases,['阿理巴吧']);
});
test('legacy normalization does not add aliases or migrate replacement into them',()=>{
 const old=dictionary.normalizeEntry({id:'old',word:'OpenAI',replacement:'old expansion',future:'retained'},null);assert.equal(Object.hasOwn(old,'aliases'),false);assert.equal(old.replacement,'old expansion');assert.equal(old.future,'retained');
});
test('an explicit empty alias list clears rules while later omitted aliases preserve the choice',()=>{
 const old=dictionary.normalizeEntry({word:'阿里巴巴',aliases:['阿理巴吧']},null);const cleared=dictionary.normalizeEntry({word:old.word,aliases:[]},old);assert.deepEqual(cleared.aliases,[]);assert.deepEqual(dictionary.normalizeEntry({word:old.word,note:'only note'},old).aliases,['阿理巴吧']);
});
test('correction leaves inputs and metadata unchanged',()=>{
 const words=[{id:'word',word:'阿里巴巴',aliases:['阿理巴吧'],future:{keep:true}}],before=structuredClone(words);correct('阿理巴吧',words);validate(words);assert.deepEqual(words,before);
});
test('spelled-out English numbers and relative dates cannot bypass high-risk protection',()=>{
 for(const [from,to] of [['one hundred','two hundred'],['today','tomorrow'],['Monday','Tuesday'],['今年','明年'],['昨日','明日']])assert.throws(()=>validate([entry('unsafe',to,[from])]),{code:'dictionary_rule'});
});
