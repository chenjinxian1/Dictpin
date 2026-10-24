'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const core=require('../renderer/token-usage');
const LIMIT=200,MAX_BYTES=1024*1024,STATUSES=['pending','responded','failed','cancelled','interrupted'];
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const timestamp=value=>integer(value)&&value<=8640000000000000;
const fixedError='用量统计暂不可用；已保留原文件，不影响识别结果。';
function safeUsage(u){const result={};for(const k of core.FIELDS)result[k]=u?.[k]===null||!integer(u?.[k])?null:u[k];if(result.input!==null&&result.cacheRead!==null&&result.cacheRead>result.input)result.cacheRead=null;const known=core.FIELDS.filter(k=>result[k]!==null).length;return {...result,status:known===4?'complete':known?'partial':'unknown'};}
function atomic(file,data){
 const parent=path.dirname(file);fs.mkdirSync(parent,{recursive:true});
 if(fs.lstatSync(parent).isSymbolicLink())throw Error();
 if(fs.existsSync(file)&&(!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink()))throw Error();
 const temporary=file+'.'+process.pid+'.'+randomUUID()+'.tmp';
 try{fs.writeFileSync(temporary,data,{flag:'wx',mode:0o600});fs.renameSync(temporary,file);}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
}
function cleanRecord(r){
 if(!r||!id(r.attemptId)||!id(r.operationId)||!['asr','refiner'].includes(r.kind)||!['dictate','translate','ask','diagnostic'].includes(r.mode)||typeof r.model!=='string'||!r.model.trim()||r.model.length>160||/[\u0000-\u001f]/.test(r.model)||!timestamp(r.at))throw Error();
 const price=core.validatePrice(r.price??core.defaultPrice());
 return {attemptId:r.attemptId,operationId:r.operationId,kind:r.kind,mode:r.mode,model:r.model,at:r.at,status:'pending',finishedAt:null,httpStatus:null,durationMs:null,usage:core.normalizeUsage(null),price,estimate:{currency:price.currency,picoUnits:null,reason:'usage_missing'}};
}
function validArchive(s){
 if(!s||typeof s!=='object'||Object.keys(s).some(k=>!Object.hasOwn(core.emptySummary(),k)))throw Error();
 for(const key of ['requests','pending','responded','failed','cancelled','interrupted','unknownUsageRequests','partialUsageRequests','unpricedRequests'])if(!integer(s[key])||s[key]>s.requests)throw Error();
 if(s.pending!==0||s.responded+s.failed+s.cancelled+s.interrupted!==s.requests)throw Error();
 for(const k of core.FIELDS){const m=s.tokens?.[k];if(!m||typeof m.known!=='string'||!/^\d{1,60}$/.test(m.known)||!integer(m.reportedRequests)||!integer(m.unknownRequests)||m.reportedRequests+m.unknownRequests!==s.requests)throw Error();}
 if(!s.costs||typeof s.costs!=='object'||Array.isArray(s.costs))throw Error();
 let priced=0;for(const [currency,c]of Object.entries(s.costs)){if(!core.CURRENCIES.includes(currency)||!c||typeof c.picoUnits!=='string'||!/^\d{1,80}$/.test(c.picoUnits)||!integer(c.requests)||c.requests>s.requests)throw Error();priced+=c.requests;}
 if(priced+s.unpricedRequests!==s.requests)throw Error();
 return JSON.parse(JSON.stringify(s));
}
class UsageLedger {
 constructor(file,{readOnly=false,write=atomic,now=()=>Date.now()}={}){
  this.file=file;this.write=write;this.now=now;this.available=!readOnly;this.error=readOnly?fixedError:null;
  this.state={version:1,revision:0,startedAt:null,archive:core.emptySummary(),records:[]};
  if(readOnly)return;
  try{
   if(!fs.existsSync(file))return;const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_BYTES)throw Error();
   const input=JSON.parse(fs.readFileSync(file,'utf8'));
   if(input?.version!==1||!integer(input.revision)||!(input.startedAt===null||timestamp(input.startedAt))||!Array.isArray(input.records)||input.records.length>256)throw Error();
   const seen=new Set(),records=[];
   for(const item of input.records){
    const r=cleanRecord(item);if(seen.has(r.attemptId)||!STATUSES.includes(item.status))throw Error();seen.add(r.attemptId);
    r.status=item.status;r.finishedAt=timestamp(item.finishedAt)?item.finishedAt:null;r.httpStatus=integer(item.httpStatus)&&item.httpStatus>=100&&item.httpStatus<=599?item.httpStatus:null;
    r.durationMs=typeof item.durationMs==='number'&&Number.isFinite(item.durationMs)&&item.durationMs>=0&&item.durationMs<=3600000?item.durationMs:null;
    r.usage=safeUsage(item.usage);r.estimate=core.estimateCost(r.usage,r.price,r.model);records.push(r);
   }
   this.state={version:1,revision:input.revision,startedAt:input.startedAt,archive:validArchive(input.archive),records};
   if(records.some(r=>r.status==='pending')){const next=structuredClone(this.state);for(const r of next.records)if(r.status==='pending'){r.status='interrupted';r.finishedAt=this.now();r.usage=core.normalizeUsage(null);r.estimate=core.estimateCost(r.usage,r.price,r.model);}this.commit(next);}
  }catch{this.available=false;this.error=fixedError;}
 }
 commit(next){
  if(!this.available)return false;
  if(!integer(next.revision)||next.revision>=Number.MAX_SAFE_INTEGER){this.available=false;this.error=fixedError;return false;}
  while(next.records.length>LIMIT){const i=next.records.findIndex(r=>r.status!=='pending');if(i<0)break;const [r]=next.records.splice(i,1);next.archive=core.aggregate([r],next.archive);}
  if(next.records.length>256){this.available=false;this.error=fixedError;return false;}
  next.revision++;const data=JSON.stringify(next);
  if(Buffer.byteLength(data)>MAX_BYTES){this.available=false;this.error=fixedError;return false;}
  try{this.write(this.file,data);this.state=next;return true;}catch{this.available=false;this.error=fixedError;return false;}
 }
 record(event){
  if(!this.available||!event||typeof event!=='object')return false;
  if(event.phase==='start'){
   if(!id(event.attemptId)||this.state.records.some(r=>r.attemptId===event.attemptId))return false;
   let row;try{row=cleanRecord(event);}catch{return false;}
   const next=structuredClone(this.state);next.startedAt??=row.at;next.records.push(row);return this.commit(next);
  }
  if(event.phase!=='finish'||!id(event.attemptId))return false;
  const index=this.state.records.findIndex(r=>r.attemptId===event.attemptId&&r.status==='pending');if(index<0)return false;
  if(!['responded','failed','cancelled'].includes(event.status))return false;
  const next=structuredClone(this.state),row=next.records[index];
  row.status=event.status;row.finishedAt=timestamp(event.at)?event.at:this.now();row.httpStatus=integer(event.httpStatus)&&event.httpStatus>=100&&event.httpStatus<=599?event.httpStatus:null;
  row.durationMs=typeof event.durationMs==='number'&&Number.isFinite(event.durationMs)&&event.durationMs>=0&&event.durationMs<=3600000?event.durationMs:null;
  row.usage=safeUsage(event.usage);row.estimate=core.estimateCost(row.usage,row.price,row.model);
  return this.commit(next);
 }
 snapshot(){return {available:this.available,error:this.error,revision:this.state.revision,startedAt:this.state.startedAt,summary:core.aggregate(this.state.records,this.state.archive),recent:structuredClone(this.state.records.slice(-12))};}
}
module.exports={UsageLedger,LIMIT,MAX_BYTES};
