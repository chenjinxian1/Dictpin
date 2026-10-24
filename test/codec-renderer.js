'use strict';
(async()=>{
 let context;
 try{
  const raw=await window.fixture.read();context=new AudioContext({sampleRate:48000});
  const decoded=await context.decodeAudioData(new Uint8Array(raw).buffer);
  const stereo=context.createBuffer(2,decoded.length,48000);const src=decoded.getChannelData(0);
  for(let i=0;i<src.length;i++){stereo.getChannelData(0)[i]=src[i]*.7;stereo.getChannelData(1)[i]=src[i]*.3;}
  const stream=context.createMediaStreamDestination();const source=context.createBufferSource();source.buffer=stereo;source.connect(stream);
  const chunks=[];const mimeType='audio/webm;codecs=opus';const recorder=new MediaRecorder(stream.stream,{mimeType,audioBitsPerSecond:96000});
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  const done=new Promise(resolve=>recorder.onstop=resolve);recorder.start(250);await context.resume();source.start();
  await new Promise(resolve=>source.onended=resolve);recorder.stop();await done;stream.stream.getTracks().forEach(t=>t.stop());await context.close();context=null;
  const bytes=await new Blob(chunks,{type:mimeType}).arrayBuffer();
  const inspect=new OfflineAudioContext(1,1,48000);const check=await inspect.decodeAudioData(bytes.slice(0));
  const pcm=await window.LocalAudio.decode(bytes,{durationMs:stereo.duration*1000});
  if(check.sampleRate!==48000||check.numberOfChannels!==2||pcm.sampleRate!==16000||pcm.channels!==1||Math.abs(pcm.pcmDurationMs-stereo.duration*1000)>500)throw Error('codec dimensions');
  const view=new DataView(pcm.localPcm.buffer);let energy=0;for(let i=0;i<pcm.localPcm.byteLength;i+=2)energy+=Math.abs(view.getInt16(i,true));if(!energy)throw Error('empty audio');
  await window.fixture.result({ok:true,sourceRate:48000,webmRate:check.sampleRate,webmChannels:check.numberOfChannels,webmBytes:bytes.byteLength,pcmRate:16000,pcmChannels:1,pcmFrames:pcm.localPcm.byteLength/2,pcmDurationMs:pcm.pcmDurationMs,originalDurationMs:stereo.duration*1000,webm:new Uint8Array(bytes),pcm:pcm.localPcm,hardwareMicrophone:false,speakerConnected:false,productLoaded:false});
 }catch(error){await context?.close().catch(()=>{});await window.fixture.result({ok:false,message:String(error.message).slice(0,200)});}
})();
