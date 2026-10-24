# Contributing to Dictpin

[Dictpin](https://github.com/chenjinxian1/Dictpin) is a Windows source-code development candidate under the [MIT License](LICENSE). Third-party components retain their own terms. No contributor agreement, support SLA or response-time promise is implied.

## Product scope

Keep the tool compact: explicit recording, local recognition, light cleanup, personal dictionary, review/copy and recoverable failures. Do not add translation, question answering, long-form writing, automatic learning/paste or a large control console without a separate product decision. Reuse the current JavaScript/Electron architecture and avoid unnecessary dependencies.

## Development

Read [Installation](docs/INSTALL.md), [API configuration](docs/API_CONFIGURATION.md) and [Privacy](docs/PRIVACY.md). Prepare external resources and build the native candidate:

```powershell
.\native\build-local03.cmd
npm test
npm run check
npm run check:docs
node scripts/package-inputs.cjs
npm run test:ui
```

The native candidate is built locally and excluded from Git. `npm run check` is portable and does not require the original private workspace. `npm run test:ui` selects Local03.

Use `npm run dev` only when deliberately opening the isolated development candidate. Compatibility helpers are retained for regression tests, not as launch instructions. Never replace shared resources, restart a running user's app, migrate profiles, or read real keys/transcripts/recordings to reproduce a report.

## Validation expectations

Run relevant checks, inspect outputs and require natural process exit. UI scenarios use fictional data and simulated native adapters. Use generated audio for capture checks; never open a physical microphone or make paid requests automatically. Run Electron GUI/media suites one at a time so each validation run stays isolated. Keep failed attempts as failures; do not skip assertions, weaken tests or extend deadlines just to obtain a pass.

Editing/copy/dictionary/recovery changes should cover stale replies, repeated actions, failure preservation, expiry and undo. UI work should be viewed in both themes, with reduced motion, long content, visible keyboard focus and a small window. Keep real hardware/service acceptance separate from synthetic tests.

## Reports and pull requests

Use the issue/PR templates. Describe the user problem, concrete trigger, expected/actual behavior, scope and actual validation. Include only fictional text and sanitized screenshots. Do not attach profiles, credentials, personal audio/transcripts, raw session dumps or account-specific paths. Security concerns follow [SECURITY.md](SECURITY.md).

Preserve original recognition, revision checks, explicit copying and single-task ownership. Dictionary correction stays explicit and local. Never silently add a network call or billable retry. Identify any third-party source or asset and its applicable license.

## Publication

Keep changes reviewable and inspect exactly the proposed files before pushing. Preserve [third-party notices](THIRD_PARTY_NOTICES.md) and the [public-source boundary](docs/release/PUBLISHING.md). A source commit is not a verified installer, binary release or security certification. A verified confidential reporting channel has not yet been configured.
