# Security and responsible disclosure

This development candidate has not had an independent security audit. No supported release series, maintenance window, security SLA or certification is claimed.

## Reporting

**No verified confidential reporting channel is configured yet.** Do not post credentials, personal transcripts, recordings, profiles or exploit details in a public issue. The maintainer must publish a verified private contact or enable and test GitHub private vulnerability reporting before soliciting confidential reports.

Non-sensitive defects can be reported in [GitHub Issues](https://github.com/chenjinxian1/Dictpin/issues), using sanitized steps, the source revision, Windows/Node/Electron versions and expected/actual behavior. Never attach an entire workspace or Git history.

## Relevant boundaries

- Optional cleanup sends text and correct dictionary terms to the selected service and can incur fees.
- The latest transcript and dictionary are plaintext local files. There is no transcript retention/delete switch.
- API keys can use OS-backed encryption; this does not protect against another process acting as the same OS user.
- Cancelled/failed audio is temporary process memory, not crash-proof storage.
- URL validation and environment isolation are guardrails, not a security audit.
- Opt-in native delivery can replace the clipboard and send Ctrl+V after explicit Stop. It does not read the earlier clipboard. Target/identity/caret/focus checks fail closed, but a key batch is not atomic with target ownership or proof of application consumption. Ambiguous delivery is never automatically retried.
- Native target metadata is temporary; do not log tokens, control details or user text. Keep delivery pending while its safety fences are active, and preserve uncertainty if cancellation cannot retract an already dispatched operation.

Read [Privacy](docs/PRIVACY.md), [API configuration](docs/API_CONFIGURATION.md).

## Maintainer preparation

Review exact proposed files and dependencies, keep tests and user data isolated, configure a real private reporting route and verify any future binary distribution. If a credential is discovered, report only its location and have its owner revoke/rotate it. Do not echo its value, automatically rewrite history or delete user data.

This policy does not itself enable GitHub reporting, monitoring or guaranteed response.
