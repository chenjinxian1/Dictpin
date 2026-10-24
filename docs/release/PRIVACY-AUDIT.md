# Public source privacy boundary

Prepared on **2026-10-24** for [chenjinxian1/Dictpin](https://github.com/chenjinxian1/Dictpin). This source publication uses a separately reviewed copy with a fresh history. It does not push the original development repository and its older review traces.

## Included deliberately

Application/renderer source, regression tests, necessary build and development helpers, public documentation, owner-approved icons, the licensed Saira font, selected fictional-content Electron screenshots and clearly labeled AI concept art. The native candidate is built locally rather than committed as an executable.

## Excluded

- Original Git history and its author/committer metadata.
- Old review dumps, machine-specific provenance records, session diagnostics and manual hardware-test records.
- Saved settings, keys, results, personal dictionary/archive, usage records and profiles.
- Real recordings, user transcripts, clipboard data and temporary files.
- Runtime DLLs, model weights, dependency installations and build outputs.

These exclusions retain the original local workspace and evidence; they are not a history rewrite or deletion of user data.

## Verification boundary

Inspect the exact proposed tracked files before the first push, including filenames, sizes, credential patterns, personal account paths and image contents. No ignored profile or recording is needed for that inspection. Test output remains in ignored `work/`.

A pattern scan can miss arbitrary, encoded or embedded secrets. A successful scan is not a security certification. Synthetic error tests may contain deliberately invented paths or dummy credentials; those must be distinguished from real values without printing secrets.

The two English software images use fictional state and simulated system adapters. Their [manifest](../images/manifest.json) is separate from the [concept-art manifest](../branding/hero-manifest.json). The concept does not demonstrate implemented controls, hardware or extra features.

## Current application privacy

The latest text and dictionary are local plaintext files; disabling multi-item history does not disable latest-result persistence. Optional cleanup sends the corrected transcript and a bounded correct-term list to the configured service and can incur charges. Audio recovery is memory-only and requires explicit user action. Read [Privacy](../PRIVACY.md) for the complete behavior.

Fresh source-export checks are recorded in [Verification](VERIFICATION.md). Real microphone, operating-system integrations and paid-service quality remain separate acceptance work.
