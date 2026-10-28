# Changelog

## Unreleased

This is an application-source development candidate. No installer release, tag or verified download has been created; package versions remain development metadata.

### 2026-10-28

#### Provider configuration and draft diagnostics — local development candidate

- Added provider presets for Qwen, DeepSeek, OpenAI and SiliconFlow, plus Local/Custom, with separate remembered provider/region configurations and one active service. Explicit Save commits changed drafts and activation atomically; switching presets sends no request.
- Added draft-bound cleanup sample tests using the same request/response rules and 12-second deadline as actual cleanup. Configuration edits invalidate old test results and superseded replies cannot update the new draft.
- Added deliberate model discovery with provider-specific, same-origin adapters, a 10-second deadline, 500-model/2 MiB caps, and suggestions/manual input retained on failure. A list or one sample does not establish general quality.
- Added explicit key removal/undo and session/saved/unavailable states. Keys remain in the main process, scoped to their profile/endpoint; requested encryption or save failure preserves previous data. Legacy configurations remain unchanged on open; unsupported newer data opens read-only.
- Optional cleanup with unavailable configuration/credentials no longer prevents local dictation. No automatic paid retry, provider switch, physical microphone test or deployed running-version replacement is introduced.
- Updated API, privacy, installation and all six README explanations. Preset documentation was checked on 2026-10-28; real account access, paid-service quality and billing remain manual acceptance. This candidate is not an installer release or GitHub publication.

Verification for this candidate: **133 local tests** passed, including the existing 74 regression tests. **14 Electron flow checks in each of Chinese and English** passed with natural exit 0, using fictional profiles, in-memory service responses, simulated system adapters and intercepted capture commands. No physical microphone, live API, real key, system clipboard or paid request was used. Invalid-workspace recovery, conflicting settings restoration and switching away from a pending diagnostic were reproduced before their fixes and then passed. Test fixtures and raw evidence remain outside the public source tree.

### 2026-10-24

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
