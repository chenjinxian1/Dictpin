'use strict';
const {validateMetadata}=require('./source-citations');
const {UsageLedger}=require('./usage-ledger');
const fs=require('node:fs');const path=require('node:path');const {randomUUID}=require('node:crypto');
const {DEFAULTS,validateSettings,MAX_RECORDING_MS,resolveProviderEndpoint}=require('./settings');
const {defaultPrice}=require('../renderer/token-usage');
const dictionary=require('./dictionary');
const {normalizeDeliveryPlan}=require('./delivery-planner');
const DATA_VERSION=2,MAX_HISTORY=200,DAY=86400000,MB=1024*1024,MAX_AUDIO_BYTES=25*MB;
const AUDIO_MAGIC=Buffer.from('LDA2'),AUDIO_HEADER_LIMIT=1024;
const AUDIO_MIMES=new Set(['audio/webm','audio/webm;codecs=opus','audio/ogg','audio/ogg;codecs=opus','audio/wav','audio/mpeg','audio/mp4']);
const MODES=new Set(['dictate','translate','ask']),STATUSES=new Set(['processing','failed','completed','cancelled','dismissed']);
const TASKS=new Set(['ask','shorten','expand','rewrite','explain','translate','write']);
const AUDIO_NAME=/^([A-Za-z0-9][A-Za-z0-9_-]{0,127})\.lda$/;
const AUDIO_TEMP=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}\.lda\.\d+\.[a-f0-9-]+\.tmp$/;
function atomicBytes(file,data){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const temp=`${file}.${process.pid}.${randomUUID()}.tmp`;
  try{fs.writeFileSync(temp,data,{mode:0o600,flag:'wx'});fs.renameSync(temp,file);}
  finally{try{fs.unlinkSync(temp);}catch{}}
}
function atomicWrite(file,data){atomicBytes(file,JSON.stringify(data,null,2));}
function timestamp(value,fallback){return typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():fallback;}
function textField(value,max){return typeof value==='string'?value.slice(0,max):'';}
function capHistory(items){
  const protectedIds=new Set(items.filter(e=>e.status==='processing').slice(0,MAX_HISTORY).map(e=>e.id));
  const otherIds=new Set(items.filter(e=>e.status!=='processing').slice(0,MAX_HISTORY-protectedIds.size).map(e=>e.id));
  return items.filter(e=>protectedIds.has(e.id)||otherIds.has(e.id));
}
function noAudio(item){return {...item,audioAvailable:false,audioBytes:0};}
function normalizeHistory(item,previous=null,fromDisk=false,now=new Date().toISOString()){
  if(!item||typeof item!=='object'||!dictionary.validId(item.id)||typeof item.text!=='string'||typeof item.original!=='string')throw new Error('历史记录格式不正确');
  const record={id:item.id,createdAt:timestamp(item.createdAt,previous?.createdAt||now),original:textField(item.original,100000),text:textField(item.text,100000),refined:!!item.refined,durationMs:Number.isFinite(item.durationMs)?Math.max(0,Math.min(MAX_RECORDING_MS,item.durationMs)):0,delivery:textField(item.delivery,100),message:textField(item.message,2000),mode:MODES.has(item.mode)?item.mode:(previous?.mode||'dictate'),status:STATUSES.has(item.status)?item.status:(previous?.status||'completed')};
  if(record.status==='dismissed')Object.assign(record,{original:'',text:'',refined:false,delivery:'none'});
  for(const key of ['context','targetLanguage'])if(typeof item[key]==='string'||typeof previous?.[key]==='string')record[key]=textField(item[key]??previous[key],key==='context'?20000:35);
  if(['provided','none'].includes(item.contextSource)||previous?.contextSource)record.contextSource=['provided','none'].includes(item.contextSource)?item.contextSource:previous.contextSource;
  if(typeof item.errorCode==='string')record.errorCode=textField(item.errorCode,40);
  if(TASKS.has(item.task)||TASKS.has(previous?.task))record.task=TASKS.has(item.task)?item.task:previous.task;
  if(['recording','retry','text'].includes(item.inputSource)||previous?.inputSource)record.inputSource=['recording','retry','text'].includes(item.inputSource)?item.inputSource:previous.inputSource;
  if(dictionary.validId(item.retryOf)||dictionary.validId(previous?.retryOf))record.retryOf=dictionary.validId(item.retryOf)?item.retryOf:previous.retryOf;
  const deliveryPlan=normalizeDeliveryPlan(item.deliveryPlan);if(deliveryPlan&&record.status==='completed')record.deliveryPlan=deliveryPlan;
  if(record.mode==='ask'&&record.status==='completed'&&record.text.trim()){const metadata=validateMetadata(record.text,item.sourceMetadata);if(metadata)record.sourceMetadata=metadata;}
  const audio=fromDisk?item:previous;
  record.audioAvailable=audio?.audioAvailable===true;record.audioBytes=record.audioAvailable&&Number.isSafeInteger(audio.audioBytes)&&audio.audioBytes>0?audio.audioBytes:0;
  return record;
}
class Store {
  constructor(dir,safeStorage,platform=process.platform){
    this.dir=dir;this.safe=safeStorage;this.platform=platform;this.file=path.join(dir,'settings.json');this.historyFile=path.join(dir,'history.json');this.dictionaryFile=path.join(dir,'dictionary.json');this.schemaFile=path.join(dir,'schema.json');this.privacyFile=path.join(dir,'privacy-pending.json');this.audioDir=path.join(dir,'audio');
    this.settings=structuredClone(DEFAULTS);this.secrets={};this.keys={asr:'',refiner:''};this.history=[];this.dictionary=[];this.notices=[];this.readOnly=false;
    this.load();
    this.usageLedger=new UsageLedger(path.join(dir,'token-usage.json'),{readOnly:this.readOnly});
  }
  recordUsage(event){return this.usageLedger.record(event);}
  usageSnapshot(){return this.usageLedger.snapshot();}
  secureAvailable(){try{return !!this.safe.isEncryptionAvailable()&&(this.platform!=='linux'||!['basic_text','unknown'].includes(this.safe.getSelectedStorageBackend()));}catch{return false;}}
  read(file){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code!=='ENOENT')this.notices.push(`本地${file===this.file?'设置':file===this.historyFile?'历史':file===this.dictionaryFile?'词典':'数据标记'}无法读取；已使用空白数据，请检查数据文件。`);return null;}}
  load(){
    const data=this.read(this.file);
    if(data){try{this.settings=validateSettings(data.settings,{repairPreferredTarget:true});this.secrets=data.secrets&&typeof data.secrets==='object'?data.secrets:{};}catch{this.notices.push('保存的设置格式无效，已恢复默认设置。');}}
    for(const kind of ['asr','refiner'])if(typeof this.secrets[kind]==='string'){
      try{if(!this.secureAvailable())throw Error();this.keys[kind]=this.safe.decryptString(Buffer.from(this.secrets[kind],'base64'));}
      catch{this.notices.push(`${kind==='asr'?'识别':'整理'}密钥无法安全解密，请重新输入；未将其降级为明文。`);}
    }
    const schema=this.read(this.schemaFile);this.readOnly=Number(schema?.version)>DATA_VERSION;
    const hist=this.read(this.historyFile);const seen=new Set();
    if(Array.isArray(hist))for(const item of hist){try{const entry=normalizeHistory(item,null,true);if(entry.status==='processing'){entry.status='failed';entry.errorCode='interrupted';entry.message='上次处理被中断，可主动重试。';}if(!seen.has(entry.id)){this.history.push(entry);seen.add(entry.id);}}catch{this.notices.push('已跳过一条格式无效的历史记录。');}}
    const words=this.read(this.dictionaryFile);
    if(Array.isArray(words)){const ids=new Set(),keys=new Set();for(const item of words){try{const entry=dictionary.normalizeEntry(item,null,timestamp(item.updatedAt,new Date().toISOString()));entry.createdAt=timestamp(item.createdAt,entry.updatedAt);const key=dictionary.wordKey(entry.word);if(!ids.has(entry.id)&&!keys.has(key)&&this.dictionary.length<dictionary.LIMITS.entries){this.dictionary.push(entry);ids.add(entry.id);keys.add(key);}}catch{this.notices.push('已跳过一条格式无效的词典记录。');}}}
    if(this.readOnly){this.notices.push('本地数据由更新版本创建；当前版本以只读方式打开，避免覆盖数据。');return;}
    // Do not delete audio or overwrite a corrupt history file when its ownership cannot be established.
    this.historyReadable=Array.isArray(hist)||!fs.existsSync(this.historyFile);
    if(this.historyReadable){try{this._cleanupDataTemps();this._recoverPrivacy();this.pruneHistory();if(Array.isArray(hist)&&JSON.stringify(hist)!==JSON.stringify(this.history))atomicWrite(this.historyFile,this.history);}catch{this.notices.push('本地历史或音频清理未完成；可复制当前结果，请检查磁盘权限或可用空间后重试。');}}
    if(!schema||schema.version!==DATA_VERSION){try{atomicWrite(this.schemaFile,{version:DATA_VERSION,previousVersion:Number(schema?.version)||1,migratedAt:new Date().toISOString(),historyFormat:'array',backups:false});}catch{this.notices.push('数据版本标记保存失败；已有内容未备份或覆盖。');}}
  }
  _assertWritable(){if(this.readOnly)throw new Error('数据版本较新，当前版本不能修改本地数据');}
  _assertHistoryReadable(){this._assertWritable();if(!this.historyReadable)throw new Error('历史文件无法读取；请先修复或明确清空历史，避免误删音频');}
  _cleanupDataTemps(names=['history.json','dictionary.json','settings.json','schema.json','privacy-pending.json']){
    if(!fs.existsSync(this.dir))return;
    for(const name of fs.readdirSync(this.dir))for(const base of names){
      if(name.startsWith(base+'.')&&/^\d+(?:\.[a-f0-9-]+)?\.tmp$/.test(name.slice(base.length+1))){fs.unlinkSync(path.join(this.dir,name));break;}
    }
  }
  keyStatus(){return Object.fromEntries(['asr','refiner'].map(k=>[k,{hasKey:!!this.keys[k],hasStoredKey:!!this.secrets[k],persistent:!!this.secrets[k]&&!!this.keys[k]}]));}
  save(input){
    this._assertWritable();const settings=validateSettings(input);const keys={...this.keys},secrets={...this.secrets},notices=[];
    for(const kind of ['asr','refiner']){
      const before=this.settings[kind],after=settings[kind];
      const oldEndpoint=resolveProviderEndpoint(before.baseUrl,kind,before.protocol,before.endpointMode),newEndpoint=resolveProviderEndpoint(after.baseUrl,kind,after.protocol,after.endpointMode);
      // Quotes belong to the effective service, not a shared model name. Keep
      // historical request snapshots and equivalent base/endpoint spellings intact.
      if(oldEndpoint.endpointUrl!==newEndpoint.endpointUrl||oldEndpoint.protocol!==newEndpoint.protocol)settings.usagePrices[kind]=defaultPrice();
      const p=input[kind];const key=typeof p.key==='string'?p.key.trim():'';
      if(key.length>4096||/[\r\n\x00]/.test(key))throw Error('API 密钥格式不正确');
      if(settings[kind].baseUrl!==this.settings[kind].baseUrl&&(keys[kind]||secrets[kind])&&!key&&!p.clearKey)throw Error('API 地址已改变，请重新输入该服务的密钥，或明确清除旧密钥。');
      if(p.clearKey){keys[kind]='';delete secrets[kind];}
      if(key){keys[kind]=key;delete secrets[kind];}
      if(p.persistKey===false)delete secrets[kind];
      if(p.persistKey===true&&keys[kind]){
        if(this.secureAvailable()){try{secrets[kind]=this.safe.encryptString(keys[kind]).toString('base64');}catch{delete secrets[kind];notices.push('系统密钥加密失败，本次密钥仅用于当前会话。');}}
        else{delete secrets[kind];notices.push('系统安全存储不可用，本次密钥仅用于当前会话，退出后需要重新输入。');}
      }
    }
    atomicWrite(this.file,{version:2,settings,secrets});this.settings=settings;this.keys=keys;this.secrets=secrets;this.notices=notices;
    try{this.pruneHistory();}catch{this.notices.push('设置已保存，但历史或音频清理未完成，请检查磁盘权限或可用空间后重试。');}
    return settings;
  }
  upsertDictionary(input){
    this._assertWritable();const previous=input?.id?this.dictionary.find(e=>e.id===input.id):this.dictionary.find(e=>typeof input?.word==='string'&&dictionary.wordKey(e.word)===dictionary.wordKey(input.word.trim()));
    const entry=dictionary.normalizeEntry(input,previous);const conflict=this.dictionary.find(e=>e.id!==entry.id&&dictionary.wordKey(e.word)===dictionary.wordKey(entry.word));if(conflict)throw new Error('词典中已存在相同词语');
    const next=previous?this.dictionary.map(e=>e.id===previous.id?entry:e):[...this.dictionary,entry];if(next.length>dictionary.LIMITS.entries)throw new Error('词典最多保存 500 个条目');
    this._cleanupDataTemps(['dictionary.json']);atomicWrite(this.dictionaryFile,next);this.dictionary=next;return {...entry};
  }
  deleteDictionary(id){return this.deleteDictionaryMany([id])>0;}
  deleteDictionaryMany(ids){
    this._assertWritable();if(!Array.isArray(ids)||ids.length<1||ids.length>500)throw new Error('请选择 1 至 500 个词典条目再删除');const wanted=new Set(ids.map(dictionary.assertId));const next=this.dictionary.filter(e=>!wanted.has(e.id));const deleted=this.dictionary.length-next.length;if(deleted){this._cleanupDataTemps(['dictionary.json']);atomicWrite(this.dictionaryFile,next);this.dictionary=next;}return deleted;
  }
  _prepareDictionaryImport(text){
    const input=dictionary.parseCSV(text),next=this.dictionary.map(e=>({...e})),existingIds=new Set(next.map(e=>e.id)),changed=new Map();
    for(const row of input){
      let entry=dictionary.normalizeEntry(row);const index=next.findIndex(e=>dictionary.wordKey(e.word)===dictionary.wordKey(entry.word));
      if(index>=0){const old=next[index];entry={...entry,id:old.id,createdAt:old.createdAt};next[index]=entry;}
      else{if(next.length>=dictionary.LIMITS.entries)throw new Error('导入后词典超过 500 个条目');next.push(entry);}
      changed.set(entry.id,{word:entry.word,replacement:entry.replacement,note:entry.note,action:existingIds.has(entry.id)?'update':'add'});
    }
    const rows=[...changed.values()],imported=rows.filter(e=>e.action==='add').length,updated=rows.length-imported;
    return {next,preview:{rows,imported,updated,total:next.length}};
  }
  previewDictionaryCSV(text){this._assertWritable();return this._prepareDictionaryImport(text).preview;}
  importDictionaryCSV(text){
    this._assertWritable();const {next,preview}=this._prepareDictionaryImport(text);
    if(preview.rows.length){this._cleanupDataTemps(['dictionary.json']);atomicWrite(this.dictionaryFile,next);this.dictionary=next;}
    const {imported,updated,total}=preview;return {imported,updated,total};
  }
  exportDictionaryCSV(){return dictionary.exportCSV(this.dictionary);}
  searchDictionary(query=''){if(typeof query!=='string'||query.length>2000)throw new Error('词典搜索词格式不正确');const q=dictionary.wordKey(query.trim());return this.dictionary.filter(e=>!q||[e.word,e.replacement,e.note].some(value=>dictionary.wordKey(value).includes(q))).map(e=>({...e}));}
  _audioLimit(){return Math.min(500,Math.max(25,Number(this.settings.maxAudioMB)||100))*MB;}
  _audioDays(){return Math.min(90,Math.max(1,Number(this.settings.audioRetentionDays)||7));}
  _audioPath(id){dictionary.assertId(id);return path.join(this.audioDir,`${id}.lda`);}
  _ensureAudioDir(create=false){
    try{const stat=fs.lstatSync(this.audioDir);if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('音频目录不安全或不可用');return true;}
    catch(e){if(e.code!=='ENOENT')throw e;if(!create)return false;fs.mkdirSync(this.audioDir,{recursive:true,mode:0o700});const stat=fs.lstatSync(this.audioDir);if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('音频目录不安全或不可用');return true;}
  }
  _listAudioFiles(){if(!this._ensureAudioDir())return [];return fs.readdirSync(this.audioDir).filter(name=>AUDIO_NAME.test(name));}
  _deleteAudioFiles(ids,all=false){
    if(!this._ensureAudioDir())return;
    const names=all?fs.readdirSync(this.audioDir).filter(name=>AUDIO_NAME.test(name)||AUDIO_TEMP.test(name)):[...new Set(ids)].map(id=>`${dictionary.assertId(id)}.lda`);
    for(const name of names){try{fs.unlinkSync(path.join(this.audioDir,name));}catch(e){if(e.code!=='ENOENT')throw e;}}
  }
  _cleanupAudioTemps(){if(this._ensureAudioDir())for(const name of fs.readdirSync(this.audioDir).filter(name=>AUDIO_TEMP.test(name)))fs.unlinkSync(path.join(this.audioDir,name));}
  _readAudioFile(id,includeBytes=false){
    if(!this._ensureAudioDir())return null;const file=this._audioPath(id);let fd;
    try{
      const link=fs.lstatSync(file);if(!link.isFile()||link.isSymbolicLink())throw new Error('音频文件不安全或不可用');
      fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.size<9||stat.size>MAX_AUDIO_BYTES+AUDIO_HEADER_LIMIT+8)throw new Error('音频文件格式无效');
      const prefix=Buffer.alloc(8);if(fs.readSync(fd,prefix,0,8,0)!==8||!prefix.subarray(0,4).equals(AUDIO_MAGIC))throw new Error('音频文件格式无效');
      const headerLength=prefix.readUInt32BE(4);if(headerLength<2||headerLength>AUDIO_HEADER_LIMIT||stat.size<=8+headerLength)throw new Error('音频文件格式无效');
      const headerBytes=Buffer.alloc(headerLength);if(fs.readSync(fd,headerBytes,0,headerLength,8)!==headerLength)throw new Error('音频文件不完整');
      const header=JSON.parse(headerBytes.toString('utf8')),audioBytes=stat.size-8-headerLength;
      if(header.version!==1||!AUDIO_MIMES.has(header.mimeType)||!Number.isFinite(header.durationMs)||header.durationMs<0||header.durationMs>MAX_RECORDING_MS||!Number.isFinite(Date.parse(header.createdAt))||audioBytes>MAX_AUDIO_BYTES)throw new Error('音频文件格式无效');
      const result={mimeType:header.mimeType,durationMs:header.durationMs,createdAt:header.createdAt,audioBytes,diskBytes:stat.size};
      if(includeBytes){result.bytes=Buffer.alloc(audioBytes);let offset=0;while(offset<audioBytes){const n=fs.readSync(fd,result.bytes,offset,audioBytes-offset,8+headerLength+offset);if(!n)throw new Error('音频文件不完整');offset+=n;}}
      return result;
    }catch(e){if(e.code==='ENOENT')return null;throw e;}finally{if(fd!==undefined)fs.closeSync(fd);}
  }
  _readPrivacy(){
    let data;try{data=JSON.parse(fs.readFileSync(this.privacyFile,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw new Error('隐私清理标记无法读取，请先检查数据目录');}
    if(data?.version!==1||!Array.isArray(data.historyIds)||!Array.isArray(data.audioIds)||data.historyIds.length>MAX_HISTORY*2||data.audioIds.length>10000||[...data.historyIds,...data.audioIds].some(id=>!dictionary.validId(id)))throw new Error('隐私清理标记格式无效');return data;
  }
  _recoverPrivacy(){
    const pending=this._readPrivacy();if(!pending)return;const removed=new Set(pending.historyIds),audio=new Set(pending.audioIds);
    const next=this.history.filter(e=>!removed.has(e.id)).map(e=>pending.clearAudio||audio.has(e.id)?noAudio(e):e);
    atomicWrite(this.historyFile,next);this.history=next;this._deleteAudioFiles(pending.audioIds,pending.clearAudio===true);this._cleanupDataTemps(['history.json']);fs.unlinkSync(this.privacyFile);
  }
  _commitHistory(next,{historyIds=[],audioIds=[],clearAudio=false}={}){
    const privacy=historyIds.length||audioIds.length||clearAudio;
    if(privacy)atomicWrite(this.privacyFile,{version:1,historyIds:[...new Set(historyIds)],audioIds:[...new Set(audioIds)],clearAudio,createdAt:new Date().toISOString()});
    try{atomicWrite(this.historyFile,next);}catch(e){if(privacy){const removed=new Set(historyIds),audio=new Set(audioIds);this.history=this.history.filter(item=>!removed.has(item.id)).map(item=>clearAudio||audio.has(item.id)?noAudio(item):item);}throw e;}
    this.history=next;
    if(privacy){this._deleteAudioFiles(audioIds,clearAudio);this._cleanupDataTemps(['history.json']);fs.unlinkSync(this.privacyFile);}
  }
  getHistory(id){dictionary.assertId(id);const record=this.history.find(e=>e.id===id);return record?{...record}:null;}
  addHistory(item){
    this._assertHistoryReadable();if(!this.settings.saveHistory)return;this.pruneHistory();const previous=this.history.find(e=>e.id===item?.id),record=normalizeHistory(item,previous);
    const all=[record,...this.history.filter(e=>e.id!==record.id)],next=capHistory(all),kept=new Set(next.map(e=>e.id)),removed=all.filter(e=>!kept.has(e.id)).map(e=>e.id);
    this._commitHistory(next,{historyIds:removed,audioIds:removed});return {...record};
  }
  deleteHistory(id){
    this._assertHistoryReadable();dictionary.assertId(id);this._recoverPrivacy();const exists=this.history.some(e=>e.id===id);if(!exists)return false;
    this._commitHistory(this.history.filter(e=>e.id!==id),{historyIds:[id],audioIds:[id]});return true;
  }
  clearHistory(){
    this._assertWritable();this._recoverPrivacy();this._commitHistory([],{historyIds:this.history.map(e=>e.id),clearAudio:true});this.historyReadable=true;
  }
  clearAudio(){
    this._assertHistoryReadable();this._recoverPrivacy();const count=this.history.filter(e=>e.audioAvailable).length;this._commitHistory(this.history.map(noAudio),{clearAudio:true});return {deleted:count};
  }
  pruneHistory(now=Date.now()){
    this._assertHistoryReadable();this._recoverPrivacy();this._cleanupAudioTemps();
    const days=[1,7,30,90,365].includes(this.settings.historyRetentionDays)?this.settings.historyRetentionDays:0;
    const next=capHistory(this.history.filter(e=>e.status==='processing'||!days||Date.parse(e.createdAt)>now-days*DAY)).map(e=>({...e}));
    const keep=new Map(next.map(e=>[e.id,e])),removed=this.history.filter(e=>!keep.has(e.id)).map(e=>e.id),audioIds=new Set(removed),files=this._listAudioFiles(),fileIds=new Set(files.map(name=>name.match(AUDIO_NAME)[1])),stored=[];
    for(const id of fileIds)if(!keep.get(id)?.audioAvailable)audioIds.add(id);
    for(const record of next){
      if(!record.audioAvailable){record.audioBytes=0;continue;}
      let info;try{info=this._readAudioFile(record.id);}catch{info=null;}
      if(!info||Date.parse(info.createdAt)<=now-this._audioDays()*DAY){audioIds.add(record.id);Object.assign(record,noAudio(record));}
      else{record.audioBytes=info.audioBytes;stored.push({id:record.id,...info});}
    }
    let total=stored.reduce((sum,e)=>sum+e.diskBytes,0);stored.sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt)||a.id.localeCompare(b.id));
    for(const info of stored){if(total<=this._audioLimit())break;total-=info.diskBytes;audioIds.add(info.id);Object.assign(keep.get(info.id),noAudio(keep.get(info.id)));}
    const audioDeleted=[...audioIds].filter(id=>fileIds.has(id)).length;
    if(JSON.stringify(next)!==JSON.stringify(this.history)||audioIds.size)this._commitHistory(next,{historyIds:removed,audioIds:[...audioIds]});
    return {deleted:removed.length,audioDeleted};
  }
  saveAudio(id,audio,completion=null){
    this._assertHistoryReadable();dictionary.assertId(id);
    if(!this.settings.saveHistory||!this.settings.saveAudio)return {audioAvailable:false,audioBytes:0};
    this.pruneHistory();if(!this.history.some(e=>e.id===id))throw new Error('请先保存对应历史，再保存音频');
    if(completion&&(completion.id!==id||completion.status!=='dismissed'))throw new Error('音频保留结果与历史记录不匹配');
    const completed=completion?normalizeHistory(completion,this.history.find(e=>e.id===id)):null;
    if(!audio||(!(audio.bytes instanceof ArrayBuffer)&&!ArrayBuffer.isView(audio.bytes)))throw new Error('录音数据格式无效');
    const bytes=Buffer.from(audio.bytes instanceof ArrayBuffer?audio.bytes:audio.bytes.buffer,audio.bytes instanceof ArrayBuffer?0:audio.bytes.byteOffset,audio.bytes.byteLength);
    if(bytes.length<1||bytes.length>MAX_AUDIO_BYTES||!AUDIO_MIMES.has(audio.mimeType)||!Number.isFinite(audio.durationMs)||audio.durationMs<0||audio.durationMs>MAX_RECORDING_MS)throw new Error('音频格式、时长或大小不受支持（每条最多 25 MB）');
    const header=Buffer.from(JSON.stringify({version:1,mimeType:audio.mimeType,durationMs:audio.durationMs,createdAt:new Date().toISOString()}));const prefix=Buffer.alloc(8);AUDIO_MAGIC.copy(prefix);prefix.writeUInt32BE(header.length,4);const contents=Buffer.concat([prefix,header,bytes]);
    if(contents.length>this._audioLimit())throw new Error('音频超过本地保存容量上限');
    const existing=this.history.find(e=>e.id===id);if(existing.audioAvailable)this._commitHistory(this.history.map(e=>e.id===id?noAudio(e):e),{audioIds:[id]});
    // Evict before the write, so even transient storage stays within the hard cap.
    const stored=[];for(const record of this.history)if(record.audioAvailable){const info=this._readAudioFile(record.id);if(info)stored.push({id:record.id,...info});}
    stored.sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt)||a.id.localeCompare(b.id));let total=stored.reduce((sum,e)=>sum+e.diskBytes,0);const evicted=[];
    for(const info of stored){if(total+contents.length<=this._audioLimit())break;total-=info.diskBytes;evicted.push(info.id);}
    if(evicted.length){const ids=new Set(evicted);this._commitHistory(this.history.map(e=>ids.has(e.id)?noAudio(e):e),{audioIds:evicted});}
    this._ensureAudioDir(true);const file=this._audioPath(id);atomicBytes(file,contents);
    try{this._commitHistory(this.history.map(e=>e.id===id?{...(completed||e),audioAvailable:true,audioBytes:bytes.length}:e));}
    catch(error){try{this._deleteAudioFiles([id]);}catch{this.notices.push('音频写入未完成；下次启动会清理未关联的音频。');}throw error;}
    return {audioAvailable:true,audioBytes:bytes.length};
  }
  readAudio(id){
    this._assertHistoryReadable();dictionary.assertId(id);this.pruneHistory();if(!this.history.find(e=>e.id===id)?.audioAvailable)return null;
    const audio=this._readAudioFile(id,true);if(!audio)return null;return {bytes:audio.bytes,mimeType:audio.mimeType,durationMs:audio.durationMs};
  }
  exportAudio(id){return this.readAudio(id);}
  audioStats(){return {bytes:this.history.reduce((sum,e)=>sum+(e.audioAvailable?e.audioBytes:0),0),count:this.history.filter(e=>e.audioAvailable).length,limitBytes:this._audioLimit()};}
  rollbackMigration(){
    this._assertHistoryReadable();this.clearAudio();
    const legacyHistory=this.history.map(({id,createdAt,original,text,refined,durationMs,delivery,message})=>({id,createdAt,original,text,refined,durationMs,delivery,message}));
    const {asr,refiner,shortcut,language,deviceId,autoPaste,saveHistory}=this.settings;const settings={asr,refiner,shortcut,language,deviceId,autoPaste,saveHistory};
    atomicWrite(this.historyFile,legacyHistory);atomicWrite(this.file,{version:1,settings,secrets:this.secrets});atomicWrite(this.schemaFile,{version:1,previousVersion:DATA_VERSION,rolledBackAt:new Date().toISOString(),backups:false});
    this.history=legacyHistory;this.settings=validateSettings(settings);return {version:1,audioDeleted:true,dictionaryPreserved:true,restartRequired:true};
  }
}
module.exports={Store,atomicWrite,DATA_VERSION};
