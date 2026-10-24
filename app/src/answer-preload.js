'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('answerCard',Object.freeze({
 getPayload:()=>ipcRenderer.invoke('answer:get'),openSource:input=>ipcRenderer.invoke('answer:source-open',input),resize:input=>ipcRenderer.invoke('answer:resize',input),close:input=>ipcRenderer.invoke('answer:close',input),copy:input=>ipcRenderer.invoke('answer:copy',input),
 onPayload(callback){if(typeof callback!=='function')return()=>{};const handler=(_event,value)=>callback(value);ipcRenderer.on('answer:payload',handler);return()=>ipcRenderer.removeListener('answer:payload',handler);}
}));
