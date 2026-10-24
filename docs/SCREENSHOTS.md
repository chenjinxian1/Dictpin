# Software examples: English presentation mode

These are **actual production Electron renderer captures**, taken on 2026-10-24 in the application's optional English presentation mode. They are not AI-generated images, reconstructed interfaces, or retouched pixels. The default UI remains Simplified Chinese; the examples use the genuine English mode.

Exactly two main-window examples are included: the result page and API configuration. Both use a fixed **640 × 480** renderer viewport. Text, saved settings, microphone enumeration, ASR, shortcuts, tray and clipboard adapters are isolated demo fixtures. No existing user profile, real recording, private transcript or credential is read.

## Main interface

![English Dictpin main interface with an editable demo result](images/results.png)

The original demonstration sentence contains the explicit misspellings `dict pin` and `sense voice`. The production local dictionary module changes them to `Dictpin` and `SenseVoice`. The seeded result retains `$500`, `3 PM` and `Do not move the deadline.`.

This demonstrates rendering and local dictionary correction, **not acoustic recognition quality**. The visible result is editable. The capture checks a real edit/save/version/copy flow through production IPC and Store, using an in-memory clipboard adapter. It then returns to the corrected demo result before taking the picture. The real system clipboard is neither read nor changed.

## API configuration

![English API settings with an example Qwen endpoint and an empty API key](images/settings.png)

The real settings accordion is expanded and scrolled to show the API endpoint, model, empty key field, secure-storage option and save control. The example address is `https://dashscope.aliyuncs.com/compatible-mode/v1`, with model `qwen-plus`. It is a configuration example, not a promise that this endpoint matches every account/region/workspace; follow [API configuration](API_CONFIGURATION.md).

The API key is empty and no connection test is run. There is no invented connected state, successful service response, latency measurement or billing claim. The screenshot comes from the actual English renderer rather than translated image pixels.

## Reproduce safely

Prepare external Electron 44.8.0 and build the candidate as described in [Installation](INSTALL.md). Run this capture by itself, after other Electron GUI/media tests have finished:

```powershell
node scripts/capture-docs.cjs
```

This writes only an isolated run under ignored `work/`. To replace the two documentation images and their manifest after reviewing a successful capture:

```powershell
node scripts/capture-docs.cjs --update-docs
```

The driver starts the production renderer/preload/IPC/Store with `uiLanguage:'en'`, seeds an English-only profile, applies real dictionary rules, and substitutes native system adapters. Network access is blocked, physical media capture is denied, and no ASR worker or paid text service is invoked. Injected test-adapter and inspection scripts are syntax-checked before execution; they do not replace application labels or user text.

Both assertions and natural child-process exit are required before files can be copied into `docs/images/`. Failed attempts do not update the images. The accepted run passed **five checks**, observed zero network requests and zero microphone commands, completed teardown, and exited **0** naturally.

## Provenance and scope

[manifest.json](images/manifest.json) records the two image sizes and exact raw PNG hashes, English presentation mode, synthetic-data scope, isolated execution and relevant production-source fingerprints. Source fingerprints use canonical UTF-8/LF so a normal Windows CRLF checkout does not invalidate them; PNG hashes remain exact binary hashes.

The separate [AI concept hero](branding/README.md) is an illustration and has its own manifest and prominent concept-art disclosure. It is never counted as a software screenshot.

These offscreen captures do not certify physical microphones, system clipboard or global shortcuts, native focus, device changes, multi-display/Windows DPI, or live API quality. The captured viewport is not an operating-system DPI acceptance test. See [Verification](release/VERIFICATION.md) for broader source checks and their limits.
