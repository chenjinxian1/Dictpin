(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ProviderEndpoint=api;})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const LEAVES={asr:'audio/transcriptions',refiner:'chat/completions'};
  function resolveProviderEndpoint(value,kind,protocol,endpointMode='auto'){
    if(!Object.hasOwn(LEAVES,kind))throw Error('Invalid service.');
    if(!['auto','base','endpoint'].includes(endpointMode))throw Error('Invalid endpoint mode.');
    if(kind==='asr'&&protocol!==undefined&&!['openai-transcriptions','qwen-input-audio'].includes(protocol))throw Error('Unsupported ASR protocol.');
    const leaf=kind==='asr'&&protocol==='qwen-input-audio'?'chat/completions':LEAVES[kind];
    if(typeof value!=='string'||value.length>2048||/[\u0000-\u0020\u007f]/.test(value.trim())||/[?#]/.test(value))throw Error('API URL 不可含空白、查询参数或片段（包括空 ? 或 #）。');
    let url;try{url=new URL(value.trim());}catch{throw Error('请填写完整的 API URL。');}
    if(!url.hostname||url.username||url.password||url.search||url.hash)throw Error('API URL 不可含账号、密码、查询参数或片段。');
    const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    if(url.protocol!=='https:'&&!(url.protocol==='http:'&&local))throw Error('API 必须使用 HTTPS；本机回环地址可用 HTTP。');
    let pathname=url.pathname.replace(/\/+$/,'');
    const found=Object.values(LEAVES).find(value=>pathname.endsWith('/'+value));
    const mode=endpointMode==='auto'?(found?'endpoint':'base'):endpointMode;
    if(mode==='endpoint'&&found!==leaf)throw Error('Full endpoint belongs to a different service / 完整端点与当前协议不匹配。');
    if(endpointMode==='auto'&&!found&&(/\/(?:responses|messages|audio\/speech|embeddings|models)$/.test(pathname)||pathname.includes('/api/v1/services/')))throw Error('Unsupported protocol / 当前不支持此完整端点协议。');
    if(!pathname&&mode==='base')pathname='/v1';
    url.pathname=pathname||'/';
    const baseUrl=url.toString().replace(/\/+$/,'');
    const requestUrl=new URL(url);
    if(mode==='base')requestUrl.pathname=pathname+'/'+leaf;
    // Preserve complete endpoints verbatim, including endpoint words in a tenant prefix.
    return {baseUrl,endpointUrl:requestUrl.toString().replace(/\/+$/,''),endpointMode:mode,inputType:mode,local,protocol:kind==='asr'?(protocol==='qwen-input-audio'?'Qwen ASR input_audio':'OpenAI audio/transcriptions'):'OpenAI chat/completions'};
  }
  function recordingLimits(protocol,maxRecordingMs=540000,backend='cloud'){
    if(backend==='local'){const maxDurationMs=Math.min(60000,Number.isFinite(maxRecordingMs)&&maxRecordingMs>0?maxRecordingMs:60000);const stopAfterMs=Math.min(maxDurationMs,58000);return Object.freeze({backend:'local',protocol:'local-sensevoice',maxDurationMs,stopAfterMs,warningMs:Math.max(0,stopAfterMs-10000)});}
    const qwen=protocol==='qwen-input-audio';
    const configured=Number.isFinite(maxRecordingMs)&&maxRecordingMs>0?maxRecordingMs:540000;
    const maxDurationMs=Math.min(configured,qwen?300000:540000);
    const stopAfterMs=Math.min(maxDurationMs,qwen?298000:538000);
    return Object.freeze({protocol:qwen?'qwen-input-audio':'openai-transcriptions',maxDurationMs,stopAfterMs,warningMs:Math.max(0,stopAfterMs-60000)});
  }
  function modelWarning(model,kind,protocol){
    if(kind!=='asr')return '';
    const name=String(model);
    if(/(?:^|[-_.])tts(?:$|[-_.])/i.test(name))return name==='qwen-audio-3.1-tts-flash'?'此型号是 TTS 文字转语音模型，不适用于听写识别。请自行选择 ASR 模型及匹配协议；不会自动替换。':'模型名称含 TTS（语音合成），可能不适用于语音识别。请核对供应商模型能力和接口协议。';
    if(/^qwen3-asr-flash-(?:filetrans|realtime)/i.test(name))return '此型号需要文件转录或实时协议，当前 input_audio Chat 适配不支持；请核对供应商协议。';
    if(/^qwen-audio-3\.[01]-asr-flash(?:$|-)/i.test(name))return '此系列使用 DashScope 原生协议，当前尚不支持；不能直接套用 Qwen input_audio Chat 协议。';
    if(/^qwen3-asr-flash(?:$|-)/i.test(name)&&protocol!=='qwen-input-audio')return '此 Qwen ASR 型号通常需要 input_audio Chat 协议，请核对后自行选择；当前不会自动切换。';
    return '';
  }
  return {resolveProviderEndpoint,modelWarning,recordingLimits};
});
