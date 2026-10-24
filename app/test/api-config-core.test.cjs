'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const ROOT=path.join(__dirname,'..');
const settings=require(path.join(ROOT,'src','settings'));
function resolver(){assert.equal(typeof settings.resolveProviderEndpoint,'function','explicit endpoint resolver is missing');return settings.resolveProviderEndpoint;}
function checks(options={}){const file=path.join(ROOT,'src','provider-checks.js');const mod=fs.existsSync(file)?require(file):{};assert.equal(typeof mod.createProviderChecks,'function','independent provider checks are missing');return mod.createProviderChecks(options);}
const config={asr:{baseUrl:'https://provider.invalid/compatible-mode/v1',model:'unit-asr'},refiner:{baseUrl:'https://provider.invalid/compatible-mode/v1',model:'unit-chat'},writingPreferences:'PRIVATE_PREF_SENTINEL',dictionary:[{word:'PRIVATE_WORD_SENTINEL'}]};
function service(fetchImpl,extra={}){return checks({getSettings:()=>structuredClone(config),getKey:()=> 'UNIT_TEST_KEY',fetchImpl,now:()=>100,...extra});}
for(const [name,input,kind,wanted]of [
 ['base URL','https://provider.invalid/v1/','refiner','https://provider.invalid/v1/chat/completions'],
 ['complete chat endpoint','https://provider.invalid/compatible-mode/v1/chat/completions/','refiner','https://provider.invalid/compatible-mode/v1/chat/completions'],
 ['complete ASR endpoint','https://provider.invalid/v1/audio/transcriptions','asr','https://provider.invalid/v1/audio/transcriptions'],
 ['root URL','https://provider.invalid','refiner','https://provider.invalid/v1/chat/completions'],
 ['localhost HTTP','http://127.0.0.1:7788/v1','asr','http://127.0.0.1:7788/v1/audio/transcriptions']
])test('endpoint preview resolves '+name,()=>assert.equal(resolver()(input,kind).endpointUrl,wanted));
test('wrong service full endpoint is rejected instead of silently reinterpreted',()=>assert.throws(()=>settings.endpoint('https://provider.invalid/v1/chat/completions','audio/transcriptions'),/service|服务|接口|协议/));
for(const input of ['https://user:password@provider.invalid/v1','https://provider.invalid/v1?api_key=unit','https://provider.invalid/v1#secret','http://provider.invalid/v1'])test('endpoint rejects credential/query/insecure input '+input,()=>assert.throws(()=>resolver()(input,'refiner')));
test('unsupported complete protocols are explicit',()=>assert.throws(()=>resolver()('https://provider.invalid/v1/responses','refiner'),/protocol|协议|支持/));
test('chat test makes a bounded POST through shared auth transport without private preferences',async()=>{
 let called;
 const r=await service(async(url,options)=>{called={url,options};return new Response(JSON.stringify({choices:[{message:{content:'OK'}}]}),{status:200});}).run('refiner');
 assert.equal(called.url,'https://provider.invalid/compatible-mode/v1/chat/completions');assert.equal(called.options.method,'POST');assert.equal(called.options.redirect,'error');assert.equal(called.options.headers.Authorization,'Bearer UNIT_TEST_KEY');
 const body=JSON.parse(called.options.body);assert.equal(body.model,'unit-chat');assert.equal(body.max_tokens,8);assert.deepEqual(body.messages,[{role:'user',content:'Reply with OK.'}]);assert.ok(!called.options.body.includes('PRIVATE_'));
 assert.equal(r.category,'chat_success');assert.equal(r.httpStatus,200);assert.equal(r.callSucceeded,true);assert.ok(!JSON.stringify(r).includes('UNIT_TEST_KEY'));assert.equal(r.content,undefined);
});
for(const [status,category]of [[401,'authentication'],[403,'authentication'],[404,'model_or_endpoint'],[400,'model_or_protocol'],[422,'model_or_protocol'],[415,'protocol'],[429,'rate_limit'],[503,'provider']])test('HTTP '+status+' is classified without reflecting provider errors',async()=>{
 const r=await service(async()=>new Response(JSON.stringify({error:{message:'echo UNIT_TEST_KEY PRIVATE_PREF_SENTINEL'}}),{status})).run('refiner');
 assert.equal(r.httpStatus,status);assert.equal(r.category,category);assert.equal(r.callSucceeded,false);assert.ok(!JSON.stringify(r).includes('UNIT_TEST_KEY'));assert.ok(!JSON.stringify(r).includes('PRIVATE_'));
});
test('HTTP 200 is not a chat pass unless a text result exists',async()=>{for(const data of [{ok:true},{error:{message:'bad'}},{choices:[{message:{content:''}}]}]){const r=await service(async()=>new Response(JSON.stringify(data),{status:200})).run('refiner');assert.equal(r.callSucceeded,false);assert.equal(r.category,'protocol');}});
test('successful ASR synthetic probe never claims recognition quality',async()=>{
 let captured;
 const r=await service(async(url,options)=>{captured={url,options};return new Response(JSON.stringify({text:'synthetic response'}),{status:200});}).run('asr');
 assert.ok(captured.url.endsWith('/audio/transcriptions'));assert.ok(captured.options.body instanceof FormData);const file=captured.options.body.get('file');assert.equal(file.type,'audio/wav');assert.equal(file.name,'synthetic-probe.wav');assert.ok(file.size<20000);assert.equal(captured.options.body.get('model'),'unit-asr');
 assert.equal(r.category,'asr_response');assert.equal(r.outcome,'warning');assert.equal(r.qualityVerified,false);assert.equal(r.content,undefined);
});
test('remote check without saved key makes no request',async()=>{let calls=0;const r=await service(async()=>{calls++;throw Error();},{getKey:()=>''}).run('refiner');assert.equal(calls,0);assert.equal(r.category,'credentials_missing');});
test('redirect failure is not followed or called authentication success',async()=>{let calls=0;const r=await service(async(_url,options)=>{calls++;assert.equal(options.redirect,'error');throw TypeError('UNIT_TEST_KEY network payload');}).run('refiner');assert.equal(calls,1);assert.equal(r.category,'network');assert.equal(r.callSucceeded,false);assert.ok(!JSON.stringify(r).includes('UNIT_TEST_KEY'));});
test('cancellation is scoped to one service',async()=>{
 const pending={};const c=service((_url,options)=>new Promise((_resolve,reject)=>{const kind=_url.endsWith('transcriptions')?'asr':'refiner';pending[kind]=options.signal;options.signal.addEventListener('abort',()=>reject(Error('cancel')),{once:true});}));
 const chat=c.run('refiner'),asr=c.run('asr');c.cancel('refiner');assert.equal(pending.refiner.aborted,true);assert.equal(pending.asr.aborted,false);c.cancel('asr');assert.equal((await chat).category,'cancelled');assert.equal((await asr).category,'cancelled');
});
test('replacing a check invalidates a stale successful response',async()=>{
 let release,calls=0;const c=service(async()=>{calls++;if(calls===1)return new Promise(resolve=>{release=()=>resolve(new Response(JSON.stringify({choices:[{message:{content:'OLD'}}]}),{status:200}));});return new Response(JSON.stringify({choices:[{message:{content:'NEW'}}]}),{status:200});});
 const first=c.run('refiner');const second=await c.run('refiner');release();assert.equal(second.category,'chat_success');assert.equal((await first).category,'cancelled');
});
test('provider check input cannot supply a URL or credential',async()=>{await assert.rejects(()=>service(async()=>{throw Error();}).run({kind:'refiner',baseUrl:'https://other.invalid',key:'unit'}),/service|服务|无效/);});

test('timeout is separate from authentication failure',async()=>{const r=await service((_u,o)=>new Promise((_resolve,reject)=>o.signal.addEventListener('abort',()=>reject(Error('unit')),{once:true})),{timeoutMs:5}).run('refiner');assert.equal(r.category,'timeout');assert.equal(r.httpStatus,null);});
test('malformed HTTP 200 response is a protocol failure without body reflection',async()=>{const r=await service(async()=>new Response('PRIVATE_UNIT_SERVER_NOT_JSON',{status:200})).run('refiner');assert.equal(r.category,'protocol');assert.equal(r.httpStatus,200);assert.ok(!JSON.stringify(r).includes('PRIVATE_UNIT_SERVER_NOT_JSON'));});
