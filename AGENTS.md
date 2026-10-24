# Dictpin contributor guidance

Read README.md, docs/INSTALL.md and docs/PRIVACY.md before changes. Keep the product compact: local dictation, explicit dictionary rules, optional light text cleanup, editing and explicit copying. No translation, Ask, expansion, automatic pasting or large history console.

Preserve recognition originals, task/version ownership, recording isolation, recovery, undo, drafts and clipboard feedback. Do not inspect or migrate real keys, profiles, transcripts or recordings. Never automatically open a physical microphone or call a paid service for validation. Use synthetic data and isolated work/ fixtures.

Use npm run dev for a deliberate development launch. Do not stop or replace a user's running application. External runtimes/models stay external. Build the Local03 worker locally from native/build-local03.cmd; generated binaries remain ignored.

Run npm test and npm run check for relevant source changes. Run npm run check:docs for documentation/assets. UI changes require the current Local03 Electron matrix and visual review; synthetic rendering is separate from actual hardware/OS/service acceptance. Require natural test-process exit.

Keep work/, .local/, profiles, recordings, models, credentials, private paths and raw user logs out of Git. Retain MIT and separately applicable third-party notices. Do not infer UI/ASR language support from translated README files.
