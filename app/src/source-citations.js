'use strict';

// Pure, bounded provider-data parsing. No fetching, DNS, Markdown parsing or
// provider request construction belongs in this module.
const MAX_TEXT = 100000;
const MAX_SOURCES = 20;
const MAX_CITATIONS = 100;
const MAX_METADATA_BYTES = 64 * 1024;
const MAX_SOURCE_IDS = 20;
const MAX_TITLE = 500;
const MAX_URL = 2048;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const URL_UNSAFE = /[\s\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069\\]/u;
const FORMATS = new Set(['none', 'openai', 'local-v1']);
const WARNING_CODES = Object.freeze([
  'invalid-format', 'invalid-metadata', 'invalid-version', 'invalid-sources',
  'invalid-source', 'invalid-source-id', 'duplicate-source-id', 'invalid-source-title',
  'source-url-rejected', 'source-limit-exceeded', 'invalid-citations',
  'invalid-citation', 'invalid-citation-range', 'citation-splits-surrogate',
  'invalid-source-ids', 'source-id-limit-exceeded', 'unknown-source-id',
  'duplicate-citation', 'citation-limit-exceeded', 'invalid-annotations',
  'unsupported-annotation', 'openai-offset-semantics-unverified',
  'openai-non-bmp-offsets-unverified', 'invalid-warning', 'disabled-metadata',
  'metadata-byte-limit-exceeded'
]);
const ALLOWED_WARNINGS = new Set(WARNING_CODES);

