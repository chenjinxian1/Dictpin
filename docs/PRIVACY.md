# Privacy and data handling

This describes the current Windows development candidate, not a privacy certification or a promise about an external service. The default development profile starts without a key, with light cleanup off and no global shortcuts. Existing development profiles retain their own saved settings.

## What stays local

Recording starts only after an explicit user action. An AudioWorklet receives the device stream through a 16 kHz audio context and produces mono PCM16. Pause-preferred segments, at most 20 seconds each, enter one local SenseVoice worker with Silero VAD. Explicit dictionary corrections are local. The product has no automatic cloud-recognition fallback.

The current product does not save new audio recordings to files. Completed text is checkpointed; completed audio is released. Only a bounded collection of accepted **unfinished** PCM segments remains recoverable in process memory: **30 seconds** after cancellation, or **up to five minutes** after recognition failure. This is not an archive of an entire long recording. Recovery requires an explicit action and disables optional cleanup and automatic paste. Expiry, clear, and exit discard that audio. Starting another recording with pending audio requires explicit discard, after capture has stopped. Crash or power loss cannot guarantee recovery.

One recording session and one local decoder run at a time. The session guard is 30 minutes and 100,000 characters; queue pressure stops capture with accepted work retained. Continuous speech may hit a 20-second boundary, so boundary-word quality is not guaranteed by this engineering change.

Do not interpret “no new recording files” as “no transcript storage.”

## What is written to disk

The normal development profile is `work/dev/profile/`. It is ignored by Git.

| File/data | Contents and retention |
| --- | --- |
| `settings.json` | Device/shortcut/service preferences and optional encrypted key envelope. Settings themselves are not encrypted. |
| `recent-result.json` | Latest recognition original, dictionary-corrected draft, current edited text, and restoration metadata, in **plaintext**. Written even with legacy multi-item history disabled. No automatic expiry or user-facing retention/delete control exists. |
| `dictionary.json` | Saved terms and explicit wrong-spelling rules, in plaintext. |
| `dictionary-archive.json` | Non-destructive deleted-entry records for undo. Deleting a visible term is not a promise of erasing every local copy. |
| `token-usage.json` | Request/model/status/timing/token metadata. No transcript bodies or keys. Unknown price/usage is not zero cost. |
| Other ignored `work/` directories | Session/temp/log/crash and automated-test artifacts. These are not publication material. |

Manual result edits are saved after a short pause (400 ms); copy, navigation, a new task, and normal exit flush pending saves. Live recording previews remain read-only until accepted audio finishes recognition. Append keeps the earlier edited draft unchanged and applies optional cleanup only to the newly recognized part. A failed save leaves the in-memory draft available, but durable storage is not guaranteed: copy important text before exiting. No text-encryption or crash-proof recovery claim is made.

## Optional guarded Windows delivery

Automatic paste is off by default and requires a new explicit settings consent. A dormant legacy `autoPaste` value does not enable it. The separate helper is launched only for an enabled shortcut-origin session; starting from the app UI stays manual.

At shortcut start the helper checks the focused editable control and retains an opaque, temporary lease with process/control/caret and clipboard-sequence metadata. It rejects passwords, terminals, unsupported controls and elevated targets. Unrelated foreground, control, caret, process or clipboard changes invalidate delivery. Metadata stays in helper/main-process memory; target tokens are not broadcast to the renderer or written to result files. It does not read the clipboard's earlier contents or target text.

After explicit Stop, one guarded attempt can replace the clipboard with the **newly added** text and send Ctrl+V. Returning focus from Dictpin is permitted only after an explicit Stop in its own UI; no unrelated application is forced forward. The clipboard is not automatically restored or backed up. The new text remains available for explicit copying. New recording, append and editing are blocked during pending delivery. Resource/backpressure stops and recovery do not authorize a paste.

Sending keys does not prove that another application consumed them. Failed, partial or cancelled in-flight delivery may have an unknown outcome: check the original field before doing anything again. There is no automatic retry. Windows input injection cannot atomically bind a key batch to a particular target; conservative guards reduce risk but do not establish universal native compatibility or a security certification. Physical input controls, focus restoration, clipboard behavior and UIPI still need manual acceptance.

## Optional network processing

With light cleanup enabled, a text Chat Completions request sends:

- The dictionary-corrected transcript and narrow cleanup instructions.
- A bounded, filtered list of saved **correct dictionary terms**, which may themselves contain private names.
- Authentication and normal network metadata to the endpoint you selected.

It does **not** send raw recording audio, explicit misspelling aliases, full result history, or clipboard content in that cleanup request. This is a statement about the current product request, not every possible upstream service or operating-system network activity.

The provider controls its own retention, processing location, billing and abuse policies. Review them before entering sensitive material. A local compatible text endpoint can be configured on loopback, but none is bundled or certified here.

Testing a saved connection sends synthetic `Reply with OK.` text and can be billable. Actual cleanup has a 12-second deadline; connection tests have a 15-second timeout. There is no automatic paid retry. Cancelling, copying, or editing stops accepting that response locally; it does not guarantee provider-side billing or processing stops. A deliberate retry may cost again.

## Keys

Keys are held in the main process, not returned as plaintext form values. New keys are session-only unless **用系统安全存储保存** is selected. Persisted keys use Electron `safeStorage` encryption through the operating system. If encryption is unavailable, the application keeps the key in memory rather than writing plaintext.

Leaving the key field blank preserves the current key. Unchecking secure storage and saving removes the encrypted persistent envelope while leaving the current session key usable; normal process exit discards session-only keys. The form has no dedicated clear-session-key control. When an existing key is present, changing the service address through the current form requires a replacement key; it never silently transfers that credential to a new host.

OS-backed encryption does not protect against malware with the same user's privileges. Never share a profile, settings file, screenshot of entered credentials, or clipboard contents. Do not manually edit a running application's profile or change real credentials while preparing publication material.

## Diagnostics and public sharing

Capped in-memory performance records contain stage duration/status/size/resource metadata, not transcripts, dictionary text, keys, or clipboard contents. This does not make every historical review dump anonymous. Historical raw development evidence is excluded from this public source snapshot.

Only individually inspected screenshots with fictional content are used in the README. No real user transcript, recording or key was read for those captures. See [application examples](SCREENSHOTS.md) for their scope. Bounded scans cannot guarantee that arbitrary secrets are absent.

Do not publish `work/`, `.local/`, profiles, models/runtime payloads or raw review dumps. Tests, benchmarks and internal review materials stay in the full local maintenance workspace. The public source history is separate from the original development history. A private reporting channel has not been configured; see [SECURITY.md](../SECURITY.md) before disclosing a problem.
