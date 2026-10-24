'use strict';
// Windows delivery is opt-in and owns only its own broker. No clipboard is read.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const TOKEN=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const REASONS=new Set(['unsupported','password','readonly','terminal','own','integrity','focus','caret','expired','missing','clipboard','keys','partial','native','busy','cancelled','protocol']);
const reason=value=>REASONS.has(value)?value:'native';
const textValid=text=>typeof text==='string'&&text.trim().length>0&&text.length<=100000&&!text.includes('\0');
class NativeDelivery{
 constructor({ownPid=process.pid,spawnImpl=spawn,exePath=path.resolve(__dirname,'../../native/dictpin-delivery.exe'),platform=process.platform,exists=fs.existsSync,timeoutMs=2500}={}){
  this.ownPid=ownPid;this.spawnImpl=spawnImpl;this.exe=exePath;this.platform=platform;this.exists=exists;this.timeoutMs=Math.max(1,Math.min(5000,timeoutMs));this.child=null;this.pending=new Map();this.sequence=0;this.disposed=false;this.ready=false;this.buffer='';
 }
 get available(){return !this.disposed&&this.platform==='win32'&&Number.isSafeInteger(this.ownPid)&&this.ownPid>0&&this.exists(this.exe);}
 _broken(){
  clearTimeout(this.bootTimer);this.ready=false;this.bootReject?.(Error('native'));this.bootResolve=this.bootReject=null;this.boot=null;
  for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(Error('native'));}this.pending.clear();this.buffer='';
  const child=this.child;this.child=null;try{child?.kill();}catch{}
 }
 _receive(message){
  if(!message||typeof message!=='object'||Array.isArray(message))throw Error('protocol');
  if(message.type==='ready'){
   if(this.ready||!this.boot||message.version!==1)throw Error('protocol');
   clearTimeout(this.bootTimer);this.ready=true;this.bootResolve();this.bootResolve=this.bootReject=null;return;
  }
  if(message.type!=='response'||!Number.isSafeInteger(message.id)||!this.pending.has(message.id))throw Error('protocol');
  const pending=this.pending.get(message.id);this.pending.delete(message.id);clearTimeout(pending.timer);pending.resolve(message);
 }
 _ensureReady(){
  if(!this.available)return Promise.reject(Error('missing'));if(this.ready)return Promise.resolve();if(this.boot)return this.boot;
  this.boot=new Promise((resolve,reject)=>{this.bootResolve=resolve;this.bootReject=reject;});const waiting=this.boot;
  try{
   const child=this.spawnImpl(this.exe,['--broker','--owner-pid',String(this.ownPid)],{cwd:path.dirname(this.exe),stdio:['pipe','pipe','pipe'],windowsHide:true,shell:false});this.child=child;
   this.bootTimer=setTimeout(()=>this._broken(),this.timeoutMs);
   child.stdout.on('data',chunk=>{if(this.child!==child)return;this.buffer+=String(chunk);if(Buffer.byteLength(this.buffer)>16384){this._broken();return;}let end;while(this.child===child&&(end=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,end);this.buffer=this.buffer.slice(end+1);try{this._receive(JSON.parse(line));}catch{this._broken();return;}}});
   child.stderr.on('data',()=>{});for(const emitter of [child,child.stdin,child.stdout,child.stderr])emitter.on('error',()=>{if(this.child===child)this._broken();});
   child.once('close',()=>{if(this.child===child)this._broken();});
  }catch{this._broken();}
  return waiting;
 }
 async _request(op,input={}){
  await this._ensureReady();if(!this.child||!this.ready||this.pending.size>=8)throw Error('native');
  const id=++this.sequence,frame=JSON.stringify({id,op,...input})+'\n';if(Buffer.byteLength(frame)>512000)throw Error('protocol');
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>this._broken(),this.timeoutMs);this.pending.set(id,{resolve,reject,timer});try{this.child.stdin.write(frame);}catch{this._broken();}});
 }
 async capture(){
  try{const r=await this._request('capture');if(r.available===true&&TOKEN.test(r.token))return{available:true,token:r.token};if(r.available!==false){this._broken();throw Error('protocol');}return{available:false,reason:reason(r.reason)};}catch{return{available:false,reason:this.available?'native':'missing'};}
 }
 async paste(input={}){
  if(!TOKEN.test(input.token)||!textValid(input.text)||typeof input.restore!=='undefined'&&typeof input.restore!=='boolean')return{status:'blocked',reason:'protocol',clipboardChanged:false};
  if(!this.available)return{status:'blocked',reason:'missing',clipboardChanged:false};
  try{const r=await this._request('paste',{token:input.token,text:input.text,restore:input.restore===true});if(!['sent','blocked','failed'].includes(r.status)||typeof r.clipboardChanged!=='boolean'){this._broken();throw Error('protocol');}return{status:r.status,reason:reason(r.reason),clipboardChanged:r.clipboardChanged};}catch{return{status:'failed',reason:'native',clipboardChanged:null};}
 }
 async discard(input={}){if(!TOKEN.test(input.token)||!this.child||!this.ready)return{discarded:false};try{return{discarded:(await this._request('discard',{token:input.token})).discarded===true};}catch{return{discarded:false};}}
 async dispose(){this.disposed=true;this._broken();}
}
const MESSAGES=Object.freeze({manual:'完成后由你复制。',preparing:'正在确认原输入框。',armed:'结束后将尝试粘贴到原输入框。',pending:'正在安全投递文字…',sent:'已发送粘贴按键；请在原输入框核对，文字也已放入剪贴板。',blocked:'未自动粘贴，文字仍在，请手动复制。',failed:'自动粘贴未完成，文字仍在，请手动复制。',cancelled:'已取消自动粘贴，文字仍在。'});
class SafePaste{
 constructor({native=new NativeDelivery(),now=()=>Date.now(),onStatus=()=>{},leaseMs=1800000}={}){this.native=native;this.now=now;this.onStatus=onStatus;this.leaseMs=Math.max(1,Math.min(1800000,leaseMs));this.generation=0;this.lease=null;this.state={status:'manual',message:MESSAGES.manual};this.disposed=false;}
 snapshot(){return{...this.state,available:this.native.available===true,helperMissing:this.native.available===false};}
 _status(status,extra={}){this.state={status,message:MESSAGES[status],...extra};try{this.onStatus(this.snapshot());}catch{}return this.snapshot();}
 async _discard(lease){if(lease?.token)try{await this.native.discard({token:lease.token});}catch{}}
 async begin(sessionId,{enabled=false,source='ui'}={}){
  const previous=this.lease;this.lease=null;const generation=++this.generation;void this._discard(previous);
  if(this.disposed||enabled!==true||source!=='shortcut'||typeof sessionId!=='string'||!sessionId||sessionId.length>128)return this._status('manual');
  const lease={sessionId,generation,createdAt:this.now(),restore:false,consumed:false};this.lease=lease;this._status('preparing');let target;
  try{target=await this.native.capture();}catch{target={available:false,reason:'native'};}
  if(this.lease!==lease||this.generation!==generation||this.disposed){void this._discard(target);return this.snapshot();}
  if(target?.available!==true||!TOKEN.test(target.token)){this.lease=null;return this._status('blocked',{reason:reason(target?.reason)});}
  lease.token=target.token;return this._status('armed');
 }
 allowRestore(sessionId){if(this.lease?.sessionId!==sessionId||this.lease.consumed)return false;this.lease.restore=true;return true;}
 cancel(sessionId,why='cancelled'){
  if(sessionId!==undefined&&this.lease?.sessionId!==sessionId)return false;
  const lease=this.lease;this.lease=null;this.generation++;void this._discard(lease);if(lease)this._status('cancelled',{reason:reason(why)});return !!lease;
 }
 async finish(result,{isCurrent=()=>false,text=result?.text}={}){
  const lease=this.lease;if(!lease||lease.sessionId!==result?.id||lease.consumed)return this.snapshot();
  const current=()=>{try{return isCurrent()===true;}catch{return false;}};
  if(!current()||result.status!=='completed'||['manual','restored'].includes(result.source)||!Number.isSafeInteger(result.revision)||result.revision<1||!textValid(text)||this.now()-lease.createdAt>=this.leaseMs){this.cancel(lease.sessionId);return this._status('blocked',{reason:this.now()-lease.createdAt>=this.leaseMs?'expired':'cancelled'});}
  lease.consumed=true;
  if(!lease.token){this.cancel(lease.sessionId);return this._status('blocked',{reason:'missing'});}
  this._status('pending');
  // Recheck after publishing: a subscriber may have cancelled or edited synchronously.
  if(this.lease!==lease)return this.snapshot();
  if(!current()){this.cancel(lease.sessionId);return this._status('blocked',{reason:'cancelled'});}
  let response;try{response=await this.native.paste({token:lease.token,text,restore:lease.restore});}catch{response={status:'failed',reason:'native',clipboardChanged:null};}
  if(this.lease!==lease)return this.snapshot();this.lease=null;void this._discard(lease);
  const status=['sent','blocked','failed'].includes(response?.status)?response.status:'failed';return this._status(status,{reason:reason(response?.reason),clipboardChanged:typeof response?.clipboardChanged==='boolean'?response.clipboardChanged:null});
 }
 async dispose(){this.disposed=true;this.cancel();await this.native.dispose?.();}
}
module.exports={NativeDelivery,SafePaste};
