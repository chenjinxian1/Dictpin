'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'..'),settings=require(path.join(root,'src/settings')),api=require(path.join(root,'src/api')),endpoint=require(path.join(root,'renderer/provider-endpoint')),checks=require(path.join(root,'src/provider-checks'));
const asr={baseUrl:'https://gateway.invalid/compatible-mode/v1',model:'qwen3-asr-flash',protocol:'qwen-input-audio'};
const webm=new Uint8Array(200);webm.set([0x1a,0x45,0xdf,0xa3]);webm.set(Buffer.from('webm'),12);
const audio={bytes:webm,mimeType:'audio/webm;codecs=opus',durationMs:1200};
test('Qwen ASR explicit protocol resolves chat endpoint without changing origin',()=>{const r=endpoint.resolveProviderEndpoint(asr.baseUrl,'asr',asr.protocol);assert.equal(r.endpointUrl,'https://gateway.invalid/compatible-mode/v1/chat/completions');assert.equal(endpoint.resolveProviderEndpoint(r.endpointUrl,'asr',asr.protocol).endpointUrl,r.endpointUrl);});
test('unsupported ASR protocol is not silently accepted',()=>assert.throws(()=>settings.validateSettings({...settings.DEFAULTS,asr:{...asr,protocol:'dashscope-native'}})));
test('known TTS purpose and unsupported DashScope ASR are visible warnings',()=>{assert.match(endpoint.modelWarning('qwen-audio-3.1-tts-flash','asr','qwen-input-audio'),/TTS/);assert.match(endpoint.modelWarning('qwen-audio-3.1-asr-flash','asr','qwen-input-audio'),/DashScope/);assert.equal(endpoint.modelWarning('qwen3.8-flash','refiner'), '');});
test('normal Qwen ASR builds JSON input_audio and parses only chat text',async()=>{
 let call;const text=await api.transcribe(audio,{asr,language:'zh'},'FAKE_UNIT_KEY',{fetchImpl:async(url,o)=>{call={url,o};return new Response(JSON.stringify({choices:[{message:{content:'unit transcript'}}]}));}});
 assert.equal(text,'unit transcript');assert.equal(call.url,'https://gateway.invalid/compatible-mode/v1/chat/completions');assert.equal(call.o.redirect,'error');assert.equal(call.o.headers.Authorization,'Bearer FAKE_UNIT_KEY');
 const body=JSON.parse(call.o.body);assert.equal(body.model,'qwen3-asr-flash');assert.equal(body.stream,false);assert.equal(body.messages[0].role,'user');assert.equal(body.messages[0].content[0].type,'input_audio');assert.equal(body.messages[0].content[0].input_audio.data,'data:audio/webm;base64,'+Buffer.from(webm).toString('base64'));assert.deepEqual(body.asr_options,{language:'zh',enable_itn:false});assert.equal(body.max_tokens,undefined);
});
test('Qwen duration, byte signature, and encoded size are enforced before fetch',async()=>{for(const invalid of [{...audio,durationMs:300001},{...audio,bytes:new Uint8Array(200)},{...audio,bytes:new Uint8Array(8*1024*1024)}]){let called=false;await assert.rejects(()=>api.transcribe(invalid,{asr},'',{fetchImpl:async()=>{called=true;throw Error();}}));assert.equal(called,false);}});
test('Qwen wrong response shape cannot pass',async()=>{await assert.rejects(()=>api.transcribe(audio,{asr},'',{fetchImpl:async()=>new Response(JSON.stringify({text:'wrong protocol'}))}));});
test('Qwen diagnostic uses synthetic WAV via selected protocol, never marks quality',async()=>{
 let body,url;const c=checks.createProviderChecks({getSettings:()=>({asr}),getKey:()=>'',fetchImpl:async(u,o)=>{url=u;body=JSON.parse(o.body);return new Response(JSON.stringify({choices:[{message:{content:''}}]}));}});
 // Local mock only: no key required; never an external network request.
 asr.baseUrl='http://127.0.0.1:19191/compatible-mode/v1';
 const result=await c.run('asr');assert.ok(url.endsWith('/chat/completions'));assert.match(body.messages[0].content[0].input_audio.data,/^data:audio\/wav;base64,/);assert.equal(result.category,'asr_response');assert.equal(result.qualityVerified,false);assert.equal(result.outcome,'warning');asr.baseUrl='https://gateway.invalid/compatible-mode/v1';
});
