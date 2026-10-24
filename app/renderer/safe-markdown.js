'use strict';

// Original generic Markdown support. This intentionally small grammar is not a
// CommonMark implementation or a claim of parity with another application's UI.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SafeAnswerMarkdown = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const LIMITS = Object.freeze({
    inputCharacters: 100000, // UTF-16 code units, matching the host validation.
    lines: 8192,
    blocks: 512, // Paragraphs, headings, code blocks, lists AND list items.
    nodes: 4096, // Includes text nodes, the fragment and its wrapper.
    inlineDepth: 8,
    bracketDepth: 8,
    fenceLength: 16,
    languageLength: 32
  });
  const ALLOWED_TAGS = new Set([
    'div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'strong', 'em', 'pre', 'code'
  ]);
  const SPACE = /\s/u;
  const ASCII_WORD = /[A-Za-z0-9]/;
  const ESCAPABLE = '\\`*_[]()!<>#+-.~';

  // Only these private, locally raised parse failures select plain-text mode.
  class ParseLimit extends Error {
    constructor(reason) { super(reason); this.reason = reason; }
  }
  function fail(reason) { throw new ParseLimit(reason); }
  function requireDocument(document) {
    if (!document || document.nodeType !== 9 ||
        typeof document.createElement !== 'function' ||
        typeof document.createDocumentFragment !== 'function') {
      throw new TypeError('A DOM document is required');
    }
  }
  function safePrefix(text) {
    let end = Math.min(text.length, LIMITS.inputCharacters);
    // Do not introduce an unmatched surrogate by truncating a valid emoji.
    if (end < text.length && end > 0) {
      const last = text.charCodeAt(end - 1), next = text.charCodeAt(end);
      if (last >= 0xD800 && last <= 0xDBFF && next >= 0xDC00 && next <= 0xDFFF) end--;
    }
    return text.slice(0, end);
  }
  function plain(document, source, reason, truncated) {
    const fragment = document.createDocumentFragment();
    const wrapper = document.createElement('div');
    wrapper.className = 'safe-answer-markdown';
    wrapper.dataset.markdownMode = 'plain';
    wrapper.dataset.markdownReason = reason;
    const content = document.createElement('pre');
    content.className = 'safe-answer-markdown-plain';
    content.textContent = source;
    wrapper.appendChild(content);
    if (truncated) {
      const notice = document.createElement('p');
      notice.className = 'safe-answer-markdown-notice';
      notice.textContent = 'Preview limited to 100,000 characters.';
      wrapper.appendChild(notice);
    }
    fragment.appendChild(wrapper);
    return { fragment, mode: 'plain', reason, truncated: !!truncated };
  }
  function splitLines(source) {
    const lines = [];
    let start = 0;
    for (let at = 0; at <= source.length; at++) {
      if (at !== source.length && source[at] !== '\r' && source[at] !== '\n') continue;
      let next = at + 1;
      if (source[at] === '\r' && source[at + 1] === '\n') next++;
      if (lines.length === LIMITS.lines) fail('line-limit');
      // Offsets always address the original source in UTF-16 code units. Never
      // derive them from displayed text (which omits markers and folds CRLF).
      lines.push({ text: source.slice(start, at), start, next: Math.min(next, source.length) });
      at = next - 1;
      start = next;
    }
    return lines;
  }
  function fenceStart(text) {
    let at = 0;
    while (at < 3 && text[at] === ' ') at++;
    const character = text[at];
    if (character !== '`' && character !== '~') return null;
    const start = at;
    while (text[at] === character) at++;
    if (at - start < 3) return null;
    if (at - start > LIMITS.fenceLength) fail('fence-limit');
    const language = text.slice(at).trim();
    if (language.length > LIMITS.languageLength || !/^[A-Za-z0-9_+.-]*$/.test(language)) {
      fail('unsupported-fence');
    }
    return { character, length: at - start };
  }
  function closesFence(text, fence) {
    let at = 0;
    while (at < 3 && text[at] === ' ') at++;
    const start = at;
    while (text[at] === fence.character) at++;
    const length = at - start;
    return length >= fence.length && length <= LIMITS.fenceLength && /^[ \t]*$/.test(text.slice(at));
  }
  function classify(text) {
    if (/^[ \t]*$/.test(text)) return { type: 'blank' };
    if (/^(?: {4}|\t)/.test(text)) fail('unsupported-indentation');
    if (/^ {0,3}>/.test(text) || /^ {0,3}(?:={3,}|-{3,})[ \t]*$/.test(text)) {
      fail('unsupported-block');
    }
    // Lists are deliberately single-level. Never silently flatten nested lists.
    if (/^[ \t]+(?:[-+*][ \t]|[0-9]{1,9}[.)][ \t])/.test(text)) fail('unsupported-list-nesting');
    if (/^ {0,3}[0-9]{1,9}\)[ \t]/.test(text)) fail('unsupported-list-marker');
    const fence = fenceStart(text);
    if (fence) return { type: 'fence', fence };
    if (/^ {0,3}#{7,}[ \t]/.test(text)) fail('unsupported-heading');
    const heading = /^ {0,3}(#{1,6})[ \t]+(.*)$/.exec(text);
    if (heading) return { type: 'heading', level: heading[1].length, text: heading[2] };
    const unordered = /^[-+*][ \t]+(.*)$/.exec(text);
    if (unordered) return { type: 'list', tag: 'ul', text: unordered[1] };
    const ordered = /^([0-9]{1,9})\.[ \t]+(.*)$/.exec(text);
    if (ordered) return { type: 'list', tag: 'ol', start: Number(ordered[1]), text: ordered[2] };
    return { type: 'paragraph' };
  }
  function isSpace(character) { return !character || SPACE.test(character); }
  function isWord(character) { return !!character && ASCII_WORD.test(character); }

  // Preserve bracketed text/links/images as opaque visible text. Each scanned
  // character is consumed, including malformed tails; there is no rescanning.
  function bracketEnd(text, start) {
    let depth = 0, at = start;
    for (; at < text.length; at++) {
      if (text[at] === '\\' && at + 1 < text.length) { at++; continue; }
      if (text[at] === '[' && ++depth > LIMITS.bracketDepth) fail('bracket-depth-limit');
      if (text[at] === ']' && --depth === 0) { at++; break; }
    }
    if (text[at] !== '(') return at;
    depth = 0;
    for (; at < text.length; at++) {
      if (text[at] === '\\' && at + 1 < text.length) { at++; continue; }
      if (text[at] === '(' && ++depth > LIMITS.bracketDepth) fail('bracket-depth-limit');
      if (text[at] === ')' && --depth === 0) return at + 1;
    }
    return at;
  }
  function parse(document, source) {
    let nodes = 0, blocks = 0;
    function countNode() { if (++nodes > LIMITS.nodes) fail('node-limit'); }
    function element(tag) {
      if (!ALLOWED_TAGS.has(tag)) throw new TypeError('Unsupported DOM tag');
      countNode();
      return document.createElement(tag);
    }
    function addText(parent, text) {
      if (!text) return;
      countNode();
      parent.appendChild(document.createTextNode(text));
    }
    function block(tag, parent, start, end) {
      if (++blocks > LIMITS.blocks) fail('block-limit');
      const node = element(tag);
      if (Number.isSafeInteger(start) && Number.isSafeInteger(end)) {
        node.dataset.sourceStart = String(start);
        node.dataset.sourceEnd = String(end);
      }
      parent.appendChild(node);
      return node;
    }
    function inline(parent, text) {
      const stack = [{ node: parent, marker: '' }];
      let at = 0, plainStart = 0;
      const current = () => stack[stack.length - 1].node;
      const flush = end => addText(current(), text.slice(plainStart, end));
      while (at < text.length) {
        const character = text[at];
        if (character === '[' || character === '<') {
          flush(at);
          let end;
          if (character === '[') end = bracketEnd(text, at);
          else { const closing = text.indexOf('>', at + 1); end = closing < 0 ? text.length : closing + 1; }
          addText(current(), text.slice(at, end));
          at = end; plainStart = at; continue;
        }
        if (character === '\\' && at + 1 < text.length && ESCAPABLE.includes(text[at + 1])) {
          flush(at); addText(current(), text[at + 1]); at += 2; plainStart = at; continue;
        }
        if (character === '`') {
          flush(at);
          if (text[at + 1] === '`') fail('unsupported-inline-code');
          const end = text.indexOf('`', at + 1);
          if (end < 0) fail('unclosed-inline-code');
          if (text[end + 1] === '`') fail('unsupported-inline-code');
          const code = element('code');
          addText(code, text.slice(at + 1, end)); current().appendChild(code);
          at = end + 1; plainStart = at; continue;
        }
        if (character !== '*' && character !== '_') { at++; continue; }
        let end = at + 1;
        while (text[end] === character) end++;
        const length = end - at;
        if (length > 2) fail('unsupported-emphasis-run');
        const marker = text.slice(at, end), before = text[at - 1], after = text[end];
        if (character === '_' && isWord(before) && isWord(after)) { at = end; continue; }
        const canOpen = !isSpace(after), canClose = !isSpace(before);
        if (canClose && stack[stack.length - 1].marker === marker) {
          flush(at); stack.pop(); at = end; plainStart = at; continue;
        }
        if (canClose && stack.some(frame => frame.marker === marker)) fail('crossed-emphasis');
        if (canOpen) {
          if (stack.length > LIMITS.inlineDepth) fail('inline-depth-limit');
          flush(at);
          const node = element(length === 2 ? 'strong' : 'em');
          current().appendChild(node); stack.push({ node, marker });
          at = end; plainStart = at; continue;
        }
        at = end;
      }
      flush(text.length);
      if (stack.length !== 1) fail('unclosed-emphasis');
    }

    const lines = splitLines(source);
    countNode();
    const fragment = document.createDocumentFragment(), wrapper = element('div');
    wrapper.className = 'safe-answer-markdown';
    wrapper.dataset.markdownMode = 'markdown';
    fragment.appendChild(wrapper);
    let at = 0;
    while (at < lines.length) {
      const item = classify(lines[at].text);
      if (item.type === 'blank') { at++; continue; }
      if (item.type === 'heading') {
        inline(block('h' + item.level, wrapper, lines[at].start, lines[at].next), item.text); at++; continue;
      }
      if (item.type === 'fence') {
        const start = lines[at].next;
        let end = at + 1;
        while (end < lines.length && !closesFence(lines[end].text, item.fence)) end++;
        if (end === lines.length) fail('unclosed-fence');
        const pre = block('pre', wrapper, lines[at].start, lines[end].next), code = element('code');
        // Preserve the original line endings inside a closed fenced code block.
        addText(code, source.slice(start, lines[end].start)); pre.appendChild(code);
        at = end + 1; continue;
      }
      if (item.type === 'list') {
        const list = block(item.tag, wrapper);
        if (item.tag === 'ol' && item.start !== 1) list.setAttribute('start', String(item.start));
        while (at < lines.length) {
          const next = classify(lines[at].text);
          if (next.type !== 'list' || next.tag !== item.tag) break;
          inline(block('li', list, lines[at].start, lines[at].next), next.text); at++;
        }
        continue;
      }
      const paragraphStart = lines[at].start, paragraph = [lines[at++].text];
      while (at < lines.length && classify(lines[at].text).type === 'paragraph') paragraph.push(lines[at++].text);
      inline(block('p', wrapper, paragraphStart, lines[at - 1].next), paragraph.join('\n'));
    }
    return { fragment, mode: 'markdown', reason: null, truncated: false };
  }
  function build(document, source) {
    requireDocument(document);
    // Never stringify arbitrary objects or let their getters/toString execute.
    if (typeof source !== 'string') return plain(document, '', 'invalid-input', false);
    if (source.length > LIMITS.inputCharacters) return plain(document, safePrefix(source), 'input-limit', true);
    try { return parse(document, source); }
    catch (error) {
      if (!(error instanceof ParseLimit)) throw error;
      return plain(document, source, error.reason, false);
    }
  }
  function render(document, source) { return build(document, source).fragment; }
  function renderInto(target, source) {
    if (!target || target.nodeType !== 1 || typeof target.replaceChildren !== 'function') {
      throw new TypeError('A target element is required');
    }
    const result = build(target.ownerDocument, source);
    target.replaceChildren(result.fragment);
    return Object.freeze({ mode: result.mode, reason: result.reason, truncated: result.truncated });
  }
  return Object.freeze({ render, renderInto, LIMITS });
});
