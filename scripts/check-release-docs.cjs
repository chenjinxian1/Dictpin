'use strict';
// Reads publication material only. Never loads a user profile or starts an app.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const languages=['README.md',...['zh-CN','fr','ja','ko','ms'].map(id=>`docs/i18n/README.${id}.md`)];
const top=['README.md','CONTRIBUTING.md','SECURITY.md','CHANGELOG.md','THIRD_PARTY_NOTICES.md','docs/INSTALL.md','docs/API_CONFIGURATION.md','docs/PRIVACY.md','docs/SCREENSHOTS.md'];
function walk(dir){return fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name).replaceAll('\\','/')]);}
const files=[...new Set([...top,...walk('docs/i18n'),...walk('docs/branding'),...walk('docs/release')].filter(f=>f.endsWith('.md')))];
const problems=[],external=new Set();let localLinks=0,anchors=0;
const plain=s=>s.replace(/```[^\n]*\n[\s\S]*?```/g,'');
const slug=s=>s.replace(/<[^>]+>/g,'').replace(/[`*_~]/g,'').toLowerCase().replace(/[^\p{L}\p{N}_\-\s]/gu,'').replace(/\s/g,'-');
function headingIds(s){const seen=new Map();return new Set([...plain(s).matchAll(/^#{1,6}\s+(.+)$/gm)].map(m=>{const value=slug(m[1].trim()),count=seen.get(value)||0;seen.set(value,count+1);return value+(count?'-'+count:'');}));}
for(const file of files){
 if(!fs.existsSync(path.join(root,file))){problems.push(`${file}: missing document`);continue;}
 const body=fs.readFileSync(path.join(root,file),'utf8');
 if(body.includes('\uFFFD')||body.includes('\0'))problems.push(`${file}: invalid text encoding`);
 if(/(?:[A-Z]:[\\/](?:Users|Documents and Settings)[\\/])|(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)|(?:sk-[A-Za-z0-9_-]{24,})/i.test(body))problems.push(`${file}: possible private path or credential; inspect without printing values`);
 for(const m of plain(body).matchAll(/!?\[[^\]\n]*\]\(([^)\n]+)\)/g)){
  const href=m[1].trim().replace(/^<|>$/g,'');
  if(/^https?:\/\//i.test(href)){external.add(href);continue;}
  if(/^[a-z]+:/i.test(href)){problems.push(`${file}: unexpected link scheme`);continue;}
  const [name,fragment]=href.split('#');let target;
  try{target=path.resolve(root,path.dirname(file),decodeURIComponent(name||path.basename(file)));}catch{problems.push(`${file}: malformed link ${href}`);continue;}
  const relative=path.relative(root,target);
  if(relative.startsWith('..')||path.isAbsolute(relative)||!fs.existsSync(target)){problems.push(`${file}: missing or out-of-tree target ${href}`);continue;}
  localLinks++;
  if(fragment&&target.endsWith('.md')){anchors++;if(!headingIds(fs.readFileSync(target,'utf8')).has(decodeURIComponent(fragment)))problems.push(`${file}: missing anchor ${href}`);}
 }
}
const english=fs.readFileSync(path.join(root,'README.md'),'utf8');
const commands=english.match(/```powershell\n([\s\S]*?)```/)?.[1].trim();
for(const file of languages){
 const body=fs.readFileSync(path.join(root,file),'utf8').replaceAll('\r\n','\n');
 if(!body.replace(/^\uFEFF/,'').startsWith('# Dictpin\n'))problems.push(`${file}: wrong display name`);
 if((body.match(/^## /gm)||[]).length<10||body.length<4500)problems.push(`${file}: incomplete translation`);
 if(body.match(/```powershell\n([\s\S]*?)```/)?.[1].trim()!==commands)problems.push(`${file}: quick-start commands differ`);
 for(const other of languages.filter(x=>x!==file)){
  const href=path.relative(path.dirname(file),other).replaceAll('\\','/');
  if(!body.slice(0,1800).includes(`](${href})`))problems.push(`${file}: missing language navigation to ${other}`);
 }
 for(const fact of ['qwen-plus','distributionReady:false','MIT','Ctrl+C','Ctrl+Enter'])if(!body.includes(fact))problems.push(`${file}: missing parity marker ${fact}`);
 if(/!\[[^\]]*\]\([^)]*(?:shields\.io|hero-base)/i.test(body))problems.push(`${file}: unsupported badge or unlettered base used as the hero`);
 const heroHref=path.relative(path.dirname(file),'docs/branding/hero.png').replaceAll('\\','/');
 const heroPosition=body.indexOf(`](${heroHref})`),screenshotPosition=body.indexOf('images/results.png');
 if(heroPosition<0||screenshotPosition<heroPosition)problems.push(`${file}: concept hero and actual screenshot are missing or not separated`);
}
const captionEvidence=[['README.md',/AI-generated concept artwork[^\n]*not a software screenshot/],['zh-CN',/AI 生成的概念配图[^\n]*不是软件实际截图/],['fr',/Illustration conceptuelle générée par IA[^\n]*ni une capture du logiciel/],['ja',/AI[^\n]*コンセプト画像[^\n]*実際のソフトウェア画面[^\n]*ではありません/],['ko',/AI로 생성한 컨셉 이미지[^\n]*실제 소프트웨어 화면/],['ms',/Ilustrasi konsep yang dijana AI[^\n]*bukan tangkapan skrin perisian/]];
for(const [id,pattern] of captionEvidence){const file=id==='README.md'?id:`docs/i18n/README.${id}.md`;if(!pattern.test(fs.readFileSync(path.join(root,file),'utf8').slice(0,1800)))problems.push(`${file}: missing localized concept-art disclosure near the hero`);}
let heroAssets=0;
try{
 const art=JSON.parse(fs.readFileSync(path.join(root,'docs/branding/hero-manifest.json'),'utf8'));
 if(art.classification!=='ai-generated-concept-art'||art.isSoftwareScreenshot!==false||art.typesetting?.wordmark!=='Dictpin'||art.typesetting?.tagline!=='Speak. Refine. Flow.'||art.typesetting?.disclosure!=='CONCEPT ART / NOT A SOFTWARE SCREENSHOT')problems.push('Hero provenance or concept-art classification is invalid');
 if(!Array.isArray(art.assets)||art.assets.length!==2||!['hero.png','hero-base.png'].every(name=>art.assets.some(a=>a.file===name)))throw Error('Expected exactly the concept base and final hero');
 for(const entry of art.assets){
  if(!['hero.png','hero-base.png'].includes(entry.file))throw Error('Unexpected hero asset path');
  const buffer=fs.readFileSync(path.join(root,'docs/branding',entry.file));heroAssets++;
  if(buffer.length<24||buffer.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||buffer.readUInt32BE(16)!==entry.width||buffer.readUInt32BE(20)!==entry.height||buffer.length!==entry.bytes||crypto.createHash('sha256').update(buffer).digest('hex')!==entry.sha256)problems.push(`Hero differs from reviewed manifest: ${entry.file}`);
  if(entry.file==='hero.png'&&(entry.width*9!==entry.height*16||entry.width<960))problems.push('Final hero must be native-size landscape 16:9');
 }
}catch(error){problems.push('Missing or invalid hero assets/manifest: '+error.message);}
const manifest=JSON.parse(fs.readFileSync(path.join(root,'docs/images/manifest.json'),'utf8'));
if(manifest.classification!=='production-electron-renderer-capture'||manifest.isSoftwareScreenshot!==true||manifest.uiLanguage!=='en'||manifest.defaultUiLanguage!=='zh-CN'||manifest.sourceHashEncoding!=='utf-8-lf')problems.push('Software screenshots must be genuine English presentation captures with portable source provenance');
if(manifest.images.length!==2||!['results.png','settings.png'].every(file=>manifest.images.some(item=>item.file===file&&item.role==='software-screenshot')))problems.push('Show only the main window and API settings as software examples');
if(manifest.microphoneCommands!==0||manifest.networkRequests!==0||manifest.paidServiceUsed!==false||manifest.systemClipboardUsed!==false||manifest.naturalExit?.exitCode!==0||manifest.naturalExit?.observedExit!==true)problems.push('Documentation capture safety or natural-exit evidence is invalid');
if(!Array.isArray(manifest.sourceFiles)||!manifest.sourceFiles.length)problems.push('Missing screenshot production-source fingerprints');
for(const entry of manifest.sourceFiles||[]){
 const target=path.resolve(root,entry.file),relative=path.relative(root,target);
 if(!entry.file.startsWith('app/')||relative.startsWith('..')||path.isAbsolute(relative)||!fs.existsSync(target)){problems.push('Invalid screenshot source path');continue;}
 const canonical=fs.readFileSync(target,'utf8').replaceAll('\r\n','\n');
 if(crypto.createHash('sha256').update(canonical,'utf8').digest('hex')!==entry.sha256)problems.push(`Screenshot source changed; regenerate the real capture: ${entry.file}`);
}
for(const entry of manifest.images){
 const buffer=fs.readFileSync(path.join(root,'docs/images',entry.file));
 if(buffer.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||buffer.readUInt32BE(16)!==entry.width||buffer.readUInt32BE(20)!==entry.height||crypto.createHash('sha256').update(buffer).digest('hex')!==entry.sha256)problems.push(`Screenshot differs from reviewed manifest: ${entry.file}`);
}
const prompt=fs.readFileSync(path.join(root,'docs/branding/hero-prompt.en.txt'),'utf8');
if(!prompt.includes('Dictpin')||!prompt.includes('Do not render any text')||!prompt.includes('2560 × 1440'))problems.push('Hero prompt is incomplete');
const report={status:problems.length?'failed':'passed',documents:files.length,languages:languages.length,localLinks,anchors,externalLinks:external.size,externalReachability:'Not certified by this local check; primary-source research and limitations are documented separately.',screenshots:manifest.images.length,conceptArtAssets:heroAssets,problems};
const output=path.join(root,'work/release-materials');fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'docs-check.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));process.exitCode=problems.length?1:0;
