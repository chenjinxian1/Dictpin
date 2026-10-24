'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Store}=require('../src/dictation-store'),{DEFAULTS}=require('../src/settings');
const WORK=path.resolve(__dirname,'../../work'),safe={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:()=> 'FAKE'};
function fixture(t){
 const dir=fs.mkdtempSync(path.join(WORK,'dictation-data-'));t.after(()=>{assert.equal(path.dirname(dir),WORK);fs.rmSync(dir,{recursive:true,force:true});});
 fs.writeFileSync(path.join(dir,'settings.json'),JSON.stringify({version:2,settings:structuredClone(DEFAULTS),secrets:{}}));
 return {dir,store:new Store(dir,safe,'win32')};
}
test('full recent result survives a fresh Store without appending to legacy history',t=>{
 const {dir,store}=fixture(t);assert.equal(typeof store.saveRecentResult,'function');
 const result={id:'synthetic-result',createdAt:'2026-10-19T00:00:00.000Z',mode:'dictate',status:'completed',original:'完整原文，不删除500。',text:'完整原文，不删除500。',refined:false,message:'',durationMs:100};
 store.saveRecentResult(result);assert.deepEqual(new Store(dir,safe,'win32').recentResult,{...result,corrected:result.original,revision:1,source:'original',corrections:[],previousText:null});assert.equal(fs.existsSync(path.join(dir,'history.json')),false);
});
test('word deletion is archived and undo restores exact unknown fields',t=>{
 const {store,dir}=fixture(t);const word=store.upsertDictionary({word:'OpenAI',note:'legacy note'});word.future={keep:true};store.dictionary[0]=word;fs.writeFileSync(path.join(dir,'dictionary.json'),JSON.stringify([word]));
 assert.equal(typeof store.removeDictionary,'function');const removal=store.removeDictionary(word.id);assert.equal(store.dictionary.length,0);assert.ok(removal.undoToken);
 assert.ok(fs.readFileSync(path.join(dir,'dictionary-archive.json'),'utf8').includes('legacy note'));store.restoreDictionary(removal.undoToken);assert.deepEqual(store.dictionary[0],word);
});
test('editing only a visible word preserves old notes and unknown metadata',t=>{
 const {store,dir}=fixture(t);const word=store.upsertDictionary({word:'OpenAI',note:'legacy note'});word.future={keep:true};store.dictionary[0]=word;fs.writeFileSync(path.join(dir,'dictionary.json'),JSON.stringify([word]));
 const edited=store.upsertDictionary({id:word.id,word:'OpenAI Labs'});assert.equal(edited.note,'legacy note');assert.deepEqual(edited.future,{keep:true});
});
