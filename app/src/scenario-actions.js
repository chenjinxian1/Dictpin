'use strict';
const {find}=require('../renderer/scenario-catalog');

// Never read a renderer-supplied property value until its own data descriptor is
// validated. There is deliberately no URL, query, content or context capability.
function readScenario(input){
 if(!input||typeof input!=='object'||Object.getPrototypeOf(input)!==Object.prototype)throw Error('场景请求无效。');
 const keys=Reflect.ownKeys(input),id=Object.getOwnPropertyDescriptor(input,'id');
 if(keys.length!==1||keys[0]!=='id'||!id||!Object.hasOwn(id,'value')||typeof id.value!=='string')throw Error('场景请求只接受固定场景标识。');
 const scenario=find(id.value);
 if(!scenario)throw Error('未知场景，请重新选择。');
 return scenario;
}

function createScenarioActions({confirm,open}){
 let pending=false;
 return Object.freeze({async open({input,window,readOwner}){
  const scenario=readScenario(input);
  if(pending)throw Error('已有网页确认正在进行，请先完成或取消。');
  if(!window||window.isDestroyed())throw Error('主窗口已关闭，未打开网页。');
  // readOwner checks the exact sender/window, lifecycle epoch and idle session.
  const epoch=readOwner();
  pending=true;
  try{
   let approved;
   try{approved=await confirm(window,scenario);}catch{throw Error('网页确认未能完成，请重试。');}
   if(approved!==true)return{ok:false,cancelled:true};
   if(window.isDestroyed())throw Error('主窗口已关闭，未打开网页。');
   if(readOwner()!==epoch)throw Error('界面或当前任务已变化，未打开网页，请重新确认。');
   try{await open(scenario.url);}catch{throw Error('未能请求浏览器打开网页，请重试。');}
   // Fulfilled openExternal only confirms dispatch, never login/page readiness.
   return{ok:true,dispatched:true};
  }finally{pending=false;}
 }});
}
module.exports={readScenario,createScenarioActions};
