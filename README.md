<h1 align="center">Dictpin</h1>

<p align="center">
  <strong>Compact desktop dictation. Speak, keep control of your words, and move on.</strong>
</p>

<p align="center">
  <a href="https://github.com/electron/electron/releases/tag/v44.8.0"><img src="https://img.shields.io/badge/Electron-44.8.0-47848F?style=flat&amp;labelColor=343B43&amp;logo=electron&amp;logoColor=white" alt="Electron 44.8.0"></a>
  <a href="app/renderer/dictation-app.js"><img src="https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?style=flat&amp;labelColor=343B43&amp;logo=javascript&amp;logoColor=F7DF1E" alt="JavaScript: Vanilla"></a>
  <a href="native/LocalAsrWorker.Local03.cs"><img src="https://img.shields.io/badge/Local%20ASR-SenseVoice-E3B341?style=flat&amp;labelColor=343B43" alt="Local ASR: SenseVoice"></a>
  <a href="docs/API_CONFIGURATION.md"><img src="https://img.shields.io/badge/Cleanup-Qwen%20%28optional%29-8B6BD6?style=flat&amp;labelColor=343B43" alt="Cleanup: Qwen (optional)"></a>
  <a href="docs/INSTALL.md"><img src="https://img.shields.io/badge/Windows-x64-0078D4?style=flat&amp;labelColor=343B43" alt="Platform: Windows x64"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-2E9D70?style=flat&amp;labelColor=343B43" alt="License: MIT"></a>
</p>

<p align="center">
  <strong>English</strong> · <a href="docs/i18n/README.zh-CN.md">简体中文</a> · <a href="docs/i18n/README.fr.md">Français</a> · <a href="docs/i18n/README.ja.md">日本語</a> · <a href="docs/i18n/README.ko.md">한국어</a> · <a href="docs/i18n/README.ms.md">Bahasa Melayu</a>
</p>

![Dictpin concept artwork: sound becoming clear text](docs/branding/hero.png)

**AI-generated concept artwork — not a software screenshot or evidence of implemented features.**

Dictpin is a Windows desktop voice-to-text development candidate built with Electron, local SenseVoice recognition, explicit personal dictionary rules, and optional text cleanup through a compatible service. For short messages, notes, names, and technical terms: start, speak, review, copy.

