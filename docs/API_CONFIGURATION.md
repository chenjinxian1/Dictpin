# Optional text cleanup: configuration and troubleshooting

Local recognition, explicit dictionary rules, editing, copying, and recovery work without a text API. Leave **轻整理** (light cleanup) **off** for this mode. No cloud ASR fallback is enabled.

## The actual settings form

Open **设置 → 模型连接** (Settings → Model connection). Default labels are Chinese; the optional English presentation mode shown in the screenshots uses the same settings fields and behavior.

| Setting | Actual field | Supported behavior |
| --- | --- | --- |
| 轻整理 | `refiner.enabled` | Opt-in text cleanup. A remote service without a key blocks starting until configured or disabled. |
| API 地址 | `refiner.baseUrl` | HTTPS base URL or complete text `/chat/completions` endpoint. HTTP is allowed only for localhost/loopback. |
| 模型 | `refiner.model` | Exact provider text model ID, up to 160 characters; no discovery or model download. |
| API 密钥 | Main-process session key; optional `secrets.refiner` envelope | Blank retains an available key. The current form requires a replacement key when changing an address with an existing key; it never silently reuses that credential at another host. |
| 用系统安全存储保存 | `persistKey` handling | Opt-in OS-backed encryption. A newly entered unchecked key stays in memory. If secure storage is unavailable, there is no plaintext persistence fallback. |

Save **保存更改** while idle. Changes apply to the next task without restarting; saving during a task is blocked. Unchecking system secure storage and saving removes the persisted encrypted key; it remains available for the current process session. Leaving the key blank without changing that option preserves it. The current form has no dedicated clear-session-key control. See [privacy](PRIVACY.md) before sharing the profile.

The application appends `/chat/completions` to a base URL; a bare host gets `/v1` first. A complete compatible endpoint is retained. URL credentials, whitespace, query strings, and fragments are rejected. Redirects are not followed. An API key belongs in the key field, never in the URL.

No API environment variables or `.env` loader are supported, so no `.env.example` is supplied. There are no UI fields for temperature, system prompt, stream, thinking mode, custom headers, retry policy, or timeout. Legacy configuration fields are not public product features.

## Minimal configurations

### No service and no API fees from cleanup

Keep light cleanup **off**. Save the intended microphone and start deliberately. Dictionary corrections still run locally.

### Optional Qwen example

Obtain a key through the [official Model Studio API key instructions](https://www.alibabacloud.com/help/en/model-studio/get-api-key) or [Chinese guide](https://help.aliyun.com/zh/model-studio/get-api-key). The console supplies the applicable region, workspace endpoint, and model access.

```text
API address: copy your workspace's OpenAI-compatible Base URL
Model: qwen-plus
API key: YOUR_PROVIDER_API_KEY
System secure storage: optional
Light cleanup: enable after saving the intended configuration
```

This is a form example, not an environment file. `qwen-plus` is an example only where your account offers it. The [Chinese key guide](https://help.aliyun.com/zh/model-studio/get-api-key) lists the legacy Beijing address `https://dashscope.aliyuncs.com/compatible-mode/v1`. The [current English compatibility guide](https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope) also describes workspace-specific hosts, for example `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1` in Singapore. Substitute your real workspace ID in the form, use a key/model from the same region, and follow your console over a copied example. No remote Qwen request was made to verify this account.

The source's default address/model are `https://api.openai.com/v1` and `gpt-4.1-mini`; this is not a live-service acceptance claim. If choosing that provider, use its [official API key page](https://platform.openai.com/api-keys) and confirm model access and current charges yourself.

A local compatible text server on allowed loopback HTTP can be configured without a key. No such server is installed, started, or validated by this project.

## Protocol, transmission, and fees

The supported request is a non-streaming JSON text **Chat Completions** POST with Bearer authorization when a key is present. The reply must contain string `choices[0].message.content`. Responses, Anthropic Messages, native DashScope APIs, ASR, TTS, and realtime audio endpoints are incompatible with this setting.

Cleanup sends the **dictionary-corrected transcript**, an editing instruction, and a bounded list of saved correct dictionary terms. It does not send raw audio, explicit wrong-spelling aliases, full result history, or the clipboard. A provider receives normal network metadata and applies its own retention and billing policies. Do not use a service for private text without accepting those terms.

**测试已保存连接** (Test saved connection) sends synthetic `Reply with OK.` text, with an eight-token output limit and 15-second timeout. It is available only for saved configuration in an idle, visible, focused window. It is a real request and can cost money. It checks connectivity/protocol, not quality on your dictation. Execute it only deliberately.

Cleanup is one request at a time with a 12-second limit. Editing or copying ends the pending cleanup; errors leave the corrected draft intact. The original recognition is separately retained. Number/negation/content guards reduce unwanted rewriting but do not guarantee all meaning is preserved. No automatic paid retry occurs. Explicit retry can cost money again, and cancelling/timing out does not guarantee that provider processing or billing stops. Temporary-audio recovery disables cleanup.

## Where configuration is saved

Normal development settings are at `work/dev/profile/settings.json`. API keys stay in the main process; opt-in persisted keys use Electron `safeStorage` encryption in `secrets.refiner`. Other settings, dictionary entries, and latest-result text are not encrypted by this key facility. Profiles must never enter Git, screenshots, issue attachments, or shared archives. See [Privacy](PRIVACY.md).

## Troubleshooting

| Symptom | Check |
| --- | --- |
| 401/403 | Key validity, API permission, region/workspace host, and account access. Never expose the key in an issue. |
| 404 | Exact text model ID and final Chat Completions endpoint. Check that the URL has not accidentally targeted ASR/TTS or another API family. |
| 400/422 or malformed reply | Whether the model accepts plain text Chat Completions and returns string content. HTTP success alone is insufficient. |
| 429 | Quota/rate limits and account plan. Retry only deliberately, after checking possible charges. |
| Provider 5xx | Provider availability. Keep the local corrected text instead of re-recording. |
| Timeout | Copy the preserved draft; choose deliberately whether to retry cleanup. Provider billing may still apply. |
| Network/certificate failure | Official HTTPS host, system clock, trusted chain, firewall, and network policy. Do not disable certificate verification. The development launcher does not forward proxy environment variables. |
| Save failed | Disk space and profile write access. Keep/copy the in-memory draft and retry saving. |
| New task blocked without key | Disable light cleanup for local-only work, or configure and save the intended service. |

No real API calls were made while preparing these materials. Endpoint documentation was checked on 2026-10-24; provider offerings and prices can change.
