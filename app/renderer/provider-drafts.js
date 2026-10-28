(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ProviderDrafts=api;})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const clone=value=>JSON.parse(JSON.stringify(value));
 const fields=['id','presetId','region','workspaceId','baseUrl','endpointMode','model','customized','revision'];
 const metadata=p=>Object.fromEntries(fields.filter(k=>p[k]!==undefined).map(k=>[k,p[k]]));
 function modelFetchAccess(draft,endpoint){if(!endpoint||typeof endpoint.local!=='boolean')return {allowed:false,reason:'configuration'};const hasKey=draft?.keyAction==='replace'?typeof draft.key==='string'&&!!draft.key.trim():draft?.keyAction==='retain'&&draft.keyStatus?.hasKey===true;return endpoint.local||hasKey?{allowed:true,reason:null}:{allowed:false,reason:'credentials_missing'};}
 class Drafts{
  constructor(presets){this.presets=presets;this.view=null;this.items=new Map();this.selected=null;this.conflicted=false;}
  accept(view){if(!view)return;this.latest=clone(view);if(!this.view){this.saved(view);return;}if(view.revision!==this.view.revision){if(this.isDirty()){this.conflicted=true;return;}this.saved(view);}}
  saved(view){this.latest=clone(view);this.view=clone(view);this.items.clear();for(const p of view.profiles)this.items.set(p.id,{profileId:p.id,expectedRevision:p.revision,draftRevision:1,profile:metadata(p),keyAction:'retain',key:'',persistKey:p.keyStatus?.persistent===true,credentialGeneration:p.credentialGeneration,keyStatus:clone(p.keyStatus||{}),status:{category:'untested'}});this.selected=view.activeProfileId;this.conflicted=false;}
  select(presetId,region=''){const p=this.presets.createProfile(presetId,region),id=p.id;if(!this.items.has(id))this.items.set(id,{profileId:id,expectedRevision:0,draftRevision:1,profile:p,keyAction:'retain',key:'',persistKey:false,keyStatus:{hasKey:false,persistent:false},status:{category:'untested'}});this.selected=id;return this.current();}
  current(){return this.items.get(this.selected);}
  reset(){this.saved(this.latest||this.view);}
  touch(){const d=this.current();d.edited=true;d.draftRevision++;d.status={category:'changed'};}
  update(patch){const d=this.current();if(Object.entries(patch).some(([k,v])=>d.profile[k]!==v)){Object.assign(d.profile,patch);this.touch();}}
  setKey(value){const d=this.current();if(d.key!==value||d.keyAction==='remove'){d.key=value;d.keyAction=value?'replace':'retain';this.touch();}}
  setPersist(value){const d=this.current();if(d.persistKey!==value){d.persistKey=value;this.touch();}}
  removeKey(){const d=this.current();if(d.keyAction==='remove'){Object.assign(d,d.removalUndo||{keyAction:'retain',key:''});delete d.removalUndo;}else{d.removalUndo={keyAction:d.keyAction,key:d.key};d.keyAction='remove';d.key='';}this.touch();}
  changed(d){const before=this.view?.profiles.find(p=>p.id===d.profileId);return !before?d.edited===true||d.profileId===this.selected:JSON.stringify(metadata(before))!==JSON.stringify(metadata(d.profile))||d.keyAction!=='retain'||d.persistKey!==(before.keyStatus?.persistent===true);}
  isDirty(){return !!this.view&&(this.selected!==this.view.activeProfileId||[...this.items.values()].some(d=>this.changed(d)));}
  input(d=this.current()){if(!d)return null;const result={profileId:d.profileId,expectedRevision:d.expectedRevision,draftRevision:d.draftRevision,profile:clone(d.profile),keyAction:d.keyAction};if(d.credentialGeneration)result.credentialGeneration=d.credentialGeneration;if(d.keyAction==='replace')result.key=d.key;const old=this.view.profiles.find(p=>p.id===d.profileId);if(d.keyAction==='replace'||d.persistKey!==(old?.keyStatus?.persistent===true))result.persistKey=d.persistKey;return result;}
  patch(){if(!this.isDirty())return null;return {expectedRevision:this.view.revision,activeProfileId:this.selected,changes:[...this.items.values()].filter(d=>this.changed(d)).map(d=>this.input(d))};}
  status(){return this.current()?.status||{category:'untested'};}
  result(revision,result,id=this.selected){const d=this.items.get(id);if(id!==this.selected||!d||d.draftRevision!==revision)return false;d.status=clone(result);return true;}
 }
 return {Drafts,modelFetchAccess};
});