function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
// Only JSON-like own data properties are accepted; accessors are never invoked.
function field(value, key) {
  if (!record(value)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
}
function arrayItem(value, index) {
  const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
}
function textError(message, code, Type = TypeError) {
  const error = new Type(message); error.code = code; return error;
}
function validateText(text) {
  if (typeof text !== 'string') throw textError('回答必须是字符串。', 'empty');
  if (text.length > MAX_TEXT) throw textError('回答超过 100000 个 UTF-16 单元。', 'size', RangeError);
  if (!text.trim()) throw textError('回答没有可用文本。', 'empty');
  if (text.includes('\0')) throw textError('回答包含无效字符。', 'format');
  return text; // Deliberately retain leading/trailing whitespace and CRLF.
}
function warningCollector(initial) {
  const values = new Set();
  const add = code => { if (ALLOWED_WARNINGS.has(code)) values.add(code); };
  if (initial !== undefined) {
    if (!Array.isArray(initial)) add('invalid-warning');
    else {
      if (initial.length > WARNING_CODES.length) add('invalid-warning');
      for (let i = 0; i < Math.min(initial.length, WARNING_CODES.length); i++) {
        const code = arrayItem(initial, i);
        if (typeof code === 'string' && ALLOWED_WARNINGS.has(code)) add(code);
        else add('invalid-warning');
      }
    }
  }
  return { add, values };
}
function publicIPv4(host) {
  const parts = host.split('.');
  if (parts.length !== 4 || !parts.every(p => /^\d{1,3}$/.test(p) && +p <= 255)) return false;
  const [a, b, c] = parts.map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113));
}
function publicIPv6(host) {
  // URL already checked IPv6 syntax and canonicalized any dotted suffix.
  const halves = host.slice(1, -1).split('::');
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length > 1 && halves[1] ? halves[1].split(':') : [];
  const words = [...left, ...Array(8 - left.length - right.length).fill('0'), ...right].map(p => parseInt(p, 16));
  // Conservatively retain global-unicast literals only. Reject private, link
  // local, loopback, mapped/translated IPv4, multicast and transition prefixes.
  return (words[0] & 0xe000) === 0x2000 &&
    !(words[0] === 0x2001 && (words[1] < 0x0200 || words[1] === 0x0db8)) &&
    words[0] !== 0x2002 && words[0] !== 0x3fff;
}
function normalizeSourceUrl(value) {
  if (typeof value !== 'string' || !value || value.length > MAX_URL || URL_UNSAFE.test(value) || !/^https:\/\//i.test(value)) return undefined;
  let decoded;
  try { decoded = decodeURIComponent(value); } catch { return undefined; }
  if (CONTROL.test(decoded) || /[\u202a-\u202e\u2066-\u2069\\]/u.test(decoded)) return undefined;
  // Even an empty userinfo marker is disallowed.
  if (value.slice(value.indexOf('//') + 2).split(/[/?#]/, 1)[0].includes('@')) return undefined;
  let parsed;
  try { parsed = new URL(value); } catch { return undefined; }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.href.length > MAX_URL) return undefined;
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (!hostname || hostname.length > 253) return undefined;
  if (hostname.startsWith('[')) {
    if (!publicIPv6(hostname)) return undefined;
  } else if (/^[\d.]+$/.test(hostname)) {
    if (!publicIPv4(hostname)) return undefined;
  } else {
    const labels = hostname.split('.');
    if (labels.length < 2 || labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return undefined;
    if (/(?:^|\.)(?:localhost|local|internal|lan|home)$/.test(hostname)) return undefined;
  }
  parsed.hostname = hostname;
  return Object.freeze({ url: parsed.href, hostname });
}
function sourceRecord(input, warnings) {
  if (!record(input)) { warnings.add('invalid-source'); return undefined; }
  const id = field(input, 'id'), rawTitle = field(input, 'title');
  if (typeof id !== 'string' || !ID.test(id)) { warnings.add('invalid-source-id'); return undefined; }
  if (typeof rawTitle !== 'string' || !rawTitle.trim() || rawTitle.length > MAX_TITLE || CONTROL.test(rawTitle)) {
    warnings.add('invalid-source-title'); return undefined;
  }
  const address = normalizeSourceUrl(field(input, 'url'));
  if (!address) { warnings.add('source-url-rejected'); return undefined; }
  return Object.freeze({ id, title: rawTitle.trim(), url: address.url, hostname: address.hostname });
}
function sourcesFrom(input, warnings) {
  if (!Array.isArray(input)) { warnings.add('invalid-sources'); return []; }
  if (input.length > MAX_SOURCES) warnings.add('source-limit-exceeded');
  const sources = [], ids = new Set();
  for (let i = 0; i < Math.min(input.length, MAX_SOURCES); i++) {
    const source = sourceRecord(arrayItem(input, i), warnings);
    if (!source) continue;
    if (ids.has(source.id)) { warnings.add('duplicate-source-id'); continue; }
    ids.add(source.id); sources.push(source);
  }
  return sources;
}
function splitsSurrogate(text, offset) {
  if (offset === 0 || offset === text.length) return false;
  const before = text.charCodeAt(offset - 1), after = text.charCodeAt(offset);
  return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
}
function rangeValid(text, start, end, warnings) {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > text.length) {
    warnings.add('invalid-citation-range'); return false;
  }
  if (splitsSurrogate(text, start) || splitsSurrogate(text, end)) {
    warnings.add('citation-splits-surrogate'); return false;
  }
  return true;
}
function citationsFrom(text, input, sources, warnings) {
  if (!Array.isArray(input)) { warnings.add('invalid-citations'); return []; }
  if (input.length > MAX_CITATIONS) warnings.add('citation-limit-exceeded');
  const ids = new Set(sources.map(source => source.id)), citations = [], seen = new Set();
  for (let i = 0; i < Math.min(input.length, MAX_CITATIONS); i++) {
    const item = arrayItem(input, i);
    if (!record(item)) { warnings.add('invalid-citation'); continue; }
    const start = field(item, 'start'), end = field(item, 'end'), rawIds = field(item, 'sourceIds');
    if (!rangeValid(text, start, end, warnings)) continue;
    if (!Array.isArray(rawIds) || !rawIds.length) { warnings.add('invalid-source-ids'); continue; }
    if (rawIds.length > MAX_SOURCE_IDS) warnings.add('source-id-limit-exceeded');
    const unique = new Set();
    for (let j = 0; j < Math.min(rawIds.length, MAX_SOURCE_IDS); j++) {
      const id = arrayItem(rawIds, j);
      if (typeof id !== 'string' || !ID.test(id)) warnings.add('invalid-source-ids');
      else if (!ids.has(id)) warnings.add('unknown-source-id');
      else unique.add(id);
    }
    if (!unique.size) continue;
    const sourceIds = [...unique];
    const key = start + ':' + end + ':' + [...sourceIds].sort().join(',');
    if (seen.has(key)) { warnings.add('duplicate-citation'); continue; }
    seen.add(key); citations.push(Object.freeze({ start, end, sourceIds: Object.freeze(sourceIds) }));
  }
  return citations;
}
function finish(format, sources, citations, warnings) {
  // Item-count limits alone do not bound persistent UTF-8 size (e.g. long
  // Chinese titles and twenty long IDs repeated in one hundred citations).
  // This is an application storage budget, not a provider API limit.
  const keptSources = sources.slice();
  let keptCitations = citations.slice();
  const snapshot = () => {
    const placed = new Set(keptCitations.flatMap(citation => citation.sourceIds));
    return {
      version: 1, format, sources: keptSources, citations: keptCitations,
      warnings: [...warnings.values],
      unplacedSourceIds: keptSources.filter(source => !placed.has(source.id)).map(source => source.id)
    };
  };
  const byteLength = value => Buffer.byteLength(JSON.stringify(value), 'utf8');
  let result = snapshot();
  if (byteLength(result) > MAX_METADATA_BYTES) {
    warnings.add('metadata-byte-limit-exceeded');
    result = snapshot();
    // Preserve the useful source catalog before positional details. Recompute
    // unplaced IDs and warnings inside the same budget after every removal.
    while (keptCitations.length && byteLength(result) > MAX_METADATA_BYTES) {
      keptCitations.pop();
      result = snapshot();
    }
    while (keptSources.length && byteLength(result) > MAX_METADATA_BYTES) {
      const removed = keptSources.pop().id;
      keptCitations = keptCitations.flatMap(citation => {
        const sourceIds = citation.sourceIds.filter(id => id !== removed);
        return sourceIds.length ? [Object.freeze({ start: citation.start, end: citation.end, sourceIds: Object.freeze(sourceIds) })] : [];
      });
      result = snapshot();
    }
  }
  // All source/citation records were reconstructed and frozen by the parser.
  return Object.freeze({ ...result, sources: Object.freeze(keptSources), citations: Object.freeze(keptCitations),
    warnings: Object.freeze(result.warnings), unplacedSourceIds: Object.freeze(result.unplacedSourceIds) });
}
function warnOpenAI(text, sources, warnings) {
  if (!sources.length) return;
  warnings.add('openai-offset-semantics-unverified');
  if (/[\ud800-\udbff][\udc00-\udfff]/.test(text)) warnings.add('openai-non-bmp-offsets-unverified');
}
/** Revalidate persisted/IPC metadata against the EXACT unchanged answer. */
function validateMetadata(text, input) {
  validateText(text);
  if (input === undefined || input === null) return undefined;
  const warnings = warningCollector(field(input, 'warnings'));
  if (!record(input)) { warnings.add('invalid-metadata'); return finish('none', [], [], warnings); }
  const format = field(input, 'format');
  if (!FORMATS.has(format)) { warnings.add('invalid-format'); return finish('none', [], [], warnings); }
  if (field(input, 'version') !== 1) { warnings.add('invalid-version'); return finish(format, [], [], warnings); }
  if (format === 'none') {
    const sources = field(input, 'sources'), citations = field(input, 'citations');
    if ((Array.isArray(sources) && sources.length) || (Array.isArray(citations) && citations.length)) warnings.add('disabled-metadata');
    return finish(format, [], [], warnings);
  }
  const sources = sourcesFrom(field(input, 'sources'), warnings);
  // OpenAI documents character indices but not an interoperable Unicode unit
  // and endpoint convention. Do not invent exact highlights, even on reload.
  if (format === 'openai') {
    warnOpenAI(text, sources, warnings);
    return finish(format, sources, [], warnings);
  }
  const citations = citationsFrom(text, field(input, 'citations'), sources, warnings);
  return finish(format, sources, citations, warnings);
}
function openAIMetadata(text, annotations) {
  const warnings = warningCollector(), sources = [], byUrl = new Map();
  if (!Array.isArray(annotations)) { warnings.add('invalid-annotations'); return finish('openai', [], [], warnings); }
  if (annotations.length > MAX_CITATIONS) warnings.add('citation-limit-exceeded');
  for (let i = 0; i < Math.min(annotations.length, MAX_CITATIONS); i++) {
    const annotation = arrayItem(annotations, i);
    if (field(annotation, 'type') !== 'url_citation') { warnings.add('unsupported-annotation'); continue; }
    const citation = field(annotation, 'url_citation');
    if (!record(citation)) { warnings.add('invalid-citation'); continue; }
    const source = sourceRecord({ id: 'source-' + (sources.length + 1), title: field(citation, 'title'), url: field(citation, 'url') }, warnings);
    if (!source) continue;
    if (!byUrl.has(source.url)) {
      if (sources.length >= MAX_SOURCES) { warnings.add('source-limit-exceeded'); continue; }
      byUrl.set(source.url, source.id); sources.push(source);
    }
    // Shape/range defects can be reported without claiming a range convention.
    const start = field(citation, 'start_index'), end = field(citation, 'end_index');
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= text.length || end > text.length) warnings.add('invalid-citation-range');
  }
  warnOpenAI(text, sources, warnings);
  return finish('openai', sources, [], warnings);
}
/** Consume choices[0].message only; never infer evidence from answer text. */
function normalizeMessage(message, format = 'none') {
  const text = validateText(field(message, 'content'));
  if (format === 'none') return Object.freeze({ text });
  if (!FORMATS.has(format)) {
    const warnings = warningCollector(); warnings.add('invalid-format');
    return Object.freeze({ text, sourceMetadata: finish('none', [], [], warnings) });
  }
  if (format === 'openai') {
    const annotations = field(message, 'annotations');
    return Object.freeze(annotations === undefined ? { text } : { text, sourceMetadata: openAIMetadata(text, annotations) });
  }
  const extension = field(message, 'local_dictation');
  if (extension === undefined) return Object.freeze({ text });
  if (!record(extension)) {
    const warnings = warningCollector(); warnings.add('invalid-metadata');
    return Object.freeze({ text, sourceMetadata: finish('local-v1', [], [], warnings) });
  }
  const sourceMetadata = validateMetadata(text, {
    version: field(extension, 'version'), format: 'local-v1',
    sources: field(extension, 'sources'), citations: field(extension, 'citations')
  });
  return Object.freeze({ text, sourceMetadata });
}
module.exports = { normalizeMessage, validateMetadata, normalizeSourceUrl, WARNING_CODES, MAX_TEXT, MAX_SOURCES, MAX_CITATIONS, MAX_METADATA_BYTES };
