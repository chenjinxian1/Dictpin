# Dictpin — public source snapshot notes

This is a source-code development snapshot, **not a numbered binary release**. No GitHub Release, tag, installer or download package is assigned by these notes.

## Included

- Local CPU SenseVoice recognition without automatic cloud ASR fallback.
- Explicit personal dictionary rules, correction review and undo.
- Separate recognition original, corrected draft and editable current text.
- Copy/edit ending pending cleanup, with late-response isolation.
- Explicit in-memory audio recovery: 30 seconds after cancellation, up to five minutes after failed recognition.
- Three compact pages and a floating strip; light/dark, high contrast and reduced motion.
- Optional compatible text cleanup with preserved local draft on failure or deadline.
- Six complete README languages and clearly separated AI concept art and synthetic-data application screenshots.
- Owner-authorized MIT original project source/assets, with separate third-party notices.

## Requirements and limits

Windows x64, Node.js 24+, locally compiled native candidate and external pinned runtime/model resources. Follow [Installation](../INSTALL.md). The UI defaults to Simplified Chinese and includes an optional English presentation mode. Documentation languages do not add six UI or recognition languages.

Latest-result text is plaintext on disk. Optional cleanup sends text and correct dictionary terms to the chosen provider and can cost money, including deliberate connection tests and retries. No automatic paid retry or raw-audio upload is part of the active dictation flow.

## Validation

Read the exact [source-export verification](VERIFICATION.md). Synthetic checks are distinct from real microphone, shortcut, clipboard, focus/DPI, device-change, service-quality and clean-install acceptance. Packaging inspection still reports `distributionReady:false`.

A future binary release must verify resource bundling, all applicable notices and installation behavior separately. Publishing this source does not relicense external models or runtime libraries.
