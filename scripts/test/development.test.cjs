'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {root,isolatedEnvironment}=require('../environment.cjs'),{seedProfile}=require('../dev.cjs');
function directory(t){const work=path.join(root,'work');fs.mkdirSync(work,{recursive:true});const dir=fs.mkdtempSync(path.join(work,'development-fixture-'));t.after(()=>{assert.equal(path.dirname(dir),work);fs.rmSync(dir,{recursive:true,force:true});});return dir;}
test('development seeds local ASR with no shortcut, text service, recording retention or credential',t=>{
 const dir=directory(t);assert.equal(seedProfile(dir),true);const value=JSON.parse(fs.readFileSync(path.join(dir,'settings.json'),'utf8'));
 assert.equal(value.settings.asr.backend,'local');assert.equal(value.settings.shortcut,'');assert.equal(value.settings.refiner.enabled,false);assert.equal(value.settings.saveAudio,false);assert.equal(value.settings.saveHistory,false);assert.deepEqual(value.secrets,{});
});
test('development launcher preserves an existing profile byte for byte without reading credentials',t=>{
 const dir=directory(t),file=path.join(dir,'settings.json'),before=Buffer.from('existing synthetic opaque profile');fs.writeFileSync(file,before);
 const read=fs.readFileSync;try{fs.readFileSync=(name,...args)=>{assert.notEqual(path.resolve(String(name)),file);return read(name,...args);};assert.equal(seedProfile(dir),false);}finally{fs.readFileSync=read;}
 assert.deepEqual(fs.readFileSync(file),before);
});
test('development/test environment isolates OS data paths and drops inherited secrets and control flags',t=>{
 const dir=directory(t),env=isolatedEnvironment(dir,{PATH:'synthetic-path',SystemRoot:'C:\\Windows',OPENAI_API_KEY:'DO_NOT_FORWARD',LOCAL_DICTATION_PROFILE:'old-profile',ELECTRON_RUN_AS_NODE:'1',NODE_OPTIONS:'synthetic',HTTP_PROXY:'synthetic'});
 assert.equal(env.PATH,'synthetic-path');assert.equal(env.SystemRoot,'C:\\Windows');
 for(const key of ['OPENAI_API_KEY','LOCAL_DICTATION_PROFILE','ELECTRON_RUN_AS_NODE','NODE_OPTIONS','HTTP_PROXY'])assert.equal(env[key],undefined);
 for(const key of ['TEMP','TMP','TMPDIR','APPDATA','LOCALAPPDATA'])assert.ok(env[key].startsWith(dir+path.sep));
});
test('documentation preview exposes only approved material and keeps private boundaries intact',()=>{
 const {resolveFile}=require('../preview.cjs'),current=resolveFile('/');
 assert.equal(current,path.join(root,'docs/preview.html'));assert.match(fs.readFileSync(current,'utf8'),/<title>Dictpin · Documentation preview<\/title>/);
 assert.equal(resolveFile('/branding/hero.png'),path.join(root,'docs/branding/hero.png'));
 assert.equal(resolveFile('/images/results.png'),path.join(root,'docs/images/results.png'));
 for(const forbidden of ['/local02/index.html','/local01/index.html','/work/dev/profile/settings.json','/.local/dependencies.json','/.git/config','/README.md','/%2e%2e%2fwork/local02/reference-metadata.json','/images/%2e%2e/branding/hero.png','/images%5cresults.png','/%00/index.html','/%E0%A4%A'])assert.equal(resolveFile(forbidden),null,forbidden);
});
test('documentation preview redirects and serves images and truthful status without starting the app',async t=>{
 const {start}=require('../preview.cjs'),server=start();t.after(()=>new Promise(resolve=>server.close(resolve)));
 if(!server.listening)await new Promise(resolve=>server.once('listening',resolve));
 const origin='http://127.0.0.1:'+server.address().port,redirect=await fetch(origin+'/',{redirect:'manual'});assert.equal(redirect.status,302);assert.equal(redirect.headers.get('location'),'/index.html');
 const response=await fetch(origin+'/');assert.equal(response.status,200);assert.ok(response.url.endsWith('/index.html'));
 const html=await response.text(),source=html.match(/<img[^>]+src="([^"]+)"/)[1],image=await fetch(new URL(source,response.url));assert.equal(image.status,200);assert.match(image.headers.get('content-type'),/image\/png/);assert.ok((await image.arrayBuffer()).byteLength>100);
 const status=await fetch(new URL('status.json',response.url));assert.equal(status.status,200);assert.deepEqual(await status.json(),{status:'ready',kind:'documentation-preview',applicationStarted:false,microphoneStarted:false,providerRequests:false});
 for(const file of ['/work/dev/profile/settings.json','/.git/config','/review/local01/FINAL.json'])assert.equal((await fetch(origin+file)).status,404);
 assert.equal((await fetch(origin+'/status.json',{method:'POST'})).status,405);
 const head=await fetch(new URL(source,response.url),{method:'HEAD'});assert.equal(head.status,200);assert.match(head.headers.get('content-type'),/image\/png/);assert.equal((await head.arrayBuffer()).byteLength,0);
});

