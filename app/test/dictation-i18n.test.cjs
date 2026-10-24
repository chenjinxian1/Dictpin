'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const file=path.join(__dirname,'../renderer/dictation-i18n.js'),locale=fs.existsSync(file)?require(file):{};
const {fixture}=require('./dictation-electron-fixture.cjs'),product=require('../src/dictation-main');

function element(tag,{id='',classes=[],attrs={},parent=null,value}={}){
 const item={tagName:tag.toUpperCase(),id,parentElement:parent,attrs:{...attrs},classList:new Set(classes),getAttribute(name){return Object.hasOwn(this.attrs,name)?this.attrs[name]:null;},setAttribute(name,text){this.attrs[name]=text;},hasAttribute(name){return Object.hasOwn(this.attrs,name);},matches(selector){return selector.split(',').some(part=>{part=part.trim();const attr=part.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);if(attr)return this.hasAttribute(attr[1])&&(attr[2]===undefined||this.getAttribute(attr[1])===attr[2]);if(part.startsWith('#'))return this.id===part.slice(1);if(part.startsWith('.'))return this.classList.has(part.slice(1));return this.tagName.toLowerCase()===part;});},closest(selector){for(let node=this;node;node=node.parentElement)if(node.matches(selector))return node;return null;}};
 if(value!==undefined)Object.defineProperty(item,'value',{get:()=>value,set(){throw Error('Localization must not assign input values');}});
 return item;
}
function documentFixture(){
 const heading=element('h1'),label=element('label'),editor=element('textarea',{id:'result-content',value:'设置',attrs:{'aria-label':'最近听写结果，可直接修改'}}),original=element('pre',{id:'original-text'}),word=element('span',{classes:['word-title'],parent:element('h2')}),alias=element('small',{classes:['word-aliases']}),correction=element('li',{parent:element('ul',{id:'correction-list'})}),input=element('input',{value:'复制文字',attrs:{placeholder:'留空保留当前密钥'}}),provider=element('span',{id:'provider-summary',attrs:{title:'设置'}});
 const nodes=[{nodeValue:'设置',parentElement:heading},{nodeValue:'API 密钥',parentElement:label},{nodeValue:'设置',parentElement:editor},{nodeValue:'复制文字',parentElement:original},{nodeValue:'设置',parentElement:word},{nodeValue:'取消',parentElement:alias},{nodeValue:'设置 → 取消',parentElement:correction},{nodeValue:'设置',parentElement:provider}];
 const doc={title:'本地听写',documentElement:{lang:'zh-CN'},body:{},createTreeWalker(){let index=0;return {nextNode:()=>nodes[index++]||null};},querySelectorAll(){return[editor,input,provider];}};
 return {doc,nodes,editor,input,provider};
}

