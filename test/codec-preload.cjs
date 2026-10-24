'use strict';
const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('fixture',{read:()=>ipcRenderer.invoke('codec:fixture'),result:value=>ipcRenderer.invoke('codec:result',value)});