> **Source-code development candidate.** Source: [chenjinxian1/Dictpin](https://github.com/chenjinxian1/Dictpin). The project code and original project assets are MIT-licensed by chenjinxian1; third-party components keep their own terms. There is no verified installer or release download. Dictpin follows preliminary name screening, not trademark clearance. Package IDs and data paths retain their existing names. This project is independent of Typeless and has no official affiliation.

## See the application

### Main interface · English presentation

![Dictpin main interface in English with a demo result](docs/images/results.png)

Actual production Electron renderer in optional English presentation mode, with English demo text and simulated system adapters. The seeded transcript is corrected by the real local dictionary rules; no microphone or acoustic recognition was used.

### API configuration · English presentation

![Dictpin API configuration in English with an empty key](docs/images/settings.png)

Example Qwen address and model, with the API key empty. No connection test, paid request, connected badge or latency claim. See [capture details](docs/SCREENSHOTS.md).

## What works today

- **Local recognition:** CPU SenseVoice with Silero voice activity detection; no automatic cloud recognition fallback.
- **Explicit dictionary correction:** save a correct term and optional common misspellings. Local, single-pass replacement uses the longest matching rule; no inferred homophones or automatic learning. Review corrections and undo them.
- **Text before cleanup finishes:** edit or copy immediately. Either action ends pending cleanup; a late response cannot replace that version. The recognition original remains available.
- **Deliberate recovery:** completed text survives; bounded unfinished PCM can be retried for 30 seconds after Cancel or five minutes after failure, in memory only. Recovery is explicit and disables remote cleanup.
- **A small workspace:** results, dictionary, settings, and a floating recording strip. Light/dark themes, high contrast, reduced motion, and keyboard focus are implemented.
- **Optional light cleanup:** punctuation, paragraphing, and disfluency removal through a text Chat Completions service. Failure or a 12-second deadline leaves the local corrected draft usable.

The practical advantages are control over wording, offline dictionary rules, and recovery without immediately recording again. We make no universal accuracy, latency, memory, or competitive-performance claim. Translation, question answering, expansion, and a large history dashboard are outside the scope.

## Workflow

```text
Explicit start → selected microphone → local recognition
              → explicit dictionary rules → optional text cleanup
              → review / edit → explicit copy
```

One recording session and one local decoder run at a time. Stop drains accepted segments before optional cleanup/delivery. During cleanup, Copy text or editing ends cleanup. `Ctrl+Enter` copies the full result; `Ctrl+C` retains normal selection copying. The optional copy-result shortcut remains unassigned by default.

## Long dictation, append and guarded paste

Recording now feeds a bounded local pipeline instead of waiting for a whole container at Stop. PCM segments prefer pauses and are capped at 20 seconds; one SenseVoice worker decodes them in order, with live text checkpoints inside the app. There is no 60-second session ceiling. Resource guards stop a session at 30 minutes, 100,000 characters, or a growing recognition backlog; accepted audio is not silently trimmed.

Use **Append more** to keep the earlier edited draft and add the next recording. The optional shortcut append preference does the same. Earlier text is not re-refined; automatic delivery uses only the new suffix, so an existing document is not pasted twice. Full-result Copy remains explicit. Live previews are read-only until the remaining segments finish; once cleanup starts, editing/copying can end it safely.

**Guarded auto-paste is off by default.** Build the separate Windows helper, enable it in Settings, save, then start with the dictation shortcut while a supported editable field is focused. After explicit Stop, Dictpin attempts one paste. It rejects passwords, terminals, elevated or unsupported controls, and changed focus/caret/process/clipboard ownership. Focus may return from Dictpin only after an explicit Stop in its own UI; unrelated applications are never forcibly activated. Starting from the app UI has no captured external target and stays manual.

Delivery replaces the clipboard with the new text; it does not read or back up earlier clipboard content. “Paste keys sent” is not proof that the destination consumed them. An uncertain outcome asks you to check the original field, and is never automatically retried. New recording, append and editing are blocked while a paste is pending. Resource/backpressure stops and recovery do not authorize a paste.

Completed text is checkpointed. Only the bounded **unfinished** PCM collection is recoverable: 30 seconds after Cancel or up to five minutes after recognition failure, in memory, with explicit retry and no remote cleanup. This is not a complete long-recording archive. Expiry, clear and exit erase the temporary audio.

Forced segment boundaries can affect words spoken without pauses. Real microphone quality, native input-field compatibility, focus, clipboard delivery and comparative performance still require manual acceptance; no superiority over Typeless is claimed. See [Changelog](CHANGELOG.md).

## Quick start: developer setup

**Current target: Windows x64.** Install Node.js **24 or later**. Prepare the full external Electron **44.8.0** distribution, sherpa-onnx **1.13.8** shared runtime, SenseVoice int8 model and tokens, Silero VAD model, and separate Local03 native worker. These resources are not bundled. Follow the exact layout and official sources in [Installation](docs/INSTALL.md).

From the repository root, after preparing the resources:

```powershell
.\native\build-local03.cmd
.\native\build-delivery.cmd
npm run doctor
npm run check
node scripts/package-inputs.cjs
npm run dev
```

Root scripts use Node built-ins; there is no root dependency installation step. `doctor` checks the existing layout, not a fresh installation or recognition quality. `dev` deliberately opens a development profile without starting recording. Do not launch through historical bootstrap or resume scripts.

For **local use without an API**, keep **轻整理** (light cleanup) off. Open **设置** (Settings), select the microphone actually used by Windows Recorder, click **保存更改** (Save changes), then explicitly start dictation. Unsaved device selections are not active. Stop, inspect, and copy. Configure a shortcut only if wanted.

`npm run check` checks application syntax, local dependencies, packaging inputs and documentation. Test suites, benchmarks, old interfaces and internal publication tools are kept out of this application-source repository. See [validation and build status](docs/INSTALL.md#validation-and-build-status). No installer build command is represented as working.

## Optional API setup

In **设置 → 模型连接** (Settings → Model connection), enter the API address, exact text model ID, and key. Choose whether to save the key using system secure storage. Save while idle, then enable light cleanup. No restart is needed. There is no supported API environment-variable or `.env` configuration.

Only **text Chat Completions** is supported here, not ASR, TTS, Responses, or native DashScope audio endpoints. Qwen is optional: use the matching region/workspace address, key, and an available text model such as `qwen-plus`. Copy the compatible address from your provider console; one example is not universal. A compatible local text server can be configured but is not included.

See [API configuration](docs/API_CONFIGURATION.md) for exact fields, official key links, examples, and troubleshooting. **Connection tests and deliberate cleanup retries can cost money.**

## Privacy and local storage

- Local recognition and dictionary correction need no API. The current product saves no new recording files. Audio recovery is temporary memory; expiry, clear, and exit discard it. Crashes cannot promise recovery.
- **The latest result is saved locally as plaintext**, including original and edited text, even with multi-item history off. There is no transcript auto-expiry or retention switch. Development data is under ignored `work/dev/profile/`; never commit it.
- Enabling cleanup sends the corrected transcript and a bounded list of saved correct dictionary terms to the configured service. Raw audio and misspelling aliases are not included. Provider retention and billing apply.
- New keys are session-only unless encrypted persistence is selected. Saved keys use Electron's OS-backed storage, with no plaintext fallback if unavailable. This does not protect against malware acting as your OS user.
- Usage records contain request/model/timing/token metadata, not text bodies or keys. Missing usage or pricing means unknown cost, not zero.

Read [Privacy](docs/PRIVACY.md) before using private material. Local recognition does not mean that optional cleanup uploads nothing or that text is never written to disk.

## Languages, limits, and verification

The UI defaults to **Simplified Chinese**, with an optional **English presentation mode** used in these examples. Six documentation languages do not imply six UI or recognition languages. Upstream SenseVoice lists Mandarin, Cantonese, English, Japanese, and Korean. Earlier fixed-file evaluation covered Mandarin and English; French and Malay recognition are not claimed.

To open the optional English UI, run `npm run dev -- --ui-language=en`; omit the flag for the default Chinese UI. This changes presentation only, not transcript or dictionary data.

This repository contains application source and usage documentation. Internal test fixtures and performance reports are not included. Global shortcuts, the system clipboard, microphone changes, focus, multiple displays, Windows DPI, real service quality and clean-machine installation still need separate acceptance.

Earlier benchmarks apply to their machine and corpus, not universal speed or accuracy. Packaging inspection explicitly reports **`distributionReady:false`**.

## Troubleshooting

| Problem | What to try |
| --- | --- |
| Missing runtime/model | Run `npm run doctor`; check complete external layout, versions, and notices. |
| No level movement or no speech | Select the actual working microphone by name, save, check Windows permission/mute, then record deliberately. The system default can be a different input. |
| No API configured | Switch cleanup off; local recognition and dictionary rules still work. |
| 401/403 or 404 | Check key/region/permission, model ID, and Chat Completions address. Never paste a key into an issue. |
| Rate limit or timeout | Keep the preserved text. Retry deliberately; the earlier request may still be billable. |
| Save failed | Keep the draft, copy important text, and check disk space/write permission before retrying. |
| TLS/network failure | Check official host, OS clock, trust chain, and firewall. Never disable certificate verification. |

## Roadmap and contributions

Next: clean-machine setup and packaging, broader device acceptance, transcript retention/deletion controls, and measured recognition improvements. These are plans, not existing features. The application will remain a compact dictation tool.

Read [CONTRIBUTING.md](CONTRIBUTING.md) for safe local checks and [SECURITY.md](SECURITY.md) for disclosure limitations. [CHANGELOG.md](CHANGELOG.md) records the source changes.

## License and acknowledgements

The original project code, documentation and original project assets are available under the [MIT License](LICENSE), copyright 2026 chenjinxian1. The [license scope](THIRD_PARTY_NOTICES.md) distinguishes project material from third-party fonts, generated declarations, runtimes and model weights.

Third-party components retain their own terms: Electron/Chromium, sherpa-onnx/ONNX Runtime, SenseVoice weights, Silero VAD, and Saira. Model terms are separate from any application-code license. Read [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Thanks to these maintainers and FLEURS contributors. The restrained industrial direction draws inspiration from [endfield-ui-skill](https://github.com/hhikr/endfield-ui-skill); no game characters, logos, or artwork are used as brand assets.
