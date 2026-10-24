'use strict';
const {LIMITS,normalizeAliases,validateRules,protectedRuleText}=require('./dictionary');
const WORD_CHARACTER=/[\p{L}\p{M}\p{N}_]/u;
const LATIN=/\p{Script=Latin}/u;
const asciiFold=text=>text.replace(/[A-Z]/g,ch=>ch.toLowerCase());
function node(){return {children:new Map(),rules:[]};}
function insert(root,source,rule){let current=root;for(const ch of source){if(!current.children.has(ch))current.children.set(ch,node());current=current.children.get(ch);}current.rules.push(rule);}
function previousCharacter(text,index){if(!index)return '';let start=index-1;if(start>0&&/[\uDC00-\uDFFF]/.test(text[start])&&/[\uD800-\uDBFF]/.test(text[start-1]))start--;return text.slice(start,index);}
function boundary(text,start,end,rule){return !rule.latin||(!WORD_CHARACTER.test(previousCharacter(text,start))&&!WORD_CHARACTER.test(end<text.length?String.fromCodePoint(text.codePointAt(end)):''));}
function compile(entries){
 const safe=[];
 for(const entry of Array.isArray(entries)?entries.slice(0,LIMITS.entries):[]){
  if(!entry||typeof entry.word!=='string'||!entry.word.trim()||entry.word.length>LIMITS.word||/[\x00-\x1f\x7f]/.test(entry.word))continue;
  try{safe.push({...entry,aliases:Object.hasOwn(entry,'aliases')?normalizeAliases(entry.aliases,entry.word):[]});}catch{/* Invalid imported rules never run. */}
 }
 try{validateRules(safe);}catch{return null;}
 const literal=node(),canonical=node(),caseGroups=new Map();
 for(const entry of safe){
  for(const alias of entry.aliases)insert(literal,alias,{to:entry.word,wordId:entry.id,latin:LATIN.test(alias),explicit:true});
  if(!/^[A-Za-z][A-Za-z ]{1,63}$/.test(entry.word)||protectedRuleText(entry.word))continue;
  const key=asciiFold(entry.word),group=caseGroups.get(key)||[];group.push(entry);caseGroups.set(key,group);
 }
 for(const [key,group] of caseGroups){if(new Set(group.map(entry=>entry.word)).size!==1)continue;const entry=group[0];insert(canonical,key,{to:entry.word,wordId:entry.id,latin:true,explicit:false});}
 return {literal,canonical};
}
function longest(root,text,start,fold){
 let current=root,best=null;
 for(let end=start;end<text.length;){const ch=String.fromCodePoint(text.codePointAt(end));current=current.children.get(fold?asciiFold(ch):ch);if(!current)break;end+=ch.length;
  for(const rule of current.rules)if(boundary(text,start,end,rule)&&text.slice(start,end)!==rule.to)best={...rule,end};
 }
 return best;
}
function correctText(original,entries=[]){
 if(typeof original!=='string')throw new TypeError('识别原文须为文本。');
 const tries=compile(entries);if(!tries)return {text:original,changes:[]};
 const changes=[],parts=[];let unchangedStart=0;
 // Scan only the immutable source. Replacements are appended, never rescanned.
 for(let start=0;start<original.length;){
  const explicit=longest(tries.literal,original,start,false),canonical=longest(tries.canonical,original,start,true);
  const match=explicit&&(!canonical||explicit.end>=canonical.end)?explicit:canonical;
  if(!match){start+=String.fromCodePoint(original.codePointAt(start)).length;continue;}
  parts.push(original.slice(unchangedStart,start),match.to);changes.push({from:original.slice(start,match.end),to:match.to,start,end:match.end,wordId:match.wordId});start=match.end;unchangedStart=start;
 }
 parts.push(original.slice(unchangedStart));return {text:parts.join(''),changes};
}
module.exports={correctText};
