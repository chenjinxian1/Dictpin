# License scope for the public source

On **2026-10-24**, the project owner explicitly confirmed that the current project source and icons may be made public and instructed that the MIT copyright name be **chenjinxian1**. This public source therefore includes a root [MIT LICENSE](../../LICENSE), copyright 2026 chenjinxian1. No name was inferred from a private account or commit email.

This is a statement of the recorded project authorization and component scope, not trademark clearance, legal advice, or an independent ownership certification. The older internal audit is not distributed as current unresolved licensing guidance.

## Scope

| Material | Applicable terms |
| --- | --- |
| Original project code, documentation and original project assets | Root MIT license, with the owner-confirmed copyright name. |
| Derived sherpa-onnx C ABI declarations in native source | Retained upstream Apache-2.0 attribution and complete license in [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md). Do not remove that provenance. |
| Bundled Saira font | SIL OFL 1.1, with [the supplied notice](../../app/assets/fonts/Saira-OFL.txt). It is not relicensed MIT. |
| Concept hero artwork | Generated for the project and clearly labeled as a concept, not a screenshot or feature proof. [Brand provenance](../branding/README.md) describes its inputs and lettering; generation does not guarantee trademark clearance or copyrightability. |
| External Electron/Chromium, Node, sherpa-onnx and ONNX Runtime | Their distribution-specific licenses and third-party notices. They are not bundled in this source export. |
| External SenseVoice weights/tokens | Separate FunASR Model License 1.1; not the source-code MIT grant. |
| External Silero VAD model | Its own MIT notice; exact upstream version mapping still needs pinning before a binary redistribution. |
| Public speech benchmarks | Historical FLEURS references use CC BY 4.0. Audio and raw benchmark dumps are not part of this source export. |

The [third-party notice inventory](../../THIRD_PARTY_NOTICES.md) links the upstream sources and retains required source notices. Developer-tool versions are declarations, not a full transitive dependency/license audit. A future binary release must deliberately assemble complete notices for the exact redistributed payload.

## Still separate from a source license

No accepted installer, resource bundle, signing/update/uninstall workflow, trademark registration or security certification is implied. The public repository does not include private profiles, model weights, runtime DLLs or historical session archives. Root MIT licensing does not remove those installation, privacy or third-party obligations.