test('Electron package entry configures its isolated profile before the instance lock even when require.main belongs to Electron',t=>{
 const {createRequire}=require('node:module'),vm=require('node:vm');
 const metadata=JSON.parse(fs.readFileSync(path.join(root,'app/package.json'),'utf8'));
 const entry=path.join(root,'app',metadata.main),profile=directory(t),paths={},events=[];
 const electron={app:{
  setPath:(key,value)=>{paths[key]=value;},
  setAppLogsPath(){},
  requestSingleInstanceLock(){events.push(['lock',paths.userData]);return false;},
  quit(){events.push(['quit']);}
 }};
 const localRequire=createRequire(entry),load=id=>id==='electron'?electron:localRequire(id);
 load.main={filename:'electron'};
 const previous=process.env.LOCAL_DICTATION_PROFILE;
 try{
  process.env.LOCAL_DICTATION_PROFILE=profile;
  vm.runInNewContext(fs.readFileSync(entry,'utf8'),{require:load,module:{exports:{}},__dirname:path.dirname(entry),__filename:entry,process,console},{filename:entry});
 }finally{if(previous===undefined)delete process.env.LOCAL_DICTATION_PROFILE;else process.env.LOCAL_DICTATION_PROFILE=previous;}
 assert.equal(paths.userData,profile,'the package entry must run boot before Electron owns the lock or reads any profile');
 assert.deepEqual(events,[['lock',profile],['quit']]);
 assert.ok(metadata.build.files.includes(metadata.main),'the launch entry must also be included in packaged builds');
});

test('development launcher allows the desktop window to appear while keeping helper consoles hidden separately',t=>{
 const vm=require('node:vm'),{EventEmitter}=require('node:events'),fixture=directory(t),entryModule={exports:{}};
 const source=path.join(root,'scripts/dev.cjs'),calls=[];
 const load=id=>{
  if(id==='node:fs')return {mkdirSync(){},existsSync:()=>true,readFileSync:()=> '44.8.0'};
  if(id==='node:child_process')return {spawn:(...args)=>{calls.push(args);return new EventEmitter();}};
  if(id==='./environment.cjs')return {root:fixture,electronPath:()=>path.join(fixture,'electron.exe'),isolatedEnvironment:run=>({APPDATA:path.join(run,'appdata')})};
  return require(id);
 };
 load.main=entryModule;
 vm.runInNewContext(fs.readFileSync(source,'utf8'),{require:load,module:entryModule,process:{argv:['node',source],versions:process.versions,execPath:process.execPath},console:{log(){},error(){}}},{filename:source});
 assert.equal(calls.length,1);
 const [executable,args,options]=calls[0];
 assert.equal(executable,path.join(fixture,'electron.exe'));
 assert.equal(args[0],path.join(fixture,'app'));
 assert.equal(options.env.LOCAL_DICTATION_PROFILE,path.join(fixture,'work/dev/profile'));
 assert.equal(options.windowsHide,false,'Windows must not swallow the desktop app first show request');
 assert.equal(options.shell,false);
});
