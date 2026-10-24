(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ProviderDiagnostics=api;})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  function createProviderDiagnostics({check,cancel,onChange=()=>{}}={}){
    const states={asr:{dirty:false,saved:false,pending:false,result:null,revision:0},refiner:{dirty:false,saved:false,pending:false,result:null,revision:0}};
    function get(kind){if(!Object.hasOwn(states,kind))throw Error('Invalid service.');return states[kind];}
    function abort(kind){const s=get(kind);if(s.pending){try{Promise.resolve(cancel?.(kind)).catch(()=>{});}catch{} }s.revision++;s.pending=false;}
    function change(kind,values){abort(kind);Object.assign(get(kind),values);onChange(kind);}
    function state(kind){return {...get(kind)};}
    function edit(kind){change(kind,{dirty:true,result:null});}
    function saved(kind){change(kind,{dirty:false,saved:true,result:null});}
    function invalidate(kind){change(kind,{saved:false,result:null});}
    function discard(kind){change(kind,{dirty:false,saved:false,result:null});}
    function cancelOne(kind){if(!get(kind).pending)return;change(kind,{result:{category:'cancelled',outcome:'cancelled',callSucceeded:false,qualityVerified:false,message:'测试已取消；服务端可能已处理或计费。'}});}
    function cancelAll(){for(const kind of Object.keys(states))cancelOne(kind);}
    async function run(kind){
      const s=get(kind);if(s.dirty||s.pending)return;
      abort(kind);const revision=s.revision;s.pending=true;s.result=null;onChange(kind);
      let result;
      try{if(typeof check!=='function')throw Error();result=await check(kind);}
      catch{result={category:'application',outcome:'error',callSucceeded:false,qualityVerified:false,message:'应用测试未完成，请确认设置窗口仍可用后重试。'};}
      if(s.revision!==revision)return;
      s.pending=false;s.result=result;onChange(kind);
    }
    return {state,edit,saved,invalidate,discard,run,cancel:cancelOne,cancelAll};
  }
  return {createProviderDiagnostics};
});
