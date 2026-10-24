'use strict';

(() => {
  const bridge = window.dictation;
  const usagePanel=window.UsagePanel?.mount(document);
  const $ = (id) => document.getElementById(id);
  const dialogOpeners=new Map();let settingsDismissPending=false;
  const MAX_DURATION_MS = 9 * 60 * 1000;
  const languageCatalog = window.OutputLanguages;
  const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
  const ACTIVE_PHASES = new Set(['starting', 'recording', 'stopping', 'processing', 'transcribing', 'refining', 'delivering']);
  const RECORDING_PHASES = new Set(['starting', 'recording']);
  const phaseLabels = { idle: '准备就绪', starting: '准备麦克风', recording: '正在录音', stopping: '正在结束录音', processing: '正在处理', transcribing: '正在识别', refining: '正在整理', delivering: '正在准备结果', done: '听写完成', retained: '片段已保留', cancelled: '已取消', error: '需要处理' };
  const phasePrompts = { idle: '准备好，就开始说', starting: '正在准备麦克风', recording: '正在听，请继续说', stopping: '正在结束录音', processing: '正在处理你的文字', transcribing: '正在把声音变成文字', refining: '正在整理你的表达', delivering: '正在准备可复制的结果', done: '听写完成', retained: '片段已保留', cancelled: '这次操作已取消', error: '先处理一下，再继续' };
  const modeNames = { dictate: '听写', translate: '翻译', ask: '问一问' };
  const taskNames = { ask: '提问', shorten: '精简', expand: '扩写', rewrite: '改写', explain: '解释', translate: '翻译', write: '帮我写' };
  const askResultNames = { ask: '回答', explain: '回答', write: '草稿', shorten: '精简结果', expand: '扩写结果', rewrite: '改写结果', translate: '翻译结果' };
  const askResultName = task => askResultNames[task] || '回答';
  const settingsNames = { input:'声音输入',shortcuts:'快捷键',output:'界面与输出',services:'AI 服务',dictionary:'词典',storage:'历史与存储',usage:'用量与单价',help:'帮助与关于' };
  let setupStep = 0;
  let setupProgressLoaded = false;
  let setupAutoChecked = false;
  let setupReturn = false;
  let setupCopyPending = false;
  let currentAnswerPending = false;
  const SETUP_KEY = 'local-dictation.setup.v1';
  let localSetupStatus; // Local UI progress, never an account/server classification.
  let snapshot = null;
  let snapshotVersion = 0;
  let recordingTimer = null;
  let settingsDirty = false;
  let currentSettingsPanel = 'input';
  const dirtySettingsSections = new Set();
  let savingProvider = null;
  const providerSignatures = {};
  const providerDiagnostics = window.ProviderDiagnostics.createProviderDiagnostics({
    check:kind=>bridge.checkProvider(kind),cancel:kind=>bridge?.cancelProviderCheck?.(kind),
    onChange:()=>{renderProviderDiagnostics();syncControls();}
  });
  let preferencePending = false;
  let draftTargetLanguages = [];
  let draftDefaultLanguage = '';
  let lastTargetSelectorSignature = '';
  let lastLanguageEditorSignature = '';
  let lastLanguageSearchSignature = '';
  let lastMicrophoneListSignature = '';
  const MAX_MODE_SHORTCUTS = 4;
  let draftShortcutRows = { dictate: [''], translate: [''], ask: [''] };
  let shortcutCapture = null;
  let shortcutInlineRevision = 0;
  let shortcutStartRevision = 0;
  let pendingInlineCapture = null;
  let pendingInlineRemoval = null;
  const shortcutErrorTimers = new Map();
  let suppressCaptureCancel = false;
  let savingSettings = false;
  let commandPending = false;
  let cancelPending = false;
  let modePending = false;
  let operationPending = false;
  let processingRequestPending = false;
  let importPreview = null;
  let importCommitting = false;
  const systemTheme = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  let currentView = 'dictation';
  const listScrollPositions = { history: 0, dictionary: 0 };
  let workspaceOpen = true;
  let scenariosExpanded = false;
  let scenarioPending = false;
  let scenariosDisposed = false;
  const heldScenarioKeys = new Set();
  let navigationRevision = 0;
  let activityWeeks = 34;
  let activityModel = null;
  let lastActivitySignature = '';
  let activityOffsetFromRight = 0;
  let selectedMode = 'dictate';
  let lastRenderedMode = null;
  let selectedTask = 'ask';
  let historyFilter = 'all';
  let dictionaryFilter = 'all';
  let dictionaryQuery = '';
  let selectingWords = false;
  let selectedWords = new Set();
  let editingWordId = null;
  let confirmResolver = null;
  let audioConsent = false;
  let lastResult = null;
  let lastHistorySignature = '';
  let lastDictionarySignature = '';
  let lastNoticeSignature = '';
  let lastSettingsSignature = '';
  let lastAnswerSignature = '';
  let submittedContext = '';
  let activeCapture = null;
  let toastTimer;
  let knownDevices = [];
  let deviceRefreshVersion = 0;
  let devicesDisposed = false;
  let deviceListState = 'idle';
  let selectorSession = null;
  let selectorGeneration = 0;
  let selectorWritePending = null;
  const selectorFieldEpochs = { targetLanguages: 0, targetLanguage: 0, deviceId: 0 };
  let draggedLanguage = null;
  let captureSequence = 0;
  const startedCaptureSessions = new Set();
  let lastRecordingDurationMs = 0;
  const unsubscribers = [];

  function toast(message) {
    $('toast').textContent = String(message);
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4200);
  }
  function errorMessage(error, fallback = '操作未完成，请稍后重试。') { return error && typeof error.message === 'string' ? error.message : fallback; }
  function showDialog(id) {
    const dialog=$(id);if(dialog.open)return;dialogOpeners.set(id,document.activeElement);navigationRevision++;
    if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
  }

  function closeDialog(id) {
    const dialog=$(id),opener=dialogOpeners.get(id);dialogOpeners.delete(id);
    if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');
    queueMicrotask(()=>{if(document.activeElement&&document.activeElement!==document.body&&document.activeElement!==dialog)return;
      const target=opener?.isConnected&&visibleFocusTarget(opener)?opener:$('settings-dialog').open?$('settings-heading'):currentView==='history'?$('history-heading'):$('workspace-title');
      if(target&&visibleFocusTarget(target)){if(!target.matches('button,input,select,textarea,a,[tabindex]'))target.tabIndex=-1;target.focus({preventScroll:true});}
    });
  }

  function readableResult(result) { return Boolean(result && ((typeof result.text === 'string' && result.text.trim()) || (typeof result.original === 'string' && result.original.trim()))); }
  function showView(view) {
    if (view === 'settings' || view === 'dictionary') { openSettings(view === 'dictionary' ? 'dictionary' : 'input'); return; }
    if (!['dictation', 'history', 'dictionary'].includes(view)) return;
    if (Object.hasOwn(listScrollPositions, currentView)) listScrollPositions[currentView] = $(currentView + '-scroll').scrollTop;
    navigationRevision++;
    currentView = view;
    document.body.classList.toggle('bounded-list-route', view === 'history' || view === 'dictionary');
    if (view === 'dictation') workspaceOpen = true;
    document.querySelectorAll('.view').forEach((element) => { const selected = element.id === `view-${view}`; element.hidden = !selected; element.classList.toggle('active', selected); });
    document.querySelectorAll('[data-view]').forEach((element) => { const selected = element.dataset.view === view; element.classList.toggle('active', selected); if (selected) element.setAttribute('aria-current', 'page'); else element.removeAttribute('aria-current'); });
    document.querySelector('.main-content').scrollTop = 0;
    window.scrollTo(0, 0);
    renderWorkspaceAccess();
    if (Object.hasOwn(listScrollPositions, view)) $(view + '-scroll').scrollTop = listScrollPositions[view];
  }




  function mountHomeScenarios() {
    const entries = window.ScenarioCatalog?.entries;
    if (!Array.isArray(entries)) {
      $('scenario-status').textContent = '常用场景暂不可用，请重新启动应用。';
      $('scenario-status').dataset.kind = 'error';
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const entry of entries) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'scenario-card';
      button.dataset.scenarioId = entry.id; button.dataset.state = 'idle';
      button.setAttribute('aria-label', `${entry.name} · 打开网页版`);
      button.setAttribute('aria-describedby', `scenario-description-${entry.id}`);
      button.setAttribute('aria-disabled', 'false');
      const top = document.createElement('span'); top.className = 'scenario-top';
      const icon = document.createElement('span'); icon.className = 'scenario-icon'; icon.textContent = entry.initials; icon.setAttribute('aria-hidden', 'true');
      const arrow = document.createElement('span'); arrow.className = 'scenario-arrow'; arrow.setAttribute('aria-hidden', 'true');
      const arrowGlyph = document.createElement('span'); arrowGlyph.textContent = '↗'; arrow.append(arrowGlyph); top.append(icon, arrow);
      const name = document.createElement('span'); name.className = 'scenario-name'; name.textContent = entry.name;
      const description = document.createElement('span'); description.id = `scenario-description-${entry.id}`; description.className = 'scenario-description'; description.textContent = entry.description;
      const action = document.createElement('span'); action.className = 'scenario-action'; action.textContent = '打开网页版'; action.setAttribute('aria-hidden', 'true');
      button.append(top, name, description, action);
      button.addEventListener('click', () => { void openHomeScenario(entry.id, button); });
      button.addEventListener('keydown', event => {
        if (!['Enter', ' '].includes(event.key)) return;
        // Own keyboard activation so native keydown/click and held Enter cannot double-open.
        event.preventDefault();
        if (event.repeat || heldScenarioKeys.has(event.key) || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
        heldScenarioKeys.add(event.key); button.click();
      });
      fragment.append(button);
    }
    $('scenario-grid').append(fragment);
  }
  async function openHomeScenario(id, button) {
    if (scenarioPending || scenariosDisposed || !$('settings-dialog').open || currentSettingsPanel !== 'help' || button.closest('[hidden]') || document.hidden) return;
    const status = $('scenario-status');
    if (typeof bridge?.openScenario !== 'function') { status.textContent = '桌面连接未就绪，暂时无法打开网页版。'; status.dataset.kind = 'error'; return; }
    scenarioPending = true;
    $('scenario-grid').setAttribute('aria-busy', 'true');
    document.querySelectorAll('.scenario-card').forEach(card => card.setAttribute('aria-disabled', 'true'));
    button.dataset.state = 'pending'; button.setAttribute('aria-busy', 'true');
    status.dataset.kind = 'pending'; status.textContent = `正在请求打开 ${button.querySelector('.scenario-name').textContent} 网页版，请在确认框中核对完整网址。`;
    try {
      // The main process alone resolves the immutable URL, authorizes and confirms opening.
      const result = await bridge.openScenario({ id });
      if (scenariosDisposed) return;
      if (result?.ok === true && result?.dispatched === true) {
        button.dataset.state = 'dispatched'; status.dataset.kind = 'success'; status.textContent = '已请求浏览器打开';
      } else if (result?.cancelled === true) {
        button.dataset.state = 'cancelled'; status.dataset.kind = 'cancelled'; status.textContent = '已取消打开网页版。';
      } else {
        button.dataset.state = 'error'; status.dataset.kind = 'error'; status.textContent = '未能请求浏览器打开，请重试。';
      }
    } catch (error) {
      if (scenariosDisposed) return;
      button.dataset.state = 'error'; status.dataset.kind = 'error'; status.textContent = errorMessage(error, '未能请求浏览器打开，请重试。');
    } finally {
      scenarioPending = false;
      if (!scenariosDisposed) {
        $('scenario-grid').setAttribute('aria-busy', 'false'); button.removeAttribute('aria-busy');
        document.querySelectorAll('.scenario-card').forEach(card => card.setAttribute('aria-disabled', 'false'));
      }
      // Never navigate, change modes, focus, rebuild capture nodes, or restore a prior view here.
    }
  }


  function renderWorkspaceAccess() {
    const desktopVisible=currentView==='dictation',desktopNav=$('desktop-workspace-nav');
    if(desktopNav){desktopNav.classList.toggle('active',desktopVisible);if(desktopVisible)desktopNav.setAttribute('aria-current','page');else desktopNav.removeAttribute('aria-current');}
    $('desktop-view-title').textContent=desktopVisible?'工作台':'历史记录';
    $('desktop-asr-label').textContent=snapshot?.settings?.asr?.backend==='local'?'本地转录':'云端识别';
    const state=snapshot?.state||{},active=ACTIVE_PHASES.has(state.phase),recoverable=Boolean(snapshot?.recovery?.token),currentResult=readableResult(state.result),hasResult=currentResult||readableResult(lastResult);
    $('session-access').hidden=currentView==='dictation'||!(active||recoverable||hasResult||['error','retained'].includes(state.phase));
    $('session-access').dataset.phase=state.phase||'idle';
    $('session-access-title').textContent=active?(modeNames[state.mode]||'听写')+' · '+(phaseLabels[state.phase]||'正在处理'):recoverable?'有片段可恢复':hasResult&&!currentResult?'查看上次结果':'查看本次结果';
    $('session-access-detail').textContent=active?'录音或处理仍在继续。':recoverable?'重试前会核对目标与费用。':String(state.message||'返回工作台核对并复制。').slice(0,180);
    const missing=snapshot&&(!asrConfigured(snapshot)||(selectedMode!=='dictate'&&!serviceConfigured(snapshot,'refiner')));
    $('quiet-readiness').hidden=!missing;
    $('quiet-readiness-message').textContent=!asrConfigured(snapshot)?'先配置语音识别；文字输入可单独使用已配置的文字模型。':'当前模式需要文字模型，请先配置 AI 服务。';
    $('quiet-data-flow-summary').textContent=(snapshot?.settings?.asr?.backend==='local'?'本地识别':'云端识别')+' · 手动复制 · 数据流向';
  }

  function openWorkspace({ focus = true, recovery = false } = {}) {
    // Never bypass a modal's pending confirmation or discard its settings draft.
    if (document.querySelector('dialog[open]')) return false;
    showView('dictation'); workspaceOpen = true; renderWorkspaceAccess();
    if (focus) {
      const target = recovery && snapshot?.recovery?.token && !ACTIVE_PHASES.has(snapshot?.state?.phase) ? $('recovery-heading') : $('workspace-title');
      target.tabIndex = -1; target.focus(); if (target.id === 'recovery-heading') $('recovery-card').scrollIntoView?.({ block: 'start' });
    }
    return true;
  }


  function openSettings(panel = 'input') {
    panel=({general:'input',personalization:'output',account:'help',about:'help'})[panel]||panel;
    if (!settingsNames[panel]) panel = 'input';
    if(panel!==currentSettingsPanel){providerDiagnostics.cancelAll();closeSelector(false);cancelInlinePending();}
    if(shortcutCapture&&panel!==currentSettingsPanel)void endShortcutCapture('已切换设置页，按键录制取消。',false);
    currentSettingsPanel = panel;
    $('settings-heading').textContent = settingsNames[panel];
    if(!settingsDirty){$('settings-message').classList.remove('error');$('settings-message').textContent=({input:'设备与识别语言更改后自动保存；不会试音。',shortcuts:'以实际注册状态为准；高级编辑需单独保存。',output:'界面与语言即时保存；写作偏好需点击保存。',services:'服务分别保存；测试需主动点击，可能计费。',dictionary:'词条仅在本机保存，使用时作为提示。',storage:'保存后生效；清理已有数据前会确认。',usage:'缺少必需单价或用量时显示未知。',help:'不会自动开麦或发送模型请求。'})[panel];}
    $('save-settings').hidden = !['storage','output','usage'].includes(panel);
    $('save-settings').textContent = panel === 'services' ? '保存模型服务' : panel === 'storage' ? '保存存储设置' : panel==='usage'?'保存单价':'保存写作偏好';
    if ($('settings-local-save')) $('settings-local-save').dataset.localSave = String(!$('save-settings').hidden);
    document.querySelectorAll('[data-settings-section]').forEach((section) => { section.hidden = section.dataset.settingsSection !== panel; });
    document.querySelectorAll('.settings-sidebar [data-settings-panel]').forEach((button) => { const active = button.dataset.settingsPanel === panel; button.classList.toggle('active', active); if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
    document.querySelector('.settings-scroll').scrollTop = 0;
    showDialog('settings-dialog');
    $('quiet-settings-nav').setAttribute('aria-expanded','true');
  }
  function setupReport() { return window.SetupReadiness?.evaluate(snapshot, { mode: selectedMode }); }
  function renderSetup() {
    const report = setupReport(); if (!report) return;
    const steps = [
      { title: '连接语音识别服务', items: [report.services.asr, report.secureStorage], description: '录音会发送到已保存的识别服务。填写地址、模型与密钥后保存；本机服务可以不填密钥。', panel: 'services' },
      { title: '选择文字处理能力', items: [report.services.refiner], description: '纯听写可以关闭整理。翻译、问一问和文字处理仍需要文字模型；关闭听写整理不会关闭这些模式的模型调用。', panel: 'services' },
      { title: '检查快捷键与麦克风', items: [report.shortcuts, ...report.shortcuts.items, report.microphone], description: '这里显示实际注册状态。快捷键不可用时仍可用录音按钮。麦克风只在你主动开始录音时请求权限；此步骤不会开麦。', panel: 'general' },
      { title: '核对隐私，练习复制', items: report.privacy.items, description: '当前所有平台均为手动复制。完成引导只表示你查看了本地配置，不表示接口、麦克风或 Windows 回填已通过验证。' }
    ];
    const step = steps[setupStep]; $('setup-dialog').dataset.step = String(setupStep);
    $('setup-heading').textContent = step.title; $('setup-progress').textContent = `开始使用 · ${setupStep + 1} / 4`;
    $('setup-step-description').textContent = step.description; const fragment = document.createDocumentFragment();
    step.items.filter(Boolean).forEach(item => { const node = document.createElement('section'); node.className = 'setup-item'; node.dataset.state = item.state; const title = document.createElement('strong'); title.textContent = item.title; const detail = document.createElement('p'); detail.textContent = item.detail; node.append(title, detail); fragment.append(node); });
    $('setup-items').replaceChildren(fragment); $('setup-configure').hidden = !step.panel; $('setup-configure').dataset.panel = step.panel || '';
    $('setup-configure').textContent = step.panel === 'general' ? '打开快捷键与麦克风设置' : '打开模型服务设置';
    $('setup-copy-practice').hidden = setupStep !== 3; $('setup-back').disabled = setupStep === 0;
    $('setup-next').textContent = setupStep === 3 ? '完成本地引导' : '下一步';
    $('setup-next').disabled = setupStep === 3 && !report.services.asr.configured;
    $('setup-message').textContent = setupStep === 3 && !report.services.asr.configured ? '识别服务尚未配置齐全，可返回第一步设置，或选择稍后设置。' : '本页只检查已保存配置；不会自动连接服务。';
  }
  function saveSetupStep() { try { localStorage.setItem(SETUP_KEY + '.step', String(setupStep)); } catch { /* optional UI preference, no secrets */ } }
  function openSetup() {
    if (!snapshot || ACTIVE_PHASES.has(snapshot.state.phase) || savingSettings || shortcutCapture) return;
    if (!setupProgressLoaded) { setupProgressLoaded = true; localSetupStatus = ''; try { localSetupStatus = localStorage.getItem(SETUP_KEY) || ''; const step = Number(localStorage.getItem(SETUP_KEY + '.step')); if (Number.isInteger(step) && step >= 0 && step < 4) setupStep = step; } catch { /* optional UI preference */ } }
    setupAutoChecked = true; renderSetup(); showDialog('setup-dialog'); $('setup-next').focus();
  }
  function leaveSetup(status = 'skipped') {
    saveSetupStep(); if (localSetupStatus === 'completed') status = 'completed'; localSetupStatus = status;  try { localStorage.setItem(SETUP_KEY, status); } catch { toast('无法保存引导进度；下次可从首页重新打开。'); }
    setupReturn = false; $('return-setup').hidden = true; closeDialog('setup-dialog');
  }
  function maybeOpenSetup() {
    // First-use guidance is a visible workbench action, not an unsolicited modal.
    if(snapshot)setupAutoChecked=true;
  }

  async function returnToSetup() { if (savingSettings || settingsDismissPending) return; const previousReturn=setupReturn;setupReturn = true;if(!(await dismissSettings()))setupReturn=previousReturn; }
  async function copySetupExample() {
    if (setupCopyPending || !bridge) return; setupCopyPending = true; $('setup-copy').disabled = true;
    try { await bridge.copyText('这是本地复制练习。'); $('setup-copy-status').textContent = '示例已复制。请自行粘贴到编辑器；尚未执行自动回填。'; }
    catch (error) { $('setup-copy-status').textContent = errorMessage(error, '复制未成功，请重试。'); }
    finally { setupCopyPending = false; $('setup-copy').disabled = false; }
  }
  async function openCurrentAnswer() {
    if (currentAnswerPending || snapshot?.state?.phase !== 'done' || snapshot.state.result?.mode !== 'ask' || snapshot.state.result?.status !== 'completed') return;
    currentAnswerPending = true; syncControls();
    try { if(typeof bridge?.openCurrentAnswer==='function')await bridge.openCurrentAnswer();else{$('legacy-answer').hidden=false;$('history-answer-host').hidden=true;$('history-answer-loading').hidden=true;$('answer-query').textContent=lastResult.original;$('answer-text').textContent=lastResult.text;showDialog('answer-dialog');} } catch (error) { toast(errorMessage(error, '当前回答已不可用，请检查历史记录。')); }
    finally { currentAnswerPending = false; syncControls(); }
  }
  function displayShortcut(value) { return String(value || 'CommandOrControl+Shift+Space').replace(/CommandOrControl|CmdOrCtrl/gi, snapshot?.platform === 'darwin' ? '⌘' : 'Ctrl').replace(/\+/g, ' + '); }
  function effectiveShortcuts(name) {
    const list = snapshot?.shortcutStatus?.bindingLists?.[name];
    if (Array.isArray(list)) return list.filter((value) => typeof value === 'string' && value.trim());
    const value = snapshot?.shortcutStatus?.bindings?.[name];
    return typeof value === 'string' && value.trim() ? [value] : [];
  }
  function effectiveShortcut(name) { const values = effectiveShortcuts(name); return values.length ? values.map(displayShortcut).join(' / ') : '未生效'; }
  function shortcutIdentity(value) {
    const parts = String(value || '').trim().replace(/\+\+$/, '+Plus').split('+').map((part) => part.trim().toLowerCase());
    const key = parts.pop(); const aliases = { ctrl: 'control', cmd: 'command', meta: snapshot?.platform === 'darwin' ? 'command' : 'super', option: 'alt', cmdorctrl: snapshot?.platform === 'darwin' ? 'command' : 'control', commandorcontrol: snapshot?.platform === 'darwin' ? 'command' : 'control' };
    return parts.map((part) => aliases[part] || part).sort().concat(key === 'enter' ? 'return' : key === 'esc' ? 'escape' : key).join('+');
  }
  function shortcutRowStatus(mode, value, index) {
    const actual = effectiveShortcuts(mode);
    const list = snapshot?.shortcutStatus?.statusLists?.[mode];
    const statuses = Array.isArray(list) ? list : [snapshot?.shortcutStatus?.statuses?.[mode]].filter(Boolean);
    const status = statuses.find((item) => shortcutIdentity(item.accelerator) === shortcutIdentity(value));
    const active = value && actual.find((item) => shortcutIdentity(item) === shortcutIdentity(value));
    if (active) return `当前生效：${displayShortcut(active)}${status?.error ? '；' + status.error : ''}`;
    if (value && status?.error) return `未生效：${status.error}`;
    const saved = mode === 'current' ? [snapshot?.settings?.shortcut || ''] : [snapshot?.settings?.modeShortcuts?.[mode] || '', ...(snapshot?.settings?.modeShortcutAlternates?.[mode] || [])];
    if (!value) return index > 0 ? '替代组合键不能为空，请填写或删除此行。' : saved.some(Boolean) ? '草稿：留空后使用下一项；全部留空则停用此模式。' : mode === 'current' ? '尚未注册成功，请保存设置后检查。' : '未启用此模式的独立快捷键。';
    if (saved.some((item) => shortcutIdentity(item) === shortcutIdentity(value))) return '尚未注册成功，请保存设置后检查。';
    return '未保存的草稿，尚未生效。';
  }
  function renderShortcutKeycaps(input, candidate) {
    let holder = input.parentElement;
    if (!holder.classList.contains('shortcut-keyfield')) {
      holder = document.createElement('div'); holder.className = 'shortcut-keyfield';
      input.parentElement.insertBefore(holder,input); holder.append(input);
      const preview = document.createElement('span'); preview.className = 'shortcut-keycaps'; preview.setAttribute('aria-hidden','true'); holder.append(preview);
    }
    const preview = holder.querySelector('.shortcut-keycaps'), raw = candidate === undefined ? input.value.trim() : candidate;
    const tokens = raw ? raw.replace(/CommandOrControl|CmdOrCtrl/gi,snapshot?.platform==='darwin'?'Cmd':'Ctrl').replace(/Control/gi,'Ctrl').replace(/Command/gi,'Cmd').split('+') : [];
    preview.replaceChildren();
    if (!tokens.length) preview.textContent='未设置';
    for (const token of tokens) { const cap=document.createElement('kbd');cap.textContent=token||'+';preview.append(cap); }
    input.title = raw ? `点击编辑：${raw}` : '点击输入组合键';
  }
  function updateShortcutStatus() {
    renderShortcutKeycaps($('shortcut'));
    $('shortcut-status').textContent = shortcutRowStatus('current', $('shortcut').value.trim(), 0);
    for (const mode of Object.keys(modeNames)) {
      document.querySelectorAll(`input[data-shortcut-mode="${mode}"]`).forEach((input) => { renderShortcutKeycaps(input); $(input.id + '-status').textContent = shortcutRowStatus(mode, input.value.trim(), Number(input.dataset.shortcutIndex)); });
      $('shortcut-live-' + mode).textContent = `本模式当前实际生效：${effectiveShortcut(mode)}`;
    }
  }
  function inlineShortcuts() { return typeof bridge?.updateShortcut === 'function' && !$('shortcut-advanced')?.open; }
  function savedShortcutRows(mode) { return [snapshot?.settings?.modeShortcuts?.[mode],...(snapshot?.settings?.modeShortcutAlternates?.[mode] || [])].filter(value=>typeof value==='string'&&value.trim()).map(value=>value.trim()); }
  function restoreInlineShortcutDraft() { dirtySettingsSections.delete('shortcuts'); settingsDirty=dirtySettingsSections.size>0; restoreSavedSection('shortcuts'); }
  function shortcutInlineError(mode,index,error) {
    const message=errorMessage(error,'快捷键未保存，原绑定已保留。'); $('shortcut-save-message').textContent=message; $('shortcut-save-message').classList.add('error');
    const id='shortcut-'+mode+(index?'-alt-'+index:'')+'-status',node=$(id); if(!node)return;
    clearTimeout(shortcutErrorTimers.get(id));node.textContent=message;node.classList.add('error');const epoch=shortcutInlineRevision;
    shortcutErrorTimers.set(id,setTimeout(()=>{shortcutErrorTimers.delete(id);if(epoch!==shortcutInlineRevision||$(id)!==node)return;node.classList.remove('error');updateShortcutStatus();syncControls();},2000));
  }
  async function commitShortcutRow(input,focusId) {
    if(savingSettings||preferencePending||operationPending||modePending||shortcutCapture||ACTIVE_PHASES.has(snapshot?.state?.phase))return false;
    savingSettings=true;shortcutInlineRevision++;syncControls();$('shortcut-save-message').classList.remove('error');$('shortcut-save-message').textContent='正在注册并保存此快捷键…';
    try{await invoke('updateShortcut',input);restoreInlineShortcutDraft();$('shortcut-save-message').textContent='此快捷键已保存。';return true;}
    catch(error){restoreInlineShortcutDraft();shortcutInlineError(input.mode,input.index,error);return false;}
    finally{savingSettings=false;syncControls();if(focusId&&$('settings-dialog').open&&currentSettingsPanel==='shortcuts'&&$(focusId)&&!$(focusId).disabled)$(focusId).focus();}
  }
  function cancelInlinePending(message='已取消快捷键修改，原绑定保留。') { if(pendingInlineRemoval){pendingInlineRemoval.cancelled=true;pendingInlineRemoval=null;} const pending=pendingInlineCapture;if(!pending)return;pending.abortCommit=true;pendingInlineCapture=null;if(!shortcutCapture){restoreInlineShortcutDraft();$('shortcut-capture-status').textContent=message;} }
  async function finishInlineShortcutCapture(capture) {
    if(shortcutCapture!==capture||capture.phase!=='releasing')return;
    const accelerator=$(capture.inputId)?.value;capture.commitOnRelease=true;pendingInlineCapture=capture;
    await endShortcutCapture('组合键已录入，正在确认快捷键恢复。',false,true);
    let timer,ack;
    try{ack=await Promise.race([capture.cleanupPromise,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),3000);})]);}catch{ack=null;}finally{clearTimeout(timer);}
    if(pendingInlineCapture===capture)pendingInlineCapture=null;
    if(capture.inlineRevision!==shortcutInlineRevision||shortcutCapture)return;
    if(capture.abortCommit||!$('settings-dialog').open||currentSettingsPanel!=='shortcuts'||ACTIVE_PHASES.has(snapshot?.state?.phase)){restoreInlineShortcutDraft();$('shortcut-capture-status').textContent='已取消快捷键修改，原绑定保留。';return;}
    if(ack?.ended!==true||ack?.restored!==true||snapshot?.shortcutStatus?.degraded){restoreInlineShortcutDraft();shortcutInlineError(capture.mode,capture.index,Error('未能确认快捷键完整恢复，此次修改未保存。请检查当前生效状态后重试。'));return;}
    await commitShortcutRow({action:'set',mode:capture.mode,index:capture.index,expected:capture.expected,accelerator},capture.inputId);
  }
  function syncShortcutDraft() {
    for (const mode of Object.keys(modeNames)) draftShortcutRows[mode] = [...document.querySelectorAll(`input[data-shortcut-mode="${mode}"]`)].map((input) => input.value);
  }
  function renderShortcutRows(mode) {
    const fragment = document.createDocumentFragment();
    draftShortcutRows[mode].forEach((value, index) => {
      const id = 'shortcut-' + mode + (index ? '-alt-' + index : '');
      const row = document.createElement('div'); row.className = 'shortcut-setting-row'; row.dataset.shortcutRow = String(index);
      const label = document.createElement('label'); label.className = 'shortcut-setting-label'; label.htmlFor = id; label.textContent = index ? `替代组合键 ${index}` : '主要组合键';
      const input = document.createElement('input'); input.id = id; input.type = 'text'; input.autocomplete = 'off'; input.spellcheck = false; input.maxLength = 100; input.placeholder = index ? '输入替代组合键，或点击录制' : '留空停用 / 使用下一项'; input.value = value; input.dataset.shortcutMode = mode; input.dataset.shortcutIndex = String(index); input.setAttribute('aria-label',`修改${modeNames[mode]}快捷键 ${index+1}`); input.addEventListener('click',()=>{if(inlineShortcuts())void beginShortcutCapture(id);}); input.addEventListener('keydown',event=>{if(inlineShortcuts()&&!shortcutCapture&&['Enter',' '].includes(event.key)){event.preventDefault();void beginShortcutCapture(id);}});
      const line = document.createElement('div'); line.className = 'shortcut-input-line';
      const capture = button('录制按键', () => beginShortcutCapture(id), 'button button-secondary small'); capture.id = 'capture-' + id; capture.dataset.shortcutCapture = id; capture.setAttribute('aria-pressed', 'false'); line.append(input, capture);
      if (index || (inlineShortcuts() && value && (mode!=='dictate'||savedShortcutRows(mode).length>1))) { const remove = button('移除', () => removeShortcutRow(mode, index), 'text-button danger-text'); remove.dataset.shortcutRemove = mode; remove.dataset.shortcutIndex = String(index); remove.setAttribute('aria-label', `移除${modeNames[mode]}替代组合键 ${index}`); line.append(remove); }
      const status = document.createElement('span'); status.id = id + '-status'; status.className = 'field-hint shortcut-row-status'; status.setAttribute('aria-live', 'polite'); input.setAttribute('aria-describedby', status.id); row.append(label, line, status); fragment.append(row);
    });
    $('shortcut-rows-' + mode).replaceChildren(fragment); updateShortcutStatus(); syncControls();
  }
  function addShortcutRow(mode) {
    if (savingSettings || operationPending || modePending || shortcutCapture || ACTIVE_PHASES.has(snapshot?.state?.phase)) return;
    syncShortcutDraft(); if (draftShortcutRows[mode].length >= MAX_MODE_SHORTCUTS) return;
    if(inlineShortcuts()){const saved=savedShortcutRows(mode);draftShortcutRows[mode]=saved.concat('');renderShortcutRows(mode);markSettingsDirty('shortcuts');const index=saved.length;void beginShortcutCapture('shortcut-'+mode+(index?'-alt-'+index:''));return;}
    draftShortcutRows[mode].push(''); renderShortcutRows(mode); markSettingsDirty('shortcuts');
    $('shortcut-' + mode + '-alt-' + (draftShortcutRows[mode].length - 1)).focus();
  }
  async function removeShortcutRow(mode, index) {
    if (savingSettings || operationPending || modePending || ACTIVE_PHASES.has(snapshot?.state?.phase)) return;
    if(inlineShortcuts()){
      const saved=savedShortcutRows(mode);if(index<0||index>=saved.length)return;
      cancelInlinePending();const operation={revision:++shortcutInlineRevision,cancelled:false};pendingInlineRemoval=operation;
      const capture=shortcutCapture;
      if(capture){
        await endShortcutCapture('已取消未提交按键，正在移除已保存组合。',false);
        let ack,timer;try{ack=await Promise.race([capture.cleanupPromise,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),3000);})]);}catch{ack=null;}finally{clearTimeout(timer);}
        if(operation.cancelled||pendingInlineRemoval!==operation||operation.revision!==shortcutInlineRevision)return;
        if(ack?.ended!==true||ack?.restored!==true||snapshot?.shortcutStatus?.degraded){pendingInlineRemoval=null;shortcutInlineError(mode,index,Error('未能确认快捷键完整恢复，此次移除未保存。'));return;}
      }
      if(operation.cancelled||pendingInlineRemoval!==operation||operation.revision!==shortcutInlineRevision||!$('settings-dialog').open||currentSettingsPanel!=='shortcuts')return;
      pendingInlineRemoval=null;await commitShortcutRow({action:'remove',mode,index,expected:saved[index]},'add-shortcut-'+mode);return;
    }
    if(shortcutCapture)return;
    syncShortcutDraft(); if (index <= 0 || index >= draftShortcutRows[mode].length) return;
    draftShortcutRows[mode].splice(index, 1); renderShortcutRows(mode); markSettingsDirty('shortcuts'); $('add-shortcut-' + mode).focus();
  }
  function serializeShortcutDraft() {
    syncShortcutDraft(); const primary = {}, alternates = {};
    for (const mode of Object.keys(modeNames)) {
      const rows = draftShortcutRows[mode].map((value) => value.trim());
      if (rows.length > MAX_MODE_SHORTCUTS) throw new Error(`${modeNames[mode]}本实现最多设置 4 个组合键。`);
      if (rows.slice(1).some((value) => !value)) throw new Error(`${modeNames[mode]}有空的替代组合键，请填写或移除空行后再保存。`);
      const values = rows.filter(Boolean); primary[mode] = values[0] || ''; alternates[mode] = values.slice(1);
    }
    return { modeShortcuts: primary, modeShortcutAlternates: alternates };
  }
  function clearShortcutCaptureUI(capture, message, focus = true) {
    if (shortcutCapture !== capture) return;
    const previousFocus=document.activeElement,focusRevision=shortcutStartRevision;
    const preserveFocusId=!focus&&capture.inline&&document.hasFocus()&&previousFocus?.matches('input[data-shortcut-mode],#shortcut')?previousFocus.id:null;
    const input = $(capture.inputId); shortcutCapture = null;
    $('settings-dialog').removeAttribute('data-capturing'); $('settings-dialog').removeAttribute('data-capture-phase');
    $('shortcut-capture-status').textContent = message; if (input) input.readOnly = false;
    if(capture.inline&&!capture.commitOnRelease){restoreInlineShortcutDraft();}
    syncControls(); if (focus && $(capture.inputId) && !$(capture.inputId).disabled) $(capture.inputId).focus();
    if(preserveFocusId&&!previousFocus.isConnected)queueMicrotask(()=>{
      const target=$(preserveFocusId);
      if(focusRevision===shortcutStartRevision&&!shortcutCapture&&$('settings-dialog').open&&currentSettingsPanel==='shortcuts'&&!document.hidden&&!document.querySelector('dialog[open]:not(#settings-dialog)')&&(!document.activeElement||document.activeElement===document.body)&&visibleFocusTarget(target)&&!target.closest('details:not([open])'))target.focus({preventScroll:true});
    });
  }
  function releaseShortcutCapture(capture) {
    if (capture.endPromise) return capture.endPromise;
    const cleanup = (async () => {
      if (!capture.backend) return { ended: true, restored: true };
      let result;
      try { result = await capture.beginPromise; } catch (error) { if (!capture.token && !capture.remoteToken) throw error; }
      const token = capture.token || capture.remoteToken || result?.token;
      if (!token) return { ended: false, restored: true };
      return bridge.endShortcutCapture({ token });
    })();
    // Main can finish on timeout/blur before either IPC reply arrives. Keep the
    // old-token cleanup alive, but never hold the UI or its callers behind it.
    capture.cleanupPromise = cleanup;
    capture.endPromise = Promise.race([cleanup, capture.remoteEndPromise]);
    return capture.endPromise;
  }
  async function endShortcutCapture(message = '按键录制已取消，原值未改变。', focus = true, accept = false) {
    const capture = shortcutCapture; if (!capture) return;
    if(!accept)capture.abortCommit=true;
    capture.cancelled = true; capture.phase = 'restoring'; $('settings-dialog').dataset.capturePhase = 'restoring';
    $('shortcut-capture-status').textContent = '正在结束录制并恢复已保存的快捷键…'; syncControls();
    try {
      const result = await releaseShortcutCapture(capture);
      const terminalMessage = result?.remoteEnded || result?.ended === false ? '按键录制已结束；请查看当前实际生效的快捷键。' : result?.ended === true && result?.restored === false ? '快捷键未能全部恢复，请查看实际生效状态并重新保存设置。' : message;
      clearShortcutCaptureUI(capture, terminalMessage, focus);
    } catch (error) { clearShortcutCaptureUI(capture, `录制已结束，但恢复快捷键失败：${errorMessage(error)}`, focus); }
  }
  async function beginShortcutCapture(inputId) {
    const startRevision=++shortcutStartRevision;cancelInlinePending();
    if (shortcutCapture) { const same=shortcutCapture.inputId===inputId;await endShortcutCapture('',false);if(same||startRevision!==shortcutStartRevision)return; }
    if(inlineShortcuts()&&(!$('settings-dialog').open||currentSettingsPanel!=='shortcuts'))return;
    if (savingSettings || operationPending || modePending || ACTIVE_PHASES.has(snapshot?.state?.phase)) return;
    const input = $(inputId); if (!input || input.disabled) return;
    const backend = typeof bridge?.beginShortcutCapture === 'function' && typeof bridge?.endShortcutCapture === 'function';
    const mode=input.dataset.shortcutMode,index=Number(input.dataset.shortcutIndex||0);
    const capture = { mode,index,inline:Boolean(mode&&inlineShortcuts()),expected:mode?(savedShortcutRows(mode)[index]||''):'', inputId, backend, phase: 'starting', token: null, remoteToken: null, cancelled: false, remoteActive: false, beginPromise: null, endPromise: null };
    capture.remoteEndPromise = new Promise((resolve) => { capture.resolveRemoteEnd = resolve; });
    if(capture.inline){capture.inlineRevision=++shortcutInlineRevision;clearTimeout(shortcutErrorTimers.get(inputId+'-status'));$(inputId+'-status')?.classList.remove('error');$('shortcut-save-message').textContent='';}
    shortcutCapture = capture; $('settings-dialog').dataset.capturing = inputId; $('settings-dialog').dataset.capturePhase = 'starting';
    $('shortcut-capture-status').textContent = backend ? '正在暂停本应用的全局快捷键，请稍候…' : '兼容模式：仅录制本窗口事件，不能暂停系统已注册的快捷键。'; syncControls(); input.focus();
    capture.beginPromise = backend ? Promise.resolve().then(() => bridge.beginShortcutCapture()) : Promise.resolve({ token: null });
    try {
      const result = await capture.beginPromise;
      if (backend && (typeof result?.token !== 'string' || !result.token)) throw new Error('未收到可用的快捷键录制许可。');
      capture.token = result?.token || null;
      if (capture.cancelled || shortcutCapture !== capture) { await releaseShortcutCapture(capture); return; }
      capture.phase = 'capturing'; $('settings-dialog').dataset.capturePhase = 'capturing';
      $('shortcut-capture-status').textContent = `${backend ? '本应用快捷键已暂停。' : '兼容模式，仅本窗口键盘事件。'}请按修饰键 + 一个常见按键；Esc 取消并保留原值，不支持裸 RightAlt。`;
      syncControls(); input.focus();
    } catch (error) {
      capture.cancelled = true;
      capture.beginError = `无法开始按键录制：${errorMessage(error)}`;
      if (capture.remoteToken) {
        capture.phase = 'restoring';
        if (shortcutCapture === capture) { $('settings-dialog').dataset.capturePhase = 'restoring'; syncControls(); }
        try { await releaseShortcutCapture(capture); } catch { /* Main also restores on timeout and window lifecycle events. */ }
      }
      clearShortcutCaptureUI(capture, capture.beginError);
    }
  }
  function shortcutOrdinaryKey(event) {
    const names = { Space: 'Space', Enter: 'Return', NumpadEnter: 'Return', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', NumpadAdd: 'numadd', NumpadSubtract: 'numsub', NumpadMultiply: 'nummult', NumpadDivide: 'numdiv', NumpadDecimal: 'numdec' };
    let key = names[event.code] || names[event.key];
    if (!key && /^Key[A-Z]$/.test(event.code)) key = event.code.slice(3);
    if (!key && /^Digit[0-9]$/.test(event.code)) key = event.code.slice(5);
    if (!key && /^Numpad[0-9]$/.test(event.code)) key = 'num' + event.code.slice(6);
    if (!key && /^F(?:[1-9]|1[0-9]|2[0-4])$/.test(event.key)) key = event.key;
    if (!key && /^[a-z0-9]$/i.test(event.key)) key = event.key.toUpperCase();
    if (!key && event.key === ' ') key = 'Space';
    if (!key && event.key === '+') key = 'Plus';
    if (!key && [';', '=', ',', '-', '.', '/', '`', '[', ']', '\\'].includes(event.key)) key = event.key;
    return key;
  }
  function inlineHeldKey(event) { return ['Control','Shift','Alt','Meta','AltGraph'].includes(event.key)?'mod:'+event.key:'key:'+(event.code||event.key); }
  function updateInlineHeld(capture,event,down) {
    capture.heldKeys ||= new Set(); const token=inlineHeldKey(event);
    if(down){for(const [name,flag] of [['Control','ctrlKey'],['Alt','altKey'],['Shift','shiftKey'],['Meta','metaKey']])if(event[flag])capture.heldKeys.add('mod:'+name);capture.heldKeys.add(token);}else capture.heldKeys.delete(token);
  }
  function onInlineShortcutKeydown(event) {
    const capture=shortcutCapture;if(!capture||!['capturing','releasing','invalid-releasing'].includes(capture.phase)||event.repeat||event.isComposing)return;
    updateInlineHeld(capture,event,true);if(capture.phase==='invalid-releasing')return;
    const ordinary=[...capture.heldKeys].filter(value=>value.startsWith('key:'));const modifiers=['Control','Alt','Shift','Meta'].filter(value=>capture.heldKeys.has('mod:'+value));
    let error='';if(capture.heldKeys.size>3)error='每组最多3个按键，请全部松开后重试。';else if(!modifiers.length||capture.heldKeys.has('mod:AltGraph')||event.getModifierState?.('AltGraph'))error='请使用修饰键与一个普通按键；裸键、AltGraph和裸RightAlt暂不支持。';else if(ordinary.length!==1)error='每组需要一个普通按键，不支持连续字母或数字组合。';
    if(!['Control','Shift','Alt','Meta','AltGraph'].includes(event.key))capture.ordinaryKey=shortcutOrdinaryKey(event);
    if(!error&&!capture.ordinaryKey)error='此按键暂不支持，请全部松开后重试。';
    capture.candidate={error,accelerator:modifiers.map(value=>value==='Meta'?(snapshot?.platform==='darwin'?'Command':'Super'):value).concat(capture.ordinaryKey||'').join('+')};
    renderShortcutKeycaps($(capture.inputId),modifiers.map(value=>value==='Meta'?(snapshot?.platform==='darwin'?'Command':'Super'):value).concat(ordinary.length?[capture.ordinaryKey||'不支持的按键']:[]).join('+'));
    capture.phase=ordinary.length?'releasing':'capturing';$('settings-dialog').dataset.capturePhase=capture.phase;
    $('shortcut-capture-status').textContent=error&&ordinary.length?'松开任意按键后检查此组合。':'松开任意已按下的按键后立即保存；Esc或点外部取消。';syncControls();
  }
  function onInlineShortcutKeyup(event) {
    const capture=shortcutCapture;if(!capture||!['capturing','releasing','invalid-releasing'].includes(capture.phase))return;
    const before=capture.heldKeys?.size||0;updateInlineHeld(capture,event,false);
    if(capture.phase==='invalid-releasing'){if(!capture.heldKeys.size){capture.phase='capturing';capture.ordinaryKey=null;$('settings-dialog').dataset.capturePhase='capturing';}return;}
    if(capture.heldKeys.size>=before||!capture.candidate)return;
    const candidate=capture.candidate;capture.candidate=null;
    if(candidate.error){capture.phase=capture.heldKeys.size?'invalid-releasing':'capturing';capture.ordinaryKey=null;$('settings-dialog').dataset.capturePhase=capture.phase;shortcutInlineError(capture.mode,capture.index,Error(candidate.error));$('shortcut-capture-status').textContent=candidate.error;syncControls();return;}
    $(capture.inputId).value=candidate.accelerator;capture.phase='releasing';markSettingsDirty('shortcuts');void finishInlineShortcutCapture(capture);
  }
  function onShortcutKeydown(event) {
    if (!shortcutCapture) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.key === 'Escape' || event.key === 'Esc' || event.code === 'Escape') {
      suppressCaptureCancel = true; setTimeout(() => { suppressCaptureCancel = false; }, 0); endShortcutCapture(); return;
    }
    if(shortcutCapture.inline){onInlineShortcutKeydown(event);return;}
    if (shortcutCapture?.phase !== 'capturing' || event.repeat || event.isComposing) return;
    if (['Control', 'Shift', 'Alt', 'Meta', 'AltGraph'].includes(event.key)) { $('shortcut-capture-status').textContent = '请继续按一个普通按键；只按修饰键或裸 RightAlt 不会修改快捷键。'; return; }
    const modifiers = []; if (event.ctrlKey) modifiers.push('Control'); if (event.altKey) modifiers.push('Alt'); if (event.shiftKey) modifiers.push('Shift'); if (event.metaKey) modifiers.push(snapshot?.platform === 'darwin' ? 'Command' : 'Super');
    if (!modifiers.length || event.getModifierState?.('AltGraph')) { $('shortcut-capture-status').textContent = '请使用 Ctrl / Alt / Shift 等修饰键加一个按键；裸键与 AltGraph 不会保存。'; return; }
    const names = { Space: 'Space', Enter: 'Return', NumpadEnter: 'Return', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', NumpadAdd: 'numadd', NumpadSubtract: 'numsub', NumpadMultiply: 'nummult', NumpadDivide: 'numdiv', NumpadDecimal: 'numdec' };
    let key = names[event.code] || names[event.key];
    if (!key && /^Key[A-Z]$/.test(event.code)) key = event.code.slice(3);
    if (!key && /^Digit[0-9]$/.test(event.code)) key = event.code.slice(5);
    if (!key && /^Numpad[0-9]$/.test(event.code)) key = 'num' + event.code.slice(6);
    if (!key && /^F(?:[1-9]|1[0-9]|2[0-4])$/.test(event.key)) key = event.key;
    if (!key && /^[a-z0-9]$/i.test(event.key)) key = event.key.toUpperCase();
    if (!key && event.key === ' ') key = 'Space';
    if (!key && event.key === '+') key = 'Plus';
    if (!key && [';', '=', ',', '-', '.', '/', '`', '[', ']', '\\'].includes(event.key)) key = event.key;
    if (!key) { $('shortcut-capture-status').textContent = '此按键暂不支持录制。可按 Esc 后手动输入 Electron 组合键。'; return; }
    if(shortcutCapture.inline&&modifiers.length+1>3){$('shortcut-capture-status').textContent='每组最多3个按键，请使用至多两个修饰键和一个普通按键。';return;}
    const input = $(shortcutCapture.inputId); input.value = modifiers.concat(key).join('+');
    shortcutCapture.phase = 'releasing'; shortcutCapture.acceptedKey = { code: event.code, key: event.key };
    $('settings-dialog').dataset.capturePhase = 'releasing';
    $('shortcut-capture-status').textContent = shortcutCapture.inline ? '请松开刚才的普通按键，随后立即注册并保存。' : '组合键已填入草稿，请松开刚才的按键；松开后恢复本应用的快捷键，保存后才注册新组合。';
    markSettingsDirty('shortcuts');
  }
  function onShortcutKeyup(event) {
    if (!shortcutCapture) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if(shortcutCapture.inline){onInlineShortcutKeyup(event);return;}
    if (shortcutCapture.phase !== 'releasing') return;
    const accepted = shortcutCapture.acceptedKey;
    if ((accepted?.code && event.code === accepted.code) || (!accepted?.code && event.key === accepted?.key)) {if(shortcutCapture.inline)void finishInlineShortcutCapture(shortcutCapture);else void endShortcutCapture('组合键已填入草稿，保存后才会尝试注册。');}
  }
  function languageName(code) { return languageCatalog?.label(code) || String(code || ''); }
  function savedTargetLanguages(settings = snapshot?.settings) {
    const values = Array.isArray(settings?.targetLanguages) ? settings.targetLanguages : [settings?.targetLanguage || 'zh'];
    const seen = new Set();
    const unique = values.filter((code) => { if (typeof code !== 'string' || !code.trim() || seen.has(code.toLowerCase())) return false; seen.add(code.toLowerCase()); return true; }).slice(0, 3);
    return unique.length ? unique : [settings?.targetLanguage || 'zh'];
  }
  function selectorCurrent(session) { return !devicesDisposed && selectorSession === session && $(session.id).open; }
  function selectorBlocked() { return !snapshot || !bridge || savingSettings || preferencePending || operationPending || modePending || Boolean(shortcutCapture) || ACTIVE_PHASES.has(snapshot?.state?.phase); }
  function visibleFocusTarget(node) {
    return node?.isConnected && !node.disabled && !node.closest('[hidden], [inert]') && !node.closest('dialog:not([open])') && getComputedStyle(node).visibility !== 'hidden' && getComputedStyle(node).display !== 'none';
  }
  function closeSelector(restore = true) {
    const previous = selectorSession; if (!previous) return;
    selectorSession = null; selectorGeneration++; draggedLanguage = null;
    closeDialog(previous.id);
    // Device enumeration is read-only and independent of the capture guard. Closing
    // the selector never stops tracks, changes devices, or cancels an issued write.
    if (!restore && !devicesDisposed && visibleFocusTarget($('close-settings'))) $('close-settings').focus({ preventScroll: true });
    if (restore) {
      const fallback = $('settings-dialog').open ? $('close-settings') : document.querySelector('[data-view="settings"]');
      const target = visibleFocusTarget(previous.opener) ? previous.opener : fallback;
      if (visibleFocusTarget(target)) target.focus({ preventScroll: true });
    }
  }
  function openSelector(kind) {
    const panel=kind==='microphone'?'input':kind==='language'?'output':null;
    if (!panel || !snapshot || !bridge || savingSettings || operationPending || modePending || shortcutCapture || ACTIVE_PHASES.has(snapshot.state.phase) || !$('settings-dialog').open || currentSettingsPanel !== panel) return;
    if (selectorSession?.kind === kind && selectorCurrent(selectorSession)) return;
    closeSelector(false);
    const session = { kind, generation: ++selectorGeneration, id: kind + '-selector-dialog', opener: kind === 'language' ? $('open-language-selector') : $('microphone') };
    selectorSession = session;
    session.waitingOperation = selectorWritePending;
    session.waitingMessage = '上一项仍在保存，请稍候。';
    if (kind === 'language') {
      $('target-language-search').value = '';
      $('favorite-language-message').textContent = selectorWritePending ? session.waitingMessage : '';
      $('favorite-language-message').classList.remove('error');
      readSavedLanguages(); renderLanguageEditor();
    } else {
      $('microphone-selector-message').textContent = selectorWritePending ? session.waitingMessage : '';
      $('microphone-selector-message').classList.remove('error');
      renderMicrophoneList();
    }
    showDialog(session.id); syncControls();
    const target = kind === 'language' && !$('target-language-search').disabled ? $('target-language-search') : $('close-' + kind + '-selector');
    target.focus();
    if (kind === 'microphone') void refreshDevices(false, session);
  }
  function readSavedLanguages() {
    draftTargetLanguages = savedTargetLanguages();
    draftDefaultLanguage = draftTargetLanguages.includes(snapshot?.settings?.targetLanguage) ? snapshot.settings.targetLanguage : draftTargetLanguages[0];
  }
  function renderSelectorSummaries() {
    const saved = savedTargetLanguages();
    const label = saved.map(languageName).join('、');
    $('selected-languages-label').textContent = label;
    $('open-language-selector').title = '已配置：' + label;
    setDeviceOptions(snapshot?.settings?.deviceId || '');
  }
  function syncSavedSelectors() {
    renderSelectorSummaries();
    // Saved data remains authoritative across close/reopen. Rendering preserves
    // the newer modal's query/status and focused control; only the issuing
    // session receives completion messages or requested focus changes.
    readSavedLanguages(); renderLanguageEditor();
    if (selectorSession?.kind === 'microphone') renderMicrophoneList();
  }
  function sectionValues(settings, keys) { return Object.fromEntries(keys.map(key => [key, settings?.[key]])); }
  async function commitSelector(section, values, session, statusId, successMessage, focus) {
    if (!selectorCurrent(session) || selectorBlocked()) return false;
    const status = $(statusId), keys = Object.keys(values), before = JSON.stringify(sectionValues(snapshot.settings, keys));
    const epochs = keys.map(key => selectorFieldEpochs[key]);
    const operation = { session }; selectorWritePending = operation; preferencePending = true;
    status.classList.remove('error'); status.textContent = '正在保存…'; syncControls();
    let succeeded = false;
    try {
      const result = await updateSettingsSection(section, values);
      // A full RPC snapshot can be stale after an unrelated notification. Merge
      // only these acknowledged fields when they have not independently changed.
      if (!devicesDisposed && result?.settings && keys.every((key, index) => selectorFieldEpochs[key] === epochs[index]) && JSON.stringify(sectionValues(snapshot.settings, keys)) === before) {
        const acknowledged = sectionValues(result.settings, keys);
        if (JSON.stringify(acknowledged) === JSON.stringify(values)) applySnapshot({ ...snapshot, settings: { ...snapshot.settings, ...acknowledged } });
      }
      if (JSON.stringify(sectionValues(snapshot.settings, keys)) === before && JSON.stringify(values) !== before) throw Error('尚未确认保存成功，请重试。');
      succeeded = true;
      if (selectorCurrent(session)) {
        if (session.kind === 'language') { readSavedLanguages(); renderLanguageEditor(); } else renderMicrophoneList();
        status.textContent = JSON.stringify(sectionValues(snapshot.settings, keys)) === JSON.stringify(values) ? successMessage : '已显示最新保存的选择；较新的设置已优先保留。';
      }
    } catch (error) {
      if (selectorCurrent(session)) {
        if (session.kind === 'language') { readSavedLanguages(); renderLanguageEditor(); } else renderMicrophoneList();
        status.classList.add('error'); status.textContent = errorMessage(error, '保存失败。') + ' 已恢复已保存的选择，请重试。';
      } else if (!devicesDisposed && !selectorSession) toast('选择保存失败，已保留原设置。请重新打开后重试。');
    } finally {
      if (selectorWritePending === operation) { selectorWritePending = null; preferencePending = false; }
      if (!devicesDisposed) {
        renderSelectorSummaries(); syncControls();
        const waiting = selectorSession;
        if (waiting && waiting !== session && selectorCurrent(waiting) && waiting.waitingOperation === operation) {
          const waitingStatus = $(waiting.kind === 'language' ? 'favorite-language-message' : 'microphone-selector-message');
          if (waitingStatus.textContent === waiting.waitingMessage) waitingStatus.textContent = '当前显示已保存的选择，可继续修改。';
          waiting.waitingOperation = null;
        }
        if (selectorCurrent(session) && focus) {
          const target = focus(); if (visibleFocusTarget(target)) target.focus();
        }
      }
    }
    return succeeded;
  }
  function renderTargetSelector() {
    const state = snapshot?.state || {};
    const active = ACTIVE_PHASES.has(state.phase);
    const saved = savedTargetLanguages();
    const sessionLanguages = active && Array.isArray(state.targetLanguages) && state.targetLanguages.length ? state.targetLanguages : saved;
    const languages = [...new Set(sessionLanguages)];
    const actual = active ? state.targetLanguage : null;
    // The active session owns its frozen language list, even if saved defaults change.
    if (actual && !languages.includes(actual)) languages.push(actual);
    const selected = actual || snapshot?.settings?.targetLanguage || languages[0];
    const signature = JSON.stringify([languages, selected, active]);
    if (signature !== lastTargetSelectorSignature) {
      lastTargetSelectorSignature = signature;
      const fragment = document.createDocumentFragment();
      for (const code of languages) { const option = document.createElement('option'); option.value = code; option.textContent = languageName(code); fragment.append(option); }
      $('target-language').replaceChildren(fragment); $('target-language').value = languages.includes(selected) ? selected : languages[0];
      $('target-language-label').textContent = active ? '本次翻译为' : '默认翻译为';
    }
    const expectedLanguage = languages.includes(selected) ? selected : languages[0];
    if ($('target-language').value !== expectedLanguage) $('target-language').value = expectedLanguage;
    $('session-target-language').hidden = !(active && actual && (state.mode === 'translate' || state.task === 'translate'));
    $('session-target-language').textContent = actual ? `本次目标语言：${languageName(actual)}` : '';
  }
  function renderLanguageEditor() {
    const signature = JSON.stringify([draftTargetLanguages, draftDefaultLanguage]);
    if (lastLanguageEditorSignature === signature) { renderLanguageSearch(); return; }
    lastLanguageEditorSignature = signature;
    const focused = $('favorite-languages').contains(document.activeElement) ? { language: document.activeElement.dataset.language, action: document.activeElement.dataset.languageAction } : null;
    const fragment = document.createDocumentFragment();
    draftTargetLanguages.forEach((code, index) => {
      const row = document.createElement('li'); row.className = 'favorite-language-row'; row.dataset.language = code; row.dataset.preferred = String(code === draftDefaultLanguage); row.draggable = true; row.dataset.languageDrag = code;
      const label = document.createElement('span'); label.className = 'favorite-language-label'; label.textContent = `${languageName(code)} · ${code}${code === draftDefaultLanguage ? ' · 默认' : ''}`;
      const actions = document.createElement('div'); actions.className = 'favorite-language-actions';
      for (const [action, title] of [['up', '上移'], ['down', '下移'], ['default', code === draftDefaultLanguage ? '已是首选' : '设为首选'], ['remove', '删除']]) {
        const control = button(title, () => editFavoriteLanguage(action, code)); control.dataset.languageAction = action; control.dataset.language = code; control.setAttribute('aria-label', `${title} ${languageName(code)}${action === 'default' ? '（本地扩展）' : ''}`); if (action === 'default') control.title = '首选语言（本地扩展）'; actions.append(control);
      }
      row.addEventListener('dragstart', event => {
        if (selectorBlocked() || selectorSession?.kind !== 'language' || !selectorCurrent(selectorSession) || event.target.closest('button')) { event.preventDefault(); return; }
        draggedLanguage = { code, session: selectorSession }; row.dataset.dragging = 'true';
        if (event.dataTransfer) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', code); }
      });
      row.addEventListener('dragover', event => { if (!selectorBlocked() && draggedLanguage?.session === selectorSession && draggedLanguage.code !== code) { event.preventDefault(); row.dataset.dropTarget = 'true'; if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'; } });
      row.addEventListener('dragleave', () => row.removeAttribute('data-drop-target'));
      row.addEventListener('drop', event => { event.preventDefault(); row.removeAttribute('data-drop-target'); const drag = draggedLanguage; draggedLanguage = null; if (drag?.session === selectorSession) void editFavoriteLanguage('move', drag.code, code); });
      row.addEventListener('dragend', () => { draggedLanguage = null; for (const item of $('favorite-languages').children) { item.removeAttribute('data-dragging'); item.removeAttribute('data-drop-target'); } });
      row.append(label, actions); fragment.append(row);
    });
    $('favorite-languages').replaceChildren(fragment); renderLanguageSearch(); syncControls();
    if (focused && selectorSession?.kind === 'language' && selectorCurrent(selectorSession)) {
      const target = [...$('favorite-languages').querySelectorAll('button')].find(node => node.dataset.language === focused.language && node.dataset.languageAction === focused.action && !node.disabled) || ($('target-language-search').disabled ? $('close-language-selector') : $('target-language-search'));
      target.focus({ preventScroll: true });
    }
  }
  function renderLanguageSearch() {
    const query = $('target-language-search').value.trim().toLocaleLowerCase();
    const signature = JSON.stringify([query, draftTargetLanguages, savedTargetLanguages()]);
    if (lastLanguageSearchSignature === signature) { syncControls(); return; }
    lastLanguageSearchSignature = signature;
    const focused = $('target-language-results').contains(document.activeElement) ? document.activeElement.dataset.language : null;
    const scrollTop = $('target-language-results').scrollTop;
    const compatibilityCodes = [...new Set([...(languageCatalog?.compatibility || []).map(item => item.code), ...savedTargetLanguages(), ...draftTargetLanguages])];
    const matches = languageCatalog?.search(query, { compatibilityCodes }) || [];
    const fragment = document.createDocumentFragment();
    for (const item of matches) {
      const code = item.code, selected = draftTargetLanguages.includes(code);
      const equivalent = draftTargetLanguages.find(value => value.toLowerCase() === code.toLowerCase());
      const name = languageName(code);
      const control = button(`${name} · ${code}${selected ? '（已收藏）' : equivalent ? `（已保留 ${equivalent}，大小写等价）` : ' ＋'}`, () => editFavoriteLanguage('add', code), 'language-search-option');
      control.dataset.languageAction = 'add'; control.dataset.language = code;
      control.dataset.catalogKind = item.custom ? 'custom' : item.compatibility ? 'compatibility' : 'catalog';
      control.title = `${item.nativeLabel} / ${item.englishLabel} / ${item.zhLabel}${item.compatibility ? ' · 兼容原有代码，不自动转换地区' : ''}`;
      fragment.append(control);
    }
    $('target-language-results').replaceChildren(fragment); $('target-language-empty').hidden = matches.length > 0 || !languageCatalog;
    $('target-language-match-count').textContent = !languageCatalog ? '语言目录未加载；已保存的目标不受影响，请重启应用。' : !query ? '全部语言' : matches.length ? `${matches.length} 项匹配` : '';
    syncControls(); $('target-language-results').scrollTop = scrollTop;
    if (focused && selectorSession?.kind === 'language' && selectorCurrent(selectorSession)) {
      const target = [...$('target-language-results').children].find(node => node.dataset.language === focused && !node.disabled) || ($('target-language-search').disabled ? $('close-language-selector') : $('target-language-search'));
      target.focus({ preventScroll: true });
    }
  }
  async function editFavoriteLanguage(action, code, destination) {
    const session = selectorSession;
    if (session?.kind !== 'language' || !selectorCurrent(session) || selectorBlocked()) return;
    // Always derive each operation from the latest committed snapshot, never a
    // displayed list or a draft captured when the dialog was first opened.
    const next = savedTargetLanguages(), index = next.indexOf(code);
    let preferred = snapshot.settings.targetLanguage;
    if (action === 'add') {
      if (next.some(item => item.toLowerCase() === code.toLowerCase()) || next.length >= 3) return;
      next.push(code);
    } else if (index === -1) return;
    else if (action === 'remove') { if (next.length <= 1) return; next.splice(index, 1); }
    else if (action === 'default') { if (preferred === code) return; preferred = code; }
    else if (action === 'up' && index > 0) [next[index - 1], next[index]] = [next[index], next[index - 1]];
    else if (action === 'down' && index < next.length - 1) [next[index + 1], next[index]] = [next[index], next[index + 1]];
    else if (action === 'move') { const target = next.indexOf(destination); if (target < 0 || target === index) return; next.splice(index, 1); next.splice(target, 0, code); }
    else return;
    // Original list changes clear preferred. This app requires a valid target:
    // represent the cleared preference by the first item without recoding it.
    if (action !== 'default') preferred = next[0];
    const message = action === 'default' ? `首选已保存为 ${languageName(preferred)}。` : `已保存，默认使用 ${languageName(preferred)}。`;
    await commitSelector('languages', { targetLanguages: next, targetLanguage: preferred }, session, 'favorite-language-message', message, () => [...$('favorite-languages').querySelectorAll('[data-language-action]')].find(node => node.dataset.language === code && node.dataset.languageAction === action && !node.disabled) || $('target-language-search'));
  }
  async function dismissSettings() {
    if (savingSettings || settingsDismissPending) return false;
    if(settingsDirty){let discard=false;settingsDismissPending=true;try{discard=await requestConfirmation('放弃未保存的更改？','已保存的设置保持有效；未保存的服务、单价和偏好草稿将被丢弃。','放弃更改',false);}finally{settingsDismissPending=false;}if(!discard)return false;}
    closeSelector(false);
    cancelInlinePending();
    if (shortcutCapture) await endShortcutCapture('', false);
    settingsDirty = false; dirtySettingsSections.clear(); for(const kind of ['asr','refiner'])providerDiagnostics.discard(kind); hydrateSettings(true); applyTheme(snapshot?.settings?.appearance);
    $('settings-message').textContent = ''; $('settings-message').classList.remove('error'); closeDialog('settings-dialog'); $('quiet-settings-nav').setAttribute('aria-expanded','false'); if (setupReturn) { setupReturn = false; $('return-setup').hidden = true; openSetup(); } return true;
  }
  function serviceConfigured(value, kind) {
    const service = value?.settings?.[kind];
    if (kind === 'asr' && service?.backend === 'local') return true;
    if (!service?.baseUrl || !service?.model) return false;
    let local = false;
    try { local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(service.baseUrl).hostname); } catch { return false; }
    return local || Boolean(value?.keyStatus?.[kind]?.hasKey);
  }
  function asrConfigured(value) { return serviceConfigured(value, 'asr'); }
  function renderNotices(notices) {
    const safeNotices = Array.isArray(notices) ? notices.filter((notice) => typeof notice === 'string' && notice.trim()) : [];
    const signature = JSON.stringify(safeNotices); if (signature === lastNoticeSignature) return; lastNoticeSignature = signature;
    const fragment = document.createDocumentFragment();
    safeNotices.forEach((message) => { const notice = document.createElement('div'); notice.className = 'notice'; notice.textContent = message; fragment.append(notice); });
    $('notices').replaceChildren(fragment);
  }
  function updateKeyStatus() {
    for (const service of ['asr', 'refiner']) {
      const status = snapshot?.keyStatus?.[service] || {};
      $(service + '-key-status').textContent = status.hasKey ? `已设置 · ${status.persistent ? '已加密保存在本机' : '仅本次会话可用'}；留空保留` : (status.hasStoredKey ? '已保存的密钥无法解密；请重新输入或勾选清除' : '尚未设置；密钥仅发送到对应服务');
      $(service + '-key').placeholder = status.hasKey ? '已设置；留空保留' : '输入你的密钥';

    }
    $('secure-storage-notice').textContent = snapshot?.secureStorage ? '系统密钥加密可用。只有勾选保存的 API Key 会加密写入本机；历史、词典和录音不加密。' : '此环境的系统密钥加密不可用。API Key 只能在本次会话使用，退出后需重新填写。';
  }
  function selectValue(id, value) {
    const select = $(id); const string = String(value);
    if (![...select.options].some((option) => option.value === string)) { const option = document.createElement('option'); option.value = string; option.textContent = string; select.append(option); }
    select.value = string;
  }
  let usagePriceBindings = {};
  function usagePriceBinding(kind) {
    const provider = snapshot.settings[kind]||{};
    let endpoint;
    try{endpoint=window.ProviderEndpoint.resolveProviderEndpoint(provider.baseUrl,kind,provider.protocol,provider.endpointMode).endpointUrl;}
    catch{endpoint=['unconfigured',String(provider.baseUrl||''),String(provider.endpointMode||'base')];}
    return JSON.stringify([provider.model||'',endpoint,provider.protocol||'chat']);
  }
  function hydrateUsagePrices() {
    if(!$('usage-refiner-model')||!snapshot?.settings)return;
    for(const kind of ['asr','refiner']){
      const current=snapshot.settings[kind].model,p=snapshot.settings.usagePrices?.[kind]||window.TokenUsage.defaultPrice();
      usagePriceBindings[kind] = usagePriceBinding(kind);
      $('usage-'+kind+'-model').value=current;$('usage-'+kind+'-currency').value=p.currency||'USD';
      const bound=!p.model||p.model===current;
      for(const field of ['inputPerMillion','outputPerMillion','cacheReadPerMillion'])$('usage-'+kind+'-'+field).value=bound?(p[field]??''):'';
      $('usage-'+kind+'-binding').textContent=bound?'保存时绑定此模型；留空显示费用未知。':'原报价绑定其他模型，请为当前模型重新配置。';
    }
  }
  function readUsagePrices() {
    for(const kind of ['asr','refiner'])if($('usage-'+kind+'-model').value!==snapshot.settings[kind].model||usagePriceBindings[kind]!==usagePriceBinding(kind))throw Error('模型或服务地址已变化，请关闭设置并放弃未保存更改后重新配置单价。');
    return Object.fromEntries(['asr','refiner'].map(kind=>[kind,window.TokenUsage.validatePrice({model:snapshot.settings[kind].model,currency:$('usage-'+kind+'-currency').value,...Object.fromEntries(['inputPerMillion','outputPerMillion','cacheReadPerMillion'].map(field=>[field,$('usage-'+kind+'-'+field).value.trim()||null]))})]));
  }
  function hydrateSettings(force = false) {
    if (!snapshot?.settings || (settingsDirty && !force)) return;
    const settings = snapshot.settings;
    hydrateUsagePrices();
    const signature = JSON.stringify([settings, snapshot.keyStatus, snapshot.secureStorage]); if (signature === lastSettingsSignature && !force) return;
    if (shortcutCapture) { void endShortcutCapture('设置已更新，按键录制已取消。', false); return; }
    lastSettingsSignature = signature;
    $('asr-url').value = settings.asr?.baseUrl || '';
    $('asr-model').value = settings.asr?.model || '';
    $('asr-protocol').value = settings.asr?.protocol || 'openai-transcriptions';
    $('asr-backend').value=settings.asr?.backend||'cloud';
    for(const kind of ['asr','refiner'])$(kind+'-endpoint-mode').value=settings[kind]?.endpointMode||'base';
    $('refiner-url').value = settings.refiner?.baseUrl || '';
    $('refiner-model').value = settings.refiner?.model || '';
    $('refiner-enabled').checked = Boolean(settings.refiner?.enabled);
    $('citation-format').value = settings.refiner?.citationFormat || 'none';
    $('shortcut').value = settings.shortcut ?? 'CommandOrControl+Shift+Space';
    for (const mode of Object.keys(modeNames)) {
      const primary = typeof settings.modeShortcuts?.[mode] === 'string' ? settings.modeShortcuts[mode] : '';
      const alternates = Array.isArray(settings.modeShortcutAlternates?.[mode]) ? settings.modeShortcutAlternates[mode] : [];
      const values = [primary, ...alternates].filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()).slice(0, MAX_MODE_SHORTCUTS);
      draftShortcutRows[mode] = values.length ? values : ['']; renderShortcutRows(mode);
    }
    updateShortcutStatus();
    selectValue('language', settings.language || 'auto');
    renderSelectorSummaries();
    $('appearance').value = ['light', 'dark', 'system'].includes(settings.appearance) ? settings.appearance : 'light';
    $('auto-paste').checked = false;
    $('save-history').checked = Boolean(settings.saveHistory);
    $('save-audio').checked = Boolean(settings.saveAudio);
    $('dictionary-prompt-enabled').checked = settings.dictionaryPromptEnabled !== false;
    $('writing-preferences').value = settings.writingPreferences || '';
    $('default-mode').value = settings.mode || 'dictate';
    selectValue('settings-history-retention', settings.historyRetentionDays || 0);
    selectValue('audio-retention', settings.audioRetentionDays || 7);
    $('max-audio-mb').value = String(settings.maxAudioMB || 100);
    syncSavedSelectors();
    for (const service of ['asr', 'refiner']) { $(service + '-key').value = ''; $(service + '-clear').checked = false; $(service + '-persist').checked = Boolean(snapshot.secureStorage && snapshot.keyStatus?.[service]?.persistent); }
    settingsDirty = false; audioConsent = Boolean(settings.saveAudio);
    updateKeyStatus(); updateDestinationNotice(); syncControls();
  }
  function providerForField(node) {
    const id=node?.id||'';
    return id.startsWith('asr-')?'asr':id.startsWith('refiner-')||id==='citation-format'?'refiner':null;
  }
  function providerFields(kind) {
    return [kind+'-url',kind+'-endpoint-mode',kind+'-model',kind+'-key',kind+'-persist',kind+'-clear',...(kind==='asr'?['asr-protocol','asr-backend']:['refiner-enabled','citation-format'])];
  }
  function updateProviderPreviews() {
    for(const kind of ['asr','refiner']){
      const code=$(kind+'-final-url'),input=$(kind+'-url');
      try{
        const resolved=window.ProviderEndpoint.resolveProviderEndpoint(input.value,kind,kind==='asr'?$('asr-protocol').value:undefined,$(kind+'-endpoint-mode').value);
        code.textContent=resolved.endpointUrl;code.dataset.invalid='false';input.removeAttribute('aria-invalid');
      }catch(error){code.textContent=error.message;code.dataset.invalid='true';input.setAttribute('aria-invalid','true');}
    }
    for(const kind of ['asr','refiner'])if($(kind+'-final-url').dataset.invalid==='true')$('quiet-advanced-'+kind).open=true;
    const local=$('asr-backend').value==='local';
    $('asr-cloud-fields').hidden=local;$('asr-local-help').hidden=!local;
    $('asr-probe-notice').textContent=local?'合成静音测试：仅检查本机引擎，不开麦、不联网，不代表真实识别质量。':'发送合成测试音频，不使用麦克风或历史；服务商可能计费，不代表识别质量。';
    const warning=local?'':window.ProviderEndpoint.modelWarning($('asr-model').value,'asr',$('asr-protocol').value);
    $('asr-model-warning').textContent=warning;$('asr-model-warning').hidden=!warning;
    $('asr-protocol-help').textContent=$('asr-protocol').value==='qwen-input-audio'?'适配 qwen3-asr-flash：JSON input_audio，最长 5 分钟，编码后请求不超过 10 MB；录制 WebM/Opus，不自动转码。此适配暂不发送词典提示。地域与账号须匹配；美国不支持此 Chat 模式。':'WebM/Opus 通过 multipart 发送到 audio/transcriptions；供应商需支持此协议及模型。';
  }
  function renderProviderDiagnostics() {
    for(const kind of ['asr','refiner']){
      const state=providerDiagnostics.state(kind),result=state.result,node=$('provider-result-'+kind);
      $('provider-save-'+kind).textContent=state.dirty?'有未保存更改 · 未测试':state.saved?'已保存 · 测试状态见下方':'当前配置 · 保存不代表已验证';
      node.dataset.outcome=result?.outcome||'idle';
      node.textContent=state.pending?'正在测试已保存配置…':result?[result.message,Number.isInteger(result.httpStatus)?'HTTP '+result.httpStatus:null,Number.isFinite(result.elapsedMs)?result.elapsedMs+' ms':null,result.category?'状态：'+result.category:null].filter(Boolean).join(' · '):'未测试';
      node.setAttribute('aria-busy',String(state.pending));
    }
  }
  function updateDestinationNotice() {
    updateProviderPreviews();
    const preview=kind=>$(kind+'-final-url').dataset.invalid==='false'?$(kind+'-final-url').textContent:'无效地址（请先修正）';
    $('asr-destination').textContent=$('asr-backend').value==='local'?'本地模式：录音只在本机识别；失败不上传，云端配置保持保存值。':'提交后的录音与识别服务 API Key 将发送到：'+preview('asr');
    $('refiner-destination').textContent='提交后的文本与语言模型 API Key 将发送到：'+preview('refiner');
  }
  function readProviderDraft(kind) {
    if(kind==='asr'&&$('asr-backend').value==='local')return {backend:'local'};
    const protocol=kind==='asr'?$('asr-protocol').value:undefined;
    const resolved=window.ProviderEndpoint.resolveProviderEndpoint($(kind+'-url').value,kind,protocol,$(kind+'-endpoint-mode').value);
    const model=$(kind+'-model').value.trim();if(!model||model.length>160||/[\u0000-\u001f]/.test(model)){$(kind+'-model').setAttribute('aria-invalid','true');throw Error('请填写有效的模型名称（最多 160 字符，不含控制字符）。');}$(kind+'-model').removeAttribute('aria-invalid');
    return {...(kind==='asr'?{backend:'cloud'}:{}),baseUrl:resolved.baseUrl,endpointMode:resolved.endpointMode,model,...(protocol?{protocol}:{}),key:$(kind+'-key').value.trim(),persistKey:Boolean(snapshot.secureStorage&&$(kind+'-persist').checked),clearKey:$(kind+'-clear').checked,...(kind==='refiner'?{enabled:$('refiner-enabled').checked,citationFormat:$('citation-format').value}:{})};
  }
  function restoreProvider(kind) {
    const other=kind==='asr'?'refiner':'asr';
    const fields=providerFields(other).map(id=>({id,value:$(id).value,checked:$(id).checked}));
    restoreSavedSection('services');
    if(providerDiagnostics.state(other).dirty){
      for(const field of fields){$(field.id).value=field.value;if(typeof field.checked==='boolean')$(field.id).checked=field.checked;}
      dirtySettingsSections.add('services');settingsDirty=true;
    }
    updateDestinationNotice();updateKeyStatus();renderProviderDiagnostics();syncControls();
  }
  function focusProviderIssue(kind) {
    const target=providerFields(kind).map(id=>$(id)).find(node=>node?.getAttribute('aria-invalid')==='true');
    if(target&&!target.closest('[hidden]')){const details=target.closest('details');if(details)details.open=true;target.focus();}
  }

  async function saveProvider(kind) {
    if(!bridge||savingSettings||preferencePending||operationPending||modePending||shortcutCapture||ACTIVE_PHASES.has(snapshot?.state?.phase))return;
    const status=$('settings-message');status.classList.remove('error');let values;
    try{values=readProviderDraft(kind);}catch(error){status.textContent=errorMessage(error);status.classList.add('error');focusProviderIssue(kind);return;}
    providerDiagnostics.cancelAll();savingSettings=true;savingProvider=kind;syncControls();
    try{
      const cloudDraft=kind==='asr'&&values.backend==='local'?providerFields(kind).filter(id=>id!=='asr-backend').map(id=>({id,value:$(id).value,checked:$(id).checked})):null;
      await updateSettingsSection('services',{[kind]:values});
      providerDiagnostics.saved(kind);restoreProvider(kind);
      if(cloudDraft)for(const field of cloudDraft){$(field.id).value=field.value;if(typeof field.checked==='boolean')$(field.id).checked=field.checked;}
      updateDestinationNotice();
      status.textContent=(kind==='asr'?'语音识别':'语言模型')+'已保存。尚未发送测试请求。';
    }catch(error){status.textContent=errorMessage(error,'服务保存失败。');status.classList.add('error');}
    finally{savingSettings=false;savingProvider=null;syncControls();}
  }
  function syncProviderSnapshots(value) {
    for(const kind of ['asr','refiner']){
      const signature=JSON.stringify([value.settings?.[kind],value.keyStatus?.[kind]]);
      if(providerSignatures[kind]&&providerSignatures[kind]!==signature)providerDiagnostics.invalidate(kind);
      providerSignatures[kind]=signature;
    }
    if(ACTIVE_PHASES.has(value.state?.phase))providerDiagnostics.cancelAll();
  }
  function syncControls() {
    const active = ACTIVE_PHASES.has(snapshot?.state?.phase);
    const unavailable = !bridge || !snapshot;
    const dataBusy = operationPending || savingSettings || preferencePending;
    const sessionBusy = active || commandPending || cancelPending || processingRequestPending || modePending || dataBusy || unavailable;
    const settingsBusy = savingSettings || preferencePending || operationPending || modePending || active || unavailable;
    document.querySelectorAll('[data-task]').forEach((node) => { node.disabled = sessionBusy; });
    for (const id of ['workspace-mode', 'target-language', 'ask-context', 'text-input', 'process-text', 'choose-history-context']) $(id).disabled = sessionBusy;
    updateRecordControl();
    $('cancel-button').disabled = cancelPending || unavailable || snapshot?.state?.retaining === true;
    $('retain-recording').hidden = snapshot?.canRetainRecording !== true || snapshot?.state?.phase !== 'recording';
    $('retain-recording').disabled = unavailable || commandPending || processingRequestPending || modePending || dataBusy;
    $('open-current-answer').hidden = snapshot?.state?.phase !== 'done' || snapshot?.state?.result?.mode !== 'ask' || snapshot?.state?.result?.status !== 'completed';
    $('open-current-answer').disabled = currentAnswerPending || sessionBusy;
    $('open-current-answer').textContent = '在独立窗口查看回答';
    $('return-setup').disabled = savingSettings;
    $('open-setup').disabled = active || savingSettings || Boolean(shortcutCapture);
    $('help-open-setup').disabled = active || savingSettings || Boolean(shortcutCapture);
    $('use-result-context').disabled = !lastResult?.text || sessionBusy;
    document.querySelectorAll('#settings-form input, #settings-form select, #settings-form textarea').forEach((node) => { node.disabled = settingsBusy; });
    if (selectingWords) $('dictionary-filter-toolbar').querySelectorAll('button,input').forEach(node => { node.disabled = true; });
    if($('asr-backend').value==='local')for(const id of providerFields('asr').filter(id=>id!=='asr-backend'))$(id).disabled=true;
    $('auto-paste').checked = false; $('auto-paste').disabled = true;
    for (const service of ['asr', 'refiner']) {
      $(service + '-persist').disabled = settingsBusy || !snapshot?.secureStorage || (service==='asr'&&$('asr-backend').value==='local');
      $(service + '-key').disabled = settingsBusy || $(service + '-clear').checked || (service==='asr'&&$('asr-backend').value==='local');
    }
    for(const kind of ['asr','refiner']){
      const state=providerDiagnostics.state(kind);
      $('save-provider-'+kind).disabled=settingsBusy||Boolean(shortcutCapture)||!state.dirty;
      $('save-provider-'+kind).textContent=savingProvider===kind?'正在保存…':'保存此服务';
      $('test-provider-'+kind).disabled=settingsBusy||Boolean(shortcutCapture)||state.dirty||state.pending||typeof bridge?.checkProvider!=='function'||(!(kind==='asr'&&$('asr-backend').value==='local')&&$(kind+'-final-url').dataset.invalid==='true');
      $('cancel-provider-'+kind).hidden=!state.pending;
      $('cancel-provider-'+kind).disabled=!state.pending;
    }
    const languageBusy = settingsBusy || active;
    // Reopening during an issued selector write is allowed; mutations stay locked.
    const selectorOpenBusy = savingSettings || operationPending || modePending || active || unavailable || Boolean(shortcutCapture) || (preferencePending && !selectorWritePending);
    $('open-language-selector').disabled = selectorOpenBusy; $('microphone').disabled = selectorOpenBusy;
    for (const kind of ['language', 'microphone']) $(kind + '-selector-dialog').setAttribute('aria-busy', String(Boolean(selectorWritePending)));
    $('microphone-selector-dialog').dataset.loading = String(deviceListState === 'loading' && selectorSession?.kind === 'microphone');
    document.querySelectorAll('[data-device-id]').forEach(node => { node.disabled = settingsBusy || deviceListState === 'loading' || node.dataset.unavailable === 'true'; });
    for (const row of $('favorite-languages').children) row.draggable = !languageBusy;
    $('target-language-search').disabled = languageBusy;
    document.querySelectorAll('[data-language-action]').forEach((node) => {
      const index = draftTargetLanguages.indexOf(node.dataset.language); const action = node.dataset.languageAction;
      node.disabled = languageBusy || (action === 'add' ? draftTargetLanguages.some(value => value.toLowerCase() === node.dataset.language.toLowerCase()) || draftTargetLanguages.length >= 3 : action === 'up' ? index <= 0 : action === 'down' ? index >= draftTargetLanguages.length - 1 : action === 'remove' ? draftTargetLanguages.length <= 1 : node.dataset.language === draftDefaultLanguage);
    });
    $('favorite-language-limit').textContent = active ? '录音或处理期间，不能修改收藏与默认语言。' : `${draftTargetLanguages.length}/3 种 · ${draftTargetLanguages.length === 3 ? '已达上限，请先移除再添加' : '至少保留 1 种'}`;
    $('cancel-settings').disabled = savingSettings; $('close-settings').disabled = savingSettings; $('settings-open-dictionary').disabled = savingSettings;
    $('save-settings').disabled = settingsBusy || Boolean(shortcutCapture);
    for(const id of ['save-shortcut-settings',...Object.keys(modeNames).map(mode=>'reset-shortcut-'+mode)])if($(id))$(id).disabled=settingsBusy||Boolean(shortcutCapture);
    const shortcutBusy = settingsBusy || active;
    for (const mode of Object.keys(modeNames)) { $('add-shortcut-' + mode).disabled = shortcutBusy || Boolean(shortcutCapture) || draftShortcutRows[mode].length >= MAX_MODE_SHORTCUTS; $('shortcut-limit-' + mode).textContent = `${draftShortcutRows[mode].length}/4 行 · 每种模式最多 4 组 · Electron 组合键`; }
    document.querySelectorAll('[data-shortcut-remove]').forEach((node) => { node.disabled = shortcutBusy || Boolean(shortcutCapture&&!inlineShortcuts()); });
    document.querySelectorAll('[data-shortcut-capture]').forEach((node) => { const selected = shortcutCapture?.inputId === node.dataset.shortcutCapture; node.disabled = shortcutBusy || Boolean(shortcutCapture && shortcutCapture.phase === 'restoring'); node.textContent = selected ? shortcutCapture.phase === 'restoring' ? '正在恢复…' : '取消录制' : '录制按键'; node.setAttribute('aria-pressed', String(selected)); });
    document.querySelectorAll('input[data-shortcut-mode], #shortcut').forEach((node) => { node.disabled = shortcutBusy || Boolean(!inlineShortcuts()&&shortcutCapture&&shortcutCapture.phase==='restoring'&&node.id!==shortcutCapture.inputId); node.readOnly = (Boolean(node.dataset.shortcutMode)&&inlineShortcuts()) || shortcutCapture?.inputId === node.id; });
    $('settings-dialog').toggleAttribute('data-inline-shortcuts',inlineShortcuts());
    for(const mode of Object.keys(modeNames)){const reset=$('reset-shortcut-'+mode);const canReset=shortcutCapture?.inline&&shortcutCapture.mode===mode&&shortcutCapture.index===0&&['capturing','releasing'].includes(shortcutCapture.phase)&&!shortcutCapture.candidate?.error&&!$('shortcut-'+mode+'-status')?.classList.contains('error');reset.hidden=inlineShortcuts()&&!canReset;reset.disabled=settingsBusy||(inlineShortcuts()?!canReset:Boolean(shortcutCapture));}
    $('refresh-devices').disabled = settingsBusy || deviceListState === 'loading';
    $('history-retention').disabled = settingsBusy;
    $('clear-history').disabled = unavailable || dataBusy || !(snapshot?.history?.length);
    $('clear-audio').disabled = unavailable || dataBusy || !(snapshot?.audioStats?.count);
    $('confirm-clear').disabled = unavailable || dataBusy;
    $('dismiss-clear').disabled = operationPending;
    document.querySelectorAll('[data-history-action]').forEach((node) => {
      const action = node.dataset.historyAction;
      node.disabled = unavailable || (action === 'copy' ? node.dataset.hasText !== 'true' : action === 'context' ? sessionBusy || node.dataset.hasText !== 'true' : action === 'retry' ? sessionBusy || node.dataset.localUnavailable === 'true' : dataBusy);
    });
    document.querySelectorAll('.context-item').forEach((node) => { node.disabled = sessionBusy; });
    for (const id of ['new-word', 'empty-new-word', 'import-dictionary']) $(id).disabled = unavailable || dataBusy;
    $('export-dictionary').disabled = unavailable || dataBusy || !dictionaryEntries().length;
    $('select-dictionary').disabled = unavailable || dataBusy || !visibleWords().length;
    $('select-all-words').disabled = unavailable || dataBusy || !visibleWords().length;
    $('delete-selected-words').disabled = unavailable || dataBusy || !selectedWords.size;
    document.querySelectorAll('.word-edit, .word-checkbox, #word-form input, #word-form textarea').forEach((node) => { node.disabled = unavailable || dataBusy; });
    for (const id of ['save-word', 'delete-word', 'dismiss-word', 'close-word']) $(id).disabled = unavailable || dataBusy;
    $('commit-import').disabled = unavailable || dataBusy || importCommitting || !importPreview?.token;
    $('cancel-import').disabled = importCommitting;
    $('close-import').disabled = importCommitting;
    $('retry-recovery').disabled = sessionBusy || !snapshot?.recovery?.token || typeof bridge?.retryRecovery !== 'function';
    $('discard-recovery').disabled = unavailable || dataBusy || processingRequestPending || !snapshot?.recovery?.token || typeof bridge?.discardRecovery !== 'function';
  }
  function applyRpcSnapshot(value, version) {
    // State notifications are authoritative. An RPC issued before a newer notification
    // (or another response) must not resurrect an old phase, result, or session.
    if (version !== snapshotVersion) return false;
    return applySnapshot(value);
  }
  async function invoke(method, ...args) {
    if (typeof bridge?.[method] !== 'function') throw new Error('当前客户端连接不支持此操作，请重新打开应用。');
    const version = snapshotVersion;
    const value = await bridge[method](...args);
    applyRpcSnapshot(value, version);
    return value;
  }
  function modeOptions() { return { mode: selectedMode, targetLanguage: $('target-language').value || snapshot?.settings?.targetLanguage || 'zh', context: selectedMode === 'ask' ? $('ask-context').value.trim() : '', task: selectedMode === 'ask' ? selectedTask : undefined }; }
  function displayedTask() {
    const state = snapshot?.state || {}; const active = ACTIVE_PHASES.has(state.phase);
    const mode = active && modeNames[state.mode] ? state.mode : selectedMode;
    const task = active && mode === 'ask' ? (taskNames[state.task] ? state.task : 'ask') : selectedTask;
    return { active, mode, task };
  }
  function renderMode() {
    const { active, mode, task } = displayedTask();
    const modeChanged = !active && lastRenderedMode !== selectedMode; if (!active) lastRenderedMode = selectedMode;

    $('workspace-title').textContent = mode === 'ask' ? (task === 'write' ? '帮我写' : '问一问') : `开始${modeNames[mode]}`;
    $('workspace-mode').value = mode; $('workspace-mode').disabled = active || modePending || savingSettings || operationPending;
    $('ask-workspace').hidden = mode !== 'ask';
    $('target-language-wrap').hidden = mode !== 'translate' && !(mode === 'ask' && task === 'translate');
    $('target-language').disabled = active || modePending;
    $('text-entry-label').textContent = mode === 'ask' ? '输入问题或要求' : '输入文字';
    $('ask-options-summary').textContent=taskNames[task]+' · 处理方式与参考文字';
    $('text-input').placeholder = mode === 'ask' ? (task === 'write' ? '写给谁？想表达什么？告诉我内容、语气和长度…' : task === 'ask' ? '输入问题，或点击麦克风说出你的问题…' : `可补充${taskNames[task]}的要求；也可留空，直接处理上方参考文字…`) : mode === 'translate' ? '粘贴或输入要翻译的文字…' : '粘贴或输入要整理的文字…';
    $('process-text').textContent = mode === 'ask' ? (task === 'ask' ? '发送问题 ↑' : `${taskNames[task]} ↑`) : mode === 'translate' ? '翻译文字 ↑' : '整理文字 ↑';
    $('text-send-hint').textContent = active ? `本次任务：${mode === 'ask' ? taskNames[task] : modeNames[mode]}。输入框保留主窗草稿，当前不可发送。` : mode === 'ask' ? '点击后发送问题和参考文字到你的文字模型服务；结果仅在应用内展示。' : '点击后发送到你配置的文字模型服务，不会自动打开链接或执行命令。';
    if (mode === 'ask' && modeChanged) $('text-entry').open = true;
    document.querySelectorAll('[data-task]').forEach((button) => { button.classList.toggle('active', button.dataset.task === task); button.setAttribute('aria-pressed', String(button.dataset.task === task)); button.disabled = active; });
    $('ask-context').disabled = active;
    $('text-input').disabled = active;
    $('process-text').disabled = active || commandPending || processingRequestPending || modePending || !bridge;
    $('use-result-context').disabled = !lastResult?.text || active;
    $('choose-history-context').disabled = active;
    syncControls();
  }
  async function changeMode(mode, targetLanguage) {
    if (!modeNames[mode] || modePending || savingSettings || operationPending || commandPending || processingRequestPending || ACTIVE_PHASES.has(snapshot?.state?.phase)) return false;
    const previous = selectedMode; const previousLanguage = snapshot?.settings?.targetLanguage || 'zh'; const previousDraftDefault = draftDefaultLanguage; const version = snapshotVersion;
    selectedMode = mode; modePending = true; renderMode();
    try { await invoke('setMode', { mode, targetLanguage: targetLanguage || $('target-language').value || previousLanguage }); if (snapshotVersion !== version) selectedMode = snapshot.settings.mode || mode; $('default-mode').value = selectedMode; if (draftDefaultLanguage === previousDraftDefault && previousDraftDefault === previousLanguage && draftTargetLanguages.includes(snapshot?.settings?.targetLanguage)) { draftDefaultLanguage = snapshot.settings.targetLanguage; renderLanguageEditor(); } return selectedMode === mode; }
    catch (error) { selectedMode = snapshotVersion === version ? previous : snapshot.settings.mode || previous; selectValue('target-language', snapshotVersion === version ? previousLanguage : snapshot.settings.targetLanguage || previousLanguage); toast(errorMessage(error, '模式保存失败。')); return false; }
    finally { modePending = false; renderMode(); }
  }
  function renderResult(result) {
    if (!result || typeof result !== 'object') return;
    lastResult = { original: typeof result.original === 'string' ? result.original : '', text: typeof result.text === 'string' ? result.text : (typeof result.original === 'string' ? result.original : ''), refined: Boolean(result.refined), status: result.status || (snapshot?.state?.phase === 'done' ? 'completed' : snapshot?.state?.phase), delivery: result.delivery, message: typeof result.message === 'string' ? result.message : '', mode: result.mode || snapshot?.state?.mode || selectedMode, targetLanguage: result.targetLanguage || snapshot?.state?.targetLanguage || '', task: result.task || snapshot?.state?.task || '', context: typeof result.context === 'string' ? result.context : submittedContext };
    $('original-text').textContent = lastResult.original || '没有可显示的输入文字。'; $('original-text').classList.toggle('placeholder', !lastResult.original);
    $('final-text').textContent = lastResult.text || '没有可显示的最终文字。'; $('final-text').classList.toggle('placeholder', !lastResult.text);
    $('copy-original').disabled = !lastResult.original; $('copy-final').disabled = !lastResult.text; $('use-result-context').disabled = !lastResult.text;
    const completed = lastResult.status === 'completed';
    $('original-details').hidden=!lastResult.original;
    $('quiet-result').dataset.fallback=String(!completed||Boolean(lastResult.mode==='dictate'&&!lastResult.refined&&/整理未完成/.test(lastResult.message||'')));
    $('copy-final').textContent=lastResult.mode==='ask'?'复制回答':lastResult.mode==='translate'?'复制译文':'复制结果';
    $('copy-final').setAttribute('aria-label',$('copy-final').textContent);
    $('final-title').textContent = !completed ? '保留的原文 / 当前文字' : lastResult.mode === 'ask' ? askResultName(lastResult.task) : lastResult.mode === 'translate' ? '翻译结果' : lastResult.refined ? '整理后的文字' : '最终文字';
    $('result-info').textContent = !completed ? (lastResult.mode === 'translate' ? '翻译尚未完成 · 保留原文，请勿当作翻译结果' : lastResult.mode === 'ask' ? '回答尚未完成 · 保留输入，请勿当作回答' : '处理尚未完成 · 保留原始文字') : lastResult.mode === 'ask' ? `仅展示${askResultName(lastResult.task)} · 不自动执行任何操作` : lastResult.mode === 'translate' ? '已完成翻译 · 请核对重要内容' : lastResult.refined ? '已完成文字整理 · 请核对重要内容' : '保留原始表达';
    $('delivery-message').textContent = lastResult.message;
    $('result-language').hidden = !lastResult.targetLanguage || !(lastResult.mode === 'translate' || lastResult.task === 'translate');
    $('result-language').textContent = lastResult.targetLanguage ? `本次目标：${languageName(lastResult.targetLanguage)}` : '';

  }
  function formatDate(value) { const date = new Date(value); if (Number.isNaN(date.getTime())) return '时间未知'; return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(date); }
  function dayKey(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'unknown' : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
  function dayLabel(value) { const date = new Date(value); if (Number.isNaN(date.getTime())) return '日期未知'; const today = new Date(); const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1); if (dayKey(date) === dayKey(today)) return '今天'; if (dayKey(date) === dayKey(yesterday)) return '昨天'; return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(date); }
  function button(label, fn, className = 'text-button') { const element = document.createElement('button'); element.type = 'button'; element.className = className; element.textContent = label; element.addEventListener('click', fn); return element; }
  let historyAnswer = null, historyAnswerGeneration = 0;
  function historyPreviewText(entry) { return entry.mode === 'ask' && typeof entry.original === 'string' && entry.original.trim() ? entry.original : historyText(entry); }
  function historyText(entry) { return typeof entry.text === 'string' && entry.text.trim() ? entry.text : typeof entry.original === 'string' ? entry.original : ''; }
  function renderHistory(history, force = false) {
    const entries = Array.isArray(history) ? history : [];
    const query = $('history-search').value.trim().toLocaleLowerCase();
    const savingDisabled = snapshot?.settings?.saveHistory === false;
    const signature = JSON.stringify([entries, historyFilter, query, savingDisabled, snapshot?.settings?.asr?.backend]); if (!force && signature === lastHistorySignature) return; lastHistorySignature = signature;
    const scrollTop = $('view-history').hidden ? null : $('history-scroll').scrollTop;
    const focused=document.activeElement,focusRow=focused?.closest?.('[data-history-id]');
    // Store structural identities only; copy-original and copy-result (and the
    // two retry destinations) must not become interchangeable after a refresh.
    const priorFocus=focusRow&&$('history-list').contains(focused)?{id:focusRow.dataset.historyId,key:focused.dataset.historyFocus}:null;
    const expanded=new Set([...$('history-list').querySelectorAll('[data-history-id]')].filter(row=>row.querySelector('.quiet-history-more')?.open).map(row=>row.dataset.historyId));
    $('history-count').textContent = String(entries.length); $('clear-history').disabled = entries.length === 0 || !bridge || operationPending;
    const filtered = entries.filter((entry) => (historyFilter === 'all' || (historyFilter === 'ask' ? entry.mode === 'ask' : entry.mode !== 'ask')) && (!query || [entry.text, entry.original, entry.context, entry.task].filter(Boolean).join(' ').toLocaleLowerCase().includes(query))).sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
    $('history-empty').hidden = filtered.length > 0;
    const emptyKind = !entries.length && savingDisabled ? 'disabled' : query ? 'search' : historyFilter !== 'all' ? 'filter' : 'empty';
    $('history-empty').dataset.kind = emptyKind;
    $('history-empty-title').textContent = { disabled: '历史记录保存已关闭', search: '没有找到相关记录', filter: historyFilter === 'ask' ? '还没有问一问记录' : '还没有听写与翻译记录', empty: '还没有历史记录' }[emptyKind];
    $('history-empty-description').textContent = { disabled: '当前不会保存新的历史文字。可在设置的「历史与存储」中开启「保存本地历史」。', search: '试试其他关键词，或清空搜索后查看记录。', filter: '切换到「全部」查看其他类型的记录。', empty: '完成一次听写、翻译或问答后，保存的结果会出现在这里。' }[emptyKind];
    const fragment = document.createDocumentFragment(); let group = null; let previousDay = null;
    filtered.forEach((entry) => {
      const key = dayKey(entry.createdAt);
      if (key !== previousDay) { const section = document.createElement('section'); section.className = 'history-group'; const heading = document.createElement('h2'); heading.className = 'history-date'; heading.textContent = dayLabel(entry.createdAt); group = document.createElement('div'); group.className = 'history-entries'; section.append(heading, group); fragment.append(section); previousDay = key; }
      const item = document.createElement('article'); item.className = 'history-item';item.dataset.historyId=entry.id;
      const time = document.createElement('time'); time.className = 'history-time'; const parsedDate = new Date(entry.createdAt); time.textContent = Number.isNaN(parsedDate.getTime()) ? '未知' : new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(parsedDate); if (!Number.isNaN(parsedDate.getTime())) time.dateTime = parsedDate.toISOString();
      const body = document.createElement('div'); body.className = 'history-body'; const header = document.createElement('div'); header.className = 'history-item-header'; const tag = document.createElement('span'); tag.className = 'history-tag'; tag.textContent = modeNames[entry.mode] || '听写'; header.append(tag);
      if (entry.status && entry.status !== 'completed') { const status = document.createElement('span'); status.className = 'history-tag status-' + (entry.status === 'failed' ? 'failed' : 'other'); status.textContent = { failed: '未完成', cancelled: '已取消', dismissed: '主动保留 · 本次未上传', processing: '处理中' }[entry.status] || '未知状态'; header.append(status); }
      if (entry.audioAvailable) { const audio = document.createElement('span'); audio.className = 'history-tag'; audio.textContent = '含本地录音'; header.append(audio); }
      if (entry.mode === 'ask' && taskNames[entry.task]) { const task = document.createElement('span'); task.className = 'history-tag'; task.textContent = taskNames[entry.task]; header.append(task); }
      if (entry.mode === 'translate' || (entry.mode === 'ask' && entry.task === 'translate')) { const language = document.createElement('span'); language.className = 'history-tag'; language.textContent = `目标：${languageName(entry.targetLanguage || '')}`; header.append(language); }
      const fallback = !(typeof entry.text === 'string' && entry.text.trim()) && Boolean(entry.original);
      if (fallback && entry.status && entry.status !== 'completed') { const note = document.createElement('p'); note.className = 'history-fallback'; note.textContent = entry.inputSource === 'text' ? '尚无最终结果，保留输入原文。' : entry.inputSource === 'recording' ? '尚无最终结果，保留识别原文。' : '尚无最终结果，保留原始文字。'; body.append(note); }
      const content = document.createElement('p'); content.className = 'history-result'; const text = historyText(entry); content.textContent = historyPreviewText(entry) || (entry.status === 'dismissed' ? (entry.audioAvailable ? '录音片段已保留，本次未识别；主动重试时才会上传。' : '保留的录音已过期或移除，当前没有可用片段。') : '这条记录没有文字。'); body.append(header, content);
      if (entry.original && entry.original !== text) { const details=historyDetails(entry.inputSource === 'text' ? '输入原文' : entry.inputSource === 'recording' ? '识别原文' : '原始文字', entry.original);details.querySelector('summary').dataset.historyFocus='original-summary';body.append(details); }
      if (entry.context) { const details=historyDetails('参考文字', entry.context);details.querySelector('summary').dataset.historyFocus='context-summary';body.append(details); }
      if (entry.message || entry.error) { const message = document.createElement('p'); message.className = 'history-delivery'; message.textContent = String(entry.message || entry.error); body.append(message); }
      const actions = document.createElement('div'); actions.className = 'history-actions'; const copy = button(fallback ? '复制原文' : entry.mode === 'ask' ? '复制答案' : '复制', () => copyText(text)); copy.dataset.historyAction = 'copy'; copy.dataset.hasText = String(Boolean(text)); copy.disabled = !text; const context = button('作为参考文字', () => useContext(text)); context.dataset.historyAction = 'context'; context.dataset.hasText = String(Boolean(text)); context.disabled = !text || ACTIVE_PHASES.has(snapshot?.state?.phase); actions.append(copy, context);
      copy.dataset.historyFocus='copy-result';
      if (entry.original && entry.original !== text) { const rawCopy = button('复制原文', () => copyText(entry.original)); rawCopy.dataset.historyAction = 'copy'; rawCopy.dataset.historyFocus='copy-original'; rawCopy.dataset.hasText = 'true'; actions.append(rawCopy); }
      if (entry.retryOf) { const retryNote = document.createElement('p'); retryNote.className = 'history-retry-note'; const original = entries.find(item => item.id === entry.retryOf); retryNote.textContent = `由重试生成 · ${entry.inputSource === 'text' ? '仅文字处理' : entry.inputSource === 'recording' ? '重新识别录音' : '原始材料重试'}${original ? ` · 原记录 ${formatDate(original.createdAt)}` : ' · 原记录已不在当前历史中'}`; body.append(retryNote); }
      if (entry.audioAvailable) { const local = snapshot?.settings?.asr?.backend === 'local'; const retry = button(local ? '本地历史重识别暂不可用' : '重新识别录音', () => retryEntry(entry, 'audio')); retry.dataset.historyAction = 'retry'; retry.dataset.historyFocus='retry-audio'; retry.dataset.localUnavailable = String(local); retry.disabled = local; if (local) retry.title = '保存的 WebM 仍可导出；本地历史解码尚未接入，请重新录音。已有原文可仅重做文字处理。'; actions.append(retry); }
      if (entry.original) { const retry = button('仅重做文字处理', () => retryEntry(entry, 'text')); retry.dataset.historyAction = 'retry'; retry.dataset.historyFocus='retry-text'; actions.append(retry); }
      if (entry.mode === 'ask' && entry.status === 'completed' && typeof entry.text === 'string' && entry.text.trim()) { const answer = button('查看回答', event => openHistoryAnswer(entry, event.currentTarget)); answer.dataset.historyAction = 'answer'; actions.append(answer); }
      if (entry.audioAvailable) { const exportButton = button('导出录音', () => exportAudio(entry.id)); exportButton.dataset.historyAction = 'export'; actions.append(exportButton); }
      const deleteButton = button('删除', () => deleteEntry(entry), 'text-button danger-text'); deleteButton.dataset.historyAction = 'delete'; actions.append(deleteButton); const secondary=[...actions.children].filter(node=>node!==copy&&node.dataset.historyAction!=='answer');
      for(const action of actions.children)if(!action.dataset.historyFocus)action.dataset.historyFocus=action.dataset.historyAction;
      if(secondary.length){const more=document.createElement('details');more.className='quiet-history-more';more.open=expanded.has(entry.id);const summary=document.createElement('summary');summary.textContent='更多操作';summary.dataset.historyFocus='more';more.append(summary);for(const node of secondary)more.append(node);
        if(entry.audioAvailable&&snapshot?.settings?.asr?.backend==='local'){const note=document.createElement('p');note.className='history-action-note';note.textContent='本地历史录音暂不能重识别；可导出录音或仅重做文字处理。';more.append(note);}
        actions.append(more);}
      body.append(actions); item.append(time, body); group.append(item);
    });
    $('history-list').replaceChildren(fragment); syncControls(); if (scrollTop !== null) $('history-scroll').scrollTop = scrollTop;
    if(priorFocus&&(!document.activeElement||document.activeElement===document.body||!focused.isConnected)){
      const row=[...$('history-list').querySelectorAll('[data-history-id]')].find(node=>node.dataset.historyId===priorFocus.id);
      let target=[...row?.querySelectorAll('[data-history-focus]')||[]].find(node=>node.dataset.historyFocus===priorFocus.key);
      // Never restore keyboard focus inside a collapsed disclosure. A now-
      // unavailable action falls back to its visible disclosure, not a peer.
      for(let parent=target?.parentElement;parent&&row.contains(parent);parent=parent.parentElement)if(parent.tagName==='DETAILS'&&!parent.open)target=parent.querySelector('summary');
      if(target&&!visibleFocusTarget(target))target=row?.querySelector('.quiet-history-more>summary');
      if(target&&visibleFocusTarget(target))target.focus({preventScroll:true});else if(visibleFocusTarget($('history-list'))){$('history-list').tabIndex=-1;$('history-list').focus({preventScroll:true});}
    }
  }
  function historyDetails(label, text) { const details = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = label; const content = document.createElement('p'); content.textContent = String(text); details.append(summary, content); return details; }








  function dictionaryEntries() { return Array.isArray(snapshot?.dictionary) ? snapshot.dictionary : []; }
  function visibleWords() { const query = dictionaryQuery.trim().toLocaleLowerCase(); return dictionaryEntries().filter((entry) => (dictionaryFilter === 'all' || (entry.source || 'manual') === dictionaryFilter) && (!query || [entry.word, entry.replacement, entry.note].filter(Boolean).join(' ').toLocaleLowerCase().includes(query))); }
  function renderDictionary(force = false) {
    const entries = dictionaryEntries(); const visible = visibleWords();
    const existing = new Set(entries.map((entry) => entry.id)); selectedWords = new Set([...selectedWords].filter((id) => existing.has(id)));
    const signature = JSON.stringify([entries, dictionaryFilter, dictionaryQuery, selectingWords, [...selectedWords]]); if (!force && signature === lastDictionarySignature) return; lastDictionarySignature = signature;
    const scrollRoot = $('dictionary-scroll'), scrollTop = $('view-dictionary').hidden ? null : scrollRoot.scrollTop;
    const focused = document.activeElement, focusedCard = focused?.closest('.word-card');
    const focusedWord = focusedCard ? { id: focusedCard.dataset.wordId, checkbox: focused.classList.contains('word-checkbox') } : null;
    const filterToolbar = $('dictionary-filter-toolbar'), selectionToolbar = $('dictionary-selection');
    const focusEntersSelection = selectingWords && (filterToolbar.contains(focused) || focused === $('select-dictionary'));
    const focusLeavesSelection = !selectingWords && selectionToolbar.contains(focused);
    $('dictionary-count').textContent = `${entries.length} 个词条${visible.length !== entries.length ? ` · 显示 ${visible.length} 个` : ''}`;
    const emptyKind = dictionaryQuery.trim() ? 'search' : dictionaryFilter === 'auto' ? 'auto' : dictionaryFilter === 'manual' ? 'manual' : 'empty';
    $('dictionary-empty').hidden = visible.length > 0; $('dictionary-empty').dataset.kind = emptyKind;
    $('dictionary-empty-title').hidden = emptyKind === 'search';
    $('dictionary-empty-title').textContent = { search: '', auto: '还没有自动添加的词条', manual: '还没有手动添加的词条', empty: '让专有名词，也准确落笔' }[emptyKind];
    $('dictionary-empty-description').textContent = { search: '没有找到匹配词条，试试其他关键词，或清空搜索。', auto: '当前版本不会自动学习或添加词条。你可以手动添加，或导入 CSV。', manual: '手动添加名字、术语和常用表达，或导入 CSV。', empty: '添加名字、术语和常用表达，作为识别与文字模型的提示。' }[emptyKind];
    $('empty-new-word').hidden = emptyKind === 'auto' || emptyKind === 'search';
    $('select-dictionary').hidden = selectingWords;
    filterToolbar.hidden = selectingWords; filterToolbar.toggleAttribute('inert', selectingWords);
    filterToolbar.querySelectorAll('button, input').forEach(control => { control.disabled = selectingWords; control.tabIndex = selectingWords ? -1 : 0; });
    selectionToolbar.hidden = !selectingWords; selectionToolbar.toggleAttribute('inert', !selectingWords);
    selectionToolbar.querySelectorAll('button, input').forEach(control => { control.tabIndex = selectingWords ? 0 : -1; });
    $('dictionary-grid').classList.toggle('is-selecting', selectingWords);
    $('selected-word-count').textContent = `已选择 ${selectedWords.size} 个词条`;
    const selectedVisible = visible.filter((entry) => selectedWords.has(entry.id)).length; $('select-all-words').checked = visible.length > 0 && selectedVisible === visible.length; $('select-all-words').indeterminate = selectedVisible > 0 && selectedVisible < visible.length;
    const fragment = document.createDocumentFragment();
    visible.forEach((entry) => {
      const card = document.createElement('article'); card.className = 'word-card'; card.dataset.wordId = entry.id; card.classList.toggle('selected', selectedWords.has(entry.id));
      const source = document.createElement('span'); source.className = 'word-source'; source.textContent = entry.source === 'auto' ? '✧' : '⌁'; source.title = entry.source === 'auto' ? '自动添加' : '手动添加';
      const edit = button('', () => { const live = visibleWords().find(word => word.id === entry.id); if (live) selectingWords ? toggleWord(live.id) : openWord(live); }, 'word-edit'); const word = document.createElement('span'); word.textContent = String(entry.word || ''); edit.append(word);
      if (entry.replacement) { const replacement = document.createElement('small'); replacement.textContent = '→ ' + entry.replacement; edit.append(replacement); }
      edit.title = entry.note || '编辑词条';
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.className = 'word-checkbox'; checkbox.checked = selectedWords.has(entry.id); checkbox.setAttribute('aria-label', `选择词条：${entry.word}`); checkbox.addEventListener('change', () => toggleWord(entry.id));
      card.append(source, edit, checkbox); fragment.append(card);
    });
    $('dictionary-grid').replaceChildren(fragment); syncControls();
    // Replacing a row must not strand keyboard focus on a disconnected element.
    // The permanent scroll root and preventScroll keep selection/snapshots in place.
    if (!$('view-dictionary').hidden && $('settings-dialog').open && currentSettingsPanel === 'dictionary' && !document.querySelector('dialog[open]:not(#settings-dialog)')) {
      let target;
      if (focusEntersSelection) target = $('select-all-words').disabled ? $('exit-dictionary-selection') : $('select-all-words');
      else if (focusLeavesSelection) target = $('select-dictionary').disabled ? $('dictionary-search') : $('select-dictionary');
      else if (focusedWord) {
        const card = [...$('dictionary-grid').children].find(node => node.dataset.wordId === focusedWord.id);
        target = card?.querySelector(focusedWord.checkbox ? '.word-checkbox' : '.word-edit') || (selectingWords ? $('exit-dictionary-selection') : $('dictionary-search'));
      }
      target?.focus({ preventScroll: true });
    }
    if (scrollTop !== null) scrollRoot.scrollTop = scrollTop;
  }
  function setDictionarySelection(selecting) { selectingWords = selecting; if (!selecting) selectedWords.clear(); renderDictionary(true); }
  function toggleWord(id) { if (!visibleWords().some(entry => entry.id === id)) return; selectingWords = true; if (selectedWords.has(id)) selectedWords.delete(id); else selectedWords.add(id); renderDictionary(true); }
  function openWord(entry) { editingWordId = entry?.id || null; $('word-dialog-heading').textContent = editingWordId ? '编辑词条' : '添加新词'; $('word-value').value = entry?.word || ''; $('word-replacement').value = entry?.replacement || ''; $('word-note').value = entry?.note || ''; $('delete-word').hidden = !editingWordId; $('word-message').textContent = entry ? `手动添加 · 更新于 ${formatDate(entry.updatedAt || entry.createdAt)}` : '词条在本机保存，使用时作为模型提示。'; showDialog('word-dialog'); $('word-value').focus(); }
  function renderStorage() { const bytes = Math.max(0, Number(snapshot?.audioStats?.bytes) || 0); const limit = Math.max(1, Number(snapshot?.audioStats?.limitBytes) || (snapshot?.settings?.maxAudioMB || 100) * 1024 * 1024); const count = Math.max(0, Number(snapshot?.audioStats?.count) || 0); $('audio-usage').textContent = `${(bytes / 1024 / 1024).toFixed(bytes ? 1 : 0)} MB / ${Math.round(limit / 1024 / 1024)} MB`; $('audio-file-count').textContent = `${count} 个录音`; $('audio-progress').max = limit; $('audio-progress').value = bytes; $('clear-audio').disabled = count === 0 || !bridge; }
  function setLevel(level) { const normalized = Number.isFinite(Number(level)) ? Math.max(0, Math.min(1, Number(level))) : 0; $('level-bars').setAttribute('aria-valuenow', String(Math.round(normalized * 100))); const count = Math.round(normalized * 20); [...$('level-bars').children].forEach((bar, index) => { const active = index < count; bar.style.height = `${active ? 6 + (index % 5) * 3 : 3 + (index % 3) * 2}px`; bar.style.backgroundColor = active ? '#5792df' : '#d1d1d1'; }); }
  function captureElapsedMs(capture) {
    if(!Number.isFinite(capture?.startedMono))return 0;
    return Math.max(0,performance.now()-capture.startedMono);
  }
  function activeRecordingLimits() {
    return activeCapture?.recordingLimits||snapshot?.state?.recordingLimits||window.ProviderEndpoint.recordingLimits(snapshot?.settings?.asr?.protocol,undefined,snapshot?.settings?.asr?.backend);
  }
  function updateTimer() {
    const state = snapshot?.state || {}; const started = activeCapture?.startedAt || state.startedAt; const milliseconds = typeof started === 'number' ? started : Date.parse(started); const recording = state.phase === 'recording' && activeCapture?.status !== 'failing';
    const savedDuration = Number.isFinite(state.durationMs) && state.durationMs > 0 ? state.durationMs : (activeCapture?.durationMs || lastRecordingDurationMs);
    const limits=activeRecordingLimits();
    const elapsed=activeCapture&&Number.isFinite(activeCapture.startedMono)?captureElapsedMs(activeCapture):Math.max(0,Date.now()-milliseconds);
    const duration = recording && Number.isFinite(milliseconds) ? Math.min(limits.maxDurationMs,elapsed) : Math.min(MAX_DURATION_MS, Math.max(0, savedDuration || 0)); const seconds = recording ? Math.floor(duration / 1000) : Math.ceil(duration / 1000); const timer = $('record-timer');
    timer.hidden = !recording && (!['stopping', 'processing', 'transcribing', 'refining', 'delivering', 'done', 'retained'].includes(state.phase) || !duration);
    timer.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; timer.setAttribute('aria-label', `本次录音时长 ${timer.textContent}`); timer.title = '本次录音时长';
    const warning = recording && duration >= limits.warningMs; const remaining = Math.max(0, Math.ceil((limits.stopAfterMs - duration) / 1000));
    timer.classList.toggle('time-warning', warning); $('record-countdown').hidden = !warning;
    const limitLabel=limits.backend==='local'?'本地 60 秒上限（提前 2 秒结束）':limits.protocol==='qwen-input-audio'?'Qwen 5 分钟上限（提前 2 秒结束，预留收尾时间）':'9 分钟上限（提前 2 秒结束，预留收尾时间）';
    $('record-countdown').textContent = warning ? (remaining ? `仅剩 ${remaining} 秒；到达 ${limitLabel} 后自动结束` : `已到 ${limitLabel}，正在结束录音`) : '';
  }
  function updateRecordControl() {
    const phase=snapshot?.state?.phase,unavailable=!snapshot||!bridge,busy=ACTIVE_PHASES.has(phase)&&!RECORDING_PHASES.has(phase);
    const blocked=unavailable||busy||commandPending||cancelPending||processingRequestPending||modePending||savingSettings||operationPending||preferencePending;
    $('record-button').disabled=unavailable;$('record-button').setAttribute('aria-disabled',String(blocked));
  }

  function renderState() {
    const state = snapshot?.state || {}; const phase = state.phase || 'idle'; const active = ACTIVE_PHASES.has(phase); const recording = RECORDING_PHASES.has(phase); const processing = active && !recording;
    const limitPolicy=RECORDING_PHASES.has(phase)?activeRecordingLimits():window.ProviderEndpoint.recordingLimits(snapshot?.settings?.asr?.protocol,undefined,snapshot?.settings?.asr?.backend);
    if($('record-limit-summary'))$('record-limit-summary').textContent=limitPolicy.backend==='local'?'本地单次最多 60 秒':limitPolicy.protocol==='qwen-input-audio'?'单次最多 5 分钟':'单次最多 9 分钟 · 25 MB';
    $('status-badge').dataset.phase = phase; $('status-label').textContent = phase === 'done' && state.mode === 'ask' ? `${askResultName(state.result?.task || state.task)}已就绪` : phase === 'done' && state.mode === 'translate' ? '翻译完成' : phaseLabels[phase] || '正在处理';
    $('record-prompt').textContent = phase === 'done' && state.mode === 'ask' ? `${askResultName(state.result?.task || state.task)}已就绪` : phase === 'done' && state.mode === 'translate' ? '翻译完成' : phasePrompts[phase] || '正在处理，请稍候';
    const registered=effectiveShortcuts('current');
    $('record-message').textContent=state.message||(recording?'点击结束并处理本次录音。':processing?'处理完成后在下方核对并复制。':registered.length?'也可使用 '+effectiveShortcut('current'):'全局快捷键尚未生效，可直接点击录音。');
    updateRecordControl(); $('record-button').classList.toggle('is-recording', recording); $('record-button').classList.toggle('is-processing', processing); $('record-button').setAttribute('aria-label', recording ? '结束录音并识别' : processing ? '正在处理录音' : '开始录音');
    $('level-bars').hidden=phase!=='recording';
    $('record-action-label').textContent=recording?'结束录音':processing?'处理中…':'开始录音';
    $('cancel-button').hidden = !active || phase === 'delivering'; $('cancel-button').disabled = commandPending;
    const currentResult = readableResult(state.result);
    if (currentResult) renderResult(state.result); $('result-heading-label').textContent = !currentResult && readableResult(lastResult) ? '上次的文字' : '这次的文字';
    if (phase !== 'recording') setLevel(0); else if (typeof state.level === 'number') setLevel(state.level);
    if (phase === 'recording' && activeCapture?.status !== 'failing' && recordingTimer === null) recordingTimer = setInterval(updateTimer, 500);
    else if ((phase !== 'recording' || activeCapture?.status === 'failing') && recordingTimer !== null) { clearInterval(recordingTimer); recordingTimer = null; }
    updateTimer(); renderMode(); renderWorkspaceAccess();
  }
  function applyTheme(preference) { document.documentElement.dataset.theme = preference === 'dark' || (preference === 'system' && systemTheme?.matches) ? 'dark' : 'light'; }
  function applySnapshot(value) {
    if (devicesDisposed) return false;
    if (!value || typeof value !== 'object' || !value.settings || !value.state) return false;
    if (Number.isFinite(value.revision) && Number.isFinite(snapshot?.revision) && value.revision < snapshot.revision) return false;
    if (shortcutCapture && ACTIVE_PHASES.has(value.state.phase)) void endShortcutCapture('本次录音或处理已开始，按键录制已取消。', false);
    if (shortcutCapture && value.shortcutCapture) {
      const capture = shortcutCapture;
      if (value.shortcutCapture.active) { capture.remoteActive = true; if (typeof value.shortcutCapture.token === 'string') capture.remoteToken = value.shortcutCapture.token; }
      else if (capture.backend && (capture.remoteActive || capture.token)) {
        capture.cancelled = true; capture.resolveRemoteEnd({ remoteEnded: true });
        const message = value.shortcutStatus?.degraded || value.shortcutStatus?.lastError ? '快捷键未能全部恢复，请查看实际生效状态并重新保存设置。' : '按键录制已结束；请查看当前实际生效的快捷键。';
        clearShortcutCaptureUI(capture, capture.beginError || message, false);
      }
    }
    if (ACTIVE_PHASES.has(value.state.phase) && $('setup-dialog').open) closeDialog('setup-dialog');
    if (historyAnswer && ACTIVE_PHASES.has(value.state.phase)) closeHistoryAnswer();
    if (selectorSession && ACTIVE_PHASES.has(value.state.phase)) closeSelector(false);
    const restoreHistoryFocus = Boolean(historyAnswer && !value.history?.some(item => item.id === historyAnswer.id));
    for (const key of Object.keys(selectorFieldEpochs)) if (JSON.stringify(snapshot?.settings?.[key]) !== JSON.stringify(value.settings[key])) selectorFieldEpochs[key]++;
    snapshotVersion += 1; snapshot = value;usagePanel?.accept(value.usage??{available:false,revision:0,error:'当前连接未提供用量统计。'});if(document.documentElement)document.documentElement.dataset.platform=value.platform||''; syncProviderSnapshots(value); if (historyAnswer && !value.history?.some(item => item.id === historyAnswer.id && item.mode === 'ask' && item.status === 'completed' && item.text?.trim())) { closeHistoryAnswer(); toast('这条历史回答已删除或过期。'); } if (!modePending) selectedMode = modeNames[value.settings.mode] ? value.settings.mode : selectedMode;
    renderTargetSelector(); syncSavedSelectors(); selectValue('history-retention', value.settings.historyRetentionDays || 0);
    renderNotices([...(Array.isArray(value.notices)?value.notices:[]),...(value.state?.languageError?[value.state.languageError]:[])]); hydrateSettings(); applyTheme(preferencePending ? $('appearance').value : value.settings.appearance); updateKeyStatus(); renderState(); renderHistory(value.history); renderDictionary();  renderStorage();
    $('sidebar-shortcut').textContent = effectiveShortcut('current'); updateShortcutStatus();
    const hasAsr = asrConfigured(value); $('connection-badge').lastChild.textContent = hasAsr ? '识别服务已配置' : '等待配置识别服务'; $('connection-badge').classList.toggle('configured', hasAsr);
    setDeviceOptions(value.settings.deviceId || '');
    $('history-privacy').textContent = value.settings.saveHistory ? '历史文字以明文保存在这台电脑，不提供云同步。模型服务商的数据保留政策另行适用。' : '已关闭新增历史记录。已有记录保留在本机，仍可查看或清除；不提供云同步。';
    $('quiet-history-policy-summary').textContent=value.settings.saveHistory?'保存与隐私：本机明文 · 无云同步':'历史保存已关闭 · 查看保留与隐私';
    $('platform-hint').textContent = '自动回填暂不可用。当前仅支持手动复制结果，再粘贴到目标应用。';
    renderRecovery(); syncControls(); if (restoreHistoryFocus) { $('history-list').tabIndex = -1; $('history-list').focus(); } if ($('setup-dialog').open) renderSetup(); maybeOpenSetup(); return true;
  }
  function recoveryDestinations(recovery) {
    const settings = snapshot?.settings || {};
    const needsChat = recovery?.mode !== 'dictate' || Boolean(settings.refiner?.enabled);
    return (settings.asr?.backend==='local'?'本地 SenseVoice CPU（最长 60 秒；已保存的录音暂不支持本地重识别）':`识别服务：${settings.asr?.baseUrl || '尚未配置'}（${settings.asr?.model || '未设置模型'}）`) + (needsChat ? `\n文字模型服务：${settings.refiner?.baseUrl || '尚未配置'}（${settings.refiner?.model || '未设置模型'}）` : '\n本次不启用文字整理。');
  }
  function renderRecovery() {
    const recovery = snapshot?.recovery;
    $('recovery-card').hidden = !recovery?.token;
    if (!recovery?.token) return;
    const bytes = Number(recovery.audioBytes ?? recovery.bytes) || 0;
    const duration = Math.ceil(Math.max(0, Number(recovery.durationMs) || 0) / 1000);
    $('recovery-summary').textContent = `${modeNames[recovery.mode] || '听写'} · ${duration} 秒 · ${(bytes / 1024 / 1024).toFixed(1)} MB。仅临时保留在内存，未因此保存到磁盘；退出、过期或被下一段替换后无法恢复。`;
    $('recovery-expiry').textContent = recovery.expiresAt ? `最迟保留至 ${formatDate(recovery.expiresAt)}。最多 1 段录音、9 分钟、25 MB；内存临时保留 5 分钟。` : '最多临时保留 1 段录音、9 分钟、25 MB；内存保留 5 分钟。';
    $('recovery-destination').textContent = recoveryDestinations(recovery);
  }
  async function retryRecovery() {
    if (!snapshot?.recovery?.token || ACTIVE_PHASES.has(snapshot?.state?.phase) || commandPending || processingRequestPending || modePending || savingSettings || operationPending) return;
    const token = snapshot.recovery.token;
    const destination = recoveryDestinations(snapshot.recovery);
    if (!(await requestConfirmation('重新发送临时录音？', `这段录音仍在本次应用内存中。点击后会发送到当前设置中的服务，可能再次计费。\n\n${destination}\n\n需要文字模型时，会发送识别文字和本次适用的参考文字、偏好。结果仅在应用内显示，请手动复制。`, '确认并重新发送'))) return;
    if (snapshot?.recovery?.token !== token || destination !== recoveryDestinations(snapshot.recovery)) { toast('临时录音或服务设置已变化，请重新确认。'); return; }
    if (ACTIVE_PHASES.has(snapshot?.state?.phase) || commandPending || processingRequestPending || modePending || savingSettings || operationPending) return;
    processingRequestPending = true; syncControls();
    try { await invoke('retryRecovery', token); }
    catch (error) { toast(errorMessage(error, '临时录音重试失败。')); }
    finally { processingRequestPending = false; syncControls(); }
  }
  async function discardRecovery() {
    const token = snapshot?.recovery?.token;
    if (!token || operationPending || savingSettings || processingRequestPending) return;
    if (!(await requestConfirmation('丢弃临时录音？', '这会清除内存中的临时录音，无法再用它重试。已有历史记录不受影响。', '丢弃录音', true))) return;
    if (snapshot?.recovery?.token !== token) return;
    await mutation('discardRecovery', token, '临时录音已丢弃');
  }
  async function copyText(text) { if (!text || !bridge) return; try { await bridge.copyText(text); toast('已复制到剪贴板'); } catch (error) { toast(errorMessage(error, '复制失败，请重试。')); } }
  function needService(kind) { if (serviceConfigured(snapshot, kind)) return false; openSettings('services'); toast(kind === 'asr' ? '请先配置识别服务的地址、模型与密钥。本机接口可不填密钥。' : '请先配置文字模型的地址、模型与密钥。本机接口可不填密钥。'); $(kind + '-url').focus(); return true; }
  async function requestToggle() {
    if (!bridge || !snapshot || commandPending || cancelPending || processingRequestPending || modePending || savingSettings || operationPending || preferencePending) return;
    const active = ACTIVE_PHASES.has(snapshot?.state?.phase);
    if(active&&!RECORDING_PHASES.has(snapshot?.state?.phase))return;
    if (!active && (needService('asr') || (selectedMode !== 'dictate' && needService('refiner')))) return;
    if (!active) submittedContext = modeOptions().context;
    commandPending = true; renderState();
    try { await invoke('toggle', modeOptions()); } catch (error) { toast(errorMessage(error)); } finally { commandPending = false; renderState(); }
  }
  async function requestCancel() { if (!bridge || cancelPending || !ACTIVE_PHASES.has(snapshot?.state?.phase) || snapshot?.state?.phase === 'delivering') return; cancelPending = true; syncControls(); try { await invoke('cancel'); } catch (error) { toast(errorMessage(error)); } finally { cancelPending = false; syncControls(); } }
  async function processText() {
    if (!bridge || commandPending || processingRequestPending || modePending || savingSettings || operationPending || ACTIVE_PHASES.has(snapshot?.state?.phase)) return;
    let text = $('text-input').value.trim(); const options = modeOptions();
    if (!text && !(selectedMode === 'ask' && options.context && selectedTask !== 'ask' && selectedTask !== 'write')) { toast('请先输入文字或问题。'); $('text-input').focus(); return; }
    if (needService('refiner')) return;
    if (!text) text = `请${taskNames[selectedTask]}参考文字。`;
    processingRequestPending = true; submittedContext = options.context; renderState();
    try { await invoke('processText', { text, ...options }); } catch (error) { toast(errorMessage(error)); } finally { processingRequestPending = false; renderState(); }
  }
  function requestConfirmation(title, description, action = '确认', destructive = false) {
    if (confirmResolver) return Promise.resolve(false);
    $('confirm-heading').textContent = title; $('confirm-description').textContent = description; $('confirm-action').textContent = action; $('confirm-action').className = `button ${destructive ? 'button-danger' : 'button-primary'}`; showDialog('confirm-dialog'); $('confirm-cancel').focus();
    return new Promise((resolve) => { confirmResolver = resolve; });
  }
  function finishConfirmation(confirmed) { const resolve = confirmResolver; confirmResolver = null; closeDialog('confirm-dialog'); if (resolve) resolve(confirmed); }
  async function mutation(method, argument, success) {
    if (!bridge || operationPending || savingSettings) return false; operationPending = true; syncControls();
    try { await invoke(method, ...(argument === undefined ? [] : [argument])); if (success) toast(success); return true; }
    catch (error) { toast(errorMessage(error)); return false; }
    finally { operationPending = false; syncControls(); }
  }
  async function deleteEntry(entry) { if (await requestConfirmation('删除这条记录？', '这条历史文字及关联录音将永久删除，无法在应用内恢复。', '删除记录', true)) await mutation('deleteHistory', entry.id, '记录已删除'); }
  async function retryEntry(entry, retryKind) {
    if (ACTIVE_PHASES.has(snapshot?.state?.phase) || commandPending || processingRequestPending || modePending || savingSettings || operationPending) return;
    const audio = retryKind === 'audio';
    if (audio && snapshot?.settings?.asr?.backend === 'local') { toast('本地历史解码尚未接入，请重新录音；原录音仍可导出，已有原文可仅重做文字处理。'); return; }
    if ((audio && (!entry.audioAvailable || needService('asr'))) || (!audio && (!entry.original || needService('refiner'))) || (audio && entry.mode !== 'dictate' && needService('refiner'))) return;
    const destination = kind => { try { return new URL(snapshot.settings[kind].baseUrl).origin; } catch { return '未配置'; } };
    const chat = !audio || entry.mode !== 'dictate' || snapshot.settings.refiner.enabled;
    const description = `${audio ? `保存的录音会重新发送到：${destination('asr')}` : '不发送录音，只重做文字处理。'}${chat ? `\n原始文字${entry.context ? '与主动提供的参考文字' : ''} → ${destination('refiner')}` : ''}\n模式：${modeNames[entry.mode] || '听写'}${entry.mode === 'ask' ? ` / ${taskNames[entry.task] || '提问'}` : ''}${entry.mode === 'translate' || entry.task === 'translate' ? `；目标语言：${languageName(entry.targetLanguage || snapshot.settings.targetLanguage)}` : ''}\n使用当前已保存的服务配置，服务商可能再次计费。创建关联的新记录，不覆盖原记录，不自动回填。`;
    if (!(await requestConfirmation('重新处理这条记录？', description, '重新处理'))) return;
    if (ACTIVE_PHASES.has(snapshot?.state?.phase) || commandPending || processingRequestPending || modePending || savingSettings || operationPending) return;
    processingRequestPending = true; renderState();
    try { submittedContext = entry.context || ''; await invoke('retryHistory', entry.id, { retryKind: audio ? 'audio' : 'text', mode: entry.mode || 'dictate', task: entry.task, context: entry.context || '', targetLanguage: entry.targetLanguage || snapshot?.settings?.targetLanguage || 'zh' }); }
    catch (error) { toast(errorMessage(error)); } finally { processingRequestPending = false; renderState(); }
  }
  function clearHistoryAnswer(restore = true) {
    const previous = historyAnswer; historyAnswer = null; historyAnswerGeneration++;
    previous?.component?.dispose(); $('history-answer-host').replaceChildren(); $('history-answer-host').hidden = true; $('history-answer-loading').hidden = true;
    if (restore && previous) {
      const trigger = previous.trigger;
      const target = trigger?.isConnected && !trigger.closest('[hidden]') ? trigger : currentView === 'history' ? $('history-list') : currentView === 'dictation' && workspaceOpen ? $('workspace-title') : document.querySelector(`.navigation [data-view="${currentView}"]`);
      if (target) { if (['history-list', 'workspace-title'].includes(target.id)) target.tabIndex = -1; target.focus(); }
    }
  }
  function closeHistoryAnswer() { closeDialog('answer-dialog'); clearHistoryAnswer(); }
  async function requestRetainRecording() {
    if (!snapshot?.canRetainRecording || snapshot.state.phase !== 'recording' || commandPending || typeof bridge?.retainRecording !== 'function') return;
    const sessionId = snapshot.state.sessionId, version = snapshotVersion; commandPending = true; renderState();
    try { const result = await bridge.retainRecording({ sessionId }); if (result?.accepted !== true && snapshotVersion === version) toast('当前片段不能保留，请查看录音与保存设置。'); }
    catch (error) { if (snapshot?.state?.sessionId === sessionId) toast(errorMessage(error, '停止保留未完成。')); }
    finally { commandPending = false; renderState(); }
  }
  async function openHistoryAnswer(entry, trigger) {
    if ([...document.querySelectorAll('dialog[open]')].some(dialog => dialog.id !== 'answer-dialog')) return;
    if (typeof bridge?.getHistoryAnswer !== 'function' || !window.AnswerCardContent) { toast('当前客户端不能安全读取历史回答，请更新客户端。'); return; }
    clearHistoryAnswer(false);
    const session = { id: entry.id, generation: ++historyAnswerGeneration, trigger, component: null }; historyAnswer = session;
    $('legacy-answer').hidden = true; $('history-answer-host').hidden = true; $('history-answer-loading').hidden = false; showDialog('answer-dialog'); $('close-history-answer-loading').focus();
    try {
      const payload = await bridge.getHistoryAnswer(entry.id);
      if (historyAnswer !== session || !$('answer-dialog').open) return;
      const live = snapshot?.history?.find(item => item.id === entry.id);
      if (!live || live.mode !== 'ask' || live.status !== 'completed' || !live.text?.trim() || payload?.id !== entry.id) throw Error('记录已删除或过期，无法查看回答。');
      $('history-answer-loading').hidden = true; $('history-answer-host').hidden = false;
      session.component = window.AnswerCardContent.create($('history-answer-host'), {
        source: input => { if (historyAnswer !== session || input.generation !== session.generation) throw Error('回答已关闭或更新。'); return bridge.openHistorySource({ id: session.id, sourceId: input.sourceId }); },
        copy: input => { if (historyAnswer !== session || input.generation !== session.generation) throw Error('回答已关闭或更新。'); return bridge.copyHistoryAnswer({ id: session.id, part: input.part }); },
        close: () => { if (historyAnswer === session) closeHistoryAnswer(); },
        ready: input => { if (historyAnswer === session && input.generation === session.generation && $('answer-dialog').open) $('history-answer-host').querySelector('[data-answer=close]').focus(); }
      }, { embedded: true });
      if (!session.component.render({ ...payload, generation: session.generation })) throw Error('回答内容无效。');
    } catch (error) { if (historyAnswer === session) { closeHistoryAnswer(); toast(errorMessage(error, '无法打开回答。')); } }
  }
  async function exportAudio(id) { if (!bridge || operationPending || savingSettings) return; operationPending = true; syncControls(); try { const result = await bridge.exportAudio(id); if (!result?.cancelled) toast('录音已导出'); } catch (error) { toast(errorMessage(error)); } finally { operationPending = false; syncControls(); } }
  async function saveWord(event) {
    event.preventDefault(); if (!bridge || operationPending) return; const word = $('word-value').value.trim(); if (!word) { $('word-message').textContent = '请输入词语。'; $('word-value').focus(); return; }
    const input = { word, replacement: $('word-replacement').value.trim(), note: $('word-note').value.trim(), source: 'manual' }; if (editingWordId) input.id = editingWordId;
    $('save-word').disabled = true; const saved = await mutation('upsertDictionary', input, editingWordId ? '词条已更新' : '词条已添加'); syncControls(); if (saved) closeDialog('word-dialog');
  }
  async function deleteWords(ids) {
    const existing = new Set(dictionaryEntries().map(entry => entry.id)); ids = [...new Set(ids)].filter(id => existing.has(id));
    if (!ids.length || operationPending || !bridge) return;
    if (!(await requestConfirmation(ids.length === 1 ? '删除这个词条？' : `删除 ${ids.length} 个词条？`, '所选词条会从本机词典永久删除，无法在应用内恢复。', '删除词条', true))) return;
    // A snapshot may remove an approved entry while confirmation is open.
    const current = new Set(dictionaryEntries().map(entry => entry.id));
    if (!ids.every(id => current.has(id))) { toast('词典已变化，请重新选择要删除的词条。'); renderDictionary(true); return; }
    const deleted = await mutation(ids.length === 1 ? 'deleteDictionary' : 'deleteDictionaryMany', ids.length === 1 ? ids[0] : ids, '词条已删除');
    if (deleted) { ids.forEach(id => selectedWords.delete(id)); closeDialog('word-dialog'); renderDictionary(true); }
  }
  async function importDictionary() {
    if (!bridge || operationPending || savingSettings) return; operationPending = true; syncControls();
    try {
      const result = await invoke('importDictionaryCSV'); if (result?.operation?.cancelled || result?.cancelled) return;
      if (!result?.importPreview?.token) throw new Error('未收到可用的导入预览，请重新选择 CSV。');
      importPreview = result.importPreview;
      $('import-summary').textContent = `将新增 ${importPreview.imported || 0} 个、更新 ${importPreview.updated || 0} 个词条。导入后共 ${importPreview.total || 0} 个。`;
      $('import-message').textContent = '请检查新增与更新内容，确认后才会写入本机词典。';
      const fragment = document.createDocumentFragment();
      for (const entry of importPreview.rows || []) { const row = document.createElement('div'); row.className = 'import-row'; const word = document.createElement('strong'); word.textContent = entry.word; const detail = document.createElement('span'); detail.textContent = [entry.replacement, entry.note].filter(Boolean).join(' / ') || '—'; const action = document.createElement('small'); action.textContent = entry.action === 'update' ? '更新' : '新增'; row.append(word, detail, action); fragment.append(row); }
      $('import-preview-list').replaceChildren(fragment); $('commit-import').disabled = false; showDialog('import-dialog');
    } catch (error) { toast(errorMessage(error)); } finally { operationPending = false; syncControls(); }
  }
  async function cancelImport() { if (importCommitting || operationPending) return; const token = importPreview?.token; importPreview = null; closeDialog('import-dialog'); syncControls(); if (token && typeof bridge?.cancelDictionaryImport === 'function') { operationPending = true; syncControls(); try { await invoke('cancelDictionaryImport', token); } catch (error) { toast(errorMessage(error, '清除导入预览失败，预览会自动过期。')); } finally { operationPending = false; syncControls(); } } }
  async function commitImport() {
    if (!bridge || !importPreview?.token || operationPending || savingSettings) return;
    operationPending = true; importCommitting = true; $('commit-import').disabled = true; $('cancel-import').disabled = true; $('close-import').disabled = true; $('import-message').textContent = '正在写入本机词典，请稍候。提交期间无法撤销。'; const token = importPreview.token; syncControls();
    try { await invoke('commitDictionaryImport', token); importPreview = null; closeDialog('import-dialog'); toast('词典已导入'); }
    catch (error) { importPreview = null; $('import-message').textContent = `${errorMessage(error)} 请取消并重新选择文件。`; }
    finally { operationPending = false; importCommitting = false; $('cancel-import').disabled = false; $('close-import').disabled = false; syncControls(); }
  }
  async function exportDictionary() { if (!bridge || operationPending || savingSettings) return; operationPending = true; syncControls(); try { const result = await bridge.exportDictionaryCSV(); if (!result?.cancelled) toast('词典 CSV 已导出'); } catch (error) { toast(errorMessage(error)); } finally { operationPending = false; syncControls(); } }
  async function useContext(text) {
    if (!text || modePending || ACTIVE_PHASES.has(snapshot?.state?.phase)) return;
    closeDialog('context-dialog'); if (!openWorkspace()) return;
    const revision = navigationRevision;
    if (!(await changeMode('ask')) || revision !== navigationRevision || currentView !== 'dictation' || !workspaceOpen || ACTIVE_PHASES.has(snapshot?.state?.phase) || document.querySelector('dialog[open]')) return;
    $('ask-context').value = String(text); submittedContext = ''; $('text-entry').open = true; $('text-input').focus(); toast('已填入参考文字，尚未发送');
  }
  function renderContextList() { const query = $('context-search').value.trim().toLocaleLowerCase(); const entries = (snapshot?.history || []).filter((entry) => historyText(entry) && (!query || historyText(entry).toLocaleLowerCase().includes(query))); const fragment = document.createDocumentFragment(); entries.forEach((entry) => { const item = button('', () => useContext(historyText(entry)), 'context-item'); const time = document.createElement('small'); time.textContent = `${formatDate(entry.createdAt)} · ${modeNames[entry.mode] || '听写'}`; const text = document.createElement('span'); text.textContent = historyText(entry); item.append(time, text); fragment.append(item); }); $('context-list').replaceChildren(fragment); $('context-empty').hidden = entries.length > 0; }
  async function changeRetention() { const previous = snapshot?.settings?.historyRetentionDays || 0; const value = Number($('history-retention').value); if (value === previous) return; if (value && !(await requestConfirmation('更改历史保留时长？', `超过 ${value} 天的历史文字及关联录音将被自动删除，无法在应用内恢复。`, '更改保留时长', true))) { $('history-retention').value = String(previous); return; } const scoped = typeof bridge?.updateSettingsSection === 'function'; const changed = await mutation(scoped ? 'updateSettingsSection' : 'saveSettings', scoped ? {section:'storage',values:{historyRetentionDays:value}} : { ...snapshot.settings, historyRetentionDays: value }, '历史保留时长已更新'); if (!changed) $('history-retention').value = String(previous); else selectValue('settings-history-retention', value); }
  function validateEndpoint(input, name, required) {
    const value = input.value.trim(); if (!value && !required) return ''; let url;
    try { url = new URL(value); } catch { throw new Error(`${name}地址不正确，请填写完整的 http:// 或 https:// 地址。`); }
    if (!url.hostname || url.username || url.password || url.search || url.hash) throw new Error(`${name}地址不能包含账号、密码、查询参数或 # 片段。`);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname); if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new Error(`${name}地址须使用 HTTPS；只有本机 localhost 或 127.0.0.1 可使用 HTTP。`);
    return value.replace(/\/+$/, '');
  }
  function fieldSection(node) {
    const id = node?.id || '';
    if (['appearance','language','microphone','default-mode'].includes(id)) return 'preferences';
    if (id === 'shortcut' || id.startsWith('shortcut-')) return 'shortcuts';
    if (id === 'target-language-search') return null;
    const section = node?.closest?.('[data-settings-section]')?.dataset.settingsSection;
    return section==='output'?'personalization':['services','storage','personalization','usage'].includes(section) ? section : null;
  }
  function restoreSavedSection(section) {
    const keep = new Set([...dirtySettingsSections].filter(value => value !== section));
    const fields = [...document.querySelectorAll('#settings-form input,#settings-form select,#settings-form textarea')].filter(node => keep.has(fieldSection(node))).map(node => ({id:node.id,value:node.value,checked:node.checked}));
    syncShortcutDraft(); const keys = JSON.parse(JSON.stringify(draftShortcutRows)), retainedAudioConsent = audioConsent, retainedPriceBindings = { ...usagePriceBindings };
    hydrateSettings(true);
    for(const field of fields)if($(field.id)){ $(field.id).value=field.value; if(typeof field.checked==='boolean')$(field.id).checked=field.checked; }
    if(keep.has('shortcuts')){draftShortcutRows=keys;for(const mode of Object.keys(modeNames))renderShortcutRows(mode);}
    if(keep.has('storage'))audioConsent=retainedAudioConsent;
    if(keep.has('usage'))usagePriceBindings=retainedPriceBindings;
    dirtySettingsSections.clear();for(const group of keep)dirtySettingsSections.add(group);settingsDirty=keep.size>0;
    updateDestinationNotice();updateShortcutStatus();updateKeyStatus();syncControls();
  }
  async function updateSettingsSection(section,values) {
    if(typeof bridge?.updateSettingsSection==='function')return invoke('updateSettingsSection',{section,values});
    // Compatibility with older bridges: only this section plus trusted saved state,
    // never values read from unrelated form fields.
    const next={...snapshot.settings,...values};
    if(section==='services')for(const kind of ['asr','refiner'])if(values[kind])next[kind]={...snapshot.settings[kind],...values[kind]};
    return invoke('saveSettings',next);
  }
  async function savePreference(node) {
    if(!snapshot?.settings)return;
    const key={appearance:'appearance',language:'language','default-mode':'mode'}[node.id];if(!key)return;
    if(savingSettings||preferencePending||operationPending||modePending||shortcutCapture||ACTIVE_PHASES.has(snapshot?.state?.phase)){restoreSavedSection('preferences');return;}
    const value=node.id==='language'&&node.value==='auto'?'':node.value;
    if(snapshot.settings[key]===value)return;
    preferencePending=true;syncControls();const status=$('settings-message');status.classList.remove('error');status.textContent='正在保存此项…';
    if(key==='appearance')applyTheme(value);
    try{await updateSettingsSection('preferences',{[key]:value});restoreSavedSection('preferences');selectedMode=snapshot.settings.mode;renderMode();status.textContent='此项已保存。未发送接口请求。';}
    catch(error){restoreSavedSection('preferences');status.textContent=errorMessage(error,'保存失败，已恢复原值。');status.classList.add('error');toast('保存失败，已恢复原值。');}
    finally{preferencePending=false;applyTheme(snapshot?.settings?.appearance);syncControls();}
  }
  async function saveSettings(event,section=currentSettingsPanel) {
    event?.preventDefault();
    if(section==='output')section='personalization';
    if(section==='services'){
      const kind=providerForField(document.activeElement);
      if(kind)await saveProvider(kind);else $('settings-message').textContent='请分别保存每项服务。';
      return;
    }
    if(!['storage','personalization','shortcuts','usage'].includes(section))return;
    if(ACTIVE_PHASES.has(snapshot?.state?.phase)){ $('settings-message').textContent='录音或处理期间不能修改设置。';return;}
    if(!bridge||savingSettings||preferencePending||operationPending||modePending||shortcutCapture?.phase==='restoring')return;
    if(shortcutCapture){savingSettings=true;syncControls();try{await endShortcutCapture('按键录制已结束。',false);}finally{savingSettings=false;syncControls();}if(operationPending||modePending)return;}
    const status=$('settings-message');status.classList.remove('error');let values;
    try{
      if(section==='shortcuts')values={shortcut:$('shortcut').value.trim(),...serializeShortcutDraft()};
      else if(section==='usage')values={usagePrices:readUsagePrices()};
      else if(section==='personalization')values={writingPreferences:$('writing-preferences').value.trim(),dictionaryPromptEnabled:$('dictionary-prompt-enabled').checked};
      else{
        const maxAudioMB=Number($('max-audio-mb').value);if(!Number.isInteger(maxAudioMB)||maxAudioMB<25||maxAudioMB>500)throw Error('音频空间上限请填写25至500 MB的整数。');
        values={saveHistory:$('save-history').checked,historyRetentionDays:Number($('settings-history-retention').value),saveAudio:$('save-audio').checked,audioRetentionDays:Number($('audio-retention').value),maxAudioMB};
        if(values.saveAudio&&!values.saveHistory)throw Error('保存原始录音需要同时开启「保存本地历史」。');
      }
    }catch(error){status.textContent=errorMessage(error);status.classList.add('error');return;}
    savingSettings=true;syncControls();
    try{
      if(section==='storage'){
        if(values.saveAudio&&!snapshot.settings.saveAudio&&!audioConsent){if(!(await requestAudioConsent()))return;audioConsent=true;}
        const destructiveChanges=[],oldRetention=snapshot.settings.historyRetentionDays||0;
        if(values.historyRetentionDays&&values.historyRetentionDays!==oldRetention&&(!oldRetention||values.historyRetentionDays<oldRetention))destructiveChanges.push(`超过 ${values.historyRetentionDays} 天的历史文字及关联录音会被删除。`);
        if(Number(snapshot.audioStats?.count)>0){
          if(values.audioRetentionDays<(snapshot.settings.audioRetentionDays||7))destructiveChanges.push(`超过 ${values.audioRetentionDays} 天的录音会被删除。`);
          if(values.maxAudioMB<(snapshot.settings.maxAudioMB||100))destructiveChanges.push(`录音空间上限降至 ${values.maxAudioMB} MB，超出的较旧录音会被删除。`);
        }
        if(destructiveChanges.length&&!(await requestConfirmation('保存并清理已有数据？',`${destructiveChanges.join('\n')}\n\n保存后现在就可能删除已有数据，无法在应用内恢复。`,'保存并清理',true)))return;
      }
      await updateSettingsSection(section,values);restoreSavedSection(section);status.textContent='此组设置已保存。尚未发送测试请求。';toast('此组设置已保存');
    }catch(error){status.textContent=errorMessage(error,'设置保存失败。');status.classList.add('error');}
    finally{savingSettings=false;syncControls();}
  }
  function requestAudioConsent() { return requestConfirmation('在本机保存原始录音？', '录音可能包含敏感内容，文件将以未加密形式保存在这台电脑，其他有权限的人可能读取。\n\n会占用磁盘空间，并按设定天数和容量上限自动清理。录音重试会重新发送到模型服务且可能再次计费。', '了解并开启'); }
  function listedMicrophones() {
    const seen = new Set();
    return knownDevices.filter(device => device.deviceId && device.deviceId !== 'default' && device.deviceId !== 'communications' && !seen.has(device.deviceId) && seen.add(device.deviceId));
  }
  function microphoneName(id) {
    if (!id) return '系统默认麦克风';
    const devices = listedMicrophones(), index = devices.findIndex(device => device.deviceId === id);
    return index < 0 ? '已选麦克风（不可用）' : devices[index].label || `麦克风 ${index + 1}（名称未提供）`;
  }
  function setDeviceOptions(selectedId) {
    const label = microphoneName(selectedId);
    $('microphone').value = selectedId; $('selected-microphone-label').textContent = label;
    $('microphone').title = '已选择：' + label;
    $('active-microphone').textContent = label;
  }
  function renderMicrophoneList() {
    const selected = snapshot?.settings?.deviceId || '', fragment = document.createDocumentFragment();
    const devices = [{ deviceId: '', label: '系统默认麦克风' }, ...listedMicrophones()];
    if (selected && !devices.some(device => device.deviceId === selected)) devices.push({ deviceId: selected, label: '已选麦克风（不可用）', unavailable: true });
    const signature = JSON.stringify([selected, devices.map(device => [device.deviceId, device.label, Boolean(device.unavailable)])]);
    if (lastMicrophoneListSignature === signature) { syncControls(); return; }
    lastMicrophoneListSignature = signature;
    const focused = $('microphone-device-list').contains(document.activeElement) ? document.activeElement.dataset.deviceId : undefined;
    const scrollTop = $('microphone-device-list').scrollTop;
    devices.forEach((device, index) => {
      const row = button('', () => void selectMicrophone(device.deviceId), 'microphone-device-row');
      row.dataset.deviceId = device.deviceId; row.dataset.unavailable = String(Boolean(device.unavailable));
      row.setAttribute('aria-pressed', String(device.deviceId === selected));
      const copy = document.createElement('span'); copy.className = 'microphone-device-copy';
      const name = document.createElement('span'); name.className = 'microphone-device-name'; name.textContent = device.label || `麦克风 ${index}（名称未提供）`;
      const note = document.createElement('span'); note.className = 'microphone-device-note';
      note.textContent = device.unavailable ? '未检测到此设备，或设备信息尚不可用；已保存选择保留。' : !device.deviceId ? '跟随系统输入设置' : '';
      const indicator = document.createElement('span'); indicator.className = 'microphone-device-indicator'; indicator.setAttribute('aria-hidden', 'true'); indicator.textContent = device.deviceId === selected ? '✓' : '';
      copy.append(name, note); row.append(copy, indicator); fragment.append(row);
    });
    $('microphone-device-list').replaceChildren(fragment); syncControls(); $('microphone-device-list').scrollTop = scrollTop;
    if (focused !== undefined && selectorSession?.kind === 'microphone' && selectorCurrent(selectorSession)) {
      const target = [...$('microphone-device-list').children].find(node => node.dataset.deviceId === focused && !node.disabled) || ($('refresh-devices').disabled ? $('close-microphone-selector') : $('refresh-devices'));
      target.focus({ preventScroll: true });
    }
  }
  async function selectMicrophone(deviceId) {
    const session = selectorSession;
    if (session?.kind !== 'microphone' || !selectorCurrent(session) || selectorBlocked() || deviceListState === 'loading') return;
    if (deviceId && !listedMicrophones().some(device => device.deviceId === deviceId)) {
      $('microphone-selector-message').textContent = '此设备已不可用，请刷新后重新选择。'; $('microphone-selector-message').classList.add('error'); return;
    }
    if (deviceId === (snapshot.settings.deviceId || '')) return;
    await commitSelector('preferences', { deviceId }, session, 'microphone-selector-message', '已保存，下次录音生效。', () => [...$('microphone-device-list').children].find(node => node.dataset.deviceId === deviceId && !node.disabled) || $('refresh-devices'));
  }
  async function refreshDevices(manual = false, session = selectorSession?.kind === 'microphone' ? selectorSession : null) {
    if (devicesDisposed) return;
    const version = ++deviceRefreshVersion;
    deviceListState = 'loading';
    if (session && selectorCurrent(session)) { $('microphone-device-status').textContent = '正在读取设备列表…'; syncControls(); }
    const currentUI = () => !devicesDisposed && version === deviceRefreshVersion && (!session || selectorCurrent(session));
    try {
      if (!navigator.mediaDevices?.enumerateDevices) throw Error('当前环境无法读取设备列表。');
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (devicesDisposed || version !== deviceRefreshVersion) return;
      const inputs = devices.filter(device => device.kind === 'audioinput');
      // Guard the real capture even when its selector has closed. No selector
      // lifecycle path releases or starts microphone resources.
      const labeled = inputs.some(device => device.label), capture = activeCapture;
      if (capture?.status === 'recording' && capture.actualDeviceId && labeled && !inputs.some(device => device.deviceId === capture.actualDeviceId)) failCapture(capture, '麦克风已断开连接。请重新连接或选择其他麦克风后重试。');
      if (!currentUI()) return;
      knownDevices = inputs; deviceListState = 'ready'; setDeviceOptions(snapshot?.settings?.deviceId || '');
      const message = !inputs.length ? '未检测到输入设备。连接设备后刷新，或保留系统默认。' : inputs.some(device => !device.label) ? '部分设备名称尚不可用。' : '';
      $('microphone-hint').textContent = message || '用于下一次录音。';
      if (session && selectorCurrent(session)) { $('microphone-device-status').textContent = message; renderMicrophoneList(); }
    } catch (error) {
      if (!currentUI()) return;
      deviceListState = 'error';
      const message = errorMessage(error, '无法读取设备列表。') + ' 已保留保存的选择，可刷新重试。';
      $('microphone-hint').textContent = message;
      if (session && selectorCurrent(session)) { $('microphone-device-status').textContent = message; renderMicrophoneList(); }
    } finally { if (currentUI()) syncControls(); }
  }
  function isCurrent(capture) {
    return activeCapture === capture && !capture.cancelled;
  }

  function publishLevel(value) {
    setLevel(value);
    if (!bridge) return;
    try { Promise.resolve(bridge.reportLevel(value)).catch(() => {}); } catch { /* UI metering must never interrupt capture. */ }
  }

  function releaseResources(capture) {
    clearTimeout(capture.limitTimer);
    clearInterval(capture.levelTimer);
    capture.intentionalStop = true;
    if (capture.stream) {
      for (const track of capture.stream.getTracks()) track.stop();
    }
    if (capture.audioContext && capture.audioContext.state !== 'closed') {
      capture.audioContext.close().catch(() => {});
    }
    if (activeCapture === capture) publishLevel(0);
  }

  function cancelCapture(sessionId) {
    const capture = activeCapture;
    if (!capture || (sessionId && capture.sessionId !== sessionId)) return;
    capture.cancelled = true; clearTimeout(capture.failureTimer);
    capture.chunks.length = 0;
    capture.intentionalStop = true;
    if (capture.recorder && capture.recorder.state !== 'inactive') {
      try { capture.recorder.stop(); } catch { /* A concurrent track end may already have stopped it. */ }
    }
    releaseResources(capture);
    if (activeCapture === capture) activeCapture = null;
  }

  async function finishFailedCapture(capture) {
    if (!isCurrent(capture) || capture.failureFinalized) return;
    capture.failureFinalized = true;
    clearTimeout(capture.failureTimer);
    releaseResources(capture);
    let audio;
    try {
      if (!capture.tooLarge && capture.startedAt && capture.chunks.length) {
        const blob = new Blob(capture.chunks, { type: capture.mimeType });
        if (blob.size > 0 && blob.size <= MAX_AUDIO_BYTES) audio = { bytes: await blob.arrayBuffer(), mimeType: capture.mimeType, durationMs: capture.durationMs };
      }
    } catch { /* Still report the failure when partial audio cannot be prepared. */ }
    capture.chunks.length = 0;
    if (!isCurrent(capture)) return;
    const payload = { sessionId: capture.sessionId, message: capture.failureMessage, ...(audio ? { audio } : {}) };
    activeCapture = null;
    try { await invoke('reportRecordingError', payload); }
    catch (error) { toast(errorMessage(error)); }
  }
  function failCapture(capture, message) {
    if (!isCurrent(capture) || capture.status === 'failing') return;
    capture.status = 'failing'; capture.failureMessage = message; capture.intentionalStop = true;
    capture.durationMs = captureElapsedMs(capture);
    lastRecordingDurationMs = capture.durationMs;
    clearTimeout(capture.limitTimer); clearInterval(capture.levelTimer); clearInterval(recordingTimer); recordingTimer = null; updateTimer();
    if (capture.recorder && (capture.startedAt || capture.recorder.state !== 'inactive')) {
      capture.failureTimer = setTimeout(() => { void finishFailedCapture(capture); }, 1500);
      try { if (capture.recorder.state !== 'inactive') capture.recorder.stop(); } catch { void finishFailedCapture(capture); }
      releaseResources(capture);
    } else { void finishFailedCapture(capture); }
  }

  function microphoneError(error) {
    switch (error?.name) {
      case 'NotAllowedError': case 'PermissionDeniedError': return '没有麦克风权限。请在 Windows「设置 → 隐私和安全性 → 麦克风」中允许桌面应用访问，然后重试。';
      case 'NotFoundError': case 'DevicesNotFoundError': return '未找到麦克风。请连接麦克风，或在设置中选择系统默认设备。';
      case 'NotReadableError': case 'TrackStartError': return '麦克风无法使用，可能被其他应用独占或已断开。请检查设备后重试。';
      case 'OverconstrainedError': return '已选麦克风不可用。请在设置中重新选择设备并保存。';
      case 'SecurityError': return '此环境不允许访问麦克风。请使用桌面应用并检查系统权限。';
      case 'AbortError': return '麦克风启动被中断，请重试。';
      default: return `录音未能开始：${errorMessage(error, '请检查麦克风及系统权限。')}`;
    }
  }

  async function startMeter(capture) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      const context = new AudioContextClass();
      capture.audioContext = context;
      const source = context.createMediaStreamSource(capture.stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      if (context.state === 'suspended') await context.resume();
      if (!isCurrent(capture) || capture.status !== 'recording') { await context.close().catch(() => {}); return; }
      const values = new Uint8Array(analyser.fftSize);
      capture.levelTimer = setInterval(() => {
        if (!isCurrent(capture) || capture.status !== 'recording') return;
        analyser.getByteTimeDomainData(values);
        let sum = 0;
        for (const sample of values) sum += ((sample - 128) / 128) ** 2;
        publishLevel(Math.min(1, Math.sqrt(sum / values.length) * 4));
      }, 100);
    } catch { /* Metering is optional. The recording remains usable without Web Audio. */ }
  }

  async function submitCapture(capture) {
    if (!isCurrent(capture)) { releaseResources(capture); return; }
    capture.durationMs = captureElapsedMs(capture);
    lastRecordingDurationMs = capture.durationMs;
    capture.status = 'submitting';
    releaseResources(capture);
    if (!capture.stopRequested) {
      failCapture(capture, '麦克风录音意外中断，未发送不完整录音。请检查设备后重试。');
      return;
    }
    try {
      const blob = new Blob(capture.chunks, { type: capture.mimeType });
      capture.chunks.length = 0;
      if (!blob.size) throw new Error('没有录到声音，请确认麦克风正常后重试。');
      if (blob.size > MAX_AUDIO_BYTES) throw new Error('录音已超过 25 MB，已中止发送。请缩短录音后重试。');
      const bytes = await blob.arrayBuffer();
      if (!isCurrent(capture)) return;
      const pcm=capture.asrBackend==='local'?await window.LocalAudio.decode(bytes,{durationMs:capture.durationMs,isCurrent:()=>isCurrent(capture)}):{};
      if(!isCurrent(capture))return;
      const version = snapshotVersion;
      const submission = bridge.submitAudio({ sessionId: capture.sessionId, bytes, mimeType: capture.mimeType, durationMs: capture.durationMs,...pcm });
      // The main process owns cancellation after the audio has crossed IPC.
      activeCapture = null;
      applyRpcSnapshot(await submission, version);
    } catch (error) {
      if (isCurrent(capture)) failCapture(capture, errorMessage(error, '录音提交失败，请重试。'));
      else if (!capture.cancelled && snapshot?.state?.sessionId === capture.sessionId && !['cancelled', 'error'].includes(snapshot?.state?.phase)) toast(errorMessage(error, '录音提交失败，请重试。'));
    }
  }

  async function stopAtLimit(capture) {
    if (!isCurrent(capture) || capture.stopRequested) return;
    try {
      // Only the main process may transition the session to stopping.
      if (RECORDING_PHASES.has(snapshot?.state?.phase)) await invoke('stop',{sessionId:capture.sessionId});
      if (isCurrent(capture) && !capture.stopRequested) stopCapture(capture.sessionId);
    } catch (error) {
      failCapture(capture, `录音已达到当前模式上限：${errorMessage(error, '结束录音失败，已安全中止。')}`);
    }
  }

  async function startCapture(command) {
    if (!bridge || !command?.sessionId) return;
    if (startedCaptureSessions.has(command.sessionId)) return;
    startedCaptureSessions.add(command.sessionId);
    if (startedCaptureSessions.size > 64) startedCaptureSessions.delete(startedCaptureSessions.values().next().value);
    if (activeCapture) cancelCapture(activeCapture.sessionId);
    lastRecordingDurationMs = 0;
    const capture = {
      sequence: ++captureSequence, sessionId: command.sessionId, status: 'starting', chunks: [], size: 0,
      cancelled: false, stopRequested: false, intentionalStop: false, stream: null, recorder: null,
      startedAt: 0, startedMono: null, asrBackend:command.asrBackend||'cloud', recordingLimits: Object.freeze({...command.recordingLimits||window.ProviderEndpoint.recordingLimits(snapshot?.settings?.asr?.protocol,undefined,command.asrBackend)}), durationMs: 0, actualDeviceId: ''
    };
    // Set the active capture before awaiting permission, so stop/cancel also work during permission prompts.
    activeCapture = capture;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('当前环境不支持录音，请使用桌面应用。');
      const mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) throw new Error('当前环境不支持 WebM/Opus 录音，请更新桌面应用。');
      const audio = { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true };
      if (command.deviceId) audio.deviceId = { exact: command.deviceId };
      const stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
      capture.stream = stream;
      if (!isCurrent(capture)) { releaseResources(capture); return; }
      if (capture.stopRequested) { failCapture(capture, '麦克风准备完成前录音已结束，请重新开始。'); return; }
      const track = stream.getAudioTracks()[0];
      if (!track || track.readyState !== 'live') throw new Error('麦克风没有可用的音频输入。');
      capture.actualDeviceId = track.getSettings?.().deviceId || '';
      for (const audioTrack of stream.getAudioTracks()) {
        audioTrack.addEventListener('ended', () => {
          if (!capture.intentionalStop) failCapture(capture, '麦克风已断开或权限被撤销。请检查设备和系统权限后重试。');
        });
      }
      stream.addEventListener('inactive', () => {
        if (!capture.intentionalStop) failCapture(capture, '麦克风输入已中断，录音已停止。请重新连接设备后重试。');
      });
      capture.mimeType = mimeType;
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 96000 });
      capture.recorder = recorder;
      recorder.addEventListener('dataavailable', (event) => {
        if (!isCurrent(capture) || capture.failureFinalized || !event.data?.size) return;
        capture.size += event.data.size;
        if (capture.size > MAX_AUDIO_BYTES) {
          capture.tooLarge = true; capture.chunks.length = 0;
          failCapture(capture, '录音已超过 25 MB，已中止发送。请缩短录音后重试。');
          return;
        }
        capture.chunks.push(event.data);
      });
      recorder.addEventListener('error', (event) => failCapture(capture, `录音发生错误：${errorMessage(event.error, '请检查麦克风后重试。')}`));
      recorder.addEventListener('stop', () => {
        if (!isCurrent(capture)) { releaseResources(capture); return; }
        if (capture.status === 'failing') void finishFailedCapture(capture);
        else if (!capture.stopRequested) { failCapture(capture, '麦克风录音意外中断，未发送不完整录音。请检查设备后重试。'); void finishFailedCapture(capture); }
        else void submitCapture(capture);
      });
      recorder.addEventListener('start', () => {
        if (!isCurrent(capture) || capture.status === 'failing') { releaseResources(capture); return; }
        if (capture.stopRequested) { failCapture(capture, '麦克风准备完成前录音已结束，请重新开始。'); return; }
        if (capture.readyReported) return;
        capture.readyReported = true;
        capture.startedAt = Date.now(); capture.startedMono = performance.now(); capture.status = 'recording';
        capture.limitTimer = setTimeout(() => { void stopAtLimit(capture); }, capture.recordingLimits.stopAfterMs);
        void invoke('recordingReady', { sessionId: capture.sessionId }).then((result) => { if (result?.accepted === false && isCurrent(capture)) failCapture(capture, '录音会话已失效，请重新开始。'); }).catch((error) => { failCapture(capture, errorMessage(error, '无法确认录音启动，请重试。')); });
        void startMeter(capture); void refreshDevices();
      });
      recorder.start(250);
    } catch (error) {
      if (isCurrent(capture)) failCapture(capture, microphoneError(error));
      else releaseResources(capture);
    }
  }

  function stopCapture(sessionId) {
    const capture = activeCapture;
    if (!capture || capture.sessionId !== sessionId || capture.cancelled || ['submitting', 'failing'].includes(capture.status)) return;
    capture.stopRequested = true;
    if (capture.status === 'starting') return;
    if (capture.recorder?.state !== 'inactive') {
      capture.status = 'stopping';
      capture.intentionalStop = true;
      clearTimeout(capture.limitTimer);
      try { capture.recorder.stop(); }
      catch (error) { failCapture(capture, errorMessage(error, '无法结束录音，请重试。')); }
    }
  }

  function onCommand(command) {
    if (!command || typeof command !== 'object') return;
    if (command.type === 'start') void startCapture(command);
    else if (command.type === 'stop') stopCapture(command.sessionId);
    else if (command.type === 'cancel') cancelCapture(command.sessionId);
  }

  function markSettingsDirty(eventOrSection) {
    if(savingSettings||preferencePending)return;
    const section=typeof eventOrSection==='string'?eventOrSection:fieldSection(eventOrSection?.target);
    if(section==='preferences'||!section)return;
    if(section==='services'){
      const kind=providerForField(eventOrSection?.target);
      if(kind)providerDiagnostics.edit(kind);
      else for(const provider of ['asr','refiner'])providerDiagnostics.edit(provider);
    }
    dirtySettingsSections.add(section);settingsDirty=true;$('settings-message').textContent='此组有未保存修改，其他分组不会随之提交。';$('settings-message').classList.remove('error');updateDestinationNotice();
    for(const service of ['asr','refiner']){$(service+'-key').disabled=$(service+'-clear').checked;if($(service+'-clear').checked)$(service+'-key').value='';}
    syncShortcutDraft();updateShortcutStatus();syncControls();
  }
  document.querySelectorAll('[data-view]').forEach((element) => element.addEventListener('click', () => showView(element.dataset.view)));
  document.querySelectorAll('[data-settings-panel]').forEach((element) => element.addEventListener('click', () => openSettings(element.dataset.settingsPanel)));
  document.querySelectorAll('[data-open-dictation]').forEach((element) => element.addEventListener('click', () => openWorkspace()));
  $('desktop-workspace-nav').addEventListener('click',()=>openWorkspace());
  $('open-session-workspace').addEventListener('click', () => openWorkspace({ recovery: true }));
  $('workspace-mode').addEventListener('change', () => changeMode($('workspace-mode').value));
  mountHomeScenarios();
  const releaseScenarioKey = event => heldScenarioKeys.delete(event.key);
  const clearScenarioKeys = () => heldScenarioKeys.clear();
  window.addEventListener('keyup', releaseScenarioKey, true); window.addEventListener('blur', clearScenarioKeys);
  unsubscribers.push(() => { scenariosDisposed = true; heldScenarioKeys.clear(); window.removeEventListener('keyup', releaseScenarioKey, true); window.removeEventListener('blur', clearScenarioKeys); });
  const resizeActivity = () =>  window.addEventListener('resize', resizeActivity); unsubscribers.push(() => window.removeEventListener('resize', resizeActivity));
  document.querySelectorAll('[data-task]').forEach((element) => element.addEventListener('click', () => { selectedTask = element.dataset.task; renderMode(); }));
  document.querySelectorAll('[data-history-filter]').forEach((element) => element.addEventListener('click', () => { historyFilter = element.dataset.historyFilter; document.querySelectorAll('[data-history-filter]').forEach((item) => { item.classList.toggle('active', item === element); item.setAttribute('aria-pressed', String(item === element)); }); renderHistory(snapshot?.history, true); }));
  document.querySelectorAll('[data-dictionary-filter]').forEach((element) => element.addEventListener('click', () => { if (selectingWords) return; dictionaryFilter = element.dataset.dictionaryFilter; document.querySelectorAll('[data-dictionary-filter]').forEach((item) => { item.classList.toggle('active', item === element); item.setAttribute('aria-pressed', String(item === element)); }); renderDictionary(true); }));
  $('open-setup').addEventListener('click', openSetup);
  $('help-open-setup').addEventListener('click', returnToSetup);
  $('return-setup').addEventListener('click', returnToSetup);
  $('setup-skip').addEventListener('click', () => leaveSetup()); $('close-setup').addEventListener('click', () => leaveSetup());
  $('setup-dialog').addEventListener('cancel', event => { event.preventDefault(); leaveSetup(); });
  $('setup-back').addEventListener('click', () => { setupStep = Math.max(0, setupStep - 1); saveSetupStep(); renderSetup(); });
  $('setup-next').addEventListener('click', () => { if (setupStep < 3) { setupStep++; saveSetupStep(); renderSetup(); } else if (setupReport()?.services.asr.configured) leaveSetup('completed'); });
  $('setup-configure').addEventListener('click', () => { setupReturn = true; closeDialog('setup-dialog'); $('return-setup').hidden = false; openSettings($('setup-configure').dataset.panel); });
  $('setup-copy').addEventListener('click', copySetupExample); $('open-current-answer').addEventListener('click', openCurrentAnswer);
  $('retry-recovery').addEventListener('click', retryRecovery); $('discard-recovery').addEventListener('click', discardRecovery);
  $('target-language').addEventListener('change', () => changeMode(selectedMode, $('target-language').value));
  $('retain-recording').addEventListener('click', requestRetainRecording);
  $('record-button').addEventListener('click', requestToggle); $('cancel-button').addEventListener('click', requestCancel); $('process-text').addEventListener('click', processText);
  $('copy-original').addEventListener('click', () => copyText(lastResult?.original)); $('copy-final').addEventListener('click', () => copyText(lastResult?.text)); $('copy-answer').addEventListener('click', () => copyText($('answer-text').textContent));
  $('refresh-devices').addEventListener('click', () => refreshDevices(true)); $('settings-form').addEventListener('input', markSettingsDirty); $('settings-form').addEventListener('change', markSettingsDirty); $('settings-form').addEventListener('submit', saveSettings);
  for(const kind of ['asr','refiner']){
    $('save-provider-'+kind).addEventListener('click',()=>saveProvider(kind));
    $('test-provider-'+kind).addEventListener('click',()=>{if(!savingSettings&&!ACTIVE_PHASES.has(snapshot?.state?.phase))void providerDiagnostics.run(kind);});
    $('cancel-provider-'+kind).addEventListener('click',()=>providerDiagnostics.cancel(kind));
    $(kind+'-url').setAttribute('aria-describedby',kind+'-final-url');
  }
  $('asr-model').setAttribute('aria-describedby','asr-model-warning');
  window.addEventListener('beforeunload',()=>providerDiagnostics.cancelAll());
  for(const id of ['appearance','language','default-mode'])$(id).addEventListener('change',()=>savePreference($(id)));
  $('save-shortcut-settings')?.addEventListener('click',event=>saveSettings(event,'shortcuts'));
  for(const [mode,key] of Object.entries({dictate:'1',translate:'2',ask:'3'}))$('reset-shortcut-'+mode)?.addEventListener('click',async()=>{if(savingSettings||preferencePending||ACTIVE_PHASES.has(snapshot?.state?.phase))return;if(inlineShortcuts()){const capture=shortcutCapture;if(!capture||capture.mode!==mode||capture.index!==0||!['capturing','releasing'].includes(capture.phase)||capture.candidate?.error)return;$(capture.inputId).value='CommandOrControl+Shift+'+key;capture.phase='releasing';await finishInlineShortcutCapture(capture);return;}if(shortcutCapture)return;draftShortcutRows[mode]=['CommandOrControl+Shift+'+key];renderShortcutRows(mode);markSettingsDirty('shortcuts');});
  const onThemeChange = () => applyTheme(settingsDirty ? $('appearance').value : snapshot?.settings?.appearance);
  systemTheme?.addEventListener?.('change', onThemeChange);
  $('close-settings').addEventListener('click', dismissSettings); $('cancel-settings').addEventListener('click', dismissSettings);
  $('settings-dialog').addEventListener('cancel', (event) => { event.preventDefault(); if (shortcutCapture) { endShortcutCapture(); return; } if (suppressCaptureCancel) { suppressCaptureCancel = false; return; } dismissSettings(); });
  for (const mode of Object.keys(modeNames)) $('add-shortcut-' + mode).addEventListener('click', () => addShortcutRow(mode));
  $('shortcut-advanced')?.addEventListener('toggle',()=>{void endShortcutCapture('',false);if(!$('shortcut-advanced').open&&typeof bridge?.updateShortcut==='function')restoreInlineShortcutDraft();for(const mode of Object.keys(modeNames))renderShortcutRows(mode);syncControls();});
  document.addEventListener('pointerdown',event=>{const capture=shortcutCapture;const remove=event.target.closest?.('[data-shortcut-remove]');if(capture?.inline&&remove&&!remove.disabled){capture.abortCommit=true;capture.pointerRemovalPending=true;capture.phase='restoring';$('settings-dialog').dataset.capturePhase='restoring';syncControls();return;}const inside=capture&&($(capture.inputId)?.closest('.shortcut-input-line')?.contains(event.target)||event.target.id==='reset-shortcut-'+capture.mode);if(!inside)cancelInlinePending();if(capture?.inline&&!inside)void endShortcutCapture('按键录制已取消，原绑定保留。',false);},true);
  $('capture-shortcut').addEventListener('click', () => beginShortcutCapture('shortcut'));
  window.addEventListener('keydown', onShortcutKeydown, true); window.addEventListener('keyup', onShortcutKeyup, true);
  const finishRemovalPointer = () => { const capture=shortcutCapture;if(!capture?.pointerRemovalPending)return;capture.pointerRemovalPending=false;setTimeout(()=>{if(shortcutCapture===capture&&!pendingInlineRemoval)void endShortcutCapture('按键录制已取消，原绑定保留。',false);},0); };
  document.addEventListener('pointerup',finishRemovalPointer,true);document.addEventListener('pointercancel',finishRemovalPointer,true);
  window.addEventListener('blur', () => { cancelInlinePending(); endShortcutCapture('窗口已失去焦点，按键录制已取消。', false); });
  $('open-language-selector').addEventListener('click', () => openSelector('language'));
  $('microphone').addEventListener('click', () => openSelector('microphone'));
  for (const kind of ['language', 'microphone']) {
    const dialog = $(kind + '-selector-dialog');
    $('close-' + kind + '-selector').addEventListener('click', () => closeSelector());
    dialog.addEventListener('cancel', event => { event.preventDefault(); if (selectorSession?.kind === kind) closeSelector(); });
    dialog.addEventListener('click', event => { if (event.target === dialog && selectorSession?.kind === kind) closeSelector(); });
    dialog.addEventListener('close', () => { if (!dialog.open && selectorSession?.kind === kind) closeSelector(); });
    dialog.addEventListener('keydown', event => {
      if (selectorSession?.kind !== kind) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeSelector(); return; }
      if (event.key !== 'Tab') return;
      const nodes = [...dialog.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')].filter(node => node.tabIndex >= 0 && visibleFocusTarget(node));
      event.preventDefault(); if (!nodes.length) return;
      const index = nodes.indexOf(document.activeElement);
      nodes[index < 0 ? (event.shiftKey ? nodes.length - 1 : 0) : (index + (event.shiftKey ? -1 : 1) + nodes.length) % nodes.length].focus();
    });
  }
  $('target-language-search').addEventListener('input', (event) => { event.stopPropagation(); renderLanguageSearch(); });
  $('target-language-search').addEventListener('change', (event) => event.stopPropagation());
  $('settings-open-dictionary').addEventListener('click', () => openSettings('dictionary'));
  $('save-audio').addEventListener('change', async () => { if ($('save-audio').checked && !snapshot?.settings?.saveAudio && !audioConsent) { const approved = await requestAudioConsent(); $('save-audio').checked = approved; audioConsent = approved; markSettingsDirty('storage'); } });
  $('history-search').addEventListener('input', () => renderHistory(snapshot?.history, true)); $('dictionary-search').addEventListener('input', () => { if (selectingWords) { $('dictionary-search').value = dictionaryQuery; return; } dictionaryQuery = $('dictionary-search').value; renderDictionary(true); }); $('history-retention').addEventListener('change', changeRetention);
  $('clear-history').addEventListener('click', () => { showDialog('clear-dialog'); $('dismiss-clear').focus(); }); $('dismiss-clear').addEventListener('click', () => closeDialog('clear-dialog'));
  $('confirm-clear').addEventListener('click', async () => { $('confirm-clear').disabled = true; const cleared = await mutation('clearHistory', undefined, '本地记录及关联录音已清除'); syncControls(); if (cleared) closeDialog('clear-dialog'); });
  $('clear-audio').addEventListener('click', async () => { if (await requestConfirmation('清除全部已存录音？', '原始录音将永久删除，无法再使用这些录音重试或导出。历史文字保留。', '清除录音', true)) await mutation('clearAudio', undefined, '已存录音已清除'); });
  $('confirm-action').addEventListener('click', () => finishConfirmation(true)); $('confirm-cancel').addEventListener('click', () => finishConfirmation(false)); $('confirm-dialog').addEventListener('cancel', (event) => { event.preventDefault(); finishConfirmation(false); });
  $('new-word').addEventListener('click', () => openWord()); $('empty-new-word').addEventListener('click', () => openWord()); $('close-word').addEventListener('click', () => closeDialog('word-dialog')); $('dismiss-word').addEventListener('click', () => closeDialog('word-dialog')); $('word-form').addEventListener('submit', saveWord); $('delete-word').addEventListener('click', () => deleteWords(editingWordId ? [editingWordId] : []));
  $('close-import').addEventListener('click', cancelImport); $('cancel-import').addEventListener('click', cancelImport); $('commit-import').addEventListener('click', commitImport); $('import-dialog').addEventListener('cancel', (event) => { event.preventDefault(); void cancelImport(); });
  $('import-dictionary').addEventListener('click', importDictionary); $('export-dictionary').addEventListener('click', exportDictionary); $('select-dictionary').addEventListener('click', () => { if (!selectingWords && visibleWords().length) setDictionarySelection(true); }); $('exit-dictionary-selection').addEventListener('click', () => setDictionarySelection(false));
  $('select-all-words').addEventListener('change', () => { if (!selectingWords) return; const checked = $('select-all-words').checked; for (const entry of visibleWords()) { if (checked) selectedWords.add(entry.id); else selectedWords.delete(entry.id); } renderDictionary(true); }); $('delete-selected-words').addEventListener('click', () => deleteWords([...selectedWords]));
  $('use-result-context').addEventListener('click', () => useContext(lastResult?.text)); $('choose-history-context').addEventListener('click', () => { $('context-search').value = ''; renderContextList(); showDialog('context-dialog'); }); $('context-search').addEventListener('input', renderContextList); $('close-context').addEventListener('click', () => closeDialog('context-dialog')); $('close-answer').addEventListener('click', () => closeDialog('answer-dialog'));
  const onDeviceChange = () => { void refreshDevices(); }; navigator.mediaDevices?.addEventListener('devicechange', onDeviceChange);
  $('close-history-answer-loading').addEventListener('click', closeHistoryAnswer);
  $('answer-dialog').addEventListener('cancel', event => { if (historyAnswer) { event.preventDefault(); closeHistoryAnswer(); } });
  $('answer-dialog').addEventListener('keydown', event => {
    if (!historyAnswer || event.key !== 'Tab') return;
    const focusable = [...$('answer-dialog').querySelectorAll('button,[tabindex],a[href],input,textarea,select')].filter(element => !element.disabled && element.tabIndex >= 0 && !element.closest('[hidden]') && getComputedStyle(element).visibility !== 'hidden');
    if (!focusable.length) { event.preventDefault(); return; }
    event.preventDefault(); const index = focusable.indexOf(document.activeElement);
    focusable[index < 0 ? (event.shiftKey ? focusable.length - 1 : 0) : (index + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length].focus();
  });
  $('answer-dialog').addEventListener('close', () => { if (!$('answer-dialog').open) clearHistoryAnswer(); });
  $('answer-dialog').addEventListener('click', event => { if (historyAnswer && event.target === $('answer-dialog')) closeHistoryAnswer(); });
  window.addEventListener('beforeunload', () => { devicesDisposed = true; deviceRefreshVersion++; closeSelector(false); clearHistoryAnswer(false); endShortcutCapture('', false); window.removeEventListener('keydown', onShortcutKeydown, true); window.removeEventListener('keyup', onShortcutKeyup, true); if (activeCapture) cancelCapture(activeCapture.sessionId); clearInterval(recordingTimer); clearTimeout(toastTimer); systemTheme?.removeEventListener?.('change', onThemeChange); navigator.mediaDevices?.removeEventListener('devicechange', onDeviceChange); for (const unsubscribe of unsubscribers) if (typeof unsubscribe === 'function') unsubscribe(); });
  if (!bridge) { renderNotices(['桌面连接未就绪。请使用应用启动程序打开 Local Dictation。']); $('save-settings').disabled = true; $('process-text').disabled = true; $('record-message').textContent = '等待桌面应用连接'; $('secure-storage-notice').textContent = '系统密钥加密状态暂不可用。'; return; }
  unsubscribers.push(bridge.onCommand(onCommand), bridge.onState(applySnapshot));
  if(typeof bridge.onUsage==='function')unsubscribers.push(bridge.onUsage(data=>usagePanel?.accept(data)));
  if (typeof bridge.onLevel === 'function') unsubscribers.push(bridge.onLevel((level) => setLevel(snapshot?.state?.phase === 'recording' ? level : 0)));
  $('text-input').addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)&&!event.shiftKey&&!event.isComposing){event.preventDefault();if(!event.repeat)void processText();}});
  $('text-input').setAttribute('aria-keyshortcuts','Control+Enter Meta+Enter');
  $('quiet-open-data-flow').addEventListener('click',()=>{$('quiet-data-flow-details').open=true;$('quiet-data-flow-details').scrollIntoView({block:'nearest'});});
  const initialVersion = snapshotVersion;
  Promise.resolve(bridge.getSnapshot()).then((value) => { applyRpcSnapshot(value, initialVersion); void refreshDevices(); }).catch((error) => renderNotices([errorMessage(error, '无法加载应用状态，请重新启动。')]));
})();
