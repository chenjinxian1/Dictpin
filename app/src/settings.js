'use strict';
const {normalizeAccelerator}=require('./shortcut-manager');
const {defaultPrice,validatePrice}=require('../renderer/token-usage');
const {resolveProviderEndpoint}=require('../renderer/provider-endpoint');
const MAX_RECORDING_MS=540000;
const MODES=Object.freeze(['dictate','translate','ask']);
const TASKS=Object.freeze(['ask','shorten','expand','rewrite','explain','translate','write']);
const DEFAULTS = Object.freeze({
  copyShortcut:'',
  asr: {backend:'cloud',baseUrl:'https://api.openai.com/v1', model:'whisper-1',protocol:'openai-transcriptions',endpointMode:'base'},
  refiner: {baseUrl:'https://api.openai.com/v1', model:'gpt-4.1-mini',endpointMode:'base', enabled:false,citationFormat:'none'},
  usagePrices:{asr:defaultPrice(),refiner:defaultPrice()},
  shortcut:'CommandOrControl+Shift+Space', modeShortcuts:{dictate:'CommandOrControl+Shift+1',translate:'CommandOrControl+Shift+2',ask:'CommandOrControl+Shift+3'}, language:'zh', deviceId:'', autoPaste:false, saveHistory:true,
  modeShortcutAlternates:Object.freeze({dictate:Object.freeze([]),translate:Object.freeze([]),ask:Object.freeze([])}),
  mode:'dictate',targetLanguage:'zh',targetLanguages:Object.freeze(['zh']),writingPreferences:'',dictionaryPromptEnabled:true,appearance:'light',
  historyRetentionDays:0,saveAudio:false,audioRetentionDays:7,maxAudioMB:100
});
function string(value, name, max=500) {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error(`${name}格式不正确`);
  return value.trim();
}
function baseUrl(value) {
  const kind=typeof value==='string'&&/\/audio\/transcriptions\/?$/.test(value.trim())?'asr':'refiner';
  return resolveProviderEndpoint(value,kind).baseUrl;
}
function endpoint(url,leaf,endpointMode) {
  const kind=leaf==='audio/transcriptions'?'asr':leaf==='chat/completions'?'refiner':null;
  if(!kind)throw Error('Unsupported service endpoint.');
  return resolveProviderEndpoint(url,kind,undefined,endpointMode).endpointUrl;
}
function choice(value,allowed,label){if(!allowed.includes(value))throw new Error(`${label}不受支持`);return value;}
function languageCode(value,label='目标语言'){
  const code=string(value,label,35);
  if(!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/.test(code))throw new Error(`${label}请使用 zh、en、en-US 等语言代码`);
  return code;
}
function validateOperation(options={},fallbackMode='dictate'){
  if(!options||typeof options!=='object'||Array.isArray(options))throw new Error('本次操作设置格式不正确');
  return {
    mode:choice(options.mode??fallbackMode,MODES,'处理模式'),
    context:string(options.context??'','本次上下文（最多 20000 字）',20000),
    task:choice(options.task??'ask',TASKS,'文字任务'),
    ...(options.targetLanguage===undefined?{}:{targetLanguage:languageCode(options.targetLanguage)})
  };
}
function validateSettings(input,{repairPreferredTarget=false}={}) {
  if (!input || typeof input!=='object' || Array.isArray(input)) throw new Error('设置格式不正确');
  const s={};
  for(const kind of ['asr','refiner']) {
    const p=input[kind]; if(!p || typeof p!=='object' || Array.isArray(p)) throw new Error('缺少 API 设置');
    const model=string(p.model,'模型名称',160); if(!model) throw new Error('模型名称不能为空');
    if(/[\u0000-\u001f]/.test(p.model))throw new Error('模型名称不可包含控制字符');
    const protocol=kind==='asr'?choice(p.protocol??'openai-transcriptions',['openai-transcriptions','qwen-input-audio'],'ASR 协议'):undefined;
    const resolved=resolveProviderEndpoint(p.baseUrl,kind,protocol,p.endpointMode);
    s[kind]={baseUrl:resolved.baseUrl,endpointMode:resolved.endpointMode,model,...(protocol?{protocol}:{})};
  }
  s.asr.backend=choice(input.asr.backend??'cloud',['cloud','local'],'识别位置');
  const prices=input.usagePrices??{};
  if(!prices||typeof prices!=='object'||Array.isArray(prices)||Object.keys(prices).some(k=>!['asr','refiner'].includes(k)))throw Error('用量单价配置无效。');
  s.usagePrices={asr:validatePrice(prices.asr??defaultPrice()),refiner:validatePrice(prices.refiner??defaultPrice())};
  s.refiner.enabled=!!input.refiner.enabled;
  s.refiner.citationFormat=choice(input.refiner.citationFormat??'none',['none','openai','local-v1'],'来源响应格式');
  s.shortcut=string(input.shortcut??DEFAULTS.shortcut,'通用快捷键',100);
  s.copyShortcut=string(input.copyShortcut??'','复制快捷键',100);
  const modeKeys=input.modeShortcuts===undefined?{dictate:'',translate:'',ask:''}:input.modeShortcuts;
  if(!modeKeys||typeof modeKeys!=='object'||Array.isArray(modeKeys)||Object.keys(modeKeys).some(key=>!MODES.includes(key)))throw Error('模式快捷键设置格式不正确');
  const alternates=input.modeShortcutAlternates===undefined?{}:input.modeShortcutAlternates;
  if(!alternates||typeof alternates!=='object'||Array.isArray(alternates)||![Object.prototype,null].includes(Object.getPrototypeOf(alternates))||Object.keys(alternates).some(key=>!MODES.includes(key)))throw Error('模式替代快捷键设置格式不正确');
  s.modeShortcuts={};s.modeShortcutAlternates={};const occupied=new Set();
  function reserve(value){const key=normalizeAccelerator(value);if(key&&occupied.has(key))throw Error('快捷键不能重复，包括同一模式、不同模式和通用快捷键');if(key)occupied.add(key);}
  reserve(s.shortcut);reserve(s.copyShortcut);
  for(const mode of MODES){
    const primary=string(modeKeys[mode]===undefined?'':modeKeys[mode],`${mode} 快捷键`,100);
    const values=alternates[mode]===undefined?[]:alternates[mode];
    if(!Array.isArray(values))throw Error(`${mode} 替代快捷键必须是数组`);
    if(values.length+(primary?1:0)>4)throw Error('每个模式最多设置 4 个快捷键');
    const extra=Array.from(values,value=>{const key=string(value,`${mode} 替代快捷键`,100);if(!key)throw Error('替代快捷键不能为空');return key;});
    reserve(primary);for(const value of extra)reserve(value);
    s.modeShortcuts[mode]=primary;s.modeShortcutAlternates[mode]=extra;
  }
  s.language=string(input.language??'','语言',12);
  if(s.language && !/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(s.language)) throw new Error('语言请使用 zh、en 等代码，或留空自动识别');
  s.deviceId=string(input.deviceId??'','麦克风',512);
  s.autoPaste=false; // Temporarily copy-only until Windows target/caret/content protection is validated.
  s.saveHistory=input.saveHistory!==false;
  s.mode=choice(input.mode??DEFAULTS.mode,MODES,'处理模式');
  s.appearance=choice(input.appearance??DEFAULTS.appearance,['light','dark','system'],'外观');
  try{s.targetLanguage=languageCode(input.targetLanguage??(repairPreferredTarget&&Array.isArray(input.targetLanguages)?input.targetLanguages[0]:DEFAULTS.targetLanguage));}catch(error){if(!repairPreferredTarget||!Array.isArray(input.targetLanguages)||!input.targetLanguages.length)throw error;s.targetLanguage=languageCode(input.targetLanguages[0]);}
  const targets=input.targetLanguages===undefined?[s.targetLanguage]:input.targetLanguages;
  if(!Array.isArray(targets)||targets.length<1||targets.length>3)throw Error('常用目标语言须为 1 至 3 个语言代码。');
  s.targetLanguages=Array.from(targets,value=>languageCode(value,'常用目标语言'));
  if(new Set(s.targetLanguages.map(code=>code.toLowerCase())).size!==s.targetLanguages.length)throw Error('常用目标语言不能重复。');
  if(!s.targetLanguages.includes(s.targetLanguage)){if(repairPreferredTarget)s.targetLanguage=s.targetLanguages[0];else throw Error('默认目标语言必须属于常用目标语言列表。');}
  s.writingPreferences=string(input.writingPreferences??'','写作偏好（最多 4000 字）',4000);
  s.dictionaryPromptEnabled=input.dictionaryPromptEnabled!==false;
  s.historyRetentionDays=choice(input.historyRetentionDays??DEFAULTS.historyRetentionDays,[0,1,7,30,90,365],'历史保留天数');
  s.saveAudio=input.saveAudio===true&&s.saveHistory;
  s.audioRetentionDays=choice(input.audioRetentionDays??DEFAULTS.audioRetentionDays,[1,7,30,90],'音频保留天数');
  s.maxAudioMB=input.maxAudioMB??DEFAULTS.maxAudioMB;
  if(!Number.isInteger(s.maxAudioMB)||s.maxAudioMB<25||s.maxAudioMB>500)throw new Error('音频总容量应为 25 至 500 MB 的整数');
  return s;
}
module.exports={MAX_RECORDING_MS,DEFAULTS,MODES,TASKS,validateSettings,validateOperation,languageCode,baseUrl,endpoint,resolveProviderEndpoint};
