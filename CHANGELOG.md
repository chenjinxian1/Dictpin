# Changelog

## Unreleased

### Fluent cleanup, auto-paste offer and system interface language — local development candidate

- Added a **Fluent** cleanup level, now the default, with **Light** kept as an option under Settings → Cleanup level. Fluent removes fillers and repeats, keeps only the final wording after a self-correction and lays out spoken lists. A new `checkFluentEdit` guard allows deletion but not invention: numbers must stay in order and come from the original, English terms must come from the original (case may change), new characters are capped at about 8%, negations must survive outside obvious corrections, and length stays bounded. Any failure keeps the local text.
- Cleanup requests now stream. A service that does not start responding within 4 seconds is abandoned without retry; the 12-second overall limit is unchanged. A service that ignores streaming and returns one JSON document still works.
- After a completed dictation, the Results page offers guarded auto-paste once (**Turn on** / **Don't show again**). Delivery still stays off until the user turns it on. After a confirmed paste the voice strip shows **Pasted** and closes after one second.
- The interface now follows the Windows display language (Chinese display languages show Chinese; all others show English) instead of always starting in Chinese, with **Settings → Interface language** to override it after a restart. `--ui-language=en|zh-CN` still forces a development instance.
- English mode no longer leaves Chinese behind: main-process notices, errors, recognizer and shortcut messages now have English (`app/renderer/dictation-i18n-messages.js`, with rules for composed messages such as HTTP status errors). Translation now covers every non-protected element instead of a fixed whitelist, translates select options other than microphone names, and splits sentences joined without a space. The updated privacy note and the new cleanup/auto-paste controls are included.
- Added `native/CleanupPolicy.cs`, a C# 5 port of the fluent guard for the planned lightweight .NET host. It builds with the system `csc.exe`.

Validation: **40 local Node checks** passed: 27 shared fluent fixtures, light-level strictness, scripted-fetch streaming (split SSE chunks, JSON fallback, first-event stall, provider error events and HTTP errors), English coverage of every Chinese source literal against a reviewed non-UI allowlist, composed-message translation, protected user text, and flag → setting → Windows language resolution. The same 27 fixtures passed against the native port built with the system `csc.exe`. `npm run check` passed. Checks use fictional text and a scripted fetch; no model request, microphone, clipboard or paste target was used, and the application was not launched. Fluent output quality with real providers, Electron flows, the auto-paste offer, English presentation on an English Windows install and visual review remain manual acceptance.

## [0.2.2-dev.31] - 2026-10-28

### UI clarity and recovery

- Gave results a flexible editor and a compact bottom status bar, with one collapsed **Versions & details** entry. Original transcript, correction records and actual request usage remain accessible. Removed the duplicate original/undo-corrections action; restore and append undo stay reachable outside the original panel.
- Made real recording/local-recognition/cleanup stages and task details visible. Added elapsed recording time, the final two-minute limit countdown and the remaining recovery lifetime. Preview updates follow new text only when the user is already reading at the bottom; focus, selection and older paragraphs are preserved.
- Restored visible voice-strip feedback within the existing window and pill sizes. **View details** opens the main window; only the separate **Recover** action retries recognition. Cleanup has a separate **Use local text** action, and copying still ends cleanup safely.
- Added optional structured stage/cleanup outcomes and keyed Chinese/English presentation for critical task states, replacing message-text decisions in the main and floating interfaces. The legacy presentation translation bridge remains for older controls; this is not a complete i18n migration.
- Separated dismissible information/warning/error notices, restored keyboard focus on dismissal, unified Dictpin branding, improved small-window labels and contrast, consolidated the layout styles and matched native window background to the system theme. Preset reset is shown only for custom addresses; usage is shown for real recorded attempts even if cleanup is later turned off.
- Exposed live checkpoint save failures, kept failed-save drafts copyable, and made unchanged save retries retain their version and previous draft. Successful copy retry clears obsolete failure feedback; ordinary copy success uses the button acknowledgement.
- Updated workspace/application versions and all six centered README titles to `0.2.2-dev.31`, with refreshed English application screenshots. This remains a source-code development update; no installer release, tag or running-version replacement is included.

Validation: **155 local tests** and **35 Electron flow checks in each of Chinese and English** passed with natural exit 0. Checks use fictional profiles, generated PCM, scripted states and simulated services/system adapters; they include composition, copy/save failures, restore/undo, late cleanup replies, reading-position protection, recovery expiry, legacy-result eligibility, the fixed strip, all pages at360×300, light/dark themes and simulated high-contrast/reduced-motion focus. No physical microphone, live model request, real key or system clipboard was used. Test fixtures and raw evidence stay local. Native focus, device behavior, Windows DPI, real clipboard/paste targets and service quality remain manual acceptance. Current running versions are not replaced or restarted.

## [0.2.2-dev.30] - 2026-10-28

### Application icon

- Refreshed the application and tray icons with a graphite, warm-white and yellow microphone/pin mark, using an original AI-assisted design. Windows ICO assets include 16/20/24/32/40/48/64/128/256 px frames for common scaling sizes.
- Explicitly set the main window icon so development windows use Dictpin's mark as well as the existing installer icon references. Application identifiers and profile paths remain unchanged.
- Updated the workspace and application versions and all six centered README titles to `0.2.2-dev.30`. This is a source-code development update; no installer, release tag or deployed running-version replacement is included.

Verification: **139 local tests** and **19 Electron flow checks in each of Chinese and English** passed with natural exit 0. The checks include decoding the window, tray and Windows icon assets, plus the existing dictation and API configuration flows using fictional data and simulated services/system adapters. Small-size previews were reviewed on light and dark backgrounds. No physical microphone, live model service, real key or system clipboard was used; test fixtures and raw evidence remain local. Actual Windows icon-cache, taskbar/tray appearance and packaged-installer behavior still require manual acceptance.

## [0.2.2-dev.29] - 2026-10-28

This is an application-source development candidate. No installer release, tag or verified download has been created; the version identifies the source update.

### Provider configuration and model discovery

- Added provider presets for Qwen, DeepSeek, OpenAI and SiliconFlow, plus Local/Custom, with separate remembered provider/region configurations and one active service. Explicit Save commits changed drafts and activation atomically; switching presets sends no request.
- Added draft-bound cleanup sample tests using the same request/response rules and 12-second deadline as actual cleanup. Configuration edits invalidate old test results and superseded replies cannot update the new draft.
- Added deliberate model discovery with provider-specific, same-origin adapters, a 10-second deadline, 500-model/2 MiB caps, and suggestions/manual input retained on failure. A list or one sample does not establish general quality.
- Separated offline built-in model suggestions from **Fetch models online**. Missing remote credentials now show **请先填写密钥**, focus the key field and send no request. Online fetching has an explicit busy label and nearby result/cancellation feedback; anonymous local services remain supported.
- Added explicit key removal/undo and session/saved/unavailable states. Keys remain in the main process, scoped to their profile/endpoint; requested encryption or save failure preserves previous data. Legacy configurations remain unchanged on open; unsupported newer data opens read-only.
- Optional cleanup with unavailable configuration/credentials no longer prevents local dictation. No automatic paid retry, provider switch, physical microphone test or deployed running-version replacement is introduced.
- Updated API, privacy, installation and all six README explanations. Preset documentation was checked on 2026-10-28; real account access, paid-service quality and billing remain manual acceptance. This source candidate is not an installer release.
- Set the workspace and application versions to `0.2.2-dev.29`, show that version in all six centered README titles, and verify the titles, manifests and changelog stay in agreement. Package identifiers and user-data paths remain unchanged.

Verification for this candidate: **139 local tests** passed, including the existing 74 regression tests. **18 Electron flow checks in each of Chinese and English** passed with natural exit 0, using fictional profiles, in-memory service responses, simulated system adapters and intercepted capture commands. No physical microphone, live API, real key, system clipboard or paid request was used. Checks include missing-key focus/feedback, offline selection, fetch/cancel states, and feedback visibility at 360 × 300 in both themes. Invalid-workspace recovery, conflicting settings restoration and switching away from a pending diagnostic were reproduced before their fixes and then passed. Test fixtures and raw evidence remain outside the public source tree.

## [0.2.1-dev.24] - 2026-10-24

#### Guarded delivery and long dictation — development candidate

- Added **opt-in guarded Windows paste**. It captures a supported editable input only at shortcut start, checks process/control/caret/focus/clipboard changes, and attempts one Ctrl+V after explicit Stop. Passwords, terminals, elevated and unsupported targets fail closed. Only an explicit Stop inside Dictpin can authorize returning to the original field.
- Preserved manual copying and introduced explicit consent versioning, so old dormant auto-paste settings never silently activate the feature. Pending delivery locks Start, append, copy and editing. Partial/ambiguous sends warn users to check the original field and never trigger an automatic retry.
- Added **continuous 16 kHz PCM capture and an ordered, bounded local recognition pipeline**. Pause-preferred segments are capped at 20 seconds; text appears and is checkpointed while recording. Removed the 60-second session ceiling. A 30-minute/100,000-character guard and early backlog stop bound resource use without silently trimming accepted packets.
- Added **Append more**, **Undo append** and optional shortcut append. Earlier manual text stays intact, optional cleanup processes only the new part, and delivery uses only the new suffix. Full-result Copy stays available. A final pass over immutable raw text handles explicit dictionary aliases spanning segment boundaries without recursive replacement.
- Preserved completed text on interruption. Only bounded unfinished PCM is retained in memory for 30 seconds after Cancel or five minutes after failure; retry is explicit, local and disables remote cleanup and automatic delivery. Expiry, clear and exit discard audio. Recovery is not a full long-recording archive.
- Resource/backpressure stops do **not** count as user-authorized paste. Fatal worklet output cannot seal a successful result. Repeated recovery attempts settle independently; late responses, duplicate/gapped packets and changed result revisions are rejected.

Validation uses local deterministic tests, generated PCM and real Electron pages with simulated targets/clipboard/recognition. A real AudioWorklet was exercised with a generated audio stream. No physical microphone, actual external input, system clipboard or paid service was used. Native helpers compile and their pure self-tests run without native actions. Real UI Automation/input-field compatibility, focus restoration, UIPI, clipboard, device changes/DPI, acoustic boundary quality and comparative speed remain separate manual acceptance. No claim of outperforming Typeless, verified installer, release tag or deployed running version is made.

For this change, **74 local tests** and **14 Electron flow checks** passed with natural exit 0, alongside source/dependency and six-language link checks. The 120-second flow uses generated PCM and a simulated recognizer; it does not measure SenseVoice accuracy or speed. The AudioWorklet check uses a generated 48 kHz stream converted to 16 kHz PCM. Test fixtures and raw reports remain local, outside the public tree.

#### Source presentation and repository cleanup

- Published the Dictpin application with English and five translated READMEs, setup/API/privacy guidance and MIT copyright chenjinxian1.
- Added two English application examples with fictional content, separate from the labeled concept artwork. The optional English presentation mode preserves transcript and dictionary data; Chinese remains the default.
- Simplified the public tree to the active application, required assets, native worker source, setup helpers and usage documentation. Removed test fixtures, benchmarks, legacy interfaces, internal review/release preparation and artwork-generation files from the current source tree. Full maintenance files remain local.

Local recognition, explicit dictionary correction/undo, editable results, early copying, preserved originals and temporary in-memory recovery remain unchanged. Real-device/system acceptance, complete standalone packaging, installer/signing/update validation and a verified confidential reporting channel remain pending.
