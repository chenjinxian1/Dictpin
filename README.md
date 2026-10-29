<h1 align="center">Dictpin v0.2.2-dev.34</h1>

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

<!-- overview -->
Dictpin is a Windows desktop voice-to-text development candidate built with Electron, local SenseVoice recognition, explicit personal dictionary rules, and optional text cleanup through a compatible service. For short messages, notes, names, and technical terms: start, speak, review, copy.
<!-- /overview -->

## Features

- **Local recognition:** SenseVoice runs on the CPU with Silero voice activity detection.
- **Personal dictionary:** save correct terms and explicit misspellings, review changes, and undo corrections.
- **Automatic cleanup:** Fluent removes fillers and repetitions; Light adds punctuation and sentence breaks. The recognition original stays available.
- **Long dictation:** live text previews, append another recording, edit, and copy. Interrupted audio can be recovered in memory for 30 seconds after cancellation or five minutes after recognition failure.
- **Compact controls:** results, dictionary, settings, and a floating recording strip, with keyboard shortcuts and light/dark themes.
- **Guarded paste:** an optional, opt-in way to deliver text to the original input field.

## Screenshots

Software screenshots · English demo

### Main interface

![Main interface](docs/images/results.png)

### API settings

![API settings](docs/images/settings.png)

[Screenshot details](docs/SCREENSHOTS.md)

## Quick start

Windows x64 and Node.js 24+. Prepare Electron 44.8.0, sherpa-onnx 1.13.8, SenseVoice, and Silero VAD using the installation guide. [Installation guide](docs/INSTALL.md)

```powershell
.\native\build-local03.cmd
.\native\build-delivery.cmd
npm run doctor
npm run check
node scripts/package-inputs.cjs
npm run dev
```

Choose your microphone in Settings, save, then start and stop dictation. The final text appears in the editor. `Ctrl+Enter` copies all text; `Ctrl+C` copies a selection.

Normal startup reuses your saved development configuration. Use `npm run dev -- --profile=isolated` for a separate profile.

## Model connection

In **Settings → Model connection**, choose Qwen, DeepSeek, OpenAI, SiliconFlow, a local compatible service, or Custom. Enter the address, model, and key, then save. Automatic cleanup runs after dictation finishes; without a usable connection, local dictation continues.

Built-in suggestions work offline. **Get models** and **Test cleanup** run when clicked. Provider usage may be billed. [API setup and troubleshooting](docs/API_CONFIGURATION.md)

## Privacy

Speech recognition runs locally. With cleanup enabled, text and dictionary terms go to your configured service. Keys can be encrypted with Windows secure storage; the latest result is stored locally. [Data handling](docs/PRIVACY.md)

## Documentation and license

[Installation](docs/INSTALL.md) · [API configuration](docs/API_CONFIGURATION.md) · [Privacy](docs/PRIVACY.md) · [Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

[MIT © 2026 chenjinxian1.](LICENSE) [Third-party notices](THIRD_PARTY_NOTICES.md)
