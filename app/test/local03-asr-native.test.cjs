'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const exe=path.resolve(__dirname,'../../native/local-asr-worker-local03.exe');
test('Local03 candidate rejects every non-whitelisted thread argument before loading a model',()=>{
 for(const args of [[],['--threads','0'],['--threads','3'],['--threads','8'],['--threads','02'],['--threads','1','extra'],['--model','untrusted']]){
  const child=spawnSync(exe,args,{encoding:'utf8',windowsHide:true,timeout:3000,env:{SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR}});
  assert.equal(child.error,undefined);assert.equal(child.status,70);assert.equal(child.signal,null);assert.ok(!child.stdout.includes('"type":"ready"'));assert.ok(!child.stdout.includes('untrusted'));
 }
});
test('Local03 public quality scores distinguish Chinese character and English word errors',()=>{
 const {quality,quantile}=require('../../scripts/local03-benchmark.cjs');
 assert.deepEqual(quality('你好，世界。','你好世间','cmn_hans_cn'),{metric:'CER',edits:1,referenceUnits:4});
 assert.deepEqual(quality('Hello, good world!','hello world','en_us'),{metric:'WER',edits:1,referenceUnits:3});
 assert.equal(quantile([4,1,3,2],.95),4);
});
