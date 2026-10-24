'use strict';
const {randomUUID}=require('node:crypto');
const LIMITS=Object.freeze({entries:500,csvBytes:8*1024*1024,word:200,replacement:2000,note:2000,aliases:12});
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
function validId(id){return typeof id==='string'&&ID.test(id)&&!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(id);}
function assertId(id){if(!validId(id))throw new Error('记录 ID 格式不正确');return id;}
function field(value,name,max,{required=false,singleLine=false}={}){
  if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)||(singleLine&&/[\r\n\t]/.test(value)))throw new Error(`${name}格式不正确或超过 ${max} 字符`);
  const out=value.trim();if(required&&!out)throw new Error(`${name}不能为空`);return out;
}
function wordKey(word){return word.normalize('NFKC').toLocaleLowerCase('en-US');}
function ruleError(message){return Object.assign(new Error(message),{code:'dictionary_rule'});}
// Ordinary spelling rules intentionally exclude high-risk values and polarity.
// A future product may offer reviewed numeric/date conversion, but this one does not.
function protectedRuleText(value){
  return /[\p{N}\p{Sc}%％‰零〇一二两三四五六七八九十百千万亿壹贰叁肆伍陆柒捌玖拾佰仟萬億]|今天|明天|昨天|前天|后天|今日|明日|昨日|次日|翌日|今年|明年|去年|前年|后年|上月|本月|下月|上周|本周|这周|下周|星期|礼拜|周末|周日|周天|上午|中午|下午|晚上|凌晨|早上|早晨|傍晚|今晚|明晚|昨晚|人民币|美元|美金|欧元|英镑|日元|港币|港元|台币|新台币|加元|澳元|新币|新加坡元|[不没无勿未非别甭]/u.test(value)||/(?:^|[^\p{L}\p{M}\p{N}_])(?:no|not|never|none|nothing|nobody|nowhere|without|neither|nor|cannot|can't|can’t|don't|don’t|doesn't|doesn’t|didn't|didn’t|isn't|isn’t|aren't|aren’t|wasn't|wasn’t|weren't|weren’t|won't|won’t|wouldn't|wouldn’t|shouldn't|shouldn’t|couldn't|couldn’t|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|trillion|today|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?=$|[^\p{L}\p{M}\p{N}_])/iu.test(value);
}
function normalizeAliases(value,word){
  if(!Array.isArray(value)||value.length>LIMITS.aliases)throw ruleError('常见错写须为数组，每个词语最多填写 12 个。');
  const out=[];
  for(const raw of value){
    let alias;try{alias=field(raw,'常见错写',LIMITS.word,{required:true,singleLine:true});}catch(error){throw ruleError(error.message);}
    if(!out.includes(alias))out.push(alias);
  }
  if(word!==undefined&&out.length){
    if(typeof word!=='string'||!word.trim())throw ruleError('纠正规则缺少正确词语。');
    for(const text of [word,...out]){
      if(protectedRuleText(text))throw ruleError('普通纠正规则不能涉及数字、金额、日期或否定表达。');
      const han=text.match(/\p{Script=Han}/gu);if(han&&han.length<2)throw ruleError('汉字纠正规则须使用至少两个汉字，不能使用单字替换。');
    }
    if(out.includes(word))throw ruleError('常见错写不能与正确词语完全相同。');
  }
  return out;
}
function validateRules(entries){
  if(!Array.isArray(entries)||entries.length>LIMITS.entries)throw ruleError('词典纠正规则格式不正确。');
  const targets=new Map();
  for(const entry of entries){
    if(!entry||typeof entry!=='object')throw ruleError('词典纠正规则格式不正确。');
    if(!Object.hasOwn(entry,'aliases'))continue;
    const aliases=normalizeAliases(entry.aliases,entry.word);
    for(const alias of aliases){const key=wordKey(alias),previous=targets.get(key);if(previous!==undefined&&previous!==entry.word)throw ruleError(`常见错写“${alias}”指向不同词语，请先解决冲突。`);targets.set(key,entry.word);}
  }
  return true;
}
function normalizeEntry(input,previous,now=new Date().toISOString()){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('词典条目格式不正确');
  const id=input.id===undefined?(previous?.id||randomUUID()):assertId(input.id);
  const merged={...previous,...input},word=field(merged.word,'词语',LIMITS.word,{required:true,singleLine:true});
  const entry={...merged,id,word,replacement:field(merged.replacement??'','替换词',LIMITS.replacement),note:field(merged.note??'','备注',LIMITS.note),source:merged.source??'manual',createdAt:previous?.createdAt||now,updatedAt:now};
  if(Object.hasOwn(input,'aliases')||previous&&Object.hasOwn(previous,'aliases'))entry.aliases=normalizeAliases(Object.hasOwn(input,'aliases')?input.aliases:previous.aliases,word);
  return entry;
}
// RFC 4180 quoting, with CRLF, LF and CR record separators accepted on import.
function parseCSV(text){
  if(typeof text!=='string'||Buffer.byteLength(text,'utf8')>LIMITS.csvBytes)throw new Error('CSV 文件须为文本且不超过 8 MB');
  if(text.charCodeAt(0)===0xfeff)text=text.slice(1);
  const rows=[];let row=[],cell='',quoted=false,closed=false,started=false;
  const pushCell=()=>{row.push(cell);if(row.length>3)throw new Error('CSV 仅支持 word、replacement、note 三列');cell='';closed=false;started=false;};
  const pushRow=()=>{pushCell();if(row.some(v=>v!==''))rows.push(row);row=[];if(rows.length>LIMITS.entries+1)throw new Error('CSV 最多导入 500 个条目');};
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;}
    else if(c===','){pushCell();}
    else if(c==='\r'||c==='\n'){pushRow();if(c==='\r'&&text[i+1]==='\n')i++;}
    else if(c==='"'){if(started||closed)throw new Error('CSV 引号位置不正确');quoted=true;started=true;}
    else{if(closed)throw new Error('CSV 结束引号后只能接逗号或换行');cell+=c;started=true;}
    if(cell.length>LIMITS.note+1)throw new Error('CSV 字段超过 2000 字符');
  }
  if(quoted)throw new Error('CSV 引号未闭合');
  if(started||closed||cell.length||row.length)pushRow();
  if(!rows.length)return [];
  const header=rows.shift().map(x=>x.trim().toLowerCase());
  if(!header.includes('word')||new Set(header).size!==header.length||header.some(x=>!['word','replacement','note'].includes(x)))throw new Error('CSV 首行须包含 word，可选 replacement、note 列');
  return rows.map(row=>{if(row.length!==header.length)throw new Error('CSV 每行列数须与首行一致');return Object.fromEntries(header.map((key,i)=>[key,unprotectCell(row[i])]));});
}
function formulaLike(value){return /^[\s\ufeff]*[=+\-@]/u.test(value)||/^[\t\r\n]/.test(value);}
function protectCell(value){return formulaLike(value)||value.startsWith("'")?`'${value}`:value;}
function unprotectCell(value){return value.startsWith("''")||(value.startsWith("'")&&formulaLike(value.slice(1)))?value.slice(1):value;}
function exportCSV(entries){
  const quote=value=>`"${protectCell(value).replace(/"/g,'""')}"`;
  return '\ufeffword,replacement,note\r\n'+entries.map(e=>[e.word,e.replacement,e.note].map(quote).join(',')).join('\r\n')+(entries.length?'\r\n':'');
}
module.exports={LIMITS,validId,assertId,wordKey,normalizeAliases,validateRules,protectedRuleText,normalizeEntry,parseCSV,exportCSV};
