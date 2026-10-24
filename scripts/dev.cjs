'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {root,isolatedEnvironment,electronPath}=require('./environment.cjs');
function doctor(){
 const electron=electronPath(),resourceRoot=path.resolve(root,'../local-asr-evaluation');
 const checks=[{name:'Node >=24',ok:Number(process.versions.node.split('.')[0])>=24,path:process.execPath},
  {name:'Electron 44.8.0 (external, no download)',ok:fs.existsSync(electron)&&fs.existsSync(path.join(path.dirname(electron),'version'))&&fs.readFileSync(path.join(path.dirname(electron),'version'),'utf8').trim()==='44.8.0',path:electron},
  {name:'Local03 candidate native worker (original retained separately)',ok:fs.existsSync(path.join(root,'native/local-asr-worker-local03.exe')),path:path.join(root,'native/local-asr-worker-local03.exe')}];
 for(const relative of ['runtime/bin/sherpa-onnx-c-api.dll','models/sensevoice/tokens.txt','models/sensevoice/model.int8.onnx','models/silero_vad.onnx'])checks.push({name:'Shared ASR '+relative,ok:fs.existsSync(path.join(resourceRoot,relative)),path:path.join(resourceRoot,relative)});
 checks.push({name:'Optional guarded paste helper',optional:true,ok:fs.existsSync(path.join(root,'native/dictpin-delivery.exe')),path:path.join(root,'native/dictpin-delivery.exe')});
 return {ready:checks.filter(c=>!c.optional).every(c=>c.ok),root,electron,resourceRoot,checks,profile:path.join(root,'work/dev/profile'),automaticMicrophone:false,automaticTextRequests:false,defaultGlobalShortcut:''};
}
function seedProfile(profile){
 fs.mkdirSync(profile,{recursive:true});const file=path.join(profile,'settings.json');
 if(fs.existsSync(file))return false;
 const settings=structuredClone(require('../app/src/settings').DEFAULTS);
 settings.mode='dictate';settings.asr.backend='local';settings.shortcut='';settings.modeShortcuts={dictate:'',translate:'',ask:''};settings.modeShortcutAlternates={dictate:[],translate:[],ask:[]};settings.refiner.enabled=false;settings.saveAudio=false;settings.saveHistory=false;
 fs.writeFileSync(file,JSON.stringify({version:2,settings,secrets:{}},null,2)+'\n',{flag:'wx'});return true;
}
function prepare({uiLanguage='zh-CN'}={}){
 const report=doctor();if(!report.ready)throw Error('Development prerequisites are missing. Run npm run doctor and read docs/INSTALL.md.');
 seedProfile(report.profile);const env=isolatedEnvironment(path.join(root,'work/dev'));
 env.LOCAL_DICTATION_PROFILE=report.profile;
 return {executable:report.electron,args:[path.join(root,'app'),...(uiLanguage==='en'?['--dictpin-ui-language=en']:[])],cwd:root,env};
}
function main(){
 if(process.argv.includes('--check')){const report=doctor();console.log(JSON.stringify(report,null,2));process.exitCode=report.ready?0:1;return;}
 const languageOption=process.argv.find(arg=>arg.startsWith('--ui-language='));if(languageOption&&languageOption!=='--ui-language=en')throw Error('Only --ui-language=en is supported; omit it for the default Chinese UI.');
 const plan=prepare({uiLanguage:languageOption?'en':'zh-CN'});console.log('Starting the independent development profile: '+plan.env.LOCAL_DICTATION_PROFILE);
 const child=spawn(plan.executable,plan.args,{cwd:plan.cwd,env:plan.env,stdio:'inherit',windowsHide:false,shell:false});
 child.once('error',error=>{console.error(error.message);process.exitCode=1;});child.once('exit',code=>{process.exitCode=code??1;});
}
module.exports={doctor,seedProfile,prepare};
if(require.main===module)try{main();}catch(error){console.error(error.message);process.exitCode=1;}
