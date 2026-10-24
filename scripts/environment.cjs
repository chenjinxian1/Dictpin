'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function isolatedEnvironment(run,input=process.env){
 const env={};
 for(const key of ['PATH','Path','SystemRoot','WINDIR','SystemDrive','ComSpec','PATHEXT','USERPROFILE','USERNAME','USERDOMAIN','HOMEDRIVE','HOMEPATH','OS','PROCESSOR_ARCHITECTURE','NUMBER_OF_PROCESSORS','SESSIONNAME','LANG','TZ'])if(input[key]!==undefined)env[key]=input[key];
 for(const [key,part]of [['TEMP','tmp'],['TMP','tmp'],['TMPDIR','tmp'],['APPDATA','appdata'],['LOCALAPPDATA','localappdata']]){env[key]=path.join(run,part);fs.mkdirSync(env[key],{recursive:true});}
 return env;
}
function electronPath(){
 const local=path.join(root,'.local/dependencies.json');
 const config=fs.existsSync(local)?JSON.parse(fs.readFileSync(local,'utf8')):{};
 return path.resolve(process.env.TYPELESS_ELECTRON||config.electron||path.join(root,'../runtime/electron.exe'));
}
module.exports={root,isolatedEnvironment,electronPath};
