'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Store}=require('../src/dictation-store'),{DEFAULTS}=require('../src/settings'),{checkDictationEdit}=require('../src/dictation-edit'),{createOverlayLifecycle}=require('../src/dictation-overlay-lifecycle');
const WORK=path.resolve(__dirname,'../../work'),safe={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:()=> 'FAKE'};
function fixture(t){
 const dir=fs.mkdtempSync(path.join(WORK,'review-fixture-'));t.after(()=>{assert.equal(path.dirname(dir),WORK);fs.rmSync(dir,{recursive:true,force:true});});
 fs.writeFileSync(path.join(dir,'settings.json'),JSON.stringify({version:2,settings:structuredClone(DEFAULTS),secrets:{refiner:'opaque'}}));return dir;
}
test('existing malformed settings JSON is never treated as a fresh profile or overwritten',t=>{
 const dir=fixture(t),file=path.join(dir,'settings.json');fs.writeFileSync(file,'{broken');const before=fs.readFileSync(file),store=new Store(dir,safe,'win32');
 assert.throws(()=>store.save({...store.settings,theme:'dark'}));assert.deepEqual(fs.readFileSync(file),before);
});
test('dictionary cannot merge a part into apart',()=>assert.throws(()=>checkDictationEdit('We are a part of this.','We are apart of this.',[{source:'manual',word:'apart'}])));
test('dictionary cannot merge the rapist into therapist',()=>assert.throws(()=>checkDictationEdit('the rapist','therapist',[{source:'manual',word:'therapist'}])));
function lifecycle(){
 let destroyed=0,created=0,timer;const manager=createOverlayLifecycle({createWindow(){created++;return{isDestroyed:()=>false,webContents:{send(){}},showInactive(){},destroy(){destroyed++;}};},loadWindow:()=>Promise.resolve(),positionWindow(){},schedule:callback=>{timer=callback;return 1;},unschedule(){timer=null;}});
 return{manager,created:()=>created,destroyed:()=>destroyed,timer:()=>timer};
}
const recording=id=>({state:{phase:'recording',sessionId:id}}),done=id=>({state:{phase:'done'},result:{id,hasText:true}});
test('copied result stays closed on repeated done updates; new task still appears',async()=>{
 const b=lifecycle();b.manager.update(recording('A'));await Promise.resolve();await Promise.resolve();b.manager.update(done('A'));b.manager.markCopied('A');b.timer()();const count=b.created();
 b.manager.update(done('A'));assert.equal(b.created(),count);assert.equal(b.manager.getWindow(),null);
 b.manager.update(recording('B'));await Promise.resolve();await Promise.resolve();b.manager.update(done('B'));assert.ok(b.manager.getWindow());b.manager.dispose();
});
test('manual dismissal stays closed on repeated done updates',async()=>{
 const b=lifecycle();b.manager.update(recording('A'));await Promise.resolve();await Promise.resolve();b.manager.update(done('A'));b.manager.dismiss();const count=b.created();b.manager.update(done('A'));assert.equal(b.created(),count);b.manager.dispose();
});
test('unsupported inherited CSV mutation cannot overwrite an unreadable dictionary',t=>{
 const dir=fixture(t),file=path.join(dir,'dictionary.json');fs.writeFileSync(file,'{broken');const store=new Store(dir,safe,'win32');assert.throws(()=>store.importDictionaryCSV('word\nOpenAI'));assert.equal(fs.readFileSync(file,'utf8'),'{broken');
});
test('duplicate dictionary IDs remain intact and block destructive edits',t=>{
 const dir=fixture(t),file=path.join(dir,'dictionary.json'),words=[{id:'same',word:'Alpha',source:'manual'},{id:'same',word:'Beta',source:'manual'}];fs.writeFileSync(file,JSON.stringify(words));const before=fs.readFileSync(file),store=new Store(dir,safe,'win32');
 assert.equal(store.dictionaryReadable,false);assert.throws(()=>store.removeDictionary('same'));assert.deepEqual(fs.readFileSync(file),before);assert.ok(store.notices.length);
});
test('conflicting normalized word keys are kept read-only rather than silently deduplicated',t=>{
 const dir=fixture(t),file=path.join(dir,'dictionary.json');fs.writeFileSync(file,JSON.stringify([{id:'one',word:'OpenAI'},{id:'two',word:'openai'}]));const before=fs.readFileSync(file),store=new Store(dir,safe,'win32');assert.equal(store.dictionaryReadable,false);assert.throws(()=>store.upsertDictionary({id:'one',word:'Changed'}));assert.deepEqual(fs.readFileSync(file),before);
});
