# Optional text cleanup: configuration and troubleshooting

Local recognition, dictionary rules, editing, copying and recovery do not require a text API. Missing or unavailable cleanup credentials make that passage continue locally with a notice; they do not prevent dictation or silently change the saved cleanup preference. There is no automatic cloud ASR or provider fallback.

## Choose a provider and edit a draft

Open **设置 → 模型连接** (Settings → Model connection). The interface distinguishes the active service from the draft that becomes active after **保存更改** (Save changes). The interface follows the Windows display language (Chinese or English) and can be changed under Settings → Interface language; both languages behave the same. Six README languages do not imply six UI languages.

| Provider | Preset contents | User input |
| --- | --- | --- |
| Qwen / Alibaba Model Studio | Region-specific workspace address; `qwen-flash`, with `qwen-plus` and `qwen3.8-flash` as other suggestions | Explicit region, workspace ID and matching key |
| DeepSeek | Complete `https://api.deepseek.com/chat/completions` endpoint; `deepseek-flash` | Key; model remains editable |
| OpenAI | `https://api.openai.com/v1`; `gpt-6-luna` | Key; model remains editable |
| SiliconFlow | China address `https://api.siliconflow.cn/v1`; editable suggestions | Select a model and enter a key; no model is automatically selected |
| Local compatible service | Loopback-address guidance only | Actual server address and installed model ID; key optional for anonymous servers |
| Custom | Text Chat Completions guidance | Actual HTTPS address, model and key |

