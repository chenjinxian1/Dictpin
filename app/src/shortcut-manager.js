'use strict';

const MODES = Object.freeze(['current', 'copy', 'dictate', 'translate', 'ask']);
const MAX_MODE_SHORTCUTS = 4; // Also confirmed in the original Windows shortcut-editor static evidence (V4-03).
const LABELS = { current: '通用', copy: '复制', dictate: '听写', translate: '翻译', ask: '问一问' };
const KEYS = new Map(('Space Tab Capslock Numlock Scrolllock Backspace Delete Insert Return Up Down Left Right Home End PageUp PageDown Escape VolumeUp VolumeDown VolumeMute MediaNextTrack MediaPreviousTrack MediaStop MediaPlayPause PrintScreen Plus numdec numadd numsub nummult numdiv').split(' ').map(key => [key.toLowerCase(), key]));
KEYS.set('enter', 'Return'); KEYS.set('esc', 'Escape');

/** Electron accelerators are case-insensitive; compare physical aliases before registration. */
function normalizeAccelerator(value, platform = process.platform) {
  if (typeof value !== 'string' || value.length > 100 || /[\x00-\x1f\x7f]/.test(value)) throw new Error('快捷键格式不正确。');
  const input = value.trim();
  if (!input) return '';
  const tokens = input.replace(/\+\+$/, '+Plus').split('+').map(part => part.trim());
  if (tokens.length < 2 || tokens.some(part => !part)) throw new Error('快捷键需要修饰键和一个按键，例如 Ctrl+Shift+Space。');
  const rawKey = tokens.pop().toLowerCase();
  const key = KEYS.get(rawKey) || (/^[a-z0-9]$/.test(rawKey) || /^f(?:[1-9]|1[0-9]|2[0-4])$/.test(rawKey) ? rawKey.toUpperCase() : /^num[0-9]$/.test(rawKey) ? rawKey : /^[)!@#$%^&*(:;=<>_,\-.?/\x60~{}\[\]|\\"]$/.test(rawKey) ? rawKey : '');
  if (!key) throw new Error('快捷键需要一个受支持的按键。');
  const modifiers = new Set();
  for (const token of tokens) {
    const name = token.toLowerCase(); let modifier;
    if (name === 'commandorcontrol' || name === 'cmdorctrl') modifier = platform === 'darwin' ? 'Command' : 'Control';
    else if (name === 'control' || name === 'ctrl') modifier = 'Control';
    else if (name === 'command' || name === 'cmd') { if (platform !== 'darwin') throw new Error('此平台请使用 Ctrl 或 CommandOrControl，不支持 Command。'); modifier = 'Command'; }
    else if (name === 'super' || name === 'meta') modifier = platform === 'darwin' ? 'Command' : 'Super';
    else if (name === 'option') { if (platform !== 'darwin') throw new Error('此平台请使用 Alt，不支持 Option。'); modifier = 'Alt'; }
    else if (name === 'alt') modifier = 'Alt';
    else if (name === 'altgr') modifier = 'AltGr';
    else if (name === 'shift') modifier = 'Shift';
    else throw new Error('快捷键包含不支持的修饰键。');
    if (modifiers.has(modifier)) throw new Error('快捷键修饰键不能重复。');
    modifiers.add(modifier);
  }
  return [...modifiers].sort().concat(key).join('+');
}

/**
 * Call only after Electron app.whenReady(). No Electron import or process side effects.
 * Register new physical keys before releasing old keys; mode swaps reuse registrations.
 * OS registration is not an atomic primitive: failed restoration is explicitly reported.
 * current accepts one string; explicit modes accept a string or up to four strings.
 * Empty strings/arrays disable bindings. Snapshots describe the committed map, never a
 * failed draft. Legacy fields expose the first active binding / first requested status.
 */
function createShortcutManager({ globalShortcut, onTrigger, onError, platform = process.platform } = {}) {
  if (!globalShortcut || ['register', 'unregister', 'isRegistered'].some(name => typeof globalShortcut[name] !== 'function') || typeof onTrigger !== 'function') throw new TypeError('需要 globalShortcut 和 onTrigger。');
  let assignments = new Map();
  const owned = new Map();
  let disposed = false, applying = false, recording = false, lastError = '';
  const voiceModes=new Set(['current','copy','dictate']);
  const suspendedMode=mode=>recording&&voiceModes.has(mode);

  function registered(accelerator) { return globalShortcut.isRegistered(accelerator) === true; }
  function keysFor(map) { return new Set([...map.values()].flat().map(entry => entry.key)); }
  function modeFor(key) { return [...assignments].find(([, entries]) => entries.some(entry => entry.key === key))?.[0]; }
  function snapshot() {
    const bindings = {}, statuses = {}, bindingLists = {}, statusLists = {}; let degraded = false;
    for (const mode of MODES) {
      statusLists[mode] = (assignments.get(mode) || []).map(entry => {
        let active = false, error = '';
        if (!disposed) {
          try { active = owned.has(entry.key) && registered(entry.key); }
          catch { error = '无法确认快捷键注册状态。'; }
          if (suspendedMode(mode)) {if(active){error='快捷键未能完全解除；录入期间已禁止触发。';degraded=true;}}
          else if (!active) { error ||= '快捷键未生效，请重新保存或更换组合。'; degraded = true; }
        }
        return { accelerator: entry.value, registered: active, error,...(suspendedMode(mode)?{suspended:true}:{}) };
      });
      bindingLists[mode] = statusLists[mode].filter(entry => entry.registered&&!entry.suspended).map(entry => entry.accelerator);
      bindings[mode] = bindingLists[mode][0] || '';
      statuses[mode] = statusLists[mode][0] ? { ...statusLists[mode][0] } : { accelerator: '', registered: false, error: '' };
    }
    const desired = keysFor(assignments);
    for (const key of owned.keys()) {
      if (!disposed && desired.has(key)) continue;
      try { if (registered(key)) degraded = true; } catch { degraded = true; }
    }
    return { bindings, statuses, bindingLists, statusLists, degraded, lastError,suspended:recording };
  }
  function failure(message, code, details = {}) {
    lastError = message;
    return Object.assign(new Error(message), { code, ...details, status: snapshot() });
  }
  function parse(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !MODES.includes(key))) throw failure('快捷键设置格式不正确。', 'invalid');
    const next = new Map(), occupied = new Map();
    for (const mode of MODES) {
      const supplied = input[mode] === undefined ? '' : input[mode];
      if (Array.isArray(supplied) && (['current','copy'].includes(mode) || supplied.length > MAX_MODE_SHORTCUTS)) {
        throw failure(mode === 'current' ? '通用快捷键只能设置一个组合。' : `${LABELS[mode]}最多设置 ${MAX_MODE_SHORTCUTS} 个快捷键。`, 'invalid', { mode, accelerator: '' });
      }
      const values = Array.isArray(supplied) ? supplied : [supplied], entries = [];
      for (const value of values) {
        let key;
        try { key = normalizeAccelerator(value, platform); }
        catch (error) { throw failure(`${LABELS[mode]}：${error.message}`, 'invalid', { mode, accelerator: typeof value === 'string' ? value : '' }); }
        if (!key) continue;
        if (occupied.has(key)) {
          const prefix = occupied.get(key) === mode ? `${LABELS[mode]}的快捷键列表重复` : `${LABELS[mode]}与${LABELS[occupied.get(key)]}使用了相同快捷键`;
          throw failure(`${prefix}，请换一个组合。`, 'duplicate', { mode, accelerator: value });
        }
        occupied.set(key, mode); entries.push({ key, value: value.trim() });
      }
      if (entries.length) next.set(mode, entries);
    }
    return next;
  }
  function dispatch(key) {
    if (disposed || applying) return;
    const mode = modeFor(key);
    if (!mode) return; // A registration awaiting cleanup is never allowed to trigger a mode.
    if(suspendedMode(mode))return;
    const report = () => {
      lastError = '快捷键操作未完成，请打开主窗口查看状态。';
      try { onError?.(new Error(lastError)); } catch { /* Reporting must not crash Electron. */ }
    };
    try { Promise.resolve(onTrigger(mode)).catch(report); } catch { report(); }
  }
  function add(key) {
    const record = owned.get(key) || { callback: () => dispatch(key) };
    if (owned.has(key) && registered(key)) return;
    // A key registered elsewhere in this app is not ours to unregister or replace.
    if (registered(key)) throw new Error('已被应用内其他快捷键占用。');
    try {
      const ok = globalShortcut.register(key, record.callback);
      if (registered(key)) owned.set(key, record);
      if (ok !== true || !owned.has(key) || !registered(key)) throw new Error('快捷键不可用或已被占用。');
    } catch (error) {
      // Track a partially successful native call so rollback/dispose can clean it up.
      try { if (registered(key)) owned.set(key, record); } catch { owned.set(key, record); }
      throw error;
    }
  }
  function remove(key) {
    if (!owned.has(key)) return;
    let error;
    try { globalShortcut.unregister(key); } catch (caught) { error = caught; }
    if (registered(key)) throw error || new Error('旧快捷键未能解除。');
    owned.delete(key);
  }
  function apply(input) {
    if (disposed) throw failure('快捷键管理器已关闭。', 'disposed');
    if (applying) throw failure('快捷键正在更新，请稍后重试。', 'busy');
    const next = parse(input);
    const nextKeys = keysFor(next);
    const oldKeys = keysFor(assignments);
    const beforeOwned = new Set(owned.keys());
    let failedMode, failedAccelerator, phase = 'register';
    applying = true;
    try {
      for (const [mode, entries] of next) {
        for (const entry of entries) {
          failedMode = mode; failedAccelerator = entry.value;if(!suspendedMode(mode))add(entry.key);
        }
      }
      phase = 'unregister';
      for (const key of [...owned.keys()]) if (!nextKeys.has(key)) {
        failedMode = modeFor(key); failedAccelerator = key; remove(key);
      }
      assignments = next; lastError = '';
      return snapshot();
    } catch {
      let rollbackComplete = true;
      // Keep the old mode mapping throughout rollback; never activate a partial new map.
      for (const key of [...owned.keys()]) if (!beforeOwned.has(key) && !oldKeys.has(key)) {
        try { remove(key); } catch { rollbackComplete = false; }
      }
      for (const key of oldKeys) {if(suspendedMode(modeFor(key)))continue;try { add(key); } catch { rollbackComplete = false; } }
      const status = snapshot(); if (status.degraded) rollbackComplete = false;
      const prefix = phase === 'register' ? `${LABELS[failedMode] || ''}快捷键不可用或已被占用。` : '旧快捷键未能解除。';
      throw failure(prefix + (rollbackComplete ? '原快捷键保持不变。' : '部分快捷键未恢复，请打开设置检查并重新保存。'), rollbackComplete ? 'registration_failed' : 'rollback_failed', { mode: failedMode, accelerator: failedAccelerator, rollbackComplete });
    } finally { applying = false; }
  }
  function setRecording(active){
    if(typeof active!=='boolean')throw failure('快捷键录入状态无效。','invalid');
    if(disposed)throw failure('快捷键管理器已关闭。','disposed');
    if(applying)throw failure('快捷键正在更新，请稍后重试。','busy');
    if(!active&&!recording)return snapshot();
    recording=active;applying=true;let failed=false;
    try{
      if(active){for(const key of [...owned.keys()])if(voiceModes.has(modeFor(key)))try{remove(key);}catch{failed=true;}}
      else for(const [mode,entries]of assignments)if(voiceModes.has(mode))for(const entry of entries)try{add(entry.key);}catch{failed=true;}
      lastError=failed?(active?'部分快捷键未能暂停；录入期间不会启动听写或复制。':'部分快捷键未能恢复，可能已被占用，请在设置中重新启用。'):'';
      if(failed)throw failure(lastError,active?'suspend_failed':'resume_failed');
      return snapshot();
    }finally{applying=false;}
  }
  function dispose() {
    disposed = true;recording=false; let failed = false;
    for (const key of [...owned.keys()]) { try { remove(key); } catch { failed = true; } }
    assignments.clear(); lastError = failed ? '部分快捷键未解除，退出应用后会释放。' : '';
    return snapshot();
  }
  return { apply, snapshot, setRecording, dispose };
}

module.exports = { createShortcutManager, normalizeAccelerator, MODES };
