'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {root,isolatedEnvironment}=require('./environment.cjs');
const work=path.join(root,'work');fs.mkdirSync(work,{recursive:true});
const env=isolatedEnvironment(path.join(work,'test-environment'));
const suites=[['application',['app/scripts/run-tests.cjs']],['development',['--test','scripts/test/development.test.cjs']]];
const reports=[];
for(const [name,args]of suites){
 const r=spawnSync(process.execPath,args,{cwd:root,env,encoding:'utf8',shell:false,windowsHide:true,maxBuffer:8*1024*1024});
 const output=(r.stdout||'')+(r.stderr||'')+(r.error?'\n'+r.error.message:'');const log=path.join(work,name+'-tests.log');fs.writeFileSync(log,output);
 const count=key=>Number(output.match(new RegExp('(?:ℹ |# )'+key+' (\\d+)'))?.[1]||0);
 const report={suite:name,status:r.status===0?'passed':'failed',exitCode:r.status,tests:count('tests'),passed:count('pass'),failed:count('fail'),log:path.relative(root,log)};reports.push(report);console.log(JSON.stringify(report));
 if(r.status!==0)console.error(output.slice(-5000));
}
fs.writeFileSync(path.join(work,'test-summary.json'),JSON.stringify({node:process.version,suites:reports},null,2)+'\n');
process.exitCode=reports.every(r=>r.status==='passed')?0:1;
