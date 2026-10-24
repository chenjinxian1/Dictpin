'use strict';

// Pure, shared output-language menu data. No network, storage or provider capability claims.
// The 109 rows come only from docs/reference/rea-round3/round3-language-catalog-facts.json.
// Their order and spelling are preserved. Compatibility labels are an independent local policy.
// Browser: window.OutputLanguages. Node: require('./output-languages').
(function expose(factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window === 'object') window.OutputLanguages = api;
})(function createOutputLanguages() {
  const MAX_QUERY_LENGTH = 256;
  const MAX_CODE_LENGTH = 35;
  const MAX_COMPATIBILITY_CODES = 128;
  // Match this application's stored target-code syntax, without canonicalizing or trimming.
  // This is input validation, not a complete BCP 47 parser or a provider-support check.
  const CODE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/;
  const entry = ([code, baseLanguage, nativeLabel, englishLabel, zhLabel]) => Object.freeze({
    code, baseLanguage, nativeLabel, englishLabel, zhLabel
  });
  const entries = Object.freeze([
    ["en-US", "en", "English (US)", "English (US)", "英语（美国）"],
    ["en-GB", "en", "English (UK)", "English (UK)", "英语（英国）"],
    ["en-AU", "en", "English (AU)", "English (AU)", "英语（澳大利亚）"],
    ["en-CA", "en", "English (CA)", "English (CA)", "英语（加拿大）"],
    ["zh-CN", "zh", "简体中文（中国大陆）", "Simplified Chinese (Mainland China)", "简体中文（中国大陆）"],
    ["zh-HK", "zh", "繁體中文 (香港)", "Traditional Chinese (Hong Kong)", "繁体中文（香港）"],
    ["zh-TW", "zh", "繁體中文 (台灣)", "Traditional Chinese (Taiwan)", "繁体中文（台湾）"],
    ["ar-EG", "ar", "العربية (مصر)", "Arabic (Egypt)", "阿拉伯语（埃及）"],
    ["ar-SA", "ar", "العربية (السعودية)", "Arabic (Saudi Arabia)", "阿拉伯语（沙特阿拉伯）"],
    ["fr-FR", "fr", "Français (France)", "French (France)", "法语（法国）"],
    ["fr-CA", "fr", "Français (Canada)", "French (Canada)", "法语（加拿大）"],
    ["nb", "nb", "Norsk bokmål", "Norwegian (Bokmål)", "挪威语（书面挪威语）"],
    ["pt-PT", "pt", "Português (Portugal)", "Portuguese (Portugal)", "葡萄牙语（葡萄牙）"],
    ["pt-BR", "pt", "Português (Brasil)", "Portuguese (Brazil)", "葡萄牙语（巴西）"],
    ["es-MX", "es", "Español (México)", "Spanish (Mexico)", "西班牙语（墨西哥）"],
    ["es-ES", "es", "Español (España)", "Spanish (Spain)", "西班牙语（西班牙）"],
    ["es-US", "es", "Español (Estados Unidos)", "Spanish (United States)", "西班牙语（美国）"],
    ["af", "af", "Afrikaans", "Afrikaans", "南非荷兰语"],
    ["sq", "sq", "shqip", "Albanian", "阿尔巴尼亚语"],
    ["am", "am", "አማርኛ", "Amharic", "阿姆哈拉语"],
    ["hy", "hy", "հայերեն", "Armenian", "亚美尼亚语"],
    ["as", "as", "অসমীয়া", "Assamese", "阿萨姆语"],
    ["az", "az", "azərbaycan", "Azerbaijani", "阿塞拜疆语"],
    ["ba", "ba", "башҡорт теле", "Bashkir", "巴什基尔语"],
    ["eu", "eu", "euskara", "Basque", "巴斯克语"],
    ["be", "be", "беларуская", "Belarusian", "白俄罗斯语"],
    ["bn", "bn", "বাংলা", "Bengali", "孟加拉语"],
    ["bs", "bs", "bosanski", "Bosnian", "波斯尼亚语"],
    ["br", "br", "brezhoneg", "Breton", "布列塔尼语"],
    ["bg", "bg", "български", "Bulgarian", "保加利亚语"],
    ["my", "my", "မြန်မာ", "Burmese", "缅甸语"],
    ["ca", "ca", "català", "Catalan", "加泰罗尼亚语"],
    ["hr", "hr", "hrvatski", "Croatian", "克罗地亚语"],
    ["cs", "cs", "čeština", "Czech", "捷克语"],
    ["da", "da", "dansk", "Danish", "丹麦语"],
    ["nl", "nl", "Nederlands", "Dutch", "荷兰语"],
    ["et", "et", "eesti", "Estonian", "爱沙尼亚语"],
    ["fo", "fo", "føroyskt", "Faroese", "法罗语"],
    ["fi", "fi", "suomi", "Finnish", "芬兰语"],
    ["gl", "gl", "galego", "Galician", "加利西亚语"],
    ["ka", "ka", "ქართული", "Georgian", "格鲁吉亚语"],
    ["de", "de", "Deutsch", "German", "德语"],
    ["el", "el", "Ελληνικά", "Greek", "希腊语"],
    ["gu", "gu", "ગુજરાતી", "Gujarati", "古吉拉特语"],
    ["ht", "ht", "Haitian Creole", "Haitian Creole", "海地克里奥尔语"],
    ["ha", "ha", "Hausa", "Hausa", "豪萨语"],
    ["haw", "haw", "ʻŌlelo Hawaiʻi", "Hawaiian", "夏威夷语"],
    ["he", "he", "עברית", "Hebrew", "希伯来语"],
    ["hi", "hi", "हिन्दी", "Hindi", "印地语"],
    ["hu", "hu", "magyar", "Hungarian", "匈牙利语"],
    ["is", "is", "íslenska", "Icelandic", "冰岛语"],
    ["id", "id", "bahasa Indonesia", "Indonesian", "印尼语"],
    ["it", "it", "italiano", "Italian", "意大利语"],
    ["ja", "ja", "日本語", "Japanese", "日语"],
    ["jv", "jv", "Jawa", "Javanese", "爪哇语"],
    ["kn", "kn", "ಕನ್ನಡ", "Kannada", "卡纳达语"],
    ["kk", "kk", "қазақ тілі", "Kazakh", "哈萨克语"],
    ["km", "km", "ខ្មែរ", "Khmer", "高棉语"],
    ["ko", "ko", "한국어", "Korean", "韩语"],
    ["lo", "lo", "ລາວ", "Lao", "老挝语"],
    ["la", "la", "Lingua latina", "Latin", "拉丁语"],
    ["lv", "lv", "latviešu", "Latvian", "拉脱维亚语"],
    ["ln", "ln", "lingála", "Lingala", "林加拉语"],
    ["lt", "lt", "lietuvių", "Lithuanian", "立陶宛语"],
    ["lb", "lb", "Lëtzebuergesch", "Luxembourgish", "卢森堡语"],
    ["mk", "mk", "македонски", "Macedonian", "马其顿语"],
    ["mg", "mg", "Malagasy", "Malagasy", "马尔加什语"],
    ["ms", "ms", "bahasa Malaysia", "Malay", "马来语"],
    ["ml", "ml", "മലയാളം", "Malayalam", "马拉雅拉姆语"],
    ["mt", "mt", "Malti", "Maltese", "马耳他语"],
    ["mr", "mr", "मराठी", "Marathi", "马拉地语"],
    ["mn", "mn", "монгол", "Mongolian", "蒙古语"],
    ["mi", "mi", "Māori", "Māori", "毛利语"],
    ["ne", "ne", "नेपाली", "Nepali", "尼泊尔语"],
    ["nn", "nn", "norsk nynorsk", "Norwegian Nynorsk", "挪威新挪威语"],
    ["oc", "oc", "occitan", "Occitan", "奥克语"],
    ["ps", "ps", "پښتو", "Pashto", "普什图语"],
    ["fa", "fa", "فارسی", "Persian", "波斯语"],
    ["pl", "pl", "polski", "Polish", "波兰语"],
    ["pa", "pa", "ਪੰਜਾਬੀ", "Punjabi", "旁遮普语"],
    ["ro", "ro", "română", "Romanian", "罗马尼亚语"],
    ["ru", "ru", "русский", "Russian", "俄语"],
    ["sa", "sa", "संस्कृत भाषा", "Sanskrit", "梵语"],
    ["sr", "sr", "српски", "Serbian", "塞尔维亚语"],
    ["sn", "sn", "chiShona", "Shona", "绍纳语"],
    ["sd", "sd", "سنڌي", "Sindhi", "信德语"],
    ["si", "si", "සිංහල", "Sinhala", "僧伽罗语"],
    ["sk", "sk", "slovenčina", "Slovak", "斯洛伐克语"],
    ["sl", "sl", "slovenščina", "Slovenian", "斯洛文尼亚语"],
    ["so", "so", "Soomaali", "Somali", "索马里语"],
    ["su", "su", "Basa Sunda", "Sundanese", "巽他语"],
    ["sw", "sw", "Kiswahili", "Swahili", "斯瓦希里语"],
    ["sv", "sv", "svenska", "Swedish", "瑞典语"],
    ["tl", "tl", "Tagalog", "Tagalog", "塔加洛语"],
    ["tg", "tg", "тоҷикӣ", "Tajik", "塔吉克语"],
    ["ta", "ta", "தமிழ்", "Tamil", "泰米尔语"],
    ["tt", "tt", "татар", "Tatar", "鞑靼语"],
    ["te", "te", "తెలుగు", "Telugu", "泰卢固语"],
    ["th", "th", "ไทย", "Thai", "泰语"],
    ["bo", "bo", "བོད་སྐད་", "Tibetan", "藏语"],
    ["tr", "tr", "Türkçe", "Turkish", "土耳其语"],
    ["tk", "tk", "türkmen dili", "Turkmen", "土库曼语"],
    ["uk", "uk", "українська", "Ukrainian", "乌克兰语"],
    ["ur", "ur", "اردو", "Urdu", "乌尔都语"],
    ["uz", "uz", "o'zbek", "Uzbek", "乌兹别克语"],
    ["vi", "vi", "Tiếng Việt", "Vietnamese", "越南语"],
    ["cy", "cy", "Cymraeg", "Welsh", "威尔士语"],
    ["yi", "yi", "ייִדיש", "Yiddish", "意第绪语"],
    ["yo", "yo", "Èdè Yorùbá", "Yoruba", "约鲁巴语"]
  ].map(entry));

  // Keep the eight original local labels available without adding aliases to the 109-row catalog.
  const compatibility = Object.freeze([
    ['zh', 'zh', '中文', 'Chinese', '中文'],
    ['en', 'en', 'English', 'English', '英语'],
    ['ja', 'ja', '日本語', 'Japanese', '日语'],
    ['ko', 'ko', '한국어', 'Korean', '韩语'],
    ['fr', 'fr', 'Français', 'French', '法语'],
    ['de', 'de', 'Deutsch', 'German', '德语'],
    ['es', 'es', 'Español', 'Spanish', '西班牙语'],
    ['pt', 'pt', 'Português', 'Portuguese', '葡萄牙语']
  ].map(row => Object.freeze({ ...entry(row), compatibility: true })));
  const byCode = new Map(entries.map(item => [item.code, item]));
  const compatibilityByCode = new Map(compatibility.map(item => [item.code, item]));

  function isValidCode(code) {
    return typeof code === 'string' && code.length <= MAX_CODE_LENGTH && CODE.test(code);
  }

  // Exact catalog lookup only: legacy base codes, differently-cased codes and unknown codes
  // do not silently become a regional option.
  function find(code) {
    return typeof code === 'string' ? byCode.get(code) || null : null;
  }

  function label(code) {
    if (!isValidCode(code)) return '';
    const legacy = compatibilityByCode.get(code);
    if (legacy) return legacy.nativeLabel;
    return find(code)?.zhLabel || code;
  }

  function customEntry(code) {
    return Object.freeze({
      code,
      // This is only the literal first subtag; it does not imply a catalog match.
      baseLanguage: code.split('-')[0],
      nativeLabel: code,
      englishLabel: code,
      zhLabel: code,
      compatibility: true,
      custom: true
    });
  }

  // Supply only saved/explicit compatibility codes. They are appended in caller order,
  // deduplicated exactly, and never affect the immutable catalog or its 109-item count.
  // Invalid inputs are rejected as an empty result so malformed UI state cannot crash a menu.
  function search(query, options = {}) {
    if (typeof query !== 'string' || query.length > MAX_QUERY_LENGTH) return [];
    if (!options || typeof options !== 'object' || Array.isArray(options)) return [];
    const codes = options.compatibilityCodes === undefined ? [] : options.compatibilityCodes;
    if (!Array.isArray(codes) || codes.length > MAX_COMPATIBILITY_CODES) return [];
    const needle = query.trim().toLowerCase();
    const candidates = entries.slice();
    const seen = new Set(byCode.keys());
    for (const code of codes) {
      if (!isValidCode(code) || seen.has(code)) continue;
      seen.add(code);
      candidates.push(compatibilityByCode.get(code) || customEntry(code));
    }
    return candidates.filter(item => !needle || [item.code, item.nativeLabel, item.englishLabel, item.zhLabel]
      .some(value => value.toLowerCase().includes(needle)));
  }

  return Object.freeze({ entries, compatibility, find, label, search, isValidCode });
});
