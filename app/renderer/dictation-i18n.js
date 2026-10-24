'use strict';
(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
 else{root.DictpinI18n=Object.freeze(api);api.install(root.document,root.dictation?.uiLanguage,{Observer:root.MutationObserver});}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 // Presentation only. Never translate snapshots, input values, transcript data or dictionary wording.
 const protectedText='input,textarea,[contenteditable],#result-content,#original-text,#correction-list,#provider-summary,#effective-shortcut,.word-title,.word-aliases,[data-user-text]';
 const protectedAttributes='#original-text,#correction-list,#provider-summary,.word-title,.word-aliases,[data-user-text]';
 const chrome='title,button,label,summary,h1,h2,h3,.app-name,.skip,.hint,.empty-copy,.dictionary-intro,.dictionary-help,.privacy-note,.count-unit,#notice,#session-status,#task-status-title,#task-status-detail,#result-message,#recent-time,#shortcut-prefix,#shortcut-suffix,#toast-text,#word-undo-text,#word-error,#confirm-description,#bar-status,#bar-feedback,#voice-pill';
 const english=Object.freeze({
  '本地听写':'Dictpin','听写条':'Dictpin voice strip','跳到内容':'Skip to content','管理':'Navigation','结果':'Results','词典':'Dictionary','设置':'Settings','设置，有未保存的更改':'Settings, unsaved changes',
  '最近结果':'Recent result','开始听写':'Start dictation','结束听写':'Stop dictation','重新听写':'Record again','取消':'Cancel','确认':'Confirm','返回':'Back','连接中':'Connecting','正在连接桌面程序':'Connecting to the desktop app','识别器不可用':'Recognizer unavailable',
  '复制':'Copy','复制文字':'Copy text','复制中…':'Copying…','复制中':'Copying','已复制':'Copied','已复制，请自行粘贴':'Copied','已复制，请自行粘贴。':'Copied. Paste when ready.','已复制识别原文。':'Original transcript copied.',
  '查看识别原文':'View original transcript','识别原文':'Original transcript','复制原文':'Copy original','还原原文':'Restore original','撤销还原':'Undo restore','词典纠正':'Dictionary corrections','撤销词典纠正':'Undo corrections','重试轻整理':'Retry cleanup','本次用量':'Request usage','本次模型用量':'Model usage',
  '未知用量与费用不按零计算。本地识别不产生模型 token。':'Unknown usage or cost is not zero. Local recognition uses no model tokens.','用量未报告，费用未知。':'Usage was not reported; cost is unknown.','没有本次调用记录。':'No service request for this result.','费用未知':'Cost unknown','用量账本当前不可读，原文件保持不变。':'Usage records are unavailable; the original file is preserved.',
  '把想说的，变成文字。':'Turn your voice into text.','在本机识别，完成后由你复制。':'Recognized locally. Review and copy when ready.','设置快捷键':'Set a shortcut','快捷键未生效':'Shortcut unavailable','按':'Press','开始说话，再按一次结束':'to start; press again to stop',
  '最近听写结果，可直接修改':'Latest dictation result, editable','听写阶段':'Dictation stages','录音':'Recording','本机识别':'Local recognition','轻整理':'Light cleanup','本次文字':'Current text','已手动修改':'Edited','已还原文字':'Text restored','已轻整理':'Lightly refined','正在处理新听写，上次结果仍保留。':'Processing new dictation; the previous result is preserved.',
  '个人词典':'Personal dictionary','词':'terms','添加词语':'Add a term','编辑词语':'Edit term','搜索词语':'Search terms','清除搜索':'Clear search','撤销':'Undo','收起撤销提示':'Dismiss undo notice','词语':'Term','编辑':'Edit','删除':'Delete',
  '保存正确写法，也可指定常见错写。在本机纠正，无需轻整理。':'Save correct terms and explicit misspellings. Corrections run locally, without cleanup.','添加常用人名、产品名和术语。':'Add names, products and terms you use often.','没有匹配的词语。':'No matching terms.','词典如何生效？':'How does the dictionary work?',
  '只有你明确填写的错写会自动纠正；不猜同音词，不改变本地识别模型。原文始终保留，纠正可撤销。':'Only explicit misspellings are corrected. No homophone guesses or recognition-model changes. The original is preserved and corrections can be undone.',
  '麦克风':'Microphone','刷新':'Refresh','系统默认麦克风':'System default microphone','开始听写时才启用。':'Used only when you start dictation.','听写快捷键':'Dictation shortcut','重新启用':'Enable again','点击后按下组合键':'Click, then press a shortcut','点击后按下听写快捷键组合':'Click, then press the dictation shortcut','点击输入框后按组合键，再按一次结束听写。':'Click the field and press a shortcut. Press it again to stop.',
  '补标点、断句和明显口吃，保留原意。':'Punctuation, paragraphs and clear disfluencies; preserve meaning.','文字与词典会发送到模型服务。':'Text and dictionary terms are sent to your service.','模型连接':'Model connection','API 地址':'API endpoint','模型':'Model','API 密钥':'API key','留空保留当前密钥':'Leave blank to keep the current key','用系统安全存储保存':'Save with system secure storage',
  '测试已保存连接':'Test saved connection','取消测试':'Cancel test','发送合成文本，可能计费。':'Sends synthetic text; charges may apply.','正在测试已保存模型…':'Testing the saved model…','测试已结束，请核对服务状态。':'Test finished. Review the service status.','已请求取消；服务端仍可能计费。':'Cancellation requested; provider charges may still apply.','取消未确认，请等待测试结束。':'Cancellation is unconfirmed. Wait for the test to finish.',
  '其他选项':'Other options','复制最近结果快捷键（可选）':'Copy latest result shortcut (optional)','点击后按下复制快捷键组合':'Click, then press the copy shortcut','未设置':'Not set','清除':'Clear','只复制，不自动粘贴。':'Copies only; never pastes automatically.','隐私与数据':'Privacy and data',
  '语音只在本机识别。最近一次结果保存在本机，不会自动粘贴到其他应用。取消的录音仅在内存保留30秒，识别失败保留5分钟；清除或退出即丢弃。开启轻整理时，文字会发送给已保存的模型服务；失败时保留当前文字。':'Speech recognition runs locally. The latest result is saved locally; nothing is pasted automatically. Cancelled audio stays in memory for 30 seconds, failed audio for 5 minutes; clear or exit discards it. Optional cleanup sends text to the saved service and preserves the current draft on failure.',
  '保存更改':'Save changes','保存更改 (Ctrl+S)':'Save changes (Ctrl+S)','正在保存…':'Saving…','已保存':'Saved','有未保存的更改':'Unsaved changes','任务结束后可保存':'Save after the task finishes','重试保存':'Retry save','还原更改':'Reset changes','查看原因':'View details','保存失败 · 查看原因':'Save failed · details','保存失败，草稿已保留。':'Save failed; draft preserved.','关闭提示':'Dismiss notice',
  '正确词语，例如：陈晋贤':'Correct term, e.g. Project Atlas','陈静贤':'Project Atles','常见错写（可选，每行一个）':'Common misspellings (optional, one per line)','只纠正你明确指定的错写，可撤销。不要添加单字、数字或否定表达规则。':'Only explicit rules are applied, with undo. Do not add single-character, numeric or negation rules.','保存':'Save','请输入词语。':'Enter a term.',
  '有未保存的设置':'Unsaved settings','继续编辑，或丢弃本次更改。':'Keep editing or discard these changes.','继续编辑':'Keep editing','丢弃更改':'Discard changes','恢复本段识别':'Recover this segment','重试本段':'Retry segment','已取消，本段仅在内存保留30秒。':'Cancelled audio remains in memory for 30 seconds.','本段识别失败，录音仅在内存保留5分钟。':'Recognition failed. Audio remains in memory for 5 minutes.',
  '已启用':'Enabled','未生效':'Not active','未设置，不占用系统组合':'Not set; no system shortcut reserved','录入中，听写快捷键已暂停':'Recording shortcut input; dictation hotkey paused','录入中，复制快捷键已暂停':'Recording shortcut input; copy hotkey paused','已有可用密钥，留空保持。':'A key is available. Leave blank to keep it.','未设置密钥；本地匿名模型服务可不填。':'No key saved. An anonymous local service may not require one.','系统安全存储当前不可用；原配置保留，新密钥只能用于本次会话。':'System secure storage is unavailable. Existing settings are preserved; new keys are session-only.',
  '正在读取设备列表…':'Reading input devices…','所选麦克风当前未找到，可改用系统默认设备。':'The selected microphone is unavailable. You can choose the system default.','暂未列出麦克风，可尝试系统默认设备或刷新。':'No microphones listed yet. Try the system default or refresh.','麦克风尚未生效，请保存更改后开始听写。':'Microphone changes are not active. Save before dictation.','此选择已保存，连接设备后可开始听写。':'Selection saved. Connect the device to start dictation.','无法读取设备列表；已保留当前选择。':'Device list unavailable; current selection preserved.',
  '正在录音':'Recording','正在处理':'Processing','本地识别就绪':'Local recognizer ready','识别器待加载':'Recognizer will load on demand','本地识别':'Local recognition','识别组件缺失':'Recognition component missing','正在准备麦克风':'Preparing microphone','准备完成后开始录音，可随时取消。':'Recording starts when ready. Cancel at any time.','再次按快捷键，或点“结束听写”。':'Press the shortcut again or click Stop dictation.','正在结束录音':'Finishing recording','即将进行本机识别。':'Local recognition starts next.','文字已就绪，正在轻整理':'Text ready; applying light cleanup','正在本机识别':'Recognizing locally','可以直接复制文字，或修改后使用。':'Copy now, or edit the text before using it.','整理失败时保留完整原文。':'The complete original is kept if cleanup fails.','语音留在本机，请稍候。':'Audio stays on this computer. Please wait.','结束整理':'End cleanup',
  '准备中':'Preparing','结束中':'Finishing','整理中':'Refining','识别中':'Recognizing','已整理':'Refined','已就绪':'Ready','文字已就绪':'Text ready','原文已保留':'Original kept','本段可恢复':'Segment recoverable','听写未完成':'Dictation incomplete','查看':'View','恢复':'Recover','结束':'Stop','准备录音':'Prepare recording','取消本次听写':'Cancel dictation','收起听写条':'Dismiss voice strip','结束录音并处理':'Stop recording and recognize',
  '结束整理并保留完整识别原文；已发出的请求仍可能计费。':'End cleanup and keep the original; requests already sent may still be billed.','取消 (Esc)':'Cancel (Esc)','取消未确认，请重试。':'Cancellation unconfirmed. Try again.','结束未确认，请重试。':'Stop unconfirmed. Try again.','复制失败，请重试。':'Copy failed. Try again.','恢复未完成，请重试。':'Recovery incomplete. Try again.','无法打开，请从托盘重试。':'Cannot open. Try again from the tray.','未能收起，请重试。':'Could not dismiss. Try again.',
  '重新轻整理？':'Retry light cleanup?','会发送当前识别文字，可能计费；本次只请求一次。':'Sends the current recognized text; charges may apply. One request only.','撤销词典纠正？':'Undo dictionary corrections?','恢复未经词典纠正的识别原文，当前稿可撤销恢复。':'Restore the uncorrected original. The current draft remains available for undo.','还原识别原文？':'Restore the original transcript?','当前稿会保留为可撤销的上一稿。':'The current draft will be kept for undo.','开始新的听写？':'Start new dictation?','上一段临时录音将被清除，已有文字仍保留。':'Discards the temporary audio segment. Existing text is preserved.',
  '未连接桌面程序，无法开始听写。':'Desktop connection unavailable. Dictation cannot start.','无法连接桌面程序，请从托盘重新打开。':'Cannot connect to the desktop app. Reopen it from the tray.','未连接桌面程序，请从托盘重新打开。':'Desktop connection unavailable. Reopen from the tray.'
 });
 function normalizeLanguage(value){return value==='en'?'en':'zh-CN';}
 function translate(value){return Object.hasOwn(english,value)?english[value]:value;}
 function closest(element,selector){return !!element?.closest?.(selector);}
 function transform(value,replace){const content=String(value),trimmed=content.trim();if(!trimmed)return content;const next=replace(trimmed);return next===trimmed?content:content.slice(0,content.indexOf(trimmed))+next+content.slice(content.indexOf(trimmed)+trimmed.length);}
 function translateNodeText(element,value,language='en'){
  if(normalizeLanguage(language)!=='en'||!element)return value;
  if(element.tagName==='OPTION'){
   if(element.value!=='')return value;
   return transform(value,text=>text.startsWith('系统默认 · ')?'System default · '+text.slice('系统默认 · '.length):translate(text));
  }
  if(closest(element,protectedText)||!closest(element,chrome))return value;
  return transform(value,text=>{
   if(element.id==='recent-time')return text.replace(/ 字符$/,' characters');
   if(element.id==='word-undo-text'){const match=text.match(/^已移除“([\s\S]*)”$/);if(match)return 'Removed “'+match[1]+'”';}
   if(element.id==='word-error'){const match=text.match(/^已有“([\s\S]*)”，请编辑现有词语。$/);if(match)return '“'+match[1]+'” already exists. Edit that term.';}
   if(element.id==='device-message'){
    if(text.startsWith('下次听写使用：')&&text.endsWith('。'))return 'Next dictation uses: '+text.slice('下次听写使用：'.length,-1)+'.';
   }
   if(element.id==='correction-summary'){const match=text.match(/^(词典已纠正 |词典纠正记录：)(\d+) 处$/);if(match)return (match[1]==='词典纠正记录：'?'History: ':'')+match[2]+' dictionary correction'+(match[2]==='1'?'':'s');}
   if(element.id==='result-message'){const match=text.match(/^已纠正 (\d+) 处$/);if(match)return match[1]+' correction'+(match[1]==='1'?'':'s')+' applied';}
   return translate(text);
  });
 }
 function translateAttribute(element,name,value,language='en'){
  if(normalizeLanguage(language)!=='en'||!['title','aria-label','placeholder'].includes(name)||closest(element,protectedAttributes))return value;
  if(name==='aria-label'&&element.hasAttribute?.('data-word-action')){
   const match=value.match(/^(编辑|删除) ([\s\S]*)$/);if(match)return (match[1]==='编辑'?'Edit ':'Delete ')+match[2];
  }
  return transform(value,translate);
 }
 function localizeDocument(document,language){
  if(!document||normalizeLanguage(language)!=='en')return 0;
  if(document.documentElement.lang!=='en')document.documentElement.lang='en';
  const title=translate(document.title);if(title!==document.title)document.title=title;
  let changed=0;const walk=document.createTreeWalker(document.body,4);let node;
  while((node=walk.nextNode())){const next=translateNodeText(node.parentElement,node.nodeValue,'en');if(next!==node.nodeValue){node.nodeValue=next;changed++;}}
  for(const element of document.querySelectorAll('[title],[aria-label],[placeholder]'))for(const name of ['title','aria-label','placeholder']){const before=element.getAttribute(name);if(before===null)continue;const after=translateAttribute(element,name,before,'en');if(after!==before){element.setAttribute(name,after);changed++;}}
  return changed;
 }
 function install(document,language,{Observer}={}){
  if(!document||normalizeLanguage(language)!=='en')return {dispose(){}};
  localizeDocument(document,'en');let pending=false,disposed=false;
  const observer=Observer?new Observer(()=>{if(pending||disposed)return;pending=true;queueMicrotask(()=>{pending=false;if(!disposed)localizeDocument(document,'en');});}):null;
  observer?.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['title','aria-label','placeholder']});
  return {dispose(){disposed=true;observer?.disconnect();}};
 }
 return {normalizeLanguage,translateNodeText,translateAttribute,localizeDocument,install};
});
