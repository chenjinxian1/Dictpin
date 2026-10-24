'use strict';

// Public fixed destinations from docs/qa-home-layout-20261018/SCENARIO-NEXT-SCOPE.md.
// Keep the original URL literals, including chat.openai.com. Reachability, current
// redirects and login requirements have not been verified. No input integration,
// native application launch, remote icon loading or network probe is implied.
// Browser: window.ScenarioCatalog. Node: require('./scenario-catalog').
(function expose(factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window === 'object') window.ScenarioCatalog = api;
})(function createScenarioCatalog() {
  const entries = Object.freeze([
    ['gmail', 'Gmail', 'https://mail.google.com/', '打开邮箱网页，查看和整理邮件。', 'G'],
    ['slack', 'Slack', 'https://app.slack.com/', '打开团队沟通网页。', 'S'],
    ['chatgpt', 'ChatGPT', 'https://chat.openai.com/', '打开对话网页，继续你的思路。', 'CG'],
    ['google-docs', 'Google Docs', 'https://docs.google.com/', '打开在线文档网页。', 'GD'],
    ['whatsapp', 'WhatsApp', 'https://web.whatsapp.com/', '打开消息沟通网页。', 'W'],
    ['claude', 'Claude', 'https://claude.ai/', '打开助手对话网页。', 'C'],
    ['notion', 'Notion', 'https://www.notion.so/', '打开笔记与项目网页。', 'N'],
    ['line', 'Line', 'https://line.me/', '打开 Line 官方网页。', 'L'],
    ['gemini', 'Gemini', 'https://gemini.google.com/', '打开灵感与对话网页。', 'GM']
  ].map(([id, name, url, description, initials]) => Object.freeze({ id, name, url, description, initials })));
  function find(id) { return typeof id === 'string' ? entries.find(entry => entry.id === id) : undefined; }
  return Object.freeze({ entries, find });
});
