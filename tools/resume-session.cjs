'use strict';
// Normal launch of one existing synthetic-test session. No diagnostic/control API.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {verifyInputs,assertScopedFile,resolveSession,appArgs,testEnvironment,readProcessInventory,findTestProcesses}=require('./run-text-test.cjs');
const BASE=path.resolve(__dirname,'..');
function prepareResume(base=BASE,{readProcesses=readProcessInventory,ownPid=process.pid}={}){
  const active=findTestProcesses(base,readProcesses(base),ownPid);
  if(active.length)return {status:'active'};
  verifyInputs(base);
  const run=resolveSession(base,path.join(base,'sessions','test-0001'));
  // Existence/scope checks only. Never parse, copy, decrypt or replace settings.
  for(const rel of ['profile/settings.json','mathematical-test-tone.wav'])assertScopedFile(base,path.join(run,rel));
  const runtime=path.join(base,'runtime','electron.exe');assertScopedFile(base,runtime);
  return {status:'ready',run,runtime,args:appArgs(run)};
}
async function run(){
  const prepared=prepareResume();
  if(prepared.status==='active'){console.log('The dedicated session already has running components. Use its existing window; nothing was started.');return 0;}
  console.log('Resuming existing sessions/test-0001. Saved configuration is retained; no empty fixture is created.');
  const child=spawn(prepared.runtime,prepared.args,{cwd:BASE,env:testEnvironment(process.env,prepared.run),stdio:'inherit',shell:false,windowsHide:false});
  return new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code??1));});
}
module.exports={prepareResume,run};
if(require.main===module){console.error('Legacy compatibility module only. Use npm run dev for the current product.');process.exitCode=1;}
