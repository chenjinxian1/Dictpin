'use strict';
// Private, original protocol. No renderer IPC accepts these envelopes or capabilities.
const VERSION = 2;
const MAX_LINE_BYTES = 256 * 1024;
const MAX_TEXT_UNITS = 32000;
const MAX_TTL_MS = 600000;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REASON = /^[a-z][a-z0-9_]{0,79}$/;
const TERMINAL = new Set(['inserted', 'blocked', 'stale', 'unsupported', 'error', 'uncertain']);
const PRE_WRITE = new Set(['blocked', 'stale', 'unsupported', 'error']);
function invalid() { throw new TypeError('Invalid native protocol envelope'); }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function exactKeys(value, required, optional = []) {
  if (!object(value) || required.some(k => !Object.hasOwn(value, k)) || Object.keys(value).some(k => !required.includes(k) && !optional.includes(k))) invalid();
}
function id(value) { return typeof value === 'string' && GUID.test(value) && value !== '00000000-0000-0000-0000-000000000000'; }
function validText(value) {
  if (typeof value !== 'string' || !value.length || value.length > MAX_TEXT_UNITS || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) return false;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) { const next = value.charCodeAt(++i); if (!(next >= 0xdc00 && next <= 0xdfff)) return false; }
    else if (c >= 0xdc00 && c <= 0xdfff) return false;
  }
  return true;
}
function validateRequest(value) {
  const common = ['protocolVersion', 'requestId', 'type'];
  if (!object(value) || value.protocolVersion !== VERSION || !id(value.requestId)) invalid();
  if (value.type === 'dispose') exactKeys(value, common);
  else {
    if (!['capture', 'insert', 'cancel'].includes(value.type) || !id(value.sessionId) || !id(value.operationId)) invalid();
    exactKeys(value, [...common, 'sessionId', 'operationId', ...(value.type === 'insert' ? ['snapshotId', 'text'] : [])]);
    if (value.type === 'insert' && (!id(value.snapshotId) || !validText(value.text))) invalid();
  }
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') + 1 > MAX_LINE_BYTES) invalid();
  return value;
}
function encodeRequest(value) { return JSON.stringify(validateRequest(value)) + '\n'; }
function decodeLine(bytes) {
  if (!(typeof bytes === 'string' || Buffer.isBuffer(bytes) || bytes instanceof Uint8Array)) invalid();
  const buffer = typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : bytes;
  if (!buffer.byteLength || buffer.byteLength > MAX_LINE_BYTES) invalid();
  try {
    // Strict flat JSON: JSON.parse alone silently accepts duplicate keys.
    const source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer);
    let position = 0;
    const whitespace = () => { while (/[ \t\r\n]/.test(source[position] || '!')) position++; };
    const expect = char => { if (source[position++] !== char) invalid(); };
    const string = () => {
      const start = position; expect('"');
      while (position < source.length) {
        const char = source[position++];
        if (char === '"') return JSON.parse(source.slice(start, position));
        if (char === '\\') position++; // JSON.parse validates the escape and control characters.
      }
      invalid();
    };
    const value = Object.create(null); whitespace(); expect('{'); whitespace();
    if (source[position] === '}') position++;
    else while (true) {
      const key = string(); if (Object.hasOwn(value, key)) invalid();
      whitespace(); expect(':'); whitespace();
      if (source[position] === '"') value[key] = string();
      else {
        const number = /^(?:0|[1-9][0-9]*)/.exec(source.slice(position));
        if (!number) invalid(); position += number[0].length; value[key] = Number(number[0]);
        if (!Number.isSafeInteger(value[key])) invalid();
      }
      whitespace(); if (source[position] === '}') { position++; break; }
      expect(','); whitespace();
    }
    whitespace(); if (position !== source.length) invalid(); return value;
  } catch { return invalid(); }
}
function validateReady(value) {
  exactKeys(value, ['protocolVersion', 'type']);
  if (value.protocolVersion !== VERSION || value.type !== 'ready') invalid();
  return true;
}
function validateResponse(value, request) {
  validateRequest(request);
  if (request.type === 'dispose') invalid();
  const fields = ['protocolVersion', 'type', 'requestId', 'sessionId', 'operationId', 'status', 'reason'];
  const capture = request.type === 'capture' && value?.status === 'captured';
  exactKeys(value, [...fields, ...(capture ? ['snapshotId', 'expiresInMs'] : request.type === 'insert' ? ['snapshotId'] : [])]);
  if (value.protocolVersion !== VERSION || value.type !== 'result' || value.requestId !== request.requestId || value.sessionId !== request.sessionId || value.operationId !== request.operationId || typeof value.reason !== 'string' || !REASON.test(value.reason)) invalid();
  if (capture) {
    if (!id(value.snapshotId) || !Number.isSafeInteger(value.expiresInMs) || value.expiresInMs < 1 || value.expiresInMs > MAX_TTL_MS) invalid();
  } else if (request.type === 'insert') {
    if (!TERMINAL.has(value.status) || value.snapshotId !== request.snapshotId) invalid();
  } else if (!PRE_WRITE.has(value.status)) invalid();
  // Return a new, whitelisted object; no raw provider/target metadata can leak through.
  return Object.freeze(Object.fromEntries(Object.keys(value).map(k => [k, value[k]])));
}
module.exports = { VERSION, MAX_LINE_BYTES, MAX_TEXT_UNITS, MAX_TTL_MS, TERMINAL, id, validText, validateRequest, encodeRequest, decodeLine, validateReady, validateResponse };
