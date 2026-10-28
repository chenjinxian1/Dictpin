# Contributing to Dictpin

Keep Dictpin a small Windows dictation tool: explicit recording, local recognition, optional text cleanup (Fluent or Light, never adding content), personal dictionary rules, editable results, explicit copying and opt-in guarded paste. Preserve original text, task/version checks, recovery and undo. Native delivery must fail closed, have explicit consent and never automatically retry an uncertain paste. Live segments stay inside the app until explicit Stop. Append preserves earlier manual text and sends only the new suffix. Avoid new dependencies and unrelated features.

Read [Installation](docs/INSTALL.md), [API configuration](docs/API_CONFIGURATION.md) and [Privacy](docs/PRIVACY.md). Prepare the external resources, build the native worker, then check the source:

```powershell
.\native\build-local03.cmd
.\native\build-delivery.cmd
npm run doctor
npm run check
```

Use `npm run dev` for a deliberate isolated launch. Do not restart another instance, migrate user profiles, open a microphone automatically or send billable requests for validation. The check command does not run recognition or prove a clean installation.

This public tree contains the application and essential setup/docs. Automated test fixtures, benchmarks, older interfaces and internal review reports stay in the full local maintenance workspace. Do not add those artifacts or raw logs to a public change.

Describe the concrete problem, resulting behavior and checks actually performed. For UI changes, inspect the real pages with fictional content; consider both themes, keyboard focus, long text and a small window. Keep hardware/service acceptance separate. Never share credentials, profiles, personal transcripts/recordings or local account paths. Follow [SECURITY.md](SECURITY.md) for disclosure limitations.

Preserve the [MIT License](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md). Source publication does not certify an installer or binary release.
