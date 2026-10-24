'use strict';
// Uses Chromium fake devices only. Never opens a physical microphone or the user profile.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {root,isolatedEnvironment,electronPath}=require('./environment.cjs');
const run=path.join(root,'work','local03-microphone-permissions-'+Date.now());fs.mkdirSync(run,{recursive:true});
const env=isolatedEnvironment(run);env.LOCAL03_PERMISSION_RUN=run;
const out=fs.openSync(path.join(run,'stdout.log'),'wx'),err=fs.openSync(path.join(run,'stderr.log'),'wx'),started=Date.now();
const child=spawn(electronPath(),[path.join(root,'test/local03-microphone-permissions.cjs'),'--disable-audio-input','--disable-audio-output','--use-fake-device-for-media-stream'],{cwd:root,env,windowsHide:true,stdio:['ignore',out,err]});
console.log(JSON.stringify({run,pid:child.pid,kind:'fake-only microphone permissions'}));
child.once('error',error=>{console.error(error.message);process.exitCode=1;});
child.once('close',(exitCode,signal)=>{fs.closeSync(out);fs.closeSync(err);const exit={pid:child.pid,exitCode,signal,elapsedMs:Date.now()-started,observedExit:true};fs.writeFileSync(path.join(run,'process-exit.json'),JSON.stringify(exit,null,2));const file=path.join(run,'result.json'),report=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{status:'failed',error:{message:'No final permission test result'}};console.log(JSON.stringify({run,status:report.status,checks:report.checks,error:report.error,exit}));process.exitCode=report.status==='passed'&&exitCode===0?0:1;});
