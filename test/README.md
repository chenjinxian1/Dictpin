# Isolated test helpers

Run from the project root after building `native\build-local03.cmd` and preparing Electron as described in [Installation](../docs/INSTALL.md).

```powershell
npm test
npm run check
npm run test:ui
npm run test:core
npm run test:extended
npm run test:capture
node scripts/test-microphone-permissions.cjs
```

`npm test` includes all application regressions and development-isolation checks. A small native argument-validation check executes the newly built candidate only with invalid arguments, before loading a model. The tests do not call a live provider or open a physical microphone. The compiled worker is a local build output, ignored by Git, rather than a bundled release.

`npm run test:ui` selects the current `local03` matrix. The core, extended, capture and recovery scenarios share the same production renderer/preload/IPC/store while substituting native adapters and fictional content. Capture uses a generated mathematical WAV with Chromium's fake-input flags. All work is isolated under `work/`; require assertions and natural exit before declaring success. Run GUI/media scenarios serially on one desktop: separate profiles do not establish that Windows focus and media services are independent between concurrent Electron instances.

For explicit cross-process recovery, first complete a capture scenario, then pass that scenario's synthetic profile directory:

```powershell
node scripts/ui.cjs recover "<this-checkout work/capture-.../profile>"
```

Do not pass an existing user profile. This check must read only the prior synthetic capture state without recording again.

Optional benchmark/resource scripts require the separately prepared public FLEURS corpus, native resources and recorded licenses. They are not part of the default test suite or a claim of microphone, clipboard, shortcut, focus, DPI, installer or real-service acceptance. Historical snapshot packagers and local machine review dumps are excluded from this public source export.

The two files in `tools/` are importable compatibility helpers used by regression tests. Direct execution is deliberately refused; launch the current product through `npm run dev` only.
