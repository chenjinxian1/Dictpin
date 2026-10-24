'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {LocalAsr}=require('../src/local-asr');
function setup(){
 const children=[];
 const engine=new LocalAsr({numThreads:1,spawnImpl:()=>{
  const child=new EventEmitter();child.pid=123;child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();child.stdin.write=()=>{};child.stdin.destroy=()=>{};child.kill=()=>{child.emit('close');return true;};child.line=value=>child.stdout.emit('data',Buffer.from(JSON.stringify(value)+'\n'));children.push(child);return child;
 }});
 return {engine,children};
}
function pcm(samples){const bytes=Buffer.alloc(320);samples.forEach((value,index)=>bytes.writeInt16LE(value,index*2));return bytes;}
async function complete(engine,children,input,response){
 const promise=engine.transcribe({localPcm:input,sampleRate:16000,channels:1});
 if(children.length===1&&!engine.ready)children[0].line({type:'ready',version:'1.13.8',loadMs:1});
 children.at(-1).line({type:'result',id:engine.job.id,frames:input.byteLength/2,speech:false,text:'',elapsedMs:1,vadMs:1,asrMs:0,threads:1,privateBytes:100,peakWorkingSetBytes:100,...response});
 return promise;
}
for(const speech of [false,true])test('all-zero PCM identifies missing signal even when worker speech flag is '+speech,async t=>{
 const {engine,children}=setup();t.after(()=>engine.dispose());
 await assert.rejects(complete(engine,children,pcm([]),{speech}),error=>{
  assert.equal(error.code,'no_speech');assert.equal(error.reason,'silent_input');assert.match(error.message,/没有收到声音信号/);assert.doesNotMatch(error.message,/未执行识别/);return true;
 });
 assert.equal(engine.lastResult.inputPeak,0);assert.equal(engine.lastResult.inputRms,0);assert.equal(engine.lastResult.inputNonzeroSamples,0);assert.equal(engine.lastResult.inputSamples,160);assert.equal(engine.lastResult.speech,speech);
});
test('nonzero audio rejected by VAD is distinguished without inventing an ASR result',async t=>{
 const {engine,children}=setup();t.after(()=>engine.dispose());
 await assert.rejects(complete(engine,children,pcm([256,-256]),{}),error=>{
  assert.equal(error.code,'no_speech');assert.equal(error.reason,'speech_not_detected');assert.match(error.message,/有声音.*未检测到.*语音/);return true;
 });
 assert.equal(engine.lastResult.inputNonzeroSamples,2);assert.equal(engine.lastResult.inputPeak,256/32768);assert.equal(engine.lastResult.speech,false);assert.equal(engine.lastResult.asrMs,0);
});
test('speech accepted by VAD with empty transcription reports recognition failure honestly',async t=>{
 const {engine,children}=setup();t.after(()=>engine.dispose());
 await assert.rejects(complete(engine,children,pcm([1]),{speech:true,text:' \n\t ',asrMs:4}),error=>{
  assert.equal(error.code,'no_speech');assert.equal(error.reason,'empty_transcript');assert.match(error.message,/检测到语音.*没有返回文字/);assert.doesNotMatch(error.message,/未执行识别/);return true;
 });
 assert.equal(engine.lastResult.speech,true);assert.equal(engine.lastResult.asrMs,4);
});
test('one-LSB PCM remains nonzero and uses sample energy rather than an arbitrary silence threshold',async t=>{
 const {engine,children}=setup();t.after(()=>engine.dispose());
 await assert.rejects(complete(engine,children,pcm([1,-1,256,-256]),{}),{code:'no_speech',reason:'speech_not_detected'});
 assert.equal(engine.lastResult.inputNonzeroSamples,4);assert.equal(engine.lastResult.inputSamples,160);
 const expected=Math.sqrt((1+1+65536+65536)/160)/32768;
 assert.ok(Math.abs(engine.lastResult.inputRms-expected)<1e-15);
});
test('signed PCM energy uses an owned offset view, preserves source, and records no content',async t=>{
 const {engine,children}=setup();t.after(()=>engine.dispose());
 const backing=Buffer.alloc(336,99),view=new Uint8Array(backing.buffer,backing.byteOffset+8,320);view.fill(0);
 const data=new DataView(view.buffer,view.byteOffset,view.byteLength);data.setInt16(0,-32768,true);data.setInt16(2,32767,true);
 const promise=engine.transcribe({localPcm:view,sampleRate:16000,channels:1});view.fill(0);
 children[0].line({type:'ready',version:'1.13.8',loadMs:1});
 children[0].line({type:'result',id:engine.job.id,frames:160,speech:true,text:'PRIVATE_RESULT_SENTINEL',elapsedMs:3,vadMs:1,asrMs:2,threads:1,privateBytes:100,peakWorkingSetBytes:100});
 assert.equal(await promise,'PRIVATE_RESULT_SENTINEL');assert.equal(engine.lastResult.inputPeak,1);assert.equal(engine.lastResult.inputNonzeroSamples,2);assert.equal(engine.lastResult.inputSamples,160);
 assert.ok(Math.abs(engine.lastResult.inputRms-Math.sqrt((1+(32767/32768)**2)/160))<1e-15);
 const serialized=JSON.stringify(engine.lastResult);assert.ok(!serialized.includes('PRIVATE_RESULT_SENTINEL'));assert.ok(!serialized.includes('localPcm'));assert.ok(!serialized.includes('text'));assert.ok(!serialized.includes('bytes'));
 assert.equal(backing[0],99);assert.equal(backing.at(-1),99);
});