test('English mode reaches main and pill through process-only arguments without starting capture',async()=>{
 const f=fixture(),host=await product.start(f.electron,{StoreClass:f.FakeStore,LocalAsrClass:f.FakeLocal,uiLanguage:'en'});
 try{assert.deepEqual(f.windows[0].options.webPreferences.additionalArguments,['--dictpin-ui-language=en']);assert.equal(f.windows[0].options.title,'Dictpin');assert.equal(host.controller.state.phase,'idle');host.controller.publish({phase:'processing',sessionId:'locale-fixture'});assert.deepEqual(f.windows[1].options.webPreferences.additionalArguments,['--dictpin-ui-language=en']);host.controller.publish({phase:'idle',sessionId:null});}finally{await host.dispose();}
});
test('default host remains Chinese when no English override is supplied',async()=>{
 const f=fixture(),host=await product.start(f.electron,{StoreClass:f.FakeStore,LocalAsrClass:f.FakeLocal});try{assert.equal(f.windows[0].options.title,'本地听写');assert.ok(!f.windows[0].options.webPreferences.additionalArguments?.includes('--dictpin-ui-language=en'));}finally{await host.dispose();}
});
test('sandbox preload exposes frozen English metadata with Chinese default and no new IPC route',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/dictation-preload.js'),'utf8');
 for(const [argv,language]of [[['electron','--dictpin-ui-language=en'],'en'],[['electron'],'zh-CN']]){let bridge;const calls=[];vm.runInNewContext(source,{process:{argv},require:()=>({contextBridge:{exposeInMainWorld:(_name,value)=>{bridge=value;}},ipcRenderer:{invoke:(...args)=>calls.push(args),on(){},removeListener(){}}})});assert.equal(bridge.uiLanguage,language);assert.equal(Object.isFrozen(bridge),true);assert.deepEqual(calls,[]);}
});
test('English chrome translation leaves transcript, original, dictionary and input values byte-for-byte intact',()=>{
 assert.equal(typeof locale.localizeDocument,'function','English chrome localization is missing');const f=documentFixture();locale.localizeDocument(f.doc,'en');
 assert.equal(f.nodes[0].nodeValue,'Settings');assert.equal(f.nodes[1].nodeValue,'API key');assert.deepEqual(f.nodes.slice(2).map(n=>n.nodeValue),['设置','复制文字','设置','取消','设置 → 取消','设置']);assert.equal(f.editor.value,'设置');assert.equal(f.input.value,'复制文字');assert.equal(f.input.getAttribute('placeholder'),'Leave blank to keep the current key');assert.equal(f.provider.getAttribute('title'),'设置');assert.equal(f.doc.documentElement.lang,'en');assert.equal(f.doc.title,'Dictpin');
 assert.equal(locale.translateNodeText(element('h2',{id:'result-content'}),'设置'),'设置');assert.equal(locale.translateNodeText(element('span',{attrs:{contenteditable:'plaintext-only'},parent:element('h2')}),'复制文字'),'复制文字');
});
test('Chinese and unsupported languages do not mutate UI chrome or content',()=>{
 assert.equal(typeof locale.localizeDocument,'function');for(const language of ['zh-CN','fr',undefined]){const f=documentFixture();assert.equal(locale.localizeDocument(f.doc,language),0);assert.equal(f.nodes[0].nodeValue,'设置');assert.equal(f.doc.documentElement.lang,'zh-CN');assert.equal(f.input.getAttribute('placeholder'),'留空保留当前密钥');}
});
test('localized chrome interpolations preserve dictionary terms and device names even when equal to a UI label',()=>{
 assert.equal(typeof locale.translateNodeText,'function');assert.equal(locale.translateNodeText(element('span',{id:'word-undo-text'}),'已移除“设置”'),'Removed “设置”');assert.equal(locale.translateAttribute(element('button',{attrs:{'data-word-action':'edit'}}),'aria-label','编辑 设置'),'Edit 设置');assert.equal(locale.translateNodeText(element('option',{value:''}),'系统默认 · 设置'),'System default · 设置');assert.equal(locale.translateNodeText(element('option',{value:'device-1'}),'设置'),'设置');assert.equal(locale.translateNodeText(element('p',{id:'recent-time'}),'2026.10.24 / 09:00 │ 42 字符'),'2026.10.24 / 09:00 │ 42 characters');
});
test('later chrome updates are localized without changing editor text or moving focus',async()=>{
 assert.equal(typeof locale.install,'function');const f=documentFixture();let observer;class Observer{constructor(callback){this.callback=callback;observer=this;}observe(){}disconnect(){this.disconnected=true;}}
 const install=locale.install(f.doc,'en',{Observer});assert.equal(f.nodes[0].nodeValue,'Settings');f.nodes[0].nodeValue='保存更改';f.nodes[2].nodeValue='保存更改';observer.callback([]);await Promise.resolve();assert.equal(f.nodes[0].nodeValue,'Save changes');assert.equal(f.nodes[2].nodeValue,'保存更改');assert.equal(f.editor.value,'设置');install.dispose();assert.equal(observer.disconnected,true);
});
test('English correction counts use concise singular and plural wording',()=>{
 assert.equal(locale.translateNodeText(element('p',{id:'result-message'}),'已纠正 1 处'),'1 correction applied');assert.equal(locale.translateNodeText(element('p',{id:'result-message'}),'已纠正 2 处'),'2 corrections applied');assert.equal(locale.translateNodeText(element('summary',{id:'correction-summary'}),'词典已纠正 2 处'),'2 dictionary corrections');
});
test('development English switch becomes an Electron argument without reading or changing a saved profile',()=>{
 const {EventEmitter}=require('node:events'),source=path.resolve(__dirname,'../../scripts/dev.cjs'),entry={exports:{}},calls=[],fixtureRoot=path.resolve(__dirname,'../../work/synthetic-language-launch');
 const load=id=>{if(id==='node:fs')return {mkdirSync(){},existsSync:()=>true,readFileSync:()=> '44.8.0'};if(id==='node:child_process')return {spawn:(...args)=>{calls.push(args);return new EventEmitter();}};if(id==='./environment.cjs')return {root:fixtureRoot,electronPath:()=>path.join(fixtureRoot,'electron.exe'),isolatedEnvironment:()=>({})};return require(id);};load.main=entry;
 vm.runInNewContext(fs.readFileSync(source,'utf8'),{require:load,module:entry,process:{argv:['node',source,'--ui-language=en'],versions:process.versions,execPath:process.execPath},console:{log(){},error(){}}});assert.equal(calls.length,1);assert.deepEqual(Array.from(calls[0][1]),[path.join(fixtureRoot,'app'),'--dictpin-ui-language=en']);assert.equal(calls[0][2].env.LOCAL_DICTATION_PROFILE,path.join(fixtureRoot,'work/dev/profile'));
});
test('localization is idempotent so observing title or language cannot schedule an endless repaint loop',()=>{
 const f=documentFixture();let title='本地听写',lang='zh-CN',titleWrites=0,langWrites=0;
 Object.defineProperty(f.doc,'title',{get:()=>title,set:value=>{titleWrites++;title=value;}});Object.defineProperty(f.doc.documentElement,'lang',{get:()=>lang,set:value=>{langWrites++;lang=value;}});
 locale.localizeDocument(f.doc,'en');assert.equal(titleWrites,1);assert.equal(langWrites,1);assert.equal(locale.localizeDocument(f.doc,'en'),0);assert.equal(titleWrites,1,'An unchanged title must not emit another DOM mutation');assert.equal(langWrites,1,'An unchanged language must not emit another DOM mutation');
});
