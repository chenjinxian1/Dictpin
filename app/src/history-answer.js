'use strict';
const {validateMetadata}=require('./source-citations');
const {TASKS}=require('./settings');
function readHistoryAnswer(store,id){
 if(typeof id!=='string'||!id||id.length>128)throw Error('历史记录标识无效。');
 store.pruneHistory();const result=store.getHistory(id);
 if(!result)throw Error('记录已删除或过期，无法查看回答。');
 if(result.mode!=='ask'||result.status!=='completed'||typeof result.text!=='string'||!result.text.trim()||result.text.length>100000)throw Error('这条记录没有可查看的完整回答。');
 return {id:result.id,...(result.sourceMetadata?{sourceMetadata:validateMetadata(result.text,result.sourceMetadata)}:{}),question:typeof result.original==='string'?result.original.slice(0,100000):'',answer:result.text,context:typeof result.context==='string'?result.context.slice(0,20000):'',task:TASKS.includes(result.task)?result.task:'ask',appearance:['light','dark','system'].includes(store.settings.appearance)?store.settings.appearance:'light'};
}
function historyCopyText(store,input){
 if(!input||typeof input!=='object'||Array.isArray(input)||!['request','answer'].includes(input.part))throw Error('复制内容类型无效。');
 const payload=readHistoryAnswer(store,input.id);
 const text=input.part==='answer'?payload.answer:[payload.question,payload.context].filter(Boolean).join('\n\n');
 if(!text)throw Error('没有可复制的文字。');return text;
}
module.exports={readHistoryAnswer,historyCopyText};
