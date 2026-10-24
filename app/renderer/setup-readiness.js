'use strict';

// Pure snapshot projection. No imports, storage, timers, network or device access.
// Browser: window.SetupReadiness.evaluate(snapshot, { mode: 'dictate' }).
// Node: require('./setup-readiness').evaluate(snapshot).
(function expose(factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window === 'object') window.SetupReadiness = api;
})(function createReadinessAPI() {
  const MODES = ['dictate', 'translate', 'ask'];
  const LABELS = { dictate: '听写', translate: '翻译', ask: 'Ask' };
  const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
  const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const bool = value => typeof value === 'boolean' ? value : null;
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
  const issue = (field, code, message) => ({ field, code, message });

  function serviceCheck(snapshot, kind, required, refinementEnabled) {
    const settings = object(object(snapshot.settings)[kind]);
    const keys = object(object(snapshot.keyStatus)[kind]);
    const title = kind === 'asr' ? '语音识别 ASR' : '文字模型 Chat';
    if(kind==='asr'&&settings.backend==='local')return {id:kind,state:'complete',title,detail:'已选择本地 SenseVoice CPU；最长 60 秒。无需 ASR Key；引擎可用性与质量尚未验证，请在服务页测试。',panel:'services',configured:true,required,host:'本机 CPU',model:'SenseVoice + Silero VAD',loopback:null,connection:'untested',issues:[],key:{state:'not-required',hasKey:null,required:false,hasStoredKey:bool(keys.hasStoredKey),persistent:false}};
    const issues = [];
    let host = '', loopback = false, urlValid = false, model = '';
    const rawURL = settings.baseUrl;
    if (typeof rawURL !== 'string' || !rawURL.trim()) {
      issues.push(issue('url', 'missing', '请填写完整的 API 地址。'));
    } else if (rawURL.length > 2048 || CONTROL.test(rawURL)) {
      issues.push(issue('url', 'invalid', 'API 地址格式不正确。'));
    } else {
      try {
        const url = new URL(rawURL.trim());
        // Keep only host: credentials, query, fragment and path are never returned.
        if (url.username || url.password || url.search || url.hash) {
          issues.push(issue('url', 'invalid', 'API 地址不能包含账号、密码、查询参数或片段。'));
        } else {
          loopback = LOOPBACK.has(url.hostname);
          if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
            issues.push(issue('url', 'invalid', 'API 地址须使用 HTTPS；仅本机回环地址可使用 HTTP。'));
          } else {
            host = url.host;
            urlValid = true;
          }
        }
      } catch {
        issues.push(issue('url', 'invalid', 'API 地址必须是完整 URL。'));
      }
    }
    if (typeof settings.model !== 'string' || !settings.model.trim()) {
      issues.push(issue('model', 'missing', '请填写模型名称。'));
    } else if (settings.model.length > 160 || CONTROL.test(settings.model)) {
      issues.push(issue('model', 'invalid', '模型名称格式不正确。'));
    } else model = settings.model.trim();

    const hasKey = bool(keys.hasKey);
    const keyOptional = urlValid && loopback;
    const keyState = hasKey === true ? 'available' : keyOptional ? 'not-required' : hasKey === false ? 'missing' : 'unknown';
    if (!keyOptional && hasKey !== true) {
      issues.push(issue('key', hasKey === false ? 'missing' : 'unknown', hasKey === false ? '远程服务需要 API Key。' : '尚未确认此服务的 API Key 状态。'));
    }
    const configured = issues.length === 0;
    const state = configured ? 'complete' : issues.some(item => item.code === 'invalid') ? 'invalid' : 'incomplete';
    const purpose = kind === 'refiner'
      ? refinementEnabled === false ? '听写整理已关闭；翻译和 Ask 仍必须配置 Chat。'
        : refinementEnabled === true ? '听写整理、翻译和 Ask 都需要 Chat。' : '听写整理开关未知；翻译和 Ask 必须配置 Chat。'
      : '录音会在结束后发送到你配置的识别服务。';
    const configurationDetail = configured
      ? `${host} · ${model}。配置齐全，尚未验证连接、模型可用性或额度。${keyOptional && hasKey !== true ? '本机回环服务可不填 Key。' : ''}`
      : `${issues.map(item => item.message).join(' ')} 尚未验证服务连接。`;
    return {
      id: kind, state, title, detail: `${configurationDetail} ${purpose}`, panel: 'services',
      configured, required, host, model, loopback: urlValid ? loopback : null,
      connection: 'untested', issues,
      key: {
        state: keyState, hasKey, required: !keyOptional,
        hasStoredKey: bool(keys.hasStoredKey),
        persistent: snapshot.secureStorage === true && hasKey === true && keys.hasStoredKey === true && keys.persistent === true
      }
    };
  }

  function modeCheck(mode, services, refinementEnabled) {
    const chatRequired = mode !== 'dictate' ? true : refinementEnabled;
    const requiredServices = ['asr', ...(chatRequired === true ? ['refiner'] : [])];
    const blockedBy = requiredServices.filter(kind => !services[kind].configured);
    if (chatRequired === null) blockedBy.push('refiner-enabled');
    const configured = blockedBy.length === 0;
    return {
      id: `mode-${mode}`, mode, title: `${LABELS[mode]}所需配置`, panel: 'services',
      state: configured ? 'complete' : chatRequired === null ? 'unknown' : 'incomplete',
      configured, requiredServices, chatRequired, blockedBy,
      detail: mode === 'dictate'
        ? chatRequired === false ? '听写仅需 ASR；文字整理已关闭。翻译和 Ask 仍需 Chat。'
          : chatRequired === true ? '听写需要 ASR 和已开启的 Chat 文字整理。' : '需确认听写的文字整理开关。'
        : `${LABELS[mode]}录音需要 ASR 和 Chat，不能通过关闭听写整理来跳过 Chat。`
    };
  }

  function shortcutText(value) {
    return typeof value === 'string' && value.length <= 100 && !/[\x00-\x1f\x7f]/.test(value) ? value.trim() : '';
  }
  function shortcutIdentity(value, platform) {
    const parts = value.replace(/\+\+$/, '+Plus').toLowerCase().split('+').map(part => part.trim());
    const key = parts.pop();
    const command = platform === 'darwin' ? 'command' : 'control';
    const aliases = { ctrl: 'control', cmd: 'command', commandorcontrol: command, cmdorctrl: command, meta: platform === 'darwin' ? 'command' : 'super', option: 'alt' };
    return parts.map(part => aliases[part] || part).sort().concat(key === 'enter' ? 'return' : key === 'esc' ? 'escape' : key).join('+');
  }
  function configuredShortcuts(settings, mode) {
    if (mode === 'current') return typeof settings.shortcut === 'string' ? [settings.shortcut].map(shortcutText).filter(Boolean) : null;
    const primary = object(settings.modeShortcuts)[mode];
    const extra = object(settings.modeShortcutAlternates)[mode];
    if (typeof primary !== 'string' || (extra !== undefined && !Array.isArray(extra))) return null;
    return [primary, ...(extra || [])].map(shortcutText).filter(Boolean);
  }
  function shortcutGroup(snapshot, mode) {
    const settings = object(snapshot.settings), status = object(snapshot.shortcutStatus);
    const configured = configuredShortcuts(settings, mode);
    const lists = object(status.statusLists), legacy = object(status.statuses);
    const listProvided = own(lists, mode);
    const known = listProvided ? Array.isArray(lists[mode]) : !!legacy[mode] && typeof legacy[mode] === 'object' && !Array.isArray(legacy[mode]);
    const rows = known ? listProvided ? lists[mode] : [legacy[mode]] : [];
    const activeLists = object(status.bindingLists), activeLegacy = object(status.bindings);
    let active = null;
    if (own(activeLists, mode)) active = Array.isArray(activeLists[mode]) ? activeLists[mode].map(shortcutText).filter(Boolean) : [];
    else if (typeof activeLegacy[mode] === 'string') active = [shortcutText(activeLegacy[mode])].filter(Boolean);
    const identity = value => shortcutIdentity(value, snapshot.platform);
    const observed = new Map();
    let malformed = false;
    for (const raw of rows) {
      const row = object(raw), accelerator = shortcutText(row.accelerator);
      if (!accelerator) { if (row.accelerator !== '') malformed = true; continue; }
      let registered = bool(row.registered);
      if (registered === true && active && !active.some(value => identity(value) === identity(accelerator))) registered = null;
      const key = identity(accelerator), previous = observed.get(key);
      if (previous && previous.registered !== registered) registered = null;
      observed.set(key, { accelerator, registered });
    }
    const registrations = [...observed.values()];
    const registeredKeys = registrations.filter(row => row.registered === true).map(row => row.accelerator);
    const unconfirmedKeys = (configured || []).filter(value => !registeredKeys.some(key => identity(value) === identity(key)));
    const failed = registrations.some(row => row.registered === false);
    const unknown = !known || malformed || registrations.some(row => row.registered === null);
    const paused = object(snapshot.shortcutCapture).active === true;
    let state;
    if (paused) state = 'paused';
    else if (registeredKeys.length) state = failed || unknown || unconfirmedKeys.length ? 'partial' : 'registered';
    else if (unknown) state = 'unknown';
    else if (failed || (configured && configured.length)) state = 'unavailable';
    else state = configured === null ? 'unknown' : 'disabled';
    const title = `${mode === 'current' ? '通用' : LABELS[mode]}快捷键`;
    const details = {
      registered: `实际已注册：${registeredKeys.join(' / ')}。`,
      partial: `实际已注册：${registeredKeys.join(' / ')}；其他组合尚未全部确认生效，请检查设置。`,
      unavailable: '没有确认已生效的组合键；请重新保存设置或换用其他组合。',
      unknown: '尚未确认系统注册状态；设置里的组合键不代表已生效。',
      disabled: '此类快捷键未启用，仍可使用界面上的录音按钮。',
      paused: '正在捕获按键，本应用的全局快捷键已暂时停用；结束后需重新确认注册状态。'
    };
    const simulation = status.simulation === true;
    const detail = simulation ? `模拟注册，未验证系统全局键。${details[state].replace('实际已注册', '模拟已注册')}` : details[state];
    return { id: `shortcut-${mode === 'current' ? 'common' : mode}`, state, title, detail, panel: 'general', simulation, sourceMode: mode, configuredKnown: configured !== null, configuredKeys: configured || [], registeredKeys, registrations, unconfirmedKeys };
  }
  function shortcutCheck(snapshot) {
    const groups = ['current', ...MODES].map(mode => shortcutGroup(snapshot, mode));
    const status = object(snapshot.shortcutStatus);
    const hasRegistration = groups.some(group => group.registeredKeys.length > 0);
    const hasError = status.degraded === true || (typeof status.lastError === 'string' && !!status.lastError.trim());
    const unfinished = groups.some(group => !['registered', 'disabled'].includes(group.state));
    const state = object(snapshot.shortcutCapture).active === true ? 'paused'
      : hasRegistration ? hasError || unfinished ? 'partial' : 'registered'
        : groups.every(group => group.state === 'disabled') && !hasError ? 'disabled'
          : hasError || groups.some(group => group.state === 'unavailable') ? 'unavailable' : 'unknown';
    const simulation = status.simulation === true;
    const detail = state === 'registered' ? '已按主进程的实际注册结果列出快捷键。'
      : state === 'disabled' ? '快捷键未启用，可使用界面上的录音按钮。'
        : state === 'paused' ? '结束按键捕获后再检查实际生效的组合键。'
          : '部分快捷键未注册或状态未知，请查看各模式的实际生效组合；仍可使用界面按钮。';
    return {
      id: 'shortcuts', state, title: '实际生效的快捷键', panel: 'general',
      simulation, detail: simulation ? `模拟注册，未验证系统全局键。${detail.replace('主进程的实际注册结果', '预览的模拟注册结果').replace('实际生效', '模拟生效')}` : detail,
      common: groups[0], dictate: groups[1], translate: groups[2], ask: groups[3], items: groups
    };
  }

  function microphoneCheck(snapshot) {
    const state = object(snapshot.state);
    const confirmed = ['recording', 'stopping'].includes(state.phase)
      && typeof state.sessionId === 'string' && !!state.sessionId.trim()
      && Number.isFinite(state.startedAt) && state.startedAt >= 0;
    // startedAt also exists for text/retry processing, so it is never proof on its own.
    const recordingError = state.phase === 'error' && object(state.result).errorCode === 'recording'
      && object(state.result).inputSource === 'recording';
    const result = { id: 'microphone', title: '麦克风', panel: 'general', ready: confirmed };
    if (confirmed) return { ...result, state: 'ready', detail: '本次录音已实际启动，并由主进程确认麦克风就绪。', evidence: 'current-recording-ready' };
    if (state.phase === 'starting') return { ...result, state: 'pending', detail: '正在等待本次录音实际启动；尚未确认麦克风可用。', evidence: 'starting' };
    if (recordingError) return { ...result, state: 'error', detail: '最近一次录音未正常完成；请检查麦克风、权限和设备状态后重试。', evidence: 'recording-error' };
    return { ...result, state: 'untested', detail: '尚未测试，或本页当前未观察到可确认的就绪结果。配置齐全不代表麦克风可用。开始录音才会实际请求麦克风。', evidence: 'none' };
  }

  function storageCheck(snapshot) {
    const available = bool(snapshot.secureStorage);
    return {
      id: 'secure-storage', state: available === true ? 'available' : available === false ? 'unavailable' : 'unknown',
      title: '系统密钥安全存储', panel: 'services', available,
      detail: available === true ? '系统密钥加密可用。仅选择保存的 API Key 会加密保存；历史、词典和录音不会因此加密。'
        : available === false ? '系统安全存储不可用。API Key 仅供当前应用会话使用，退出后需重新填写；不会降级为明文保存。'
          : '系统安全存储状态未知，尚不能确认 API Key 可以安全持久保存。'
    };
  }
  function privacyCheck(snapshot) {
    const settings = object(snapshot.settings), audioStats = object(snapshot.audioStats);
    const saveHistory = bool(settings.saveHistory), saveAudio = bool(settings.saveAudio);
    const historyDays = [0, 1, 7, 30, 90, 365].includes(settings.historyRetentionDays) ? settings.historyRetentionDays : null;
    const audioDays = [1, 7, 30, 90].includes(settings.audioRetentionDays) ? settings.audioRetentionDays : null;
    const audioLimitMB = Number.isInteger(settings.maxAudioMB) && settings.maxAudioMB >= 25 && settings.maxAudioMB <= 500 ? settings.maxAudioMB : null;
    const history = {
      id: 'history-privacy', title: '本地历史', panel: 'storage', state: saveHistory === true ? 'enabled' : saveHistory === false ? 'disabled' : 'unknown',
      enabled: saveHistory, encrypted: false, existingCount: Array.isArray(snapshot.history) ? snapshot.history.length : null, retentionDays: historyDays,
      detail: saveHistory === true ? `新历史文字将以明文保存在本机，最多 200 条；${historyDays === null ? '保留期限未知' : historyDays === 0 ? '不按天自动清理' : `保留 ${historyDays} 天`}。`
        : saveHistory === false ? '已关闭新增历史。此前保存的本地文字仍可能存在，可在历史页面查看或清除。'
          : '本地历史保存开关未知；不能据此断言没有保存历史。'
    };
    const inconsistentAudio = saveAudio === true && saveHistory !== true;
    const audio = {
      id: 'audio-privacy', title: '原始录音留存', panel: 'storage',
      state: inconsistentAudio ? 'invalid' : saveAudio === true ? 'enabled' : saveAudio === false ? 'disabled' : 'unknown',
      enabled: inconsistentAudio ? null : saveAudio, encrypted: false,
      existingCount: count(audioStats.count), existingBytes: count(audioStats.bytes), retentionDays: audioDays, limitMB: audioLimitMB,
      detail: inconsistentAudio ? '录音保存要求同时开启本地历史；当前保存配置不完整。'
        : saveAudio === true ? `原始录音将以未加密文件保存在本机；${audioDays === null ? '保留期限未知' : `保留 ${audioDays} 天`}，${audioLimitMB === null ? '容量上限未知' : `总容量上限 ${audioLimitMB} MB`}。`
          : saveAudio === false ? '不新增持久保存的原始录音。已有音频仍可能存在；录音故障恢复可在内存中临时保留一段音频，最长 5 分钟。'
            : '原始录音保存开关未知；不能据此断言音频未保存。'
    };
    const delivery = {
      id: 'delivery-privacy', title: '发送与复制', panel: 'help', state: 'info',
      detail: '本检查不联网、不开麦。结束录音后音频发往配置的 ASR；翻译、Ask 或开启整理时文字发往 Chat。结果需核对后手动复制，不自动回填其他应用。'
    };
    return { items: [history, audio, delivery], history, audio, delivery, summary: '本地历史、词典和可选录音为明文，不提供云同步。关闭保存不等于清除已有数据；删除也不等于物理安全擦除。服务商的留存与费用政策另行适用。' };
  }

  /**
   * Takes src/main.js snapshot(), not an unsaved form draft. Key material and raw
   * error messages are never copied. UI must render title/detail with textContent.
   * configurationReady covers required API configuration only, not connectivity,
   * microphone permission, shortcut registration or a guarantee a task will work.
   */
  function evaluate(input, options) {
    const snapshot = object(input), settings = object(snapshot.settings), opts = object(options);
    const requestedMode = own(opts, 'mode') ? opts.mode : settings.mode;
    const mode = MODES.includes(requestedMode) ? requestedMode : null;
    const refinementEnabled = bool(object(settings.refiner).enabled);
    const chatRequired = mode === null ? null : mode !== 'dictate' ? true : refinementEnabled;
    const services = {
      asr: serviceCheck(snapshot, 'asr', mode !== null, refinementEnabled),
      refiner: serviceCheck(snapshot, 'refiner', chatRequired, refinementEnabled)
    };
    const modes = Object.fromEntries(MODES.map(name => [name, modeCheck(name, services, refinementEnabled)]));
    const selected = mode === null ? null : modes[mode];
    const shortcuts = shortcutCheck(snapshot), microphone = microphoneCheck(snapshot);
    const secureStorage = storageCheck(snapshot), privacy = privacyCheck(snapshot);
    const configurationReady = selected !== null && selected.configured;
    return {
      version: 1, scope: 'local-configuration', mode, configurationReady,
      requiredServices: selected ? [...selected.requiredServices] : [],
      summary: mode === null ? '尚未确认当前模式。仅检查本地快照，不测试网络或麦克风。'
        : configurationReady ? `${LABELS[mode]}所需服务配置齐全；连接、模型、额度和麦克风仍需实际使用验证。`
          : `${LABELS[mode]}所需服务配置尚不完整，请检查下列条目。`,
      services, modes, shortcuts, microphone, secureStorage, privacy,
      items: [services.asr, services.refiner, ...shortcuts.items, microphone, secureStorage, ...privacy.items]
    };
  }

  return Object.freeze({ evaluate });
});
