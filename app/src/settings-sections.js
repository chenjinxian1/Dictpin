'use strict';
const SECTIONS=Object.freeze({
  preferences:['appearance','language','deviceId','mode'],
  shortcuts:['shortcut','modeShortcuts','modeShortcutAlternates'],
  languages:['targetLanguage','targetLanguages'],
  services:['asr','refiner'],
  usage:['usagePrices'],
  storage:['saveHistory','historyRetentionDays','saveAudio','audioRetentionDays','maxAudioMB'],
  personalization:['writingPreferences','dictionaryPromptEnabled']
});
const PROVIDER_FIELDS=new Set(['backend','baseUrl','endpointMode','model','protocol','key','persistKey','clearKey','enabled','citationFormat']);
function object(value,label){
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error(`${label}格式不正确`);
  for(const [key,d]of Object.entries(Object.getOwnPropertyDescriptors(value)))if(!Object.hasOwn(d,'value')||['__proto__','prototype','constructor'].includes(key))throw Error(`${label}包含不允许的字段`);
  return value;
}
/** Merge only the explicitly selected section onto the latest main-process settings. */
function mergeSettingsSection(current,input){
  object(input,'设置更新');if(Object.keys(input).some(k=>!['section','values'].includes(k))||!Object.hasOwn(SECTIONS,input.section))throw Error('设置分组无效');
  const values=object(input.values,'设置内容'),keys=Object.keys(values),allowed=SECTIONS[input.section];
  if(!keys.length||keys.some(k=>!allowed.includes(k)))throw Error('此分组不能修改其他设置');
  const result={...current};
  for(const key of keys){
    if(input.section==='services'){
      const provider=object(values[key],'模型服务');
      if(!Object.keys(provider).length||Object.keys(provider).some(k=>!PROVIDER_FIELDS.has(k)||(key==='asr'&&['enabled','citationFormat'].includes(k))||(key==='refiner'&&['protocol','backend'].includes(k))))throw Error('模型服务字段无效');
      result[key]={...current[key],...provider};
    }else result[key]=values[key];
  }
  return result;
}
module.exports={mergeSettingsSection,SECTIONS};
