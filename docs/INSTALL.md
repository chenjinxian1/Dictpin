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
.\native\build-delivery.cmd
```

The first command builds `native/local-asr-worker-local03.exe`; the second builds the separate `native/dictpin-delivery.exe` for optional guarded paste. Both outputs stay in this checkout and are ignored by Git. The delivery helper uses the Windows .NET Framework UI Automation/Windows Forms assemblies supplied with the framework, not a downloaded dependency. It does not replace another application's worker, shared DLLs, or models. Preserve external artifacts and their notices; the source license does not relicense them.

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
npm run check
node scripts/package-inputs.cjs
npm run check:docs
```

The guarded delivery helper is optional for recognition and copying. Missing it disables native delivery without preventing manual use. `doctor` reports that optional component separately. Doctor requires the external runtime/model layout and checks existence/version, not DLL completeness, model hashes or recognition quality. Compile the worker before launching. No microphone or model is started by these checks.

The portable source check does not require the original developer's private history, archive or launcher. Static package-input inspection checks that both locally built helpers and required production sources are present; it still reports **`distributionReady:false`**. A passing source check is not an accepted installer.

## Start and use deliberately

```powershell
npm run dev
```

The default launcher reuses a development profile across sibling checkouts. New retained data starts at `../Dictpin-Development/profile/`; it does not start recording by itself. First-run defaults leave cleanup and global shortcuts off; later launches preserve your saved choices. `npm run doctor` reports the selected profile without reading a key. Test fixtures, legacy entry points, benchmark tools and internal review reports are excluded from this repository.

For a candidate that uses only its own configuration, run `npm run dev -- --profile=isolated` or [Start-Isolated.cmd](../Start-Isolated.cmd). It uses that checkout's `work/dev/profile/` and does not copy saved keys from other candidates. The normal [Start-Dev.cmd](../Start-Dev.cmd) uses the retained profile.

If this updated launcher is in a checkout with an existing configured `work/dev/profile/`, `npm run dev -- --remember-current-profile` selects that profile for subsequent sibling checkouts. This writes only a version and relative paths to the settings, runtime and environment directories in `../.dictpin-development-profile.json`: it does not copy/decrypt keys or move/rewrite settings. The runtime path preserves Electron's encryption context as well as the settings file. Keep all selected directories; a missing, malformed, newer or out-of-workspace reference stops startup instead of silently making an empty replacement. An already selected different profile is not overwritten.

The existing single-instance lock belongs to the selected profile. Starting another checkout with that same profile displays the running instance and does not switch its code or start a second writer. Deliberately exit that development instance before using another build with the same profile. Use isolated mode for concurrent comparisons. Other running profiles are not closed or restarted.

In **设置** (Settings), choose the microphone actually used by Windows Recorder and click **保存更改** (Save changes). Without an API, keep **文字整理** (Text cleanup) off. Click **开始听写** to record and **结束听写** to stop, then inspect, edit or explicitly copy. Recording now previews ordered local recognition segments while you speak. Segments prefer pauses and are capped at 20 seconds; a session is guarded at 30 minutes/100,000 characters, with early stop if recognition falls behind. Completed text is preserved and accepted unfinished PCM is retained for explicit recovery.

In **模型连接** (Model connection), select a provider preset or Local/Custom and fill the actual model and key. Provider/region configurations are remembered separately; the active service and unsaved draft are identified. Test cleanup checks the draft with a fictional sample only when clicked; Get models is also explicit. Save changes commits the modified profiles and activation together. Missing cleanup credentials allow local dictation to continue for that passage. See [API configuration](API_CONFIGURATION.md) for limits, key removal and migration.

Settings save while idle and apply to the next task without restarting. A running task keeps its captured device/dictionary/service configuration. Complete cancelled audio can be recovered for 30 seconds, failed-recognition audio for up to five minutes, in memory only. Recovery requires a click and disables optional remote cleanup.

## Guarded paste and append

Build the delivery helper with the command above. In Settings, explicitly enable **安全自动粘贴** (Guarded auto-paste) and save. Existing profiles stay off unless newly opted in. Focus a supported editable field, then use the dictation shortcut. After explicit Stop, Dictpin attempts a single paste. App-UI starts stay manual. Passwords, terminals, elevated/unsupported controls and changed focus/caret/process/clipboard state block delivery. Returning from Dictpin is allowed only after an explicit Stop in its own UI, without forcing unrelated apps. The clipboard is replaced, not read or backed up.

Use **继续追加** (Append more) for another recording without overwriting the earlier draft; the shortcut append preference is under Other options. Full Copy includes the combined result, while guarded delivery sends only newly added text. Existing text is not re-refined. During recording/decoding the preview is read-only; edit/copy is available once remaining segments finish. Appended results currently do not expose the whole-result cleanup retry action, preserving the earlier draft.

An uncertain paste result means check the original input first; never assume nothing was inserted. There is no automatic retry. Resource/backpressure stops and recovered audio do not auto-paste. These are development capabilities, not completed physical-input acceptance. See [Privacy](PRIVACY.md) and [Changelog](../CHANGELOG.md).

## Interface language

The interface follows the Windows display language: Chinese display languages show Chinese and every other language shows English. Change it under **Settings → Interface language** (System, Simplified Chinese or English); the choice applies after restarting Dictpin.

To force a language for a development instance:

```powershell
npm run dev -- --ui-language=en
npm run dev -- --ui-language=zh-CN
```

The flag is process-only and takes priority over the saved setting. Neither changes dictated text, dictionary terms or the recognition language, and neither starts recording. An already running instance keeps its current presentation.

## Validation and build status

| Command | Meaning and limits |
| --- | --- |
| `npm run check` | Portable source syntax, ignore-boundary and documentation checks; does not depend on private original-workspace evidence or require an empty Git remote list. |
| `npm run check:docs` | Usage-document links, six-language navigation, selected image files and screenshot/concept separation. It does not certify legal rights or translation quality. |
| `node scripts/package-inputs.cjs` | Strict development/package inputs, including the locally compiled candidate. No installer is run. |

This repository contains only the application and its supporting setup/documentation. Automated test fixtures and internal performance/review reports remain in the full local maintenance workspace. Source checks do not certify a physical microphone, OS shortcuts/clipboard, DPI or live paid services.

There is **no verified installer build command**. Existing electron-builder metadata does not package the worker, complete DLL/model set and paths into an accepted standalone distribution. No supported `npm run build`, signed installer, clean install, update or uninstall is claimed. Installing app development dependencies does not resolve those packaging gaps.

## Troubleshooting

Missing runtime/model: compare the complete layout and pinned versions, rebuild the candidate if missing, then run doctor. No sound: save the input that works in Recorder; check permission/mute, then record deliberately. API errors are covered in [API configuration](API_CONFIGURATION.md). Copy important text if saving fails. Never disable certificate verification or post credentials, personal transcripts or raw device logs in an issue.

Read [third-party notices](../THIRD_PARTY_NOTICES.md), [privacy](PRIVACY.md) before sharing a modified source snapshot or binary.
