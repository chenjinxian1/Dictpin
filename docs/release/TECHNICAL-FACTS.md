# Public source: technical facts

This inventory describes the current Windows x64 source candidate. It is not an installer, hardware acceptance or universal performance claim.

## Architecture and active scope

`scripts/dev.cjs` launches `app/src/dictation-entry.cjs`, then `dictation-main.js`. The active controller keeps local dictation as the product flow. Legacy compatibility modules and regression fixtures are retained where needed; their Ask/translation/cloud-ASR paths are not current product features.

| Stage | Source | Actual behavior |
| --- | --- | --- |
| Recording | `app/renderer/dictation-capture.js`, `local-audio.js` | Explicit start, saved device selection, local WebM/Opus decode to 16 kHz mono PCM16. Requests echo cancellation/noise suppression/automatic gain off. |
| Recognition | `app/src/local-asr.js`, `native/LocalAsrWorker.Local03.cs` | CPU SenseVoice int8 through sherpa-onnx 1.13.8 and Silero VAD. No automatic cloud ASR fallback. Native executable is built locally. |
| Dictionary | `app/src/local-dictionary.js`, `dictionary.js` | Explicit saved wrong-spelling → correct-term rules; longest match, single pass, no inferred homophones or recursive replacement. |
| Optional cleanup | `app/src/dictation-edit.js`, `refinement-policy.js` | Text Chat Completions; sends the corrected transcript and a bounded correct-term list. Guards reject out-of-policy changes but do not guarantee quality. |
| Result/recovery | `dictation-controller.js`, `dictation-store.js`, `dictation-app.js` | Original/corrected/current text are separate. Copy/edit ends pending cleanup; late replies cannot overwrite the chosen version. Recovery is explicit. |

A segment is limited to 60 seconds, with recording stopped around 58 seconds. Cancelled complete audio is held in memory for 30 seconds; failed recognition can retain a complete segment for up to five minutes. Clear, expiry and exit discard it. Recovery disables cleanup. Cleanup has a 12-second deadline and no automatic paid retry.

## Setup and commands

Node.js 24+, Windows x64, external Electron 44.8.0, sherpa-onnx 1.13.8 shared runtime, SenseVoice int8/tokens and Silero VAD are required for full operation. Build `native/build-local03.cmd` before native regression tests and doctor; executables are not committed.

[Installation](../INSTALL.md) gives the complete sibling directory layout and official sources. Models/runtime remain external. The root scripts use Node built-ins. `npm run check` is a portable source check; `npm run test:ui` selects the current Local03 matrix. `npm run preview` exposes only a sanitized loopback documentation preview, not the app or a profile.

Static package-input checking can pass while reporting **`distributionReady:false`**. No supported installer build, self-contained package, update or uninstall acceptance is claimed.

## API and storage

The form offers enabled/address/model/key/system-secure-storage fields for optional text cleanup. It accepts a text Chat Completions base URL or full endpoint, requires HTTPS except loopback HTTP, and does not follow redirects. There is no API `.env` loader, arbitrary header, streaming, Responses or native DashScope audio configuration. A deliberate connection test is a real synthetic-text request, with a 15-second timeout, and can be billable.

Normal development data is under ignored `work/dev/profile/`. The latest original/corrected/edited text is saved in plaintext `recent-result.json` even with legacy multi-item history off. Dictionary deletion archives can retain entries for undo. New recording files are not saved by the current product. Saved keys use OS-backed encryption only if selected; no plaintext fallback is written. Exact key retention/clearing and network boundaries are in [API configuration](../API_CONFIGURATION.md) and [Privacy](../PRIVACY.md).

## Language and evidence

The UI defaults to Simplified Chinese. An optional English presentation mode translates known interface labels, not user text or saved data. Six READMEs do not add six UI or recognition languages. Upstream SenseVoice lists Mandarin, Cantonese, English, Japanese and Korean. Earlier fixed-file quality evidence covered Mandarin/English; it is historical, not a new public-export benchmark. French and Malay recognition are not claimed.

[Verification](VERIFICATION.md) records fresh exported-source checks. Synthetic pages/audio do not certify real microphones, hot-plugging, global shortcuts, clipboard delivery, focus, multi-display/DPI, clean installation, power-loss durability or live cleanup quality. No universal speed, accuracy, memory or zero-upload claim is made.

## License

The owner confirmed public source/icon authorization and MIT copyright name chenjinxian1 on 2026-10-24. Root MIT applies to original project material; [third-party notices](../../THIRD_PARTY_NOTICES.md) retain the separate font, generated ABI, model and runtime terms.
