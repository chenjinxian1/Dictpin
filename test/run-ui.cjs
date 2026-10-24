'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),kind=process.argv[2]||'local03';
const entry={extended:'interaction04-extended-ui.cjs',core:'interaction04-ui.cjs',capture:'interaction04-capture-ui.cjs',recover:'interaction04-recovery.cjs',endfield:'endfield-ui.cjs',endfield02:'endfield02-ui.cjs',local02:'local02-ui.cjs',local03:'local03-ui.cjs'}[kind];
if(!entry)throw Error('Choose local03, core, extended, capture, recover, endfield02, local02 or endfield.');
if(kind==='recover'){if(!process.argv[3])throw Error('Pass the isolated capture profile path');process.env.INTERACTION04_RECOVERY_PROFILE=path.resolve(process.argv[3]);}
const runtime=path.resolve(process.env.INTERACTION04_ELECTRON||path.join(root,'../runtime/electron.exe'));if(!fs.existsSync(runtime))throw Error('Set INTERACTION04_ELECTRON to an existing Electron 44 executable. No runtime is downloaded.');
const run=path.join(root,'work',kind+'-'+Date.now()),env={...process.env,INTERACTION04_RUN:run};
for(const key of Object.keys(env))if(/^(?:NODE_|ELECTRON_)/i.test(key)||/_PROXY$/i.test(key))delete env[key];
for(const [key,part]of [['TEMP','tmp'],['TMP','tmp'],['TMPDIR','tmp'],['APPDATA','appdata'],['LOCALAPPDATA','localappdata']]){env[key]=path.join(run,part);fs.mkdirSync(env[key],{recursive:true});}
const out=fs.openSync(path.join(run,'stdout.log'),'wx'),err=fs.openSync(path.join(run,'stderr.log'),'wx');
const args=[path.join(__dirname,entry),'--disable-audio-input','--disable-audio-output'];
if(kind==='capture'){
 const tone=path.join(run,'mathematical-440hz.wav'),rate=16000,count=rate*8,data=Buffer.alloc(44+count*2);data.write('RIFF',0);data.writeUInt32LE(36+count*2,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(rate,24);data.writeUInt32LE(rate*2,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(count*2,40);for(let i=0;i<count;i++)data.writeInt16LE(Math.round(7000*Math.sin(2*Math.PI*440*i/rate)),44+i*2);fs.writeFileSync(tone,data,{flag:'wx'});args.push('--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+tone);
}
const began=Date.now(),child=spawn(runtime,args,{env,cwd:root,windowsHide:true,stdio:['ignore',out,err]});console.log(JSON.stringify({run,pid:child.pid,kind}));
child.once('error',e=>{console.error(e.message);process.exitCode=1;});child.once('exit',(code,signal)=>{fs.closeSync(out);fs.closeSync(err);fs.writeFileSync(path.join(run,'process-exit.json'),JSON.stringify({kind,pid:child.pid,exitCode:code,signal,elapsedMs:Date.now()-began,observedExit:true},null,2));const result=path.join(run,'result.json');if(fs.existsSync(result))console.log(fs.readFileSync(result,'utf8'));process.exitCode=code??1;});
