'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),core=require('../renderer/token-usage'),view=require('../renderer/usage-panel'),{desktopChrome}=require('../src/desktop-window');
const row={at:1000,kind:'refiner',model:'model',status:'responded',usage:core.normalizeUsage({prompt_tokens:0,completion_tokens:0,total_tokens:0,prompt_tokens_details:{cached_tokens:0}}),estimate:{currency:'USD',picoUnits:'0',reason:null}};
test('empty, loading and unavailable do not show invented measured zeros or free labels',()=>{for(const data of [null,{available:false,error:'fixed'}, {available:true,summary:core.emptySummary(),recent:[]}]){const v=view.present(data);assert.deepEqual(v.metrics,['—','—','—','—']);assert.ok(!JSON.stringify(v).includes('免费'));}});
test('actual reported zero is shown; partial usage and missing price stay explicit',()=>{const data={available:true,summary:core.aggregate([row]),recent:[row]};assert.deepEqual(view.present(data).metrics,['0','0','0','0']);const r={...row,usage:core.normalizeUsage({prompt_tokens:10}),estimate:{currency:'USD',picoUnits:null,reason:'usage_missing'}};const v=view.present({...data,summary:core.aggregate([r]),recent:[r]});assert.equal(v.metrics[0],'10');assert.equal(v.metrics[1],'—');assert.ok(v.cost.includes('未知'));assert.ok(v.summary.includes('部分 usage 1'));});
test('multiple currencies remain separate and tiny nonzero amounts are not rendered as free zero',()=>{assert.ok(core.formatMoney('1','USD').includes('<0.000001'));const rows=[row,{...row,estimate:{currency:'CNY',picoUnits:'1000000000'}}];const v=view.present({available:true,summary:core.aggregate(rows),recent:rows});assert.equal(v.costs.length,2);assert.ok(v.costs.some(x=>x.includes('USD')));assert.ok(v.costs.some(x=>x.includes('CNY')));});
test('native Windows caption keeps OS controls and other platforms keep their native frame',()=>{const options=desktopChrome('win32','dark');assert.equal(options.titleBarStyle,'hidden');assert.equal(options.titleBarOverlay.height,40);assert.ok(options.titleBarOverlay.symbolColor);assert.deepEqual(desktopChrome('linux'),{});assert.deepEqual(desktopChrome('darwin'),{});});

test('compact cumulative total is only the reported total and flags missing requests exactly',()=>{
 const partial={...row,usage:core.normalizeUsage({prompt_tokens:10,completion_tokens:2,prompt_tokens_details:{cached_tokens:0}})};
 const complete={...row,usage:core.normalizeUsage({prompt_tokens:10,completion_tokens:2,total_tokens:12,prompt_tokens_details:{cached_tokens:0}})};
 let v=view.present({available:true,summary:core.aggregate([partial]),recent:[partial]});
 assert.equal(v.total,'—');assert.equal(v.totalNote,'（1 次总量未知）');
 v=view.present({available:true,summary:core.aggregate([complete,partial]),recent:[complete,partial]});
 assert.equal(v.total,'12');assert.equal(v.totalNote,'（1 次总量未知）');
 v=view.present({available:true,summary:core.aggregate([row]),recent:[row]});
 assert.equal(v.total,'0');assert.equal(v.totalNote,'');
 const huge={...complete,usage:{...complete.usage,total:Number.MAX_SAFE_INTEGER}};
 v=view.present({available:true,summary:core.aggregate([huge,huge]),recent:[huge,huge]});
 assert.equal(v.total,(BigInt(Number.MAX_SAFE_INTEGER)*2n).toLocaleString());
});
