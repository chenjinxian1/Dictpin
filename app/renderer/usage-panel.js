'use strict';
(function(factory){const api=factory(typeof module==='object'&&module.exports?require('./token-usage'):window.TokenUsage);if(typeof module==='object'&&module.exports)module.exports=api;if(typeof window==='object')window.UsagePanel=api;})(function(core){
 const statusLabel={pending:'进行中',responded:'已响应',failed:'请求失败',cancelled:'已取消',interrupted:'上次中断'};
 const reasonLabel={price_missing:'单价未配置',model_price_missing:'该模型单价未配置',usage_missing:'用量未知',cache_unknown:'缓存用量未知',cache_price_missing:'缓存单价未配置',usage_invalid:'用量字段不一致'};
 function number(value){return value===null||value===undefined?'—':BigInt(value).toLocaleString();}
 function price(estimate){return estimate?.picoUnits===null||estimate?.picoUnits===undefined?'费用未知 · '+(reasonLabel[estimate?.reason]||'缺少用量或单价'):'估算 '+core.formatMoney(estimate.picoUnits,estimate.currency);}
 function present(data){
  if(!data)return {state:'loading',title:'正在读取用量',note:'仅使用提供方实际 usage，不按字符推算。',metrics:['—','—','—','—'],cost:'费用未知',total:'—',totalNote:'正在读取',summary:'正在读取本机计量记录。',costs:[],rows:[]};
  if(data.available===false)return {state:'error',title:'用量统计暂不可用',note:data.error||'统计文件不可用；识别结果不受影响。',metrics:['—','—','—','—'],cost:'费用未知',total:'—',totalNote:'记录不可用',summary:'无法保证计量完整；原文件已保留。',costs:[],rows:[]};
  const rows=(data.recent||[]).slice().reverse(),last=rows[0],s=data.summary||core.emptySummary();
  const latest=last?{state:last.status==='pending'?'pending':last.usage.status,title:(last.kind==='asr'?'云端 ASR':'文字模型')+' · '+last.model,note:(statusLabel[last.status]||'未知状态')+' · '+(last.status==='pending'?'完成后更新用量':last.usage.status==='complete'?'usage 已完整报告':last.usage.status==='partial'?'部分 usage；— 表示未知':'usage 未知；不按零计'),metrics:core.FIELDS.map(k=>number(last.usage[k])),cost:price(last.estimate)}:{state:'empty',title:'尚无远端请求记录',note:'本地 ASR 不产生远端 token；— 表示未知。',metrics:['—','—','—','—'],cost:'费用尚未配置或尚无用量'};
  const known=k=>s.tokens[k].reportedRequests?number(s.tokens[k].known):'—';
  const summary='已记录 '+s.requests+' 次远端请求'+(s.pending?'，'+s.pending+' 次进行中':'')+'；累计已报告输入 '+known('input')+' / 输出 '+known('output')+' / 缓存输入 '+known('cacheRead')+' / 总量 '+known('total')+'。未知 usage '+s.unknownUsageRequests+' 次，部分 usage '+s.partialUsageRequests+' 次，费用未知 '+s.unpricedRequests+' 次。';
  const costs=Object.entries(s.costs).sort(([a],[b])=>a.localeCompare(b)).map(([currency,v])=>'估算 '+core.formatMoney(v.picoUnits,currency)+'（'+v.requests+' 次可估算请求）');
  const total=known('total'),totalNote=s.tokens.total.unknownRequests?'（'+s.tokens.total.unknownRequests+' 次总量未知）':s.requests?'':'尚无记录';
  return {...latest,total,totalNote,summary,costs,rows:rows.slice(0,8).map(r=>({time:new Date(r.at).toLocaleString(),model:r.model,kind:r.kind==='asr'?'云端 ASR':'文字模型',status:statusLabel[r.status]||'未知状态',metrics:core.FIELDS.map(k=>number(r.usage[k])),cost:price(r.estimate)}))};
 }
 function mount(document){
  const $=id=>document.getElementById(id);let accepted=null;
  function render(data){
   const view=present(data);$('usage-panel').dataset.state=view.state;$('usage-latest-model').textContent=view.title;$('usage-status').textContent=view.note;
   for(const [i,key]of core.FIELDS.entries())$('usage-current-'+key).textContent=view.metrics[i];
   $('usage-cumulative-total').textContent=view.total;$('usage-cumulative-note').textContent=view.totalNote;
   $('usage-current-cost').textContent=view.cost;$('usage-summary').textContent=view.summary;$('usage-total-cost').textContent=view.costs.length?view.costs.join(' · '):'暂无可核验的费用估算；不同币种不会相加。';
   const fragment=document.createDocumentFragment();
   for(const row of view.rows){const tr=document.createElement('tr');for(const cell of [row.time,row.kind+' · '+row.model,row.status,...row.metrics,row.cost]){const td=document.createElement('td');td.textContent=cell;tr.append(td);}fragment.append(tr);}
   $('usage-recent-body').replaceChildren(fragment);$('usage-recent-empty').hidden=view.rows.length>0;
  }
  render(null);
  return {accept(data){if(!data)return false;if(accepted&&Number.isFinite(data.revision)&&data.revision<accepted.revision)return false;accepted=data;render(data);return true;},render:()=>render(accepted)};
 }
 return {present,mount,number,price};
});
