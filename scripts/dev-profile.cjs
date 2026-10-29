'use strict';
const fs=require('node:fs'),path=require('node:path');
const REGISTRY_NAME='.dictpin-development-profile.json';
function inside(base,target){const relative=path.relative(base,target);return relative!==''&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);}
function checkedPath(base,target){
 if(!inside(base,target))throw Error('Development profile must stay inside the sibling workspace.');
 const realBase=fs.realpathSync(base);let existing=target;
 while(!fs.existsSync(existing)){const parent=path.dirname(existing);if(parent===existing)throw Error('Development profile parent is unavailable.');existing=parent;}
 const realExisting=fs.realpathSync(existing);
 if(realExisting!==realBase&&!inside(realBase,realExisting))throw Error('Development profile links must stay inside the sibling workspace.');
 return fs.existsSync(target)?fs.realpathSync(target):target;
}
function requireSavedProfile(profile){
 if(!fs.existsSync(profile)||!fs.statSync(profile).isDirectory())throw Error('The remembered development profile is missing; no empty replacement was created.');
 const settings=path.join(profile,'settings.json');
 if(!fs.existsSync(settings)||!fs.lstatSync(settings).isFile())throw Error('The selected development profile has no saved settings.');
}
function resolveDevelopmentProfile({root,mode='remembered'}={}){
 if(!['remembered','isolated'].includes(mode))throw Error('Use --profile=remembered or --profile=isolated.');
 const checkout=path.resolve(root),base=path.resolve(checkout,'..'),registryPath=path.join(base,REGISTRY_NAME);
 const retained=path.join(base,'Dictpin-Development');
 let selected=mode==='isolated'?path.join(checkout,'work/dev/profile'):path.join(retained,'profile'),runtime=mode==='isolated'?path.join(checkout,'work'):path.join(retained,'runtime'),environment=mode==='isolated'?path.join(checkout,'work/dev'):path.join(retained,'environment'),source=mode==='isolated'?'checkout':'default';
 if(mode==='remembered'&&fs.existsSync(registryPath)){
  if(!fs.lstatSync(registryPath).isFile()||fs.lstatSync(registryPath).isSymbolicLink())throw Error('Development profile reference must be a regular local file.');
  let data;try{data=JSON.parse(fs.readFileSync(registryPath,'utf8'));}catch{throw Error('Development profile reference is invalid; no settings were changed.');}
  if(!data||data.version!==1||['profile','runtime','environment'].some(key=>typeof data[key]!=='string'||!data[key]||data[key].includes('\0')||path.isAbsolute(data[key]))||Object.keys(data).some(key=>!['version','profile','runtime','environment'].includes(key)))throw Error('Unsupported development profile reference; no settings were changed.');
  selected=path.resolve(base,data.profile);runtime=path.resolve(base,data.runtime);environment=path.resolve(base,data.environment);source='selected';
 }
 if(source==='default'&&(selected===checkout||inside(checkout,selected)))throw Error('The default retained data directory conflicts with this checkout; use isolated mode or select an existing profile.');
 const profile=checkedPath(base,selected),runtimeRoot=checkedPath(base,runtime),environmentRoot=checkedPath(base,environment);
 if(source==='selected'){requireSavedProfile(profile);for(const directory of [runtimeRoot,environmentRoot])if(!fs.existsSync(directory)||!fs.statSync(directory).isDirectory())throw Error('The remembered encryption environment is missing; no empty replacement was created.');}
 return {mode,profile,runtimeRoot,environmentRoot,registryPath,source};
}
function rememberCurrentProfile({root}={}){
 const current=resolveDevelopmentProfile({root,mode:'isolated'});requireSavedProfile(current.profile);
 const selected=()=>{const value=resolveDevelopmentProfile({root});if(['profile','runtimeRoot','environmentRoot'].some(key=>value[key]!==current[key]))throw Error('Another development profile is already selected; it was not replaced.');return value;};
 if(fs.existsSync(current.registryPath))return selected();
 const base=path.resolve(root,'..'),record={version:1,profile:path.relative(base,current.profile),runtime:path.relative(base,current.runtimeRoot),environment:path.relative(base,current.environmentRoot)};
 try{fs.writeFileSync(current.registryPath,JSON.stringify(record,null,2)+'\n',{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;}
 return selected();
}
module.exports={resolveDevelopmentProfile,rememberCurrentProfile};
