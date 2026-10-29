'use strict';
// Local documentation checks only. No network, application or user profile access.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const languages=['README.md',...['zh-CN','fr','ja','ko','ms'].map(id=>`docs/i18n/README.${id}.md`)];
function walk(dir){return fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name).replaceAll('\\','/')]);}
const files=[...fs.readdirSync(root).filter(f=>f.endsWith('.md')),...walk('docs').filter(f=>f.endsWith('.md'))];
const problems=[],external=new Set();let localLinks=0,anchors=0;
const application=JSON.parse(fs.readFileSync(path.join(root,'app/package.json'),'utf8')),workspace=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const version=application.version;
if(typeof version!=='string'||!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)||workspace.version!==version)problems.push('package.json and app/package.json must have the same valid source version');
if(!fs.readFileSync(path.join(root,'CHANGELOG.md'),'utf8').includes(`## [${version}] - `))problems.push('CHANGELOG.md: missing current version entry');
const plain=s=>s.replace(/```[^\n]*\n[\s\S]*?```/g,'');
const slug=s=>s.replace(/<[^>]+>/g,'').replace(/[`*_~]/g,'').toLowerCase().replace(/[^\p{L}\p{N}_\-\s]/gu,'').replace(/\s/g,'-');
function headingIds(s){const seen=new Map();return new Set([...plain(s).matchAll(/^#{1,6}\s+(.+)$/gm)].map(m=>{const value=slug(m[1].trim()),count=seen.get(value)||0;seen.set(value,count+1);return value+(count?'-'+count:'');}));}
for(const file of files){
 const body=fs.readFileSync(path.join(root,file),'utf8');
 if(body.includes('\uFFFD')||body.includes('\0'))problems.push(`${file}: invalid encoding`);
 if(/(?:[A-Z]:[\\/](?:Users|Documents and Settings)[\\/])|(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)|(?:sk-[A-Za-z0-9_-]{24,})/i.test(body))problems.push(`${file}: possible private path or credential; inspect without printing values`);
 const markup=plain(body),links=[...markup.matchAll(/!?\[[^\]\n]*\]\(([^)\n]+)\)/g),...markup.matchAll(/<(?:a|img)\b[^>]*\b(?:href|src)=["']([^"']+)["'][^>]*>/gi)];
 for(const m of links){
  const href=m[1].trim().replace(/^<|>$/g,'').replaceAll('&amp;','&');
  if(/^https?:\/\//i.test(href)){external.add(href);continue;}
  if(/^[a-z]+:/i.test(href)){problems.push(`${file}: unexpected link scheme`);continue;}
  const [name,fragment]=href.split('#');let target;
  try{target=path.resolve(root,path.dirname(file),decodeURIComponent(name||path.basename(file)));}catch{problems.push(`${file}: malformed link`);continue;}
  const relative=path.relative(root,target);
  if(relative.startsWith('..')||path.isAbsolute(relative)||!fs.existsSync(target)){problems.push(`${file}: missing or out-of-tree target ${href}`);continue;}
  localLinks++;
  if(fragment&&target.endsWith('.md')){anchors++;if(!headingIds(fs.readFileSync(target,'utf8')).has(decodeURIComponent(fragment)))problems.push(`${file}: missing anchor ${href}`);}
 }
}
const commands=fs.readFileSync(path.join(root,'README.md'),'utf8').replaceAll('\r\n','\n').match(/```powershell\n([\s\S]*?)```/)?.[1].trim();
for(const file of languages){
 const body=fs.readFileSync(path.join(root,file),'utf8').replaceAll('\r\n','\n');
 const header=body.split(/^## /m,1)[0];
 if(!body.startsWith(`<h1 align="center">Dictpin v${version}</h1>\n`)||(body.match(/^## /gm)||[]).length<6||(body.match(/^- /gm)||[]).length<5)problems.push(`${file}: incomplete README or mismatched version title`);
 const overview=header.match(/<!-- overview -->\n([\s\S]*?)\n<!-- \/overview -->/)?.[1];
 if(!overview||overview.trim().split(/\n\s*\n/).length!==1||!['Dictpin','Windows','Electron','SenseVoice'].every(term=>overview.includes(term)))problems.push(`${file}: expected one concise project overview`);
 if(/^>/m.test(header))problems.push(`${file}: opening boilerplate should stay in supporting documentation`);
 if((header.match(/<p align="center">/g)||[]).length!==3)problems.push(`${file}: tagline, badges and language navigation must be centered`);
 const badgeImages=[...header.matchAll(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/g)].map(m=>m[1]);
 if(badgeImages.length!==6||badgeImages.some(src=>!src.startsWith('https://img.shields.io/badge/')))problems.push(`${file}: expected six static project badges`);
 if(body.match(/```powershell\n([\s\S]*?)```/)?.[1].trim()!==commands)problems.push(`${file}: quick-start commands differ`);
 for(const other of languages.filter(f=>f!==file))if(!header.includes(`href="${path.relative(path.dirname(file),other).replaceAll('\\','/')}"`))problems.push(`${file}: missing language navigation`);
 for(const fact of ['MIT','Ctrl+C','Ctrl+Enter','Node.js','24','SenseVoice'])if(!body.includes(fact))problems.push(`${file}: missing ${fact}`);
 for(const guide of ['docs/INSTALL.md','docs/API_CONFIGURATION.md','docs/PRIVACY.md','CHANGELOG.md','CONTRIBUTING.md','SECURITY.md','THIRD_PARTY_NOTICES.md'])if(!body.includes(path.relative(path.dirname(file),guide).replaceAll('\\','/')))problems.push(`${file}: missing supporting guide ${guide}`);
 const images=[...body.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(m=>path.resolve(root,path.dirname(file),m[1]));
 const expected=['docs/branding/hero.png','docs/images/results.png','docs/images/settings.png'].map(f=>path.join(root,f));
 if(images.length!==3||images.some((f,i)=>f!==expected[i]))problems.push(`${file}: expected concept hero, main window and API settings only`);
 if(/npm (?:test|run (?:test:|preview))/.test(body))problems.push(`${file}: removed maintenance command remains`);
}
const expectedIntro='Dictpin is a Windows desktop voice-to-text development candidate built with Electron, local SenseVoice recognition, explicit personal dictionary rules, and optional text cleanup through a compatible service. For short messages, notes, names, and technical terms: start, speak, review, copy.';
if(fs.readFileSync(path.join(root,'README.md'),'utf8').match(/<!-- overview -->\r?\n([\s\S]*?)\r?\n<!-- \/overview -->/)?.[1]!==expectedIntro)problems.push('README.md: project overview differs from the approved text');
// The hero itself carries its concept-art label. Keep localized image descriptions
// and the provenance guide, without requiring a defensive paragraph on the homepage.
const concepts=[['README.md',/concept artwork/i],['zh-CN',/概念配图/],['fr',/illustration conceptuelle/i],['ja',/コンセプト画像/],['ko',/컨셉 이미지/],['ms',/ilustrasi konsep/i]];
for(const [id,pattern]of concepts){const file=id==='README.md'?id:`docs/i18n/README.${id}.md`,alt=fs.readFileSync(path.join(root,file),'utf8').match(/!\[([^\]]+)\]/)?.[1]||'';if(!pattern.test(alt))problems.push(`${file}: missing concept-art image description`);}
for(const file of ['docs/branding/hero.png','docs/images/results.png','docs/images/settings.png']){
 const buffer=fs.readFileSync(path.join(root,file));
 if(buffer.length<24||buffer.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')problems.push(`${file}: invalid PNG`);
 else{const width=buffer.readUInt32BE(16),height=buffer.readUInt32BE(20);if(file.includes('/images/')?(width!==640||height!==480):(width*9!==height*16))problems.push(`${file}: unexpected dimensions`);}
}
const report={status:problems.length?'failed':'passed',documents:files.length,languages:languages.length,localLinks,anchors,externalLinks:external.size,externalReachability:'Not checked; this command makes no network requests.',badgesPerReadme:6,screenshots:2,conceptArtAssets:1,problems};
fs.mkdirSync(path.join(root,'work'),{recursive:true});fs.writeFileSync(path.join(root,'work/docs-check.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));process.exitCode=problems.length?1:0;
