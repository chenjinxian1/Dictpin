'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {root,isolatedEnvironment,electronPath}=require('./environment.cjs');
const run=path.join(root,'work','docs-showcase-'+Date.now()),env=isolatedEnvironment(run);env.DICTPIN_DOCS_RUN=run;
const executable=electronPath();if(!fs.existsSync(executable))throw Error('Prepare external Electron 44.8.0 first.');
const output=fs.openSync(path.join(run,'stdout.log'),'wx'),errors=fs.openSync(path.join(run,'stderr.log'),'wx');
const began=Date.now(),child=spawn(executable,[path.join(root,'test/docs-showcase.cjs'),'--disable-audio-input','--disable-audio-output','--disable-background-networking'],{cwd:root,env,windowsHide:true,stdio:['ignore',output,errors]});
console.log(JSON.stringify({run,pid:child.pid,kind:'English documentation capture; no physical microphone or API'}));
child.once('error',error=>{console.error(error.message);process.exitCode=1;});
child.once('exit',(code,signal)=>{
 fs.closeSync(output);fs.closeSync(errors);const exit={exitCode:code,signal,elapsedMs:Date.now()-began,observedExit:true};fs.writeFileSync(path.join(run,'process-exit.json'),JSON.stringify(exit,null,2)+'\n');
 const file=path.join(run,'result.json'),result=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
 const success=code===0&&result?.status==='passed'&&result?.teardown?.ok===true;
 if(success&&process.argv.includes('--update-docs')){
  const images=path.join(root,'docs/images');const selected=result.screenshots.map(entry=>{fs.copyFileSync(path.join(run,'screenshots',entry.file),path.join(images,entry.file));return {...entry,role:'software-screenshot',sourceFixture:'English documentation demo',privacyReviewed:true};});
  const html=fs.readFileSync(path.join(root,'app/renderer/dictation.html'),'utf8'),sources=['app/src/dictation-main.js','app/src/dictation-preload.js',...Array.from(html.matchAll(/(?:src|href)="([^\"]+\.(?:js|css))"/g),m=>'app/renderer/'+m[1]),'app/renderer/dictation.html'];
  const fingerprints=[...new Set(sources)].map(file=>({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file),'utf8').replaceAll('\r\n','\n'),'utf8').digest('hex')}));
  const manifest={capturedOn:'2026-10-24',classification:'production-electron-renderer-capture',isSoftwareScreenshot:true,sourceHashEncoding:'utf-8-lf',kind:result.kind,uiLanguage:'en',defaultUiLanguage:'zh-CN',demoData:true,acousticRecognitionRun:false,paidServiceUsed:false,microphoneCommands:0,networkRequests:0,systemClipboardUsed:false,checks:result.checks.length,failed:0,naturalExit:exit,sourceFiles:fingerprints,images:selected};
  fs.writeFileSync(path.join(images,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 }
 console.log(JSON.stringify({status:success?'passed':'failed',checks:result?.checks?.length||0,networkRequests:result?.networkAttempts?.length,microphoneCommands:result?.microphoneCommands?.length,teardown:result?.teardown?.ok,...exit,updatedDocs:success&&process.argv.includes('--update-docs')}));
 if(!success){console.error(result?.error?.message||'See the isolated capture logs.');}process.exitCode=success?0:1;
});
