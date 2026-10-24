'use strict';
// Visible, local-only test orchestration. No installation, downloads or global settings.
const fs=require('node:fs'),path=require('node:path'),{spawn,execFileSync}=require('node:child_process'),{createHash,randomUUID}=require('node:crypto');
const BASE=path.resolve(__dirname,'..');
function testEnvironment(input,run){
  const env={...input};
  // Do not inherit Node/Electron code-injection or alternate runtime settings.
  for(const key of Object.keys(env))if(/^(NODE_|ELECTRON_|.*_PROXY$)/i.test(key))delete env[key];
  Object.assign(env,{TYPELESS_TEST_RUN_DIR:run,NO_PROXY:'127.0.0.1,localhost,::1',TEMP:path.win32.join(run,'tmp'),TMP:path.win32.join(run,'tmp'),APPDATA:path.win32.join(run,'cache','roaming'),LOCALAPPDATA:path.win32.join(run,'cache','local')});
  return env;
}
function appArgs(run){return ['--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+path.win32.join(run,'mathematical-test-tone.wav'),'--disable-audio-input','--disable-audio-output','--user-data-dir='+path.win32.join(run,'profile'),path.win32.join(path.dirname(path.dirname(run)),'tools','bootstrap.cjs')];}
function assertScopedFile(base,filename){
  const realBase=fs.realpathSync(base),baseStat=fs.lstatSync(base);
  if(!baseStat.isDirectory()||baseStat.isSymbolicLink())throw Error('The test directory must be an ordinary directory.');
  const rel=path.relative(base,filename);if(rel.startsWith('..')||path.isAbsolute(rel))throw Error('File is outside the test directory.');
  let dir=path.dirname(filename);
  while(dir!==base){const st=fs.lstatSync(dir);if(!st.isDirectory()||st.isSymbolicLink())throw Error('Linked test directories are not permitted.');const next=path.dirname(dir);if(next===dir)throw Error('Invalid input parent.');dir=next;}
  const st=fs.lstatSync(filename);if(!st.isFile()||st.isSymbolicLink()||!fs.realpathSync(filename).startsWith(realBase+path.sep))throw Error('Input is not a scoped regular file.');
}
function verifyInputs(base){
  assertScopedFile(base,path.join(base,'INPUT-MANIFEST.json'));
  const manifest=JSON.parse(fs.readFileSync(path.join(base,'INPUT-MANIFEST.json'),'utf8'));
  if(manifest.version!=='0.2.1-dev.23'||!Array.isArray(manifest.files)||!manifest.files.length)throw Error('Input manifest is invalid.');
  for(const item of manifest.files){
    if(typeof item.path!=='string'||item.path.includes('\\')||item.path.split('/').some(x=>!x||x==='.'||x==='..')||path.isAbsolute(item.path))throw Error('Unsafe manifest path.');
    const filename=path.join(base,item.path);assertScopedFile(base,filename);
    const data=fs.readFileSync(filename);
    if(data.length!==item.bytes||createHash('sha256').update(data).digest('hex')!==item.sha256)throw Error('Input verification failed: '+item.path);
  }
  return manifest.files.length;
}

function samePath(left,right){return path.win32.resolve(left).replace(/^\\\\\?\\/,'').toLowerCase()===path.win32.resolve(right).replace(/^\\\\\?\\/,'').toLowerCase();}
function assertScopedDirectory(base,folder){
  const rel=path.relative(base,folder);
  if(rel.startsWith('..')||path.isAbsolute(rel))throw Error('Session directory is outside the test directory.');
  let current=base;
  for(const part of ['',...rel.split(path.sep).filter(Boolean)]){
    if(part)current=path.join(current,part);
    const st=fs.lstatSync(current);
    if(!st.isDirectory()||st.isSymbolicLink()||!samePath(fs.realpathSync(current),current))throw Error('A linked or redirected directory is not an ordinary test directory.');
  }
  return folder;
}
function resolveSession(base,value){
  if(typeof value!=='string'||!path.isAbsolute(value)||!samePath(path.dirname(value),path.join(base,'sessions'))||!/^test-\d{4,}$/.test(path.basename(value)))throw Error('A dedicated new session directory is required.');
  return assertScopedDirectory(base,path.resolve(value));
}
function findTestProcesses(base,inventory,ownPid){
  if(!Array.isArray(inventory))throw Error('Process inventory is unavailable; no test was started.');
  const scripts={runner:path.join(base,'tools','run-text-test.cjs'),mock:path.join(base,'tools','fixture.cjs'),app:path.join(base,'tools','bootstrap.cjs')};
  const runtime=path.join(base,'runtime','electron.exe'),found=[];
  for(const item of inventory){
    if(!item||!Number.isInteger(item.ProcessId))throw Error('Process inventory is invalid; no test was started.');
    if(item.ProcessId===ownPid)continue;
    const exe=item.ExecutablePath,command=item.CommandLine;
    const words=typeof command==='string'?[...command.matchAll(/"([^"]*)"|([^\s"]+)/g)].map(match=>match[1]??match[2]):[];
    const role=Object.keys(scripts).find(key=>words.some(word=>samePath(word,scripts[key])));
    const isRuntime=typeof exe==='string'&&samePath(exe,runtime);
    const isTool=typeof exe==='string'&&/^(?:node|electron)\.exe$/i.test(path.win32.basename(exe))&&role;
    if(isRuntime||isTool)found.push({pid:item.ProcessId,role:role||'runtime',executable:exe,commandLine:command||''});
  }
  return found;
}
function readProcessInventory(base){
  const quote=value=>"'"+value.replace(/'/g,"''")+"'";
  const runtime=quote(path.join(base,'runtime','electron.exe')),tools=quote('*'+path.join(base,'tools','*.cjs')+'*');
  const script="$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $items=@(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq "+runtime+" -or ($_.Name -in @('node.exe','electron.exe') -and $_.CommandLine -like "+tools+") } | Select-Object ProcessId,ParentProcessId,ExecutablePath,CommandLine); ConvertTo-Json -InputObject $items -Compress -Depth 3";
  const powershell=path.win32.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  let data;
  try{data=execFileSync(powershell,['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:4*1024*1024,env:{...process.env,TEMP:base,TMP:base,APPDATA:base,LOCALAPPDATA:base}});}
  catch{throw Error('Cannot check current test processes. No app was started and earlier test data was preserved.');}
  try{const result=JSON.parse(data.replace(/^\uFEFF/,''));if(!Array.isArray(result))throw Error();return result;}
  catch{throw Error('Process inventory is invalid. No test was started.');}
}
function createSession(base){
  const sessions=path.join(base,'sessions');
  try{fs.mkdirSync(sessions);}catch(error){if(error.code!=='EEXIST')throw error;}
  assertScopedDirectory(base,sessions);
  for(let index=1;index<=9999;index++){
    const run=path.join(sessions,'test-'+String(index).padStart(4,'0'));
    try{fs.mkdirSync(run);}catch(error){if(error.code==='EEXIST')continue;throw error;}
    resolveSession(base,run);
    for(const dir of ['tmp','cache','cache/roaming','cache/local'])fs.mkdirSync(path.join(run,dir));
    return run;
  }
  throw Error('No unused session directory is available; earlier sessions were preserved.');
}
function prepareLaunch(base,{readProcesses=readProcessInventory,ownPid=process.pid}={}){
  const active=()=>findTestProcesses(base,readProcesses(base),ownPid);
  let running=active();
  if(running.length)return{status:'active',processes:running};
  assertScopedDirectory(base,base);
  const guard=path.join(base,'launcher-guard'),ownerFile=path.join(guard,'owner.json');
  const readOwner=()=>{
    assertScopedDirectory(base,guard);
    const names=fs.readdirSync(guard);
    if(names.length!==1||names[0]!=='owner.json')throw Error('Unrecognized launcher guard files were preserved; no test was started.');
    assertScopedFile(base,ownerFile);
    if(fs.statSync(ownerFile).size>4096)throw Error('Unrecognized launcher guard was preserved.');
    const owner=JSON.parse(fs.readFileSync(ownerFile,'utf8'));
    if(owner.schema!==1||!Number.isInteger(owner.pid)||typeof owner.base!=='string'||!samePath(owner.base,base)||typeof owner.token!=='string'||!/^[0-9a-f-]{36}$/.test(owner.token))throw Error('Unrecognized launcher guard was preserved.');
    return owner;
  };
  try{fs.mkdirSync(guard);}catch(error){
    if(error.code!=='EEXIST')throw error;
    running=active();
    if(running.length)return{status:'active',processes:running};
    const previous=readOwner();
    // Only the tiny recognized guard is reclaimed. Session/profile data is never moved.
    if(readOwner().token!==previous.token)throw Error('Launcher guard changed; no test was started.');
    fs.unlinkSync(ownerFile);fs.rmdirSync(guard);
    fs.mkdirSync(guard);
  }
  const token=randomUUID();
  fs.writeFileSync(ownerFile,JSON.stringify({schema:1,pid:ownPid,base:path.resolve(base),token}),{flag:'wx'});
  const release=()=>{
    try{
      if(readOwner().token!==token)return false;
      fs.unlinkSync(ownerFile);fs.rmdirSync(guard);return true;
    }catch{return false;}
  };
  try{return{status:'ready',runDir:createSession(base),release};}catch(error){release();throw error;}
}

async function run(){
  if(process.platform!=='win32'||process.versions.electron!=='44.8.0')throw Error('Use the verified Windows Electron 44.8.0 runtime.');
  if(path.resolve(__dirname)!==path.join(BASE,'tools'))throw Error('Legacy helper directory does not match its project root.');
  if(fs.realpathSync(BASE).replace(/^\\\\\?\\/, '').toLowerCase()!==BASE.toLowerCase())throw Error('The test directory must not be redirected through a junction.');
  const count=verifyInputs(BASE),runtime=path.join(BASE,'runtime','electron.exe');
  assertScopedFile(BASE,runtime);
  if(path.resolve(process.execPath).toLowerCase()!==runtime.toLowerCase())throw Error('Unexpected runtime path.');
  const launch=prepareLaunch(BASE);
  if(launch.status==='active'){
    console.log('This dedicated local test still has running components. Use the existing app/tray or finish that session first.');
    for(const item of launch.processes)console.log(item.role+' PID '+item.pid+': '+item.executable);
    console.log('No new app was started. Existing processes and all earlier test data were left untouched.');
    return;
  }
  try{
  const runDir=launch.runDir;
  console.log(`Verified ${count} test input files. Starting localhost mock only.`);
  const env=testEnvironment(process.env,runDir),children=new Set();let stopping=false;
  const start=(args,childEnv)=>{
    if(stopping)throw Error('The test was cancelled; no additional process will be started.');
    const child=spawn(runtime,args,{cwd:BASE,env:childEnv,stdio:'inherit',windowsHide:false,shell:false});children.add(child);
    child.on('exit',()=>children.delete(child));return child;
  };
  const stop=()=>{if(stopping)return;stopping=true;for(const child of children)if(child.exitCode===null)child.kill();};
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  let fixtureError,appChild;
  try{
    const fixture=start([path.join(BASE,'tools','fixture.cjs')],{...env,ELECTRON_RUN_AS_NODE:'1'});
    fixture.once('error',error=>{fixtureError=error;});
    const readyFile=path.join(runDir,'READY.json'),deadline=Date.now()+15000;
    while(!fs.existsSync(readyFile)){
      if(stopping||fixtureError||fixture.exitCode!==null||Date.now()>deadline)throw fixtureError||Error('Local mock did not become ready.');
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    if(stopping||fixtureError||fixture.exitCode!==null)throw fixtureError||Error('The test was cancelled or the local mock exited.');
    const ready=JSON.parse(fs.readFileSync(readyFile,'utf8'));
    if(!/^http:\/\/127\.0\.0\.1:\d+\/v1$/.test(ready.mockUrl)||ready.credentials!=='empty')throw Error('Unexpected mock destination.');
    const settings=JSON.parse(fs.readFileSync(path.join(runDir,'profile','settings.json'),'utf8')).settings;
    if(!settings||settings.shortcut||Object.values(settings.modeShortcuts||{}).some(Boolean)||Object.values(settings.modeShortcutAlternates||{}).some(x=>x.length)||settings.autoPaste||settings.saveAudio||settings.asr?.baseUrl!==ready.mockUrl||settings.refiner?.baseUrl!==ready.mockUrl)throw Error('Unsafe test configuration.');
    const args=appArgs(runDir);
    fs.writeFileSync(path.join(runDir,'launcher.json'),JSON.stringify({at:new Date().toISOString(),version:'0.2.1-dev.23',test:'text-only manual workflow',runtime,argv:args,globalShortcuts:'disabled',source:'frozen dev23',physicalMicrophone:false},null,2),{flag:'wx'});
    console.log('Opening the test app. Use typed synthetic text only. Do not click Record or change API destinations.');
    console.log('Exit using the app tray menu: Quit. Keep this console open; Ctrl+C stops only processes launched here.');
    appChild=start(args,env);
    const code=await new Promise((resolve,reject)=>{appChild.once('error',reject);appChild.once('exit',resolve);});
    if(code!==0&&code!==null&&!stopping)throw Error('The application exited with code '+code);
  }finally{
    stop();process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
  }
  console.log('This test session ended. Its data stays in '+runDir+'. Earlier sessions were preserved.');
  }finally{launch.release();}
}
module.exports={testEnvironment,appArgs,verifyInputs,assertScopedFile,findTestProcesses,readProcessInventory,prepareLaunch,resolveSession};
if(require.main===module){console.error('Legacy compatibility module only. Use npm run dev for the current product.');process.exitCode=1;}
