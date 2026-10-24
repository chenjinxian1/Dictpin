'use strict';
// Portable source validation. Never loads user profiles, starts the app, or calls a provider.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
function walk(directory){const base=path.join(root,directory);if(!fs.existsSync(base))return[];return fs.readdirSync(base,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(directory,entry.name)):[path.join(directory,entry.name)]);}
const syntax=['app','test','tools','scripts'].flatMap(walk).filter(file=>/\.(?:js|cjs)$/.test(file)).map(file=>{const result=spawnSync(process.execPath,['--check',path.join(root,file)],{encoding:'utf8',windowsHide:true,shell:false});return {file:file.replaceAll('\\','/'),status:result.status===0?'passed':'failed',...(result.status===0?{}:{error:result.stderr||result.error?.message||'Syntax checker did not exit successfully'})};});
const packageInputs=require('./package-inputs.cjs').inspectPackageInputs({sourceOnly:true});
const ignoredFiles=['work/dev/profile/settings.json','.local/dependencies.json','.env','recordings/synthetic.wav','node_modules/unit/index.js','models/synthetic.onnx','native/local-asr-worker-local03.exe'];
const ignoreText=fs.readFileSync(path.join(root,'.gitignore'),'utf8').split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith('#'));
// These exact ignore rules are part of the source contract, even before git init.
const requiredRules=['work/','.local/','.env','recordings/','node_modules/','models/','*.exe'];
const missingIgnoreRules=requiredRules.filter(rule=>!ignoreText.includes(rule));
const docs=spawnSync(process.execPath,['scripts/check-release-docs.cjs'],{cwd:root,encoding:'utf8',windowsHide:true,shell:false,maxBuffer:2*1024*1024});
let docsResult;try{docsResult=JSON.parse(docs.stdout);}catch{docsResult={status:'failed',error:docs.stderr||docs.error?.message||'Document checker produced no valid report'};}
const report={status:syntax.every(item=>item.status==='passed')&&packageInputs.status==='passed'&&!missingIgnoreRules.length&&docs.status===0&&docsResult.status==='passed'?'passed':'failed',scope:'Portable source syntax, public documentation, ignore rules, and packaging source inputs. No app, microphone, model, installer, paid service, or historical private workspace is used.',syntax:{total:syntax.length,passed:syntax.filter(item=>item.status==='passed').length,failures:syntax.filter(item=>item.status!=='passed')},packageInputs,ignores:{passed:!missingIgnoreRules.length,missingRules:missingIgnoreRules,protectedExamples:ignoredFiles},documentation:docsResult,distributionReady:false};
fs.mkdirSync(path.join(root,'work'),{recursive:true});fs.writeFileSync(path.join(root,'work/verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));process.exitCode=report.status==='passed'?0:1;
