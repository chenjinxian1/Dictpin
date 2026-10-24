'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function inspectPackageInputs({workspaceRoot=root,metadata,exists=fs.existsSync,sourceOnly=false}={}){
 const packageInfo=metadata||JSON.parse(fs.readFileSync(path.join(workspaceRoot,'app/package.json'),'utf8'));
 const files=Array.isArray(packageInfo.build?.files)?packageInfo.build.files:[],checks=[];
 const check=(name,relative,base=workspaceRoot)=>checks.push({name,relative,path:path.join(base,relative),ok:exists(path.join(base,relative))});
 for(const file of files){if(typeof file!=='string')continue;if(file==='assets/**/*')check('Packaged asset directory','assets',path.join(workspaceRoot,'app'));else if(!/[*?{}]/.test(file))check('Packaged application file',file,path.join(workspaceRoot,'app'));}
 for(const file of ['src/dictation-entry.cjs','src/local-asr.js','src/local-dictionary.js','src/dictionary.js'])checks.push({name:'Required production module is included',relative:file,path:path.join(workspaceRoot,'app',file),ok:files.includes(file)});
 const nativeWorker='native/local-asr-worker-local03.exe';
 for(const relative of [nativeWorker,'native/LocalAsrWorker.Local03.cs','native/build-local03.cmd'])if(!sourceOnly||relative!==nativeWorker)check('Local03 development native input',relative);
 const failures=checks.filter(item=>!item.ok);
 return {status:failures.length?'failed':'passed',scope:sourceOnly?'Static source/package inputs only; the generated native executable is deliberately not required.':'Static development/package file inputs only; no binary, microphone, API, installer or application is run.',sourceOnly,automaticExecution:false,nativeWorker,checks,failures,distributionReady:false,distributionLimitations:['未构建或运行安装包，不能把清单检查当作安装与分发验收。','候选 worker、共享 ASR DLL、模型和许可证仍使用工程旁的开发布局；当前 extraResources 不代表可独立分发。','正式安装布局、资源定位、签名及许可核查需要独立完成。']};
}
module.exports={inspectPackageInputs};
if(require.main===module){if(process.argv.slice(2).some(arg=>arg!=='--source-only'))throw Error('Only --source-only is supported.');const report=inspectPackageInputs({sourceOnly:process.argv.includes('--source-only')});console.log(JSON.stringify(report,null,2));process.exitCode=report.status==='passed'?0:1;}