Presets were checked against documentation on **2026-10-28**, not against real accounts or service quality. Sources: [Qwen Chat](https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions), [DeepSeek first call](https://api-docs.deepseek.com/quick_start/agent_integrations/), [OpenAI model](https://developers.openai.com/api/docs/models/gpt-6-luna), [SiliconFlow Chat](https://docs.siliconflow.cn/docs/api/chat-completions-post). Availability and offerings can change.

The `qwen3.8-flash` non-thinking adapter was additionally checked against [Qwen's thinking-mode documentation](https://help.aliyun.com/en/model-studio/deep-thinking) on **2026-10-29**. For this exact model on the documented HTTPS Qwen workspace or legacy Chat Completions endpoints, Dictpin sends top-level `enable_thinking:false`. This also applies when that official endpoint is saved in **Custom** or **Previous configuration**; it does not change the saved provider, address, model or key. Third-party/local endpoints, other protocols, alternate ports and unverified model IDs receive no inferred parameter. Test cleanup and actual cleanup share this rule. The existing 12-second overall deadline remains; disabling thinking is not a guarantee of latency or quality, and no paid model call was used to verify this adapter.

Qwen offers Beijing, Singapore, Hong Kong, Tokyo, Frankfurt and Virginia regions. New workspace URLs require an explicit region and valid workspace ID; the key must match. Existing legacy hosts and models are not silently migrated.

Each provider/region has a separate remembered configuration; only one is active. Switching providers or pages retains in-memory drafts and sends no request. Edited addresses are marked custom; restoring a preset is explicit. The preview shows the final request URL. **Save changes** commits changed configurations and activation together while idle. Validation, encryption or disk failure leaves the previous service active. Running dictation retains its frozen configuration; no restart is needed.

HTTPS is required except for localhost/loopback HTTP. URL credentials, whitespace, query strings and fragments are rejected; redirects are not followed. Base URLs receive `/chat/completions`; complete compatible endpoints are retained. DeepSeek's preset uses its exact complete endpoint instead of the generic bare-host `/v1` rule. Keys belong in the key field, never in URLs.

There is no API environment-variable or `.env` loader. Arbitrary headers, prompts, retry and timeout controls are not exposed. Only text **Chat Completions** is supported, not Responses, Anthropic Messages, native DashScope audio, ASR or TTS.

## Keys: retain, replace or remove

The interface distinguishes **not configured**, **this session only**, **securely saved** and **encrypted key currently unavailable**. Stored keys remain in the main process and are never returned as form values or hashes. Reveal applies only to newly typed keys.

- Blank retains the current profile's key; it never borrows another provider's key.
- **移除密钥** (Remove key) marks removal for the next save; **撤销移除** (Undo removal) is available before saving.
- Changing an address or region requires replacement or explicit removal when an old key exists. Supplier names alone never authorize reuse at another endpoint.
- New keys are session-only unless **用系统安全存储保存** (Save with system secure storage) is selected. Requested encryption failure aborts saving; there is no plaintext or silent session-only fallback.
- Unchecking secure storage and saving removes the encrypted copy while retaining the current session key until exit. This differs from Remove key.
- Unavailable encrypted keys remain preserved. An unrelated settings save does not erase them.

Use the provider's official key guidance or console: [Qwen key guide](https://help.aliyun.com/zh/model-studio/get-api-key), [OpenAI API keys](https://platform.openai.com/api-keys). Never include real keys in issues or screenshots.

## Test the draft or get models deliberately

**测试轻整理** (Test cleanup, shared by both cleanup levels) checks the current API draft without saving. An unrelated microphone draft does not disable it. It sends one fixed fictional Chinese/English sample, with no private transcript or personal dictionary, through the same request builder and response checks as actual cleanup. Both have a **12-second** deadline. Passing that sample is not a quality guarantee for other text.

The interface shows untested, checking, sample passed, failed and changed states. Address, region, model, key or request-parameter edits invalidate the old result; cancelled/superseded replies cannot update the new draft. Expandable safe details identify the tested model, final address, category, HTTP status, elapsed time and test time. Raw error bodies and authorization are not shown. A green verification state is not persisted across restarts.

**内置模型建议（无需联网）** (Built-in model suggestions, offline) is a separate menu of editable presets. Choosing one fills the model field without a key or any service request; manual entry remains available.

**在线获取模型** (Fetch models online) deliberately queries the current service. For a remote service without a usable key, clicking it immediately shows **请先填写密钥** (Please enter an API key first), highlights and focuses the key field, and sends no request. An anonymous loopback service does not require a key. While a request is running, the button shows **正在获取…** (Fetching…); nearby feedback reports cancellation, failure or the number of models received.

This metadata request is limited to **10 seconds**, **500 models** and **2 MiB** of response data in total. It does not download models or prove cleanup compatibility. Built-in suggestions and manual entry remain available on failure or truncation.

Listing uses provider-specific same-origin routes. Qwen uses `/api/v1/models` with bounded pagination, not `compatible-mode/v1/models`. Addresses without a verified same-origin adapter, including new Singapore/Hong Kong workspace hosts in this version, retain suggestions/manual entry. This is a limitation of Dictpin's adapter, not a claim that the service cannot support listing. Keys are not forwarded to another origin. See [Qwen model-list documentation](https://help.aliyun.com/zh/model-studio/list-models).

Testing, listing and saving are mutually exclusive. Drafts remain editable during dictation, but diagnostic operations and saving wait until idle. UI, shortcut and tray starts cancel pending diagnostics and ignore late replies. Selecting, typing and saving never auto-test or auto-fetch.

## Requests, privacy and fees

Actual cleanup sends the **dictionary-corrected transcript**, narrow editing instructions and a bounded list of saved correct dictionary terms. It does not send recording audio, wrong-spelling aliases, full result history or the clipboard. Provider retention and billing apply. See [Privacy](PRIVACY.md).

Requests are streaming (`stream:true`, with `stream_options.include_usage`) JSON POSTs with Bearer authorization when a key exists. If no response starts within 4 seconds the request is abandoned without retry; the overall deadline stays 12 seconds. A service that ignores streaming and returns one JSON document is accepted. Some compatible services reject the streaming parameters with HTTP 400. The assembled reply must be complete text and pass the selected cleanup level's checks: Fluent allows deleting fillers, repeats and abandoned self-corrections but not new numbers, terms or content; Light allows only punctuation and minimal disfluency changes. HTTP success alone is insufficient. Known official preset/model combinations use narrowly allowed non-thinking parameters; arbitrary custom endpoints and unknown models do not inherit them. SiliconFlow's first adapter adds no speculative thinking parameter.

**Sample tests and deliberate cleanup retries can cost money.** Getting models sends the selected service's authentication and normal network metadata; the provider determines applicable charges. There is no automatic paid retry or provider switch. Cancellation, copying, editing and timeout stop accepting a reply locally but cannot guarantee remote processing or billing stops. Failed cleanup preserves the local corrected draft and independent recognition original. Temporary-audio recovery disables cleanup.

## Storage and compatibility

Development settings remain in ignored `work/dev/profile/settings.json`. Versioned metadata is stored in `settings.textServices` with an `activeProfileId`; optional encrypted per-profile keys are in `secrets.textServices`. Active `settings.refiner` remains a compatibility projection. Legacy encrypted-key fields are preserved where needed; raw keys never enter page-state broadcasts.

An old profile appears as **原有配置** (Previous configuration), unchanged, in memory. Opening it does not write a migration, change its host/model or send a request. Explicit saving writes the new structure. Unknown newer service data opens read-only rather than being overwritten. Key encryption does not encrypt settings metadata, dictionary or plaintext latest-result text, and cannot protect against malware acting as the same OS user.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| 401/403 | Check this profile's key, permissions and matching region/workspace. |
| 404 | Check the model ID and final text Chat Completions address. |
| 400/422 or incompatible reply | Check protocol/model support and complete string content. Listing a model is not a compatibility test. |
| 429 or provider 5xx | Check quota/provider status; use preserved local text. Retry only deliberately. |
| Timeout/cancel | Keep the local draft; provider processing or billing may still occur. |
| Address changed with old key | Replace or explicitly remove that profile's key. |
| Listing unavailable | Choose a suggestion or type the model ID; do not forward keys to another host. |
| No usable cleanup key | Local dictation continues for that passage; configure cleanup later. |
| Save failed | Check the field, secure storage, disk space and write access. Drafts remain and the previous service stays active. |
| Network/certificate failure | Check official address, clock, trusted chain, firewall and network policy. Never disable certificate validation. The development launcher does not forward proxy environment variables. |

No live API, account access, billing or cleanup quality is certified here. Use fictional samples for deliberate manual service acceptance.
