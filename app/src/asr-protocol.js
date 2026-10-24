'use strict';
const {resolveProviderEndpoint}=require('../renderer/provider-endpoint');
const MAX_QWEN_REQUEST_BYTES=10000000;
function invalid(message,code='format'){const e=new Error(message);e.code=code;throw e;}
function qwenAudioRequest(audio,config){
  if(!audio||(!(audio.bytes instanceof ArrayBuffer)&&!ArrayBuffer.isView(audio.bytes)))invalid('Qwen 音频格式无效。');
  const bytes=audio.bytes instanceof ArrayBuffer?Buffer.from(audio.bytes):Buffer.from(audio.bytes.buffer,audio.bytes.byteOffset,audio.bytes.byteLength);
  if(bytes.length<100||bytes.length>7500000||!Number.isFinite(audio.durationMs)||audio.durationMs<=0||audio.durationMs>300000)invalid('Qwen ASR 音频须不超过 5 分钟及编码后 10 MB。','size');
  let mime;
  if(['audio/webm','audio/webm;codecs=opus'].includes(audio.mimeType)){
    if(!bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]))||!bytes.subarray(0,4096).includes(Buffer.from('webm')))invalid('WebM 容器标识无效；不会假定或自动转码。');
    mime='audio/webm';
  }else if(audio.mimeType==='audio/wav'){
    if(bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE'||bytes.toString('ascii',12,16)!=='fmt '||bytes.readUInt32LE(16)!==16||bytes.readUInt16LE(20)!==1||bytes.readUInt16LE(22)!==1||bytes.readUInt16LE(34)!==16||bytes.toString('ascii',36,40)!=='data'||bytes.readUInt32LE(40)!==bytes.length-44||bytes.readUInt32LE(4)!==bytes.length-8||bytes.readUInt16LE(32)!==2||(bytes.length-44)%2!==0)invalid('仅接受有效的单声道 PCM16 WAV。');
    const rate=bytes.readUInt32LE(24);if(rate<8000||rate>96000||bytes.readUInt32LE(28)!==rate*2||(bytes.length-44)/(rate*2)>300)invalid('WAV 时长或采样率无效。');
    mime='audio/wav';
  }else invalid('Qwen 当前适配支持 WebM/Opus 或 PCM16 WAV，不提供自动转码。');
  const language=config.language?String(config.language).split('-')[0]:'';
  if(language&&!['zh','yue','en','ja','de','ko','ru','fr','pt','ar','it','es','hi','id','th','tr','uk','vi','cs','da','fil','fi','is','ms','no','pl','sv'].includes(language))invalid('所选语言不在 Qwen ASR 协议支持列表，请选择自动识别或受支持语言。');
  const body=JSON.stringify({model:config.asr.model,messages:[{role:'user',content:[{type:'input_audio',input_audio:{data:'data:'+mime+';base64,'+bytes.toString('base64')}}]}],stream:false,asr_options:{...(language?{language}:{}),enable_itn:false}});
  if(Buffer.byteLength(body)>MAX_QWEN_REQUEST_BYTES)invalid('Qwen 编码后请求超过 10 MB。','size');
  return {url:resolveProviderEndpoint(config.asr.baseUrl,'asr','qwen-input-audio',config.asr.endpointMode).endpointUrl,body};
}
function qwenText(data){return !data?.error?data?.choices?.[0]?.message?.content:undefined;}
module.exports={qwenAudioRequest,qwenText,MAX_QWEN_REQUEST_BYTES};
