# Verification of the public source export

Recorded on **2026-10-24** for the **separate public source snapshot**. Node.js **v24.11.1**, Windows x64; the Electron requirement is **44.8.0**. These are fresh checks of the export, not reused counts from the original development history.

## Final source-export checks

| Check | Observed result |
| --- | --- |
| `npm test` | **458 application + 7 development tests passed**, zero failures; exit 0. |
| `npm run check` | **160/160 source syntax checks** and **45/45 source/package-input checks** passed. Ignore-boundary checks passed. No private original archive or empty-remote requirement. |
| `node scripts/package-inputs.cjs` | **46/46 strict development/package inputs** passed with the locally compiled candidate present. Explicitly reports **`distributionReady:false`**. |
| `npm run check:docs` | **22 documents, six READMEs, 209 local links, six anchors, two English application screenshots and two concept-art assets** checked; no problems. The 33 external URLs are inventoried, not availability-certified. |
| `npm run test:ui` / Local03 | **87/87 page checks passed**, zero external requests, successful teardown and natural exit 0; process elapsed **51,315 ms**. |
| `npm run test:core` | **5/5 flow checks passed**, successful teardown and natural exit 0; process elapsed **2,947 ms**. |
| `npm run test:capture`, isolated runs | Two serial runs each passed **7/7 generated-audio checks**, with successful teardown and natural exit 0; process elapsed **5,308 ms** and **5,233 ms**. |

The native candidate was built locally for validation and remains ignored by Git. These process durations are test-run timings, not speech-recognition latency measurements.

## Failed concurrent attempt retained

An earlier capture test started concurrently with the core suite recorded three checks, then hit its capture watchdog and exited **1**. That attempt is a **failure**, not a passing seven-check run. Its evidence remains in ignored local test output.

The capture script and timing limits were not changed to make the later runs pass. The two subsequent isolated runs passed all seven checks and exited naturally. This observation does not establish a precise focus/media root cause or claim a product fix. Run Electron GUI/media suites **one at a time** to keep their validation isolated; do not skip assertions or increase timeouts merely to hide a failure.

## English UI examples

The optional English presentation mode changes interface labels only. Ten focused regression tests protect dictated text, originals, dictionary wording, input values, default Chinese behavior and idempotent DOM updates. The application suite now contains 458 tests, including the original 448.

The two 640 × 480 screenshots show the main window and expanded API configuration. The actual production renderer/preload/IPC/store was used with fictional text, real local dictionary correction and simulated system adapters. Five capture checks passed; natural exit 0 in **1,545 ms**. There were zero microphone, ASR or network calls; only an in-memory clipboard adapter was used. The key field was empty and no service connection result was fabricated.

Early English-capture attempts did not pass while DOM idempotence and capture-fixture initialization/quoting were being corrected. They were not accepted as screenshots or counted as successes. The final PNG files are unchanged renderer pixels. Canonical UTF-8/LF hashes identify the production source so that normal Git line-ending conversion does not invalidate provenance.

After these changes, the default Chinese Local03 matrix passed 87/87, the core flow passed 5/5, and a serial generated-audio capture passed 7/7 with natural exit 0 in **5,343 ms**. This adds validation; it does not turn the earlier failed concurrent attempt into a success.

## Evidence boundaries

The regression suites use synthetic settings, dummy credentials, generated audio or substituted native adapters. UI captures are actual Electron offscreen rendering with fictional content. They do not certify physical microphone behavior, real global shortcuts/clipboard, hot-plugging, native focus, multiple screens/DPI, clean installation or a paid service.

The selected [application screenshots](../SCREENSHOTS.md) were freshly rendered from the production English presentation mode with demo data. Their hashes are separate from the AI [concept hero manifest](../branding/hero-manifest.json); the concept is not a software screenshot or evidence of implemented functions.

No fresh recognition quality/speed benchmark is implied by exporting source. Earlier fixed-file evidence applies to its corpus and environment only. No universal accuracy, latency or memory claim is made. No real recording, private transcript, project credential or paid text-service request was used for these checks.

## Not an installer acceptance

Native source is included, but compiled executables, shared DLLs and model weights are not committed. Static packaging checks report `distributionReady:false`. Full payload notices, exact VAD upstream version mapping, installer/signing/update/uninstall and clean-machine acceptance remain separate work.

The original running application, its profile and shared resources were not changed by preparing this public copy. Both assertions and natural process exit are required; forced termination is never counted as success. Raw test output remains in ignored `work/`, rather than exposing machine-specific traces in the public repository.
