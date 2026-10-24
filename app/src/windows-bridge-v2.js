'use strict';
// Dormant development adapter. The application does not import it until Windows acceptance.
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { spawn } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const P = require('./windows-bridge-protocol');
const SOURCES = Object.freeze(['NativeEditTarget.cs', 'WindowsBridgeV2.cs']);
const reasonCode = value => /^[a-z][a-z0-9_]{0,79}$/.test(value) ? value : 'native_failure';
function verifyHelper(root, io = fs) {
  const read = (file, max) => {
    const full = path.join(root, file), stat = io.lstatSync(full);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > max) throw Error('invalid_helper_file');
    return io.readFileSync(full);
  };
  const manifest = JSON.parse(read('build-manifest.json', 16384).toString('utf8'));
  if (manifest.protocolVersion !== P.VERSION || manifest.helper?.file !== 'WindowsBridgeV2.exe' || !Array.isArray(manifest.sources) || manifest.sources.length !== SOURCES.length) throw Error('invalid_helper_manifest');
  const entries = [manifest.helper, ...SOURCES.map(file => {
    const matches = manifest.sources.filter(e => e.file === file);
    if (matches.length !== 1) throw Error('invalid_helper_manifest');
    return matches[0];
  })];
  for (const entry of entries) {
    if (!/^[a-f0-9]{64}$/.test(entry.sha256) || createHash('sha256').update(read(entry.file, entry.file.endsWith('.exe') ? 2 * 1024 * 1024 : 256 * 1024)).digest('hex') !== entry.sha256) throw Error('helper_hash_mismatch');
  }
  return path.join(root, 'WindowsBridgeV2.exe');
}
function createWindowsInputAdapter(options = {}) {
  const platform = options.platform || process.platform;
  const enabled = options.allowUnverifiedDevelopment === true && platform === 'win32';
  const launch = options.spawn || spawn;
  const now = options.now || (() => performance.now());
  const nativeRoot = options.nativeDir || path.join(__dirname, '..', 'native', 'v2');
  const verify = options.verifyHelper || (() => verifyHelper(nativeRoot));
  const timeout = Math.max(1, Math.min(10000, options.requestTimeoutMs || 5000));
  let child = null, ready = false, disposed = false, pending = null, snapshot = null;
  let generation = 0, captureEpoch = 0, capturing = false, captureOwner = null, buffer = Buffer.alloc(0), warm = null, finishWarm = null, readyTimer = null;
  let failureReason = enabled ? 'not_ready' : platform !== 'win32' ? 'unsupported_platform' : 'native_unverified';
  const result = (status, reason, ids = {}) => Object.freeze({ status, reason: reasonCode(reason), ...ids });
  const ids = request => ({ sessionId: request.sessionId, operationId: request.operationId, ...(request.snapshotId ? { snapshotId: request.snapshotId } : {}) });
  function stop(reason, cancellation = false) {
    failureReason = reasonCode(reason); ready = false; snapshot = null; captureEpoch++; capturing = false; captureOwner = null; buffer = Buffer.alloc(0); generation++;
    clearTimeout(readyTimer); readyTimer = null;
    const previous = child; child = null;
    if (pending) {
      const request = pending; pending = null; clearTimeout(request.timer); request.cleanup?.();
      request.resolve(result(request.request.type === 'insert' && request.submitted ? 'uncertain' : cancellation ? 'blocked' : 'error', failureReason, ids(request.request)));
    }
    const finished = finishWarm; finishWarm = null; warm = null; finished?.(false);
    try { previous?.stdin?.destroy(); previous?.kill(); } catch { /* Termination is not evidence of no write. */ }
  }
  function receive(chunk, processChild, token) {
    if (child !== processChild || token !== generation) return;
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (bytes.length + buffer.length > P.MAX_LINE_BYTES) return stop('response_oversized');
    buffer = Buffer.concat([buffer, bytes]);
    let newline;
    while ((newline = buffer.indexOf(10)) >= 0) {
      const line = buffer.subarray(0, newline); buffer = buffer.subarray(newline + 1);
      let data;
      try { data = P.decodeLine(line); } catch { return stop('invalid_response'); }
      if (!ready) {
        try { P.validateReady(data); } catch { return stop('protocol_mismatch'); }
        ready = true; failureReason = 'ready'; clearTimeout(readyTimer); readyTimer = null;
        const resolve = finishWarm; finishWarm = null; resolve?.(true);
      } else {
        if (!pending) return stop('unexpected_response');
        let checked;
        try { checked = P.validateResponse(data, pending.request); } catch { return stop('invalid_response'); }
        const completed = pending; pending = null; clearTimeout(completed.timer); completed.cleanup?.();
        completed.resolve(checked);
      }
    }
  }
  function warmUp() {
    if (disposed || !enabled) return Promise.resolve(false);
    if (ready) return Promise.resolve(true);
    if (warm) return warm;
    let resolveWarm;
    const promise = new Promise(resolve => { resolveWarm = resolve; }); warm = promise; finishWarm = resolveWarm;
    try {
      const executable = verify();
      if (typeof executable !== 'string' || !path.isAbsolute(executable)) throw Error('invalid_helper_path');
      const processChild = launch(executable, [], { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'ignore'] });
      child = processChild; buffer = Buffer.alloc(0); const token = ++generation;
      const live = () => child === processChild && generation === token;
      processChild.once('error', () => { if (live()) stop('helper_start_failed'); });
      processChild.once('exit', () => { if (live()) stop('helper_exited'); });
      processChild.stdin.on('error', () => { if (live()) stop('pipe_failed'); });
      processChild.stdout.on('error', () => { if (live()) stop('pipe_failed'); });
      processChild.stdout.on('data', data => receive(data, processChild, token));
      readyTimer = setTimeout(() => { if (live() && !ready) stop('ready_timeout'); }, timeout);
      readyTimer.unref?.();
    } catch { stop('helper_unavailable'); }
    return promise;
  }
  const abortedGetter = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted').get;
  function isAborted(signal) { return signal != null && abortedGetter.call(signal); }
  function validSignal(signal) { try { return signal == null || typeof abortedGetter.call(signal) === 'boolean'; } catch { return false; } }
  function request(type, values, signal) {
    const envelope = { protocolVersion: P.VERSION, requestId: randomUUID(), type, ...values };
    let wire;
    try { wire = P.encodeRequest(envelope); } catch { return Promise.resolve(result('blocked', 'invalid_input', ids(envelope))); }
    if (!validSignal(signal)) return Promise.resolve(result('blocked', 'invalid_signal', ids(envelope)));
    if (isAborted(signal)) return Promise.resolve(result('blocked', 'cancelled', ids(envelope)));
    if (!ready || !child || disposed) return Promise.resolve(result('blocked', failureReason, ids(envelope)));
    if (pending) return Promise.resolve(result('blocked', 'busy', ids(envelope)));
    return new Promise(resolve => {
      const processChild = child;
      const entry = { request: envelope, resolve, submitted: false, timer: null, cleanup: null }; pending = entry;
      const abort = () => { if (pending === entry) stop('cancelled', true); };
      if (signal) {
        try { EventTarget.prototype.addEventListener.call(signal, 'abort', abort, { once: true }); entry.cleanup = () => { try { EventTarget.prototype.removeEventListener.call(signal, 'abort', abort); } catch {} }; }
        catch { pending = null; stop('invalid_signal', true); resolve(result('blocked', 'invalid_signal', ids(envelope))); return; }
      }
      entry.timer = setTimeout(() => { if (pending === entry) stop('request_timeout'); }, timeout);
      entry.timer.unref?.();
      // From this point a failed write callback cannot prove that no bytes reached the helper.
      entry.submitted = true;
      try { processChild.stdin.write(wire, 'utf8', error => { if (error && pending === entry && child === processChild) stop('pipe_failed'); }); }
      catch { if (pending === entry) stop('pipe_failed'); }
    });
  }
  async function captureTarget(input = {}) {
    try { input = input && { sessionId: input.sessionId, operationId: input.operationId, signal: input.signal }; }
    catch { return result('blocked', 'invalid_input'); }
    if (!input || typeof input !== 'object' || !P.id(input.sessionId) || !P.id(input.operationId)) return result('blocked', 'invalid_input');
    if (!ready || disposed) return result('blocked', failureReason, inputIds(input));
    if (pending || capturing) return result('blocked', 'busy', inputIds(input));
    if (!validSignal(input.signal)) return result('blocked', 'invalid_signal', inputIds(input));
    if (snapshot) return result('blocked', 'snapshot_active', inputIds(input));
    if (isAborted(input.signal)) return result('blocked', 'cancelled', inputIds(input));
    capturing = true; captureOwner = inputIds(input); const started = now(), token = generation, epoch = ++captureEpoch;
    const reply = await request('capture', inputIds(input), input.signal);
    if (captureEpoch === epoch) { capturing = false; captureOwner = null; }
    if (reply.status !== 'captured') return reply;
    if (isAborted(input.signal) && generation === token) stop('cancelled', true);
    if (disposed || !ready || generation !== token || captureEpoch !== epoch) return result('stale', 'capture_expired', inputIds(input));
    const expiresAt = started + reply.expiresInMs;
    snapshot = { ...inputIds(input), snapshotId: reply.snapshotId, expiresAt };
    if (now() >= expiresAt) return result('stale', 'capture_expired', inputIds(input));
    return Object.freeze({ status: 'captured', reason: reply.reason, ...snapshot });
  }
  function inputIds(input) { return { sessionId: input.sessionId, operationId: input.operationId }; }
  async function insertText(input = {}) {
    try { input = input && { sessionId: input.sessionId, operationId: input.operationId, snapshotId: input.snapshotId, text: input.text, signal: input.signal }; }
    catch { return result('blocked', 'invalid_input'); }
    if (!input || typeof input !== 'object' || !P.id(input.sessionId) || !P.id(input.operationId) || !P.id(input.snapshotId) || !P.validText(input.text)) return result('blocked', 'invalid_input');
    const identity = { ...inputIds(input), snapshotId: input.snapshotId };
    if (pending || capturing) return result('blocked', 'busy', identity);
    if (!validSignal(input.signal)) return result('blocked', 'invalid_signal', identity);
    if (isAborted(input.signal)) return result('blocked', 'cancelled', identity);
    if (!snapshot || Object.keys(identity).some(k => snapshot[k] !== identity[k]) || now() >= snapshot.expiresAt) return result('stale', 'snapshot_unavailable', identity);
    snapshot = null; // One attempt, including cancellation or uncertainty. No automatic retry.
    return request('insert', { ...identity, text: input.text }, input.signal);
  }
  async function cancelOperation(input = {}) {
    try { input = input && { sessionId: input.sessionId, operationId: input.operationId }; }
    catch { return result('blocked', 'invalid_input'); }
    if (!input || typeof input !== 'object' || !P.id(input.sessionId) || !P.id(input.operationId)) return result('blocked', 'invalid_input');
    const identity = inputIds(input);
    if (capturing && captureOwner?.sessionId === input.sessionId && captureOwner?.operationId === input.operationId) { stop('cancelled', true); return result('blocked', 'cancelled', identity); }
    if (pending && pending.request.sessionId === input.sessionId && pending.request.operationId === input.operationId) {
      const uncertain = pending.request.type === 'insert' && pending.submitted;
      stop('cancelled', true); return result(uncertain ? 'uncertain' : 'blocked', 'cancelled', identity);
    }
    if (pending) return result('blocked', 'busy', identity);
    if (!snapshot || snapshot.sessionId !== input.sessionId || snapshot.operationId !== input.operationId) return result('stale', 'snapshot_unavailable', identity);
    snapshot = null; return request('cancel', identity);
  }
  function dispose() {
    if (disposed) return; disposed = true;
    if (child && ready && !pending) { try { child.stdin.write(P.encodeRequest({ protocolVersion: P.VERSION, requestId: randomUUID(), type: 'dispose' })); } catch {} }
    stop('disposed', true);
  }
  return Object.freeze({ warmUp, captureTarget, insertText, cancelOperation, dispose,
    capabilities: () => Object.freeze({ protocolVersion: P.VERSION, productionReady: false, enabledForDevelopment: enabled, ready: ready && !disposed, reason: failureReason }) });
}
module.exports = { createWindowsInputAdapter, verifyHelper };
