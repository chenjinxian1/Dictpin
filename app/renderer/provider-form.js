(function(root){
 'use strict';
 function create({bridge,onChange,onBusy}){
  const $=id=>document.getElementById(id),P=root.ProviderPresets,D=new root.ProviderDrafts.Drafts(P),en=bridge.uiLanguage==='en',t=(zh,english)=>en?english:zh;
  let ready=false,operation=null,operationKind=null,operationProfile=null,operationRevision=null,sequence=0,locked=false,secure=false;
  const label=p=>P.providerLabel(p,en?'en':'zh-CN');
  function cancel(){if(operation){const id=operation,d=D.items.get(operationProfile);if(d?.draftRevision===operationRevision&&['running','loading'].includes(d.status.category))d.status={category:'changed'};operation=null;renderStatus();void bridge.cancelProviderDiagnostic({requestId:id}).catch(()=>{});onBusy(false);}}
  function changed(){cancel();renderStatus();renderInfo();onChange();}
  function options(select,entries){select.replaceChildren(...entries.map(([value,text])=>{const o=document.createElement('option');o.value=value;o.textContent=text;return o;}));}
  options($('model-provider'),P.PROVIDERS.map(p=>[p.id,en?p.en:p.label]));
  options($('model-region'),[['',t('请选择区域','Choose a region')],...P.REGIONS.map(p=>[p.id,en?p.en:p.label])]);
  function renderStatus(){
   const s=D.status(),messages={untested:t('未测试','Not tested'),changed:t('配置已更改，请重新测试','Changed — test again'),running:t('正在测试轻整理…','Testing cleanup…'),loading:t('正在获取模型…','Getting models…')};
   const missingKey=s.kind==='models'&&s.category==='credentials_missing';
   $('model-key-error').hidden=!missingKey;$('model-key-error').textContent=missingKey?t('请先填写密钥','Please enter an API key first.'):'';
   if(missingKey)$('model-key').setAttribute('aria-invalid','true');else $('model-key').removeAttribute('aria-invalid');
   $('model-fetch-feedback').textContent=s.kind==='models'?(missingKey?t('尚未发送请求。','No request sent.'):(messages[s.category]||s.displayMessage||'')):'';
   $('test-message').textContent=s.kind==='models'?'':messages[s.category]||s.displayMessage||'';
   $('test-message').dataset.outcome=s.outcome||s.category;
   const details=$('test-details');details.hidden=!s.requestId;
   $('test-detail-text').textContent=s.requestId?[t('模型：','Model: ')+(s.model||'—'),t('地址：','Address: ')+(s.endpointUrl||'—'),'HTTP: '+(s.httpStatus??'—'),t('类别：','Category: ')+s.category,t('耗时：','Elapsed: ')+Math.round(s.elapsedMs||0)+' ms',t('时间：','Time: ')+(s.testedAt?new Date(s.testedAt).toLocaleString(en?'en-GB':'zh-CN'):'—')].join('\n'):'';
  }
  function renderInfo(){
   if(!ready)return;const d=D.current(),p=d.profile,active=D.view.profiles.find(x=>x.id===D.view.activeProfileId);
   $('provider-active').textContent=t('当前生效：','Active: ')+label(active)+' · '+(active.model||t('未选模型','No model'));
   $('provider-pending').textContent=D.conflicted?t('服务配置已变化，请还原草稿后重新编辑。','Service settings changed elsewhere. Restore the draft and edit again.'):D.isDirty()?t('保存后启用：','After Save: ')+label(p):t('正在编辑当前配置','Editing the active configuration');
   $('provider-customized').hidden=!p.customized;
   $('restore-provider-preset').disabled=locked||p.presetId==='legacy';
   $('provider-region-field').hidden=p.presetId!=='qwen';$('provider-workspace-field').hidden=p.presetId!=='qwen';
   const state=d.keyAction==='remove'?'remove':d.keyAction==='replace'?(d.persistKey?'will-save':'new'):d.keyStatus.state||(d.keyStatus.hasKey?'session':'missing');
   const states={remove:t('保存后移除密钥；此前仍使用已保存配置。','Key removal takes effect after Save.'),'will-save':t('新密钥将在保存时加密。','New key will be encrypted on Save.'),new:t('新密钥仅用于本次会话，保存前不生效。','New key is session-only and takes effect after Save.'),session:t('密钥仅用于本次会话。','Key is available for this session only.'),saved:t('密钥已用系统安全存储保存。','Key is saved with system secure storage.'),unavailable:t('已保留加密密钥，当前无法解密；可重新输入。','Encrypted key is preserved but unavailable; enter a replacement.'),missing:t('未配置密钥；本地匿名服务可不填。','No key configured; an anonymous local service may not need one.')};
   $('key-message').textContent=states[state]||states.missing;
   $('remove-model-key').textContent=d.keyAction==='remove'?t('撤销移除','Undo removal'):t('移除密钥','Remove key');
   $('remove-model-key').disabled=locked||(!d.keyStatus.hasKey&&!d.keyStatus.hasStoredKey&&!d.key&&d.keyAction!=='remove');
   $('reveal-model-key').disabled=locked||!d.key;
   $('remember-key').disabled=locked||!secure;
   $('secure-key-note').textContent=secure?'':t('系统安全存储不可用；新密钥只能用于本次会话。','Secure storage is unavailable; new keys can only be session-only.');
   try{$('final-model-url').textContent=t('最终请求地址：','Request address: ')+root.ProviderEndpoint.resolveProviderEndpoint(p.baseUrl,'refiner',undefined,p.endpointMode).endpointUrl;}catch{$('final-model-url').textContent=t('填完整地址后显示最终请求地址。','Enter a complete address to preview the request URL.');}
   const help=P.KEY_URLS[p.presetId];$('provider-key-help').hidden=!help;$('provider-key-help').href=help||'#';
   let endpoint;try{endpoint=root.ProviderEndpoint.resolveProviderEndpoint(p.baseUrl,'refiner',undefined,p.endpointMode);}catch{}
   const access=root.ProviderDrafts.modelFetchAccess(d,endpoint);
   $('model-source-hint').textContent=endpoint?.local?t('内置建议无需联网；在线获取将访问本地模型服务。','Built-in suggestions work without a connection; online fetch queries your local model service.'):access.reason==='credentials_missing'?t('内置建议无需密钥；在线获取请先填写密钥。','Built-in suggestions work without a key; enter a key before fetching online.'):t('可使用内置建议或手动填写；在线获取会查询当前厂商的模型列表。','Use built-in suggestions or type a model; online fetch queries this provider’s model list.');
   $('fetch-models').textContent=operation&&operationKind==='models'?t('正在获取…','Fetching…'):t('在线获取模型','Fetch models online');$('fetch-models').setAttribute('aria-busy',String(!!operation&&operationKind==='models'));
   $('provider-key-help').textContent=t('获取 API 密钥','Get an API key');
   $('provider-summary').textContent=label(active)+' · '+(active.model||t('未配置','Not configured'));
  }
  function render(){
   if(!ready)return;const d=D.current(),p=d.profile;
   if(p.presetId==='legacy'&&!$('model-provider').querySelector('option[value=legacy]')){const o=document.createElement('option');o.value='legacy';o.textContent=t('原有配置','Previous configuration');$('model-provider').append(o);}
   $('model-provider').value=p.presetId;$('model-region').value=p.region||'';$('model-workspace').value=p.workspaceId||'';$('model-url').value=p.baseUrl||'';$('model-name').value=p.model||'';$('model-key').value=d.key;$('model-key').type='password';$('reveal-model-key').textContent=t('查看','Show');$('remember-key').checked=d.persistKey;
   const list=$('model-suggestions');list.replaceChildren(...P.suggestions(p).map(id=>{const o=document.createElement('option');o.value=id;return o;}));renderInfo();renderStatus();
   const builtins=P.suggestions(p);options($('builtin-models'),[['',builtins.length?t('选择内置建议…','Choose a built-in suggestion…'):t('暂无内置建议，可手动填写','No built-in suggestions; type a model')],...builtins.map(id=>[id,id])]);$('builtin-models').value='';$('builtin-models').disabled=locked||!builtins.length;
  }
  function accept(view){if(!view)return;const before=D.selected;D.accept(view);ready=true;if(!before||!D.isDirty())render();else renderInfo();}
  function select(){const provider=$('model-provider').value;let region=provider==='qwen'?$('model-region').value:'';if(provider==='qwen'&&!region){const saved=D.view.profiles.find(x=>x.presetId==='qwen');region=saved?.region||'';}if(provider==='legacy')D.selected='legacy';else D.select(provider,region);cancel();render();onChange();}
  $('model-provider').addEventListener('change',select);
  $('model-region').addEventListener('change',()=>{D.select('qwen',$('model-region').value);cancel();render();onChange();});
  $('model-workspace').addEventListener('input',()=>{const p=D.current().profile,workspaceId=$('model-workspace').value.trim();let defaults;try{defaults=P.createProfile('qwen',p.region,workspaceId);}catch{defaults={baseUrl:'',endpointMode:'base'};}D.update({workspaceId,...(!p.customized?{baseUrl:defaults.baseUrl,endpointMode:defaults.endpointMode}:{})});$('model-url').value=D.current().profile.baseUrl;changed();});
  $('model-url').addEventListener('input',()=>{const baseUrl=$('model-url').value.trim();D.update({baseUrl,endpointMode:/\/chat\/completions\/?$/.test(baseUrl)?'endpoint':'base',customized:true});changed();});
  $('model-name').addEventListener('input',()=>{D.update({model:$('model-name').value.trim()});changed();});
  $('builtin-models').addEventListener('change',()=>{const value=$('builtin-models').value;if(!value)return;$('model-name').value=value;D.update({model:value});changed();});
  $('model-key').addEventListener('input',()=>{D.setKey($('model-key').value.trim());changed();});
  $('remember-key').addEventListener('change',()=>{D.setPersist($('remember-key').checked);changed();});
  $('remove-model-key').addEventListener('click',()=>{D.removeKey();changed();render();});
  $('reveal-model-key').addEventListener('click',()=>{$('model-key').type=$('model-key').type==='password'?'text':'password';$('reveal-model-key').textContent=$('model-key').type==='password'?t('查看','Show'):t('隐藏','Hide');});
  $('restore-provider-preset').addEventListener('click',()=>{const d=D.current(),p=d.profile;if(p.presetId==='legacy')return;let defaults;try{defaults=P.createProfile(p.presetId,p.region,p.workspaceId);}catch{$('model-workspace').setAttribute('aria-invalid','true');$('model-workspace').focus();D.result(d.draftRevision,{category:'error',displayMessage:t('业务空间 ID 格式无效，请修改后重试。','Invalid workspace ID. Correct it and try again.')});renderStatus();return;}D.update({baseUrl:defaults.baseUrl,endpointMode:defaults.endpointMode,model:defaults.model,customized:false});changed();render();});
  function resultMessage(result,kind){
   const success=result.outcome==='success'||['success','test_success','chat_success','cleanup_success','models_success'].includes(result.category);
   if(kind==='models'&&Array.isArray(result.models))return t('已获取 '+result.models.length+' 个模型，可在模型输入框选择；列表不代表轻整理兼容。','Received '+result.models.length+' models; choose one in the model input. Listing is not proof of cleanup compatibility.')+(result.partial?t(' 已达到读取上限。',' The read limit was reached.'):'');
   if(success)return t('本次轻整理样例通过；不代表所有内容的效果。','This cleanup sample passed; quality for other text is not established.');
   const messages={authentication:t('认证失败，请核对当前服务的密钥和权限。','Authentication failed. Check this service’s key and permissions.'),credentials_missing:t('请填写当前服务的密钥，或使用本地匿名服务。','Enter this service’s key, or use an anonymous local service.'),unsupported:t('当前地址暂未支持获取模型，可手动填写。','This address has no verified model-list adapter. Enter a model manually.'),cancelled:t('已取消；服务端仍可能处理或计费。','Cancelled; server processing or billing may still occur.'),timeout:t('请求超时，未自动重试；文字仍保留。','Timed out without retry; your text is preserved.'),rate_limit:t('额度或频率受限，请检查服务账户。','Quota or rate limit reached. Check your provider account.'),model_or_endpoint:t('模型或接口不存在，请核对模型与最终地址。','Model or endpoint not found. Check the model and request URL.')};
   if(result.category==='not_supported')return messages.unsupported;
   if(result.category==='configuration')return t('请检查地址、区域与模型；更换地址时须替换或移除旧密钥。','Check the address, region and model. Replace or remove the old key when changing addresses.');
   return messages[result.category]||t('检查未通过，请展开详情；配置草稿仍保留。','The check did not pass. Expand details; your draft is preserved.');
  }
  async function run(kind){
   if(!ready||operation)return;const d=D.current(),id=d.profileId,revision=d.draftRevision;
   if(kind==='models'){let endpoint;try{endpoint=root.ProviderEndpoint.resolveProviderEndpoint(d.profile.baseUrl,'refiner',undefined,d.profile.endpointMode);}catch{}const access=root.ProviderDrafts.modelFetchAccess(d,endpoint);if(!access.allowed){D.result(revision,{kind,category:access.reason,displayMessage:access.reason==='credentials_missing'?t('请先填写密钥','Please enter an API key first.'):t('请先填写有效的 API 地址。','Enter a valid API address first.')},id);renderStatus();const field=$(access.reason==='credentials_missing'?'model-key':'model-url');field.focus();field.scrollIntoView({block:'nearest',behavior:'auto'});return;}}
   const requestId='api-'+Date.now()+'-'+(++sequence);operation=requestId;operationKind=kind;operationProfile=id;operationRevision=revision;onBusy(true);D.result(revision,{kind,category:kind==='models'?'loading':'running'},id);renderStatus();renderInfo();
   try{const input={...D.input(),requestId};const result=await(kind==='models'?bridge.listProviderModels(input):bridge.checkTextService(input));if(operation!==requestId)return;if(D.result(revision,{...result,displayMessage:resultMessage(result,kind)},id)&&kind==='models'&&Array.isArray(result.models)){const ids=result.models.map(m=>typeof m==='string'?m:m.id).filter(Boolean);$('model-suggestions').replaceChildren(...[...new Set([...P.suggestions(d.profile),...ids])].map(value=>{const o=document.createElement('option');o.value=value;return o;}));}}
   catch{if(operation===requestId)D.result(revision,{kind,category:'error',displayMessage:t('检查未完成；请核对地址、模型和密钥，草稿仍保留。','Check incomplete. Verify the address, model and key; the draft is preserved.')},id);}
   finally{if(operation===requestId){operation=null;onBusy(false);renderStatus();renderInfo();}}
  }
  $('test-model').addEventListener('click',()=>void run('test'));$('fetch-models').addEventListener('click',()=>void run('models'));
  $('provider-key-help').addEventListener('click',event=>{event.preventDefault();void bridge.openProviderHelp(D.current().profile.presetId).catch(()=>{});});
  $('cancel-test').addEventListener('click',()=>{const d=D.current(),kind=operationKind;cancel();D.result(d.draftRevision,{kind,category:'cancelled',displayMessage:t('已取消；服务端仍可能计费。','Cancelled; server billing may still occur.')});renderStatus();});
  return {accept,saved(view){cancel();D.saved(view);render();},reset(){cancel();D.reset();render();},isDirty:()=>ready&&D.isDirty(),patch:()=>ready?D.patch():null,cancel,sync(state){locked=state.locked;secure=state.secure;const unavailable=locked||state.busy||!!operation||!ready;$('test-model').disabled=unavailable;$('fetch-models').disabled=unavailable;$('builtin-models').disabled=locked||!ready||!P.suggestions(D.current()?.profile).length;$('cancel-test').hidden=!operation;renderInfo();},status:()=>D.status()};
 }
 root.ProviderForm={create};
})(typeof globalThis==='object'?globalThis:this);
