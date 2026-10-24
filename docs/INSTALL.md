# Installation and developer commands

[Source repository](https://github.com/chenjinxian1/Dictpin). This is a **Windows x64 source-code development candidate**, not a verified installer or self-contained portable package. Original project code is MIT-licensed; external runtimes, models and fonts retain their own terms.

## Prepare the environment

1. Install [Node.js 24 or later](https://nodejs.org/en/download) for Windows x64 with Node and npm on PATH. Root scripts use Node built-ins; there is no root dependency installation step.
2. Obtain the complete [Electron 44.8.0 Windows x64 release](https://github.com/electron/electron/releases/tag/v44.8.0), specifically `electron-v44.8.0-win32-x64.zip`. Extract the whole distribution, including its notices and support files. Copying only `electron.exe` is insufficient.
3. Obtain `sherpa-onnx-v1.13.8-win-x64-shared-MD-Release-no-tts.tar.bz2` from [sherpa-onnx 1.13.8](https://github.com/k2-fsa/sherpa-onnx/releases/tag/v1.13.8). Keep its full compatible `bin` DLL set and notices. The worker checks version `1.13.8`; another ABI/runtime variant is not interchangeable.
4. Follow the [official SenseVoice model instructions](https://k2-fsa.github.io/sherpa/onnx/sense-voice/pretrained.html) for `sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2`. Place `model.int8.onnx` and `tokens.txt` together as below. Obtain [`silero_vad.onnx`](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx) from the official sherpa release asset. Keep model licenses: SenseVoice weights have separate FunASR terms, and the exact upstream Silero model-version mapping still needs pinning before redistribution.
5. Clone the source and compile the separate candidate locally. Compiled worker executables are deliberately **not committed**. The build needs the Windows 64-bit .NET Framework C# compiler at `%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\csc.exe`.

```powershell
git clone https://github.com/chenjinxian1/Dictpin.git
cd Dictpin
.\native\build-local03.cmd
```

The command builds only `native/local-asr-worker-local03.exe` in this checkout. It does not replace another application's worker, shared DLLs, or models. Preserve external artifacts and their notices; the source license does not relicense them.

## Required directory layout

```text
parent/
  Dictpin/                              # this source checkout
    app/
    native/local-asr-worker-local03.exe  # build locally; ignored by Git
    scripts/
  runtime/                              # full external Electron distribution
    electron.exe
    version                             # contains 44.8.0
    ...
  local-asr-evaluation/
    runtime/bin/
      sherpa-onnx-c-api.dll
      ...                               # all compatible companion DLLs
    models/sensevoice/
      model.int8.onnx
      tokens.txt
    models/silero_vad.onnx
    licenses/                           # retain supplied notices
```

The worker resolves resources relative to its executable. There is no supported model-directory setting. An optional ignored `.local/dependencies.json` overrides only the Electron path:

```json
{"electron":"C:\\path\\to\\electron\\electron.exe"}
```

This is a fictional local path, not a download URL or API configuration file. `TYPELESS_ELECTRON` is another runtime-path override; it does not configure an API. Existing package/environment identifiers and profile paths retain their legacy names for compatibility.

## Check before launching

After the build, from the repository root:

```powershell
npm run doctor
npm test
npm run check
node scripts/package-inputs.cjs
npm run check:docs
```

Doctor requires the external runtime/model layout and checks existence/version, not DLL completeness, model hashes or recognition quality. The application regression suite includes invalid-argument tests of the compiled candidate, so build it before testing even when no real audio is used.

The portable source check does not require the original developer's private history, archive or launcher. Static package-input inspection checks that the locally built candidate and required production sources are present; it still reports **`distributionReady:false`**. A passing source check is not an accepted installer.

## Start and use deliberately

```powershell
npm run dev
```

The launcher uses an isolated development profile under `work/dev/profile/`; it does not start recording by itself. Existing development settings are retained. First-run defaults leave cleanup and global shortcuts off. Historical compatibility helpers are not launch instructions.

In **设置** (Settings), choose the microphone actually used by Windows Recorder and click **保存更改** (Save changes). Without an API, keep **轻整理** off. Click **开始听写** to record and **结束听写** to stop, then inspect, edit or explicitly copy. A segment is limited to 60 seconds, with automatic stop around 58 seconds.

Settings save while idle and apply to the next task without restarting. A running task keeps its captured device/dictionary/service configuration. Complete cancelled audio can be recovered for 30 seconds, failed-recognition audio for up to five minutes, in memory only. Recovery requires a click and disables optional remote cleanup.

## Optional English presentation

Choose English interface labels when starting a new development instance:

```powershell
npm run dev -- --ui-language=en
```

The flag is process-only. It does not migrate a profile, translate dictated text or dictionary terms, change recognition language, or start recording. An already running instance keeps its current presentation. Omit the flag for the default Chinese interface. Some unmapped system/provider messages retain their original language.

## Preview documentation

```powershell
npm run preview
```

Preview prints a loopback-only URL. It serves the sanitized documentation preview, concept hero and selected fictional-content software screenshots; it does not run the application or expose profiles/work directories. Stop it deliberately when finished. Previewing screenshots does not validate hardware or a paid API.

## Validation and build status

| Command | Meaning and limits |
| --- | --- |
| `npm test` | Application and development regression suites; includes compiled-candidate invalid-argument checks. Build the candidate first. |
| `npm run check` | Portable source syntax, ignore-boundary and documentation checks; does not depend on private original-workspace evidence or require an empty Git remote list. |
| `npm run check:docs` | Publication links, navigation, image hashes/dimensions and concept/screenshot disclosures. It does not certify legal rights or translation quality. |
| `node scripts/package-inputs.cjs` | Strict development/package inputs, including the locally compiled candidate. No installer is run. |
| `npm run test:ui` or `node scripts/ui.cjs local03` | Current Local03 real Electron page matrix with fictional state and simulated native adapters. External Electron and the compiled candidate must be available. |
| `npm run test:core` / `npm run test:extended` | Focused Electron flow suites. |
| `npm run test:capture` | Generated-audio flow, not a physical microphone. |
| `node scripts/test-microphone-permissions.cjs` | Permission-routing checks with fake media input. |

Require both assertions and natural process exit. Forced termination is not success. [Verification](release/VERIFICATION.md) reports the exact public-source checks; earlier development results are historical. Raw output stays in ignored `work/`.

There is **no verified installer build command**. Existing electron-builder metadata does not package the worker, complete DLL/model set and paths into an accepted standalone distribution. No supported `npm run build`, signed installer, clean install, update or uninstall is claimed. Installing app development dependencies does not resolve those packaging gaps.

## Troubleshooting

Missing runtime/model: compare the complete layout and pinned versions, rebuild the candidate if missing, then run doctor. No sound: save the input that works in Recorder; check permission/mute, then record deliberately. API errors are covered in [API configuration](API_CONFIGURATION.md). Copy important text if saving fails. Never disable certificate verification or post credentials, personal transcripts or raw device logs in an issue.

Read [third-party notices](../THIRD_PARTY_NOTICES.md), [privacy](PRIVACY.md), and [source-publication scope](release/PUBLISHING.md) before sharing a modified source snapshot or binary.
