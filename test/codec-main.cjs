'use strict';
// Standalone codec computation fixture; never loads the product app, UI, preload or IPC.
const {app,BrowserWindow,ipcMain,session}=require('electron');const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'../work/codec');fs.mkdirSync(root,{recursive:true});
for(const [kind,leaf]of [['userData','profile'],['sessionData','session'],['temp','temp'],['crashDumps','crash']]){const p=path.join(root,leaf);fs.mkdirSync(p,{recursive:true});app.setPath(kind,p);}app.setAppLogsPath(path.join(root,'logs'));
let win;const timer=setTimeout(()=>{console.error('codec timeout');app.exit(2);},25000);
app.whenReady().then(async()=>{
 session.defaultSession.setPermissionCheckHandler(()=>false);session.defaultSession.setPermissionRequestHandler((_w,_p,done)=>done(false));
 session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_d,done)=>done({cancel:true}));
 win=new BrowserWindow({show:false,webPreferences:{preload:path.join(__dirname,'codec-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 const owner=event=>{if(event.sender!==win.webContents||event.senderFrame!==event.sender.mainFrame)throw Error('owner');};
 ipcMain.handle('codec:fixture',event=>{owner(event);return fs.readFileSync(path.resolve(__dirname,'../../local-asr-evaluation/models/sensevoice/test_wavs/zh.wav'));});
 ipcMain.handle('codec:result',(event,result)=>{owner(event);clearTimeout(timer);if(result.ok){fs.writeFileSync(path.join(root,'public-stereo.webm'),Buffer.from(result.webm));fs.writeFileSync(path.join(root,'public-decoded.pcm'),Buffer.from(result.pcm));delete result.webm;delete result.pcm;}fs.writeFileSync(path.join(root,'RESULT.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));app.exit(result.ok?0:1);});
 await win.loadFile(path.join(__dirname,'codec.html'));
}).catch(()=>app.exit(3));
