'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),checker=path.join(root,'scripts/package-inputs.cjs');
function inspect(options){assert.ok(fs.existsSync(checker),'Local03 needs a static package-input check separate from installer acceptance');return require(checker).inspectPackageInputs(options);}
test('doctor requires the actual Local03 candidate even when the old worker is present',()=>{
 const source=path.join(root,'scripts/dev.cjs'),module={exports:{}},candidate=path.join(root,'native/local-asr-worker-local03.exe');const calls=[];
 const load=id=>{
  if(id==='node:fs')return {existsSync:file=>path.resolve(file)!==candidate,readFileSync:()=> '44.8.0'};
  if(id==='node:child_process')return {spawn(){calls.push('spawn');throw Error('Doctor must not launch');}};
  if(id==='./environment.cjs')return {root,electronPath:()=>path.join(root,'../runtime/electron.exe'),isolatedEnvironment(){throw Error('Doctor must not prepare a user profile');}};
  return require(id);
 };load.main={};vm.runInNewContext(fs.readFileSync(source,'utf8'),{require:load,module,process:{versions:process.versions,execPath:process.execPath},console},{filename:source});
 const report=module.exports.doctor();assert.equal(report.ready,false);assert.ok(report.checks.some(c=>c.path===candidate&&c.ok===false));assert.deepEqual(calls,[]);
});
test('static checks catch a missing candidate or omitted local dictionary module without running any binary',()=>{
 const metadata=JSON.parse(fs.readFileSync(path.join(root,'app/package.json'),'utf8'));
 const good=inspect({workspaceRoot:root,metadata,exists:()=>true});assert.equal(good.status,'passed');assert.equal(good.distributionReady,false);
 const absent=inspect({workspaceRoot:root,metadata,exists:file=>!file.endsWith('local-asr-worker-local03.exe')});assert.equal(absent.status,'failed');assert.ok(absent.failures.some(c=>/local-asr-worker-local03\.exe$/.test(c.path)));
 const stripped=structuredClone(metadata);stripped.build.files=stripped.build.files.filter(f=>f!=='src/local-dictionary.js');assert.equal(inspect({workspaceRoot:root,metadata:stripped,exists:()=>true}).status,'failed');
});
test('the real development candidate, source and build inputs exist while installer acceptance remains explicit',()=>{
 const result=inspect();assert.equal(result.status,'passed',JSON.stringify(result.failures));assert.equal(result.nativeWorker,'native/local-asr-worker-local03.exe');assert.equal(result.distributionReady,false);assert.ok(result.distributionLimitations.some(item=>/安装包/.test(item)));assert.equal(result.automaticExecution,false);
});
