'use strict';
(function(factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(typeof window==='object')window.TokenUsage=api;})(function(){
 const CURRENCIES=['USD','CNY','SGD','HKD','EUR','GBP','JPY'],FIELDS=['input','output','total','cacheRead'];
 function own(o,k){const d=o&&typeof o==='object'?Object.getOwnPropertyDescriptor(o,k):null;return d&&Object.hasOwn(d,'value')?d.value:undefined;}
 function token(v){return Number.isSafeInteger(v)&&v>=0?v:null;}
 function normalizeUsage(raw){
  let input=token(own(raw,'prompt_tokens')),output=token(own(raw,'completion_tokens')),total=token(own(raw,'total_tokens')),cacheRead=token(own(own(raw,'prompt_tokens_details'),'cached_tokens'));
  if(input!==null&&cacheRead!==null&&cacheRead>input)cacheRead=null;
  const known=[input,output,total,cacheRead].filter(x=>x!==null).length;
  return {input,output,total,cacheRead,status:known===4?'complete':known?'partial':'unknown'};
 }
 function defaultPrice(model=''){return {model,currency:'USD',inputPerMillion:null,outputPerMillion:null,cacheReadPerMillion:null};}
 function rate(value){if(value===null||value===undefined)return null;if(typeof value!=='string'||!/^(?:0|[1-9]\d{0,6})(?:\.\d{1,6})?$/.test(value))throw Error('每百万单价须为最多六位小数的非负十进制数；留空表示未配置。');return value.includes('.')?value.replace(/0+$/,'').replace(/\.$/,''):value;}
 function validatePrice(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['model','currency','inputPerMillion','outputPerMillion','cacheReadPerMillion'].includes(k)))throw Error('单价配置无效。');
  const model=own(value,'model')??'',currency=own(value,'currency')??'USD';
  if(typeof model!=='string'||model.length>160||/[\u0000-\u001f]/.test(model)||!CURRENCIES.includes(currency))throw Error('单价模型或币种无效。');
  return {model:model.trim(),currency,inputPerMillion:rate(own(value,'inputPerMillion')),outputPerMillion:rate(own(value,'outputPerMillion')),cacheReadPerMillion:rate(own(value,'cacheReadPerMillion'))};
 }
 function micros(value){const [whole,fraction='']=value.split('.');return BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'));}
 function estimateCost(usage,price,model){
  const unknown=reason=>({currency:price?.currency||null,picoUnits:null,reason});
  try{price=validatePrice(price);}catch{return unknown('price_missing');}
  if(price.model!==model||!price.model)return unknown('model_price_missing');
  if(price.inputPerMillion===null||price.outputPerMillion===null)return unknown('price_missing');
  if(usage.input===null||usage.output===null)return unknown('usage_missing');
  if(usage.cacheRead===null)return unknown('cache_unknown');
  if(usage.cacheRead>usage.input)return unknown('usage_invalid');
  if(usage.cacheRead>0&&price.cacheReadPerMillion===null)return unknown('cache_price_missing');
  const cost=BigInt(usage.input-usage.cacheRead)*micros(price.inputPerMillion)+BigInt(usage.output)*micros(price.outputPerMillion)+BigInt(usage.cacheRead)*(price.cacheReadPerMillion===null?0n:micros(price.cacheReadPerMillion));
  return {currency:price.currency,picoUnits:cost.toString(),reason:null};
 }
 function emptySummary(){return {requests:0,pending:0,responded:0,failed:0,cancelled:0,interrupted:0,unknownUsageRequests:0,partialUsageRequests:0,unpricedRequests:0,tokens:Object.fromEntries(FIELDS.map(k=>[k,{known:'0',reportedRequests:0,unknownRequests:0}])),costs:{}};}
 function aggregate(records,initial){
  const s=initial?JSON.parse(JSON.stringify(initial)):emptySummary();
  for(const r of records){
   s.requests++;s[r.status]=(s[r.status]||0)+1;const final=r.status!=='pending';
   if(final&&r.usage.status==='unknown')s.unknownUsageRequests++;if(final&&r.usage.status==='partial')s.partialUsageRequests++;
   for(const key of FIELDS){const metric=s.tokens[key],value=r.usage[key];if(value===null)metric.unknownRequests++;else{metric.known=(BigInt(metric.known)+BigInt(value)).toString();metric.reportedRequests++;}}
   if(final){if(r.estimate.picoUnits===null)s.unpricedRequests++;else{const currency=r.estimate.currency,group=s.costs[currency]||(s.costs[currency]={picoUnits:'0',requests:0});group.picoUnits=(BigInt(group.picoUnits)+BigInt(r.estimate.picoUnits)).toString();group.requests++;}}
  }
  return s;
 }
 function formatMoney(pico,currency){if(pico===null||pico===undefined)return '费用未知';const n=BigInt(pico);if(n>0n&&n<1000000n)return currency+' <0.000001';const rounded=(n+500000n)/1000000n;return currency+' '+(rounded/1000000n).toString()+'.'+(rounded%1000000n).toString().padStart(6,'0');}
 return {CURRENCIES,FIELDS,normalizeUsage,defaultPrice,validatePrice,estimateCost,emptySummary,aggregate,formatMoney};
});
