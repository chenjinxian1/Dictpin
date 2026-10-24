'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {Store:LegacyStore,atomicWrite,DATA_VERSION}=require('./store');
const {DEFAULTS,validateSettings,resolveProviderEndpoint}=require('./settings');
const {defaultPrice}=require('../renderer/token-usage');
const dictionary=require('./dictionary');
const clone=value=>structuredClone(value);
function object(value){return value&&typeof value==='object'&&!Array.isArray(value);}
function withoutTransient(provider){const result={...provider};for(const key of ['key','persistKey','clearKey'])delete result[key];return result;}
class Store extends LegacyStore{
 load(){
  this.recentFile=path.join(this.dir,'recent-result.json');this.archiveFile=path.join(this.dir,'dictionary-archive.json');
  const data=this.read(this.file);this.envelope=object(data)?clone(data):{};this.settingsReadable=!fs.existsSync(this.file)||(object(data)&&object(data.settings));
  this.rawSettings=object(data?.settings)?clone(data.settings):{};
  this.secrets=object(data?.secrets)?clone(data.secrets):{};
  try{this.settings=data?validateSettings(data.settings,{repairPreferredTarget:true}):clone(DEFAULTS);this.settings.mode='dictate';}
  catch{this.settingsReadable=false;this.settings=clone(DEFAULTS);this.notices.push('旧配置无法安全迁移，原文件与密钥保持不变；当前只可查看。');}
  this.disabledModeShortcuts=clone(this.envelope.compatibility?.disabledModeShortcuts||this.rawSettings.modeShortcuts||{});
  this.disabledModeShortcutAlternates=clone(this.envelope.compatibility?.disabledModeShortcutAlternates||this.rawSettings.modeShortcutAlternates||{});
  this.settings.modeShortcuts={dictate:'',translate:'',ask:''};this.settings.modeShortcutAlternates={dictate:[],translate:[],ask:[]};
  if(!data)this.settings.asr.backend='local';
  for(const kind of ['asr','refiner'])if(typeof this.secrets[kind]==='string'){
   try{if(!this.secureAvailable())throw Error();this.keys[kind]=this.safe.decryptString(Buffer.from(this.secrets[kind],'base64'));}
   catch{this.notices.push('已保留加密配置；系统安全存储当前不可用，请重新输入本次会话密钥。');}
  }
  const schema=this.read(this.schemaFile);this.readOnly=Number(schema?.version)>DATA_VERSION;if(this.readOnly)this.notices.push('数据版本较新，已只读打开；原文件保持不变。');
  const history=this.read(this.historyFile);this.history=Array.isArray(history)?history:[];this.historyReadable=Array.isArray(history)||!fs.existsSync(this.historyFile);
  const words=this.read(this.dictionaryFile);this.dictionaryReadable=Array.isArray(words)||!fs.existsSync(this.dictionaryFile);
  this.dictionary=[];
  const wordIds=new Set(),wordKeys=new Set();let duplicateWords=false;
  if(Array.isArray(words))for(const raw of words)try{
   const entry={...raw,...dictionary.normalizeEntry(raw,raw,raw.updatedAt)},key=dictionary.wordKey(entry.word);
   if(wordIds.has(entry.id)||wordKeys.has(key)){this.dictionaryReadable=false;duplicateWords=true;}
   wordIds.add(entry.id);wordKeys.add(key);this.dictionary.push(entry);
  }catch{this.notices.push('有旧词条无法读取，原文件保持不变。');this.dictionaryReadable=false;}
  if(duplicateWords)this.notices.push('词典有重复标识或冲突词语，已只读打开；原文件完整保留，请先恢复一致数据。');
  try{dictionary.validateRules?.(this.dictionary);}catch{this.dictionaryReadable=false;this.notices.push('词典有冲突纠错规则，已只读打开；原文件完整保留。');}
  const archive=this.read(this.archiveFile);this.archive=object(archive)&&Array.isArray(archive.entries)?archive:{version:1,entries:[]};
  this.archiveReadable=!fs.existsSync(this.archiveFile)||(archive?.version===1&&Array.isArray(archive.entries));
  this.recentResult=null;const recent=this.read(this.recentFile);
  if(recent)try{this.recentResult=this.validateRecent(recent);}catch{this.notices.push('最近结果无法读取，原文件保持不变。');}
  // Intentionally no legacy prune, privacy recovery, temporary cleanup, schema write or audio deletion.
 }
 save(input){
  this._assertWritable();if(!this.settingsReadable)throw Error('旧配置无法读取，未覆盖原文件。');
  const settings=validateSettings({...input,mode:'dictate',modeShortcuts:{dictate:'',translate:'',ask:''},modeShortcutAlternates:{dictate:[],translate:[],ask:[]}}),keys={...this.keys},secrets=clone(this.secrets),notices=[];
  for(const kind of ['asr','refiner']){
   const before=this.settings[kind],after=settings[kind],p=input[kind];
   const oldEndpoint=resolveProviderEndpoint(before.baseUrl,kind,before.protocol,before.endpointMode),newEndpoint=resolveProviderEndpoint(after.baseUrl,kind,after.protocol,after.endpointMode);
   if(oldEndpoint.endpointUrl!==newEndpoint.endpointUrl||oldEndpoint.protocol!==newEndpoint.protocol||before.model!==after.model)settings.usagePrices[kind]=defaultPrice();
   const key=typeof p.key==='string'?p.key.trim():'';
   if(key.length>4096||/[\r\n\x00]/.test(key))throw Error('API 密钥格式不正确。');
   if(after.baseUrl!==before.baseUrl&&(keys[kind]||secrets[kind])&&!key&&!p.clearKey)throw Error('API 地址已改变，请重新输入密钥或明确清除旧密钥。');
   if(p.clearKey){keys[kind]='';delete secrets[kind];}
   if(key){keys[kind]=key;delete secrets[kind];}
   if(p.persistKey===false)delete secrets[kind];
   if(p.persistKey===true&&keys[kind]){
    if(this.secureAvailable())secrets[kind]=this.safe.encryptString(keys[kind]).toString('base64');
    else{delete secrets[kind];notices.push('安全存储不可用；密钥仅用于当前会话，不保存明文。');}
   }
  }
  const persisted={...clone(this.rawSettings),...settings};
  for(const kind of ['asr','refiner'])persisted[kind]={...withoutTransient(this.rawSettings[kind]||{}),...withoutTransient(settings[kind])};
  const compatibility={...this.envelope.compatibility,legacyMode:this.envelope.compatibility?.legacyMode||this.rawSettings.mode||'dictate',disabledModeShortcuts:clone(this.disabledModeShortcuts),disabledModeShortcutAlternates:clone(this.disabledModeShortcutAlternates)};
  const envelope={...clone(this.envelope),version:2,settings:persisted,secrets,compatibility};
  atomicWrite(this.file,envelope);this.envelope=clone(envelope);this.rawSettings=clone(persisted);this.settings=settings;this.keys=keys;this.secrets=secrets;this.notices=notices;
  return settings;
 }
 validateRecent(input){
  if(!object(input)||!dictionary.validId(input.id)||input.mode!=='dictate'||!['completed','failed','cancelled'].includes(input.status))throw Error('最近结果格式不正确。');
  if(typeof input.original!=='string'||typeof input.text!=='string'||input.original.length>100000||input.text.length>100000||!String(input.text||input.original).trim()||/\0/.test(input.text+input.original))throw Error('最近结果正文无效。');
  const corrected=input.corrected===undefined?input.original:input.corrected,revision=input.revision===undefined?1:input.revision,source=input.source??(input.refined?'refined':'original'),previousText=input.previousText??null;
  if(typeof corrected!=='string'||corrected.length>100000||/\0/.test(corrected)||!Number.isSafeInteger(revision)||revision<1||!['original','dictionary','refined','manual','restored'].includes(source)||previousText!==null&&(typeof previousText!=='string'||previousText.length>100000||/\0/.test(previousText)))throw Error('最近结果版本无效。');
  const corrections=input.corrections??[];
  if(!Array.isArray(corrections)||corrections.length>1000||corrections.some(c=>!object(c)||typeof c.from!=='string'||typeof c.to!=='string'||!Number.isSafeInteger(c.start)||!Number.isSafeInteger(c.end)||c.start<0||c.end<c.start||c.end>input.original.length||input.original.slice(c.start,c.end)!==c.from))throw Error('最近结果纠词记录无效。');
  return {...clone(input),id:input.id,createdAt:String(input.createdAt||''),mode:'dictate',status:input.status,original:input.original,corrected,text:input.text,revision,source,corrections:clone(corrections),previousText,refined:input.refined===true,message:String(input.message||'').slice(0,3000),durationMs:Math.max(0,Math.min(60000,Number(input.durationMs)||0))};
 }
 saveRecentResult(input){this._assertWritable();const result=this.validateRecent(input);atomicWrite(this.recentFile,result);this.recentResult=result;return clone(result);}
 getRecentResult(){return this.recentResult?clone(this.recentResult):null;}
 upsertDictionary(input){
  this._assertWritable();if(!this.dictionaryReadable)throw Error('旧词典无法安全读取，未覆盖原文件。');
  const previous=input?.id?this.dictionary.find(e=>e.id===input.id):this.dictionary.find(e=>dictionary.wordKey(e.word)===dictionary.wordKey(input?.word||''));
  const normalized=dictionary.normalizeEntry({...previous,...input},previous);
  const entry={...previous,...normalized};
  if(this.dictionary.some(e=>e.id!==entry.id&&dictionary.wordKey(e.word)===dictionary.wordKey(entry.word)))throw Error('词典中已存在这个词语。');
  const next=previous?this.dictionary.map(e=>e.id===entry.id?entry:e):[...this.dictionary,entry];
  dictionary.validateRules?.(next);
  if(next.length>500)throw Error('词典最多保存 500 个词语。');
  atomicWrite(this.dictionaryFile,next);this.dictionary=next;return clone(entry);
 }
 removeDictionary(id){
  this._assertWritable();if(!this.dictionaryReadable||!this.archiveReadable)throw Error('词典或归档不可写，未删除词语。');
  dictionary.assertId(id);const entry=this.dictionary.find(e=>e.id===id);if(!entry)throw Error('词语已变化，请刷新后重试。');
  const undoToken=randomUUID(),record={undoToken,removedAt:new Date().toISOString(),entry:clone(entry)};
  const nextArchive={...this.archive,entries:[...this.archive.entries,record]};
  if(Buffer.byteLength(JSON.stringify(nextArchive))>8*1024*1024)throw Error('词典归档空间已满，未删除词语。');
  atomicWrite(this.archiveFile,nextArchive);this.archive=nextArchive;
  const next=this.dictionary.filter(e=>e.id!==id);atomicWrite(this.dictionaryFile,next);this.dictionary=next;
  return {undoToken,word:entry.word};
 }
 restoreDictionary(token){
  this._assertWritable();if(typeof token!=='string'||!this.dictionaryReadable||!this.archiveReadable)throw Error('无法撤销这次删除。');
  const record=this.archive.entries.find(e=>e.undoToken===token);if(!record)throw Error('未找到可恢复的词语。');
  const entry=record.entry;dictionary.assertId(entry?.id);
  const existing=this.dictionary.find(e=>e.id===entry.id||dictionary.wordKey(e.word)===dictionary.wordKey(entry.word));
  if(existing){if(JSON.stringify(existing)===JSON.stringify(entry))return clone(existing);throw Error('已有同名或更新后的词语，未覆盖。');}
  if(this.dictionary.length>=500)throw Error('词典已满，归档中的词语仍保留。');
  const next=[...this.dictionary,clone(entry)];dictionary.validateRules?.(next);atomicWrite(this.dictionaryFile,next);this.dictionary=next;
  return clone(entry); // Archive remains as a non-destructive recovery record.
 }
 previewDictionaryCSV(){throw Error('当前简化版本不导入 CSV；旧词典保持不变。');}
 importDictionaryCSV(){throw Error('当前简化版本不导入 CSV；旧词典保持不变。');}
 deleteDictionary(id){return this.removeDictionary(id);}
 deleteDictionaryMany(){throw Error('请逐条删除并使用可恢复撤销。');}
 pruneHistory(){return {deleted:0,audioDeleted:0};}
 addHistory(){throw Error('旧历史为只读兼容数据；新结果单独保存。');}
 deleteHistory(){throw Error('当前版本不删除旧历史。');}
 clearHistory(){throw Error('当前版本不清空旧历史。');}
 clearAudio(){throw Error('当前版本不删除旧音频。');}
 saveAudio(){return {audioAvailable:false,audioBytes:0};}
 rollbackMigration(){throw Error('当前版本不执行破坏性旧格式转换。');}
}
module.exports={Store};
