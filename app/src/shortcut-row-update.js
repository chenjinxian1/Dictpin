'use strict';

const {types:{isProxy}}=require('node:util');
const MODES=new Set(['dictate','translate','ask']);
const COMMON_FIELDS=['mode','index','expected','action'];
// Mirror normalizeAccelerator's terminal literal-plus spelling for counting only;
// preserve the raw value and leave all syntax/conflict validation to the caller.
const keyCount=accelerator=>accelerator.trim().replace(/\+\+$/,'+Plus').split('+').filter(token=>token.trim()).length;

function validateInput(input){
  if(!input||typeof input!=='object'||isProxy(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input)))throw Error('快捷键更新格式不正确');
  const descriptors=Object.getOwnPropertyDescriptors(input);
  // Inspect every own key, including symbols and non-enumerable properties, before
  // reading any values. A renderer request must never execute an accessor.
  for(const key of Reflect.ownKeys(descriptors)){
    if(typeof key!=='string'||![...COMMON_FIELDS,'accelerator'].includes(key)||!Object.hasOwn(descriptors[key],'value'))throw Error('快捷键更新包含不允许的字段');
  }
  if(COMMON_FIELDS.some(key=>!Object.hasOwn(descriptors,key)))throw Error('快捷键更新缺少必要字段');
  if(!MODES.has(input.mode)||!Number.isInteger(input.index)||input.index<0||input.index>3||typeof input.expected!=='string')throw Error('快捷键更新格式不正确');
  if(input.action==='set'){
    if(!Object.hasOwn(descriptors,'accelerator')||typeof input.accelerator!=='string'||input.accelerator.length>100||!input.accelerator.trim())throw Error('快捷键不能为空，且最多 100 个字符');
  }else if(input.action!=='remove'||Object.hasOwn(descriptors,'accelerator'))throw Error('快捷键更新操作无效');
}

/** Merge one row into the latest saved settings; the caller validates and commits it. */
function mergeShortcutRow(currentSettings,input){
  validateInput(input);
  const {mode,index,expected,action}=input;
  const primary=currentSettings.modeShortcuts?.[mode]??'';
  const alternates=currentSettings.modeShortcutAlternates?.[mode]??[];
  if(typeof primary!=='string'||!Array.isArray(alternates)||alternates.some(value=>typeof value!=='string'))throw Error('已保存的快捷键格式不正确');
  const saved=[primary,...alternates].filter(value=>value!=='');
  if(saved.length>4)throw Error('每个模式最多设置 4 个快捷键');
  if(index<saved.length){
    if(saved[index]!==expected)throw Error('快捷键已更改，请刷新后重试');
    if(action==='remove'){
      if(mode==='dictate'&&saved.length===1)throw Error('听写模式至少需要保留一个快捷键');
      saved.splice(index,1);
    }else saved[index]=input.accelerator;
  }else if(action==='set'&&index===saved.length&&expected===''&&saved.length<4){
    saved.push(input.accelerator);
  }else throw Error('快捷键行已更改或不存在，请刷新后重试');
  // Match rows against the saved order first. Only this successful inline edit
  // reorders the chosen mode; stable sort preserves equal-length binding order.
  saved.sort((left,right)=>keyCount(left)-keyCount(right));
  return{
    ...currentSettings,
    modeShortcuts:{...currentSettings.modeShortcuts,[mode]:saved[0]??''},
    modeShortcutAlternates:{...currentSettings.modeShortcutAlternates,[mode]:saved.slice(1)}
  };
}

module.exports={mergeShortcutRow};
