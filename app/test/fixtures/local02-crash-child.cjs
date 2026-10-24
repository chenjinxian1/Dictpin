'use strict';
const path=require('node:path'),assert=require('node:assert/strict');
const {Store}=require('../../src/dictation-store'),{Controller}=require('../../src/dictation-controller');
const directory=path.resolve(process.argv[2]),work=path.resolve(__dirname,'../../../work/local02');
assert.equal(path.dirname(directory),work);process.on('message',()=>{});
const store=new Store(directory,{isEncryptionAvailable:()=>false},'win32'),original='强制结束前的完整原文：预算500元，不要扩写。😀';
const controller=new Controller({store,bridge:{},localAsr:{transcribe:async()=>original},apiImpl:{refine:()=>{process.send({ready:true,id:controller.session.id,original});return new Promise(()=>{});}}});
(async()=>{await controller.toggle();const id=controller.session.id;controller.recordingReady({sessionId:id});controller.stop();await controller.submitAudio({sessionId:id,bytes:new Uint8Array(1200),mimeType:'audio/webm',durationMs:100,localPcm:new Uint8Array(3200),sampleRate:16000,channels:1});})().catch(error=>{process.send({error:error.message});process.exitCode=1;});
