'use strict';
// Inspect application source and documentation. Never launch, record or contact a service.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),appRoot=path.join(root,'app');
function walk(base){return fs.readdirSync(path.join(root,base),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(base,e.name)):[path.join(base,e.name).replaceAll('\\','/')]);}
const app=JSON.parse(fs.readFileSync(path.join(appRoot,'package.json'),'utf8'));
const production=app.build.files.flatMap(file=>file==='assets/**/*'?walk('app/assets'):['app/'+file]);
const source=[...production.filter(file=>/\.(?:js|cjs)$/.test(file)),...walk('scripts').filter(file=>/\.(?:js|cjs)$/.test(file))];
const syntax=source.map(file=>{const result=spawnSync(process.execPath,['--check',path.join(root,file)],{encoding:'utf8',windowsHide:true,shell:false});return{file,ok:result.status===0,...(result.status===0?{}:{error:result.stderr||result.error?.message||'Syntax checker failed'})};});
const problems=[];
const declared=new Set(production.map(file=>path.resolve(root,file)));
if(!declared.has(path.resolve(appRoot,app.main)))problems.push('Application entry is not included');
for(const file of production){
 const full=path.resolve(root,file);
 if(!full.startsWith(appRoot+path.sep)||!fs.existsSync(full)){problems.push(`${file}: missing or unsafe production file`);continue;}
 if(!/\.(?:js|cjs|css|html)$/.test(file))continue;
 const body=fs.readFileSync(full,'utf8');let refs=[];
 if(/\.(?:js|cjs)$/.test(file))refs=[...body.matchAll(/require\(['"](\.[^'"]+)['"]\)/g)].map(m=>m[1]);
 if(file.endsWith('.html'))refs=[...body.matchAll(/(?:src|href)=['"]([^'"#]+)['"]/g)].map(m=>m[1]);
 if(file.endsWith('.css'))refs=[...body.matchAll(/(?:url\(['"]?|@import\s+['"])([^'"\)]+)['"]?\)?/g)].map(m=>m[1]);
 for(const ref of refs){
  if(/^(?:https?:|data:)/.test(ref))continue;
  const base=path.resolve(path.dirname(full),ref),target=[base,base+'.js',base+'.cjs'].find(candidate=>fs.existsSync(candidate)&&fs.statSync(candidate).isFile());
  if(!target||!declared.has(target))problems.push(`${file}: missing or unpackaged dependency ${ref}`);
 }
}
const actual=walk('app');for(const file of actual)if(!declared.has(path.resolve(root,file)))problems.push(`${file}: outside production manifest`);
for(const directory of ['test','tests','app/test','app/scripts','scripts/test','tools','review','docs/release'])if(fs.existsSync(path.join(root,directory)))problems.push(`${directory}: local maintenance artifacts must stay outside public source`);
const packageInputs=require('./package-inputs.cjs').inspectPackageInputs({sourceOnly:true});
const ignores=fs.readFileSync(path.join(root,'.gitignore'),'utf8').split(/\r?\n/).map(s=>s.trim());
const missingIgnoreRules=['work/','.local/','.env','recordings/','node_modules/','models/','*.exe','test/','app/test/'].filter(rule=>!ignores.includes(rule));
const docs=spawnSync(process.execPath,['scripts/check-release-docs.cjs'],{cwd:root,encoding:'utf8',windowsHide:true,shell:false,maxBuffer:1024*1024});let documentation;
try{documentation=JSON.parse(docs.stdout);}catch{documentation={status:'failed',error:docs.stderr||'No documentation report'};}
const report={status:syntax.every(item=>item.ok)&&!problems.length&&packageInputs.status==='passed'&&!missingIgnoreRules.length&&docs.status===0&&documentation.status==='passed'?'passed':'failed',scope:'Application syntax, declared local dependencies/assets, source-only packaging inputs and usage documentation. No application, microphone, model, installer or paid service is run.',syntax:{total:syntax.length,passed:syntax.filter(item=>item.ok).length,failures:syntax.filter(item=>!item.ok)},production:{files:production.length,problems},packageInputs,ignores:{missingRules:missingIgnoreRules},documentation,distributionReady:false};
fs.mkdirSync(path.join(root,'work'),{recursive:true});fs.writeFileSync(path.join(root,'work/verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));process.exitCode=report.status==='passed'?0:1;
