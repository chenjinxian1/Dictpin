# Dictpin: working brand

**Dictpin** combines dictation with a small, immediately available “pin” tool. Suggested pronunciation: “dict-pin.” Tagline: **Speak. Refine. Flow.** Alternative short description: **Compact desktop dictation.**

This is a working display name, selected after [preliminary screening](NAME-CHECK.md) on 2026-10-24. Voxlet has direct same-category conflicts. No trademark, company-name, domain, package, or handle availability is guaranteed or reserved. Keep the name provisional until the owner completes clearance.

## Visual direction

Off-white paper surfaces, graphite text, fine alignment lines, modest chamfered edges, and a small industrial-yellow accent. Typography and negative space carry the identity; technical details are restrained. Saira is used under its own [OFL notice](../../app/assets/fonts/Saira-OFL.txt).

Industrial science-fiction inspiration is a mood, not permission to copy game assets. No game characters, logos, screenshots, or software marks were supplied to the generator. No affiliation with Typeless or a game publisher is implied. Generation is not a legal originality or trademark certification.

## Hero artwork: AI concept, not software evidence

![Dictpin AI-generated concept artwork, not an actual application screenshot](hero.png)

**Concept artwork. This is not a software screenshot or evidence of implemented features.** The floating instrument, sound waves, and abstract text bars are an illustration of speech becoming text. They do not describe literal controls, multiple output cards, hardware, or additional application functions.

Created on 2026-10-24 with the built-in image-generation tool. The first draft looked like microphone hardware; the selected refinement replaces it with a slender software-inspired voice strip and a quieter backdrop. No application API key or paid text-cleanup request was used.

| Asset | Purpose |
| --- | --- |
| [hero.png](hero.png) | README hero, **1664 × 936**, exact 16:9. Native pixels, minimal centered crop; no upscaling. Manually typeset Dictpin, tagline, and concept-art disclosure. |
| [hero-base.png](hero-base.png) | Selected unlettered AI-generated base, **1672 × 941**, retained unchanged. Not a software screenshot. |
| [hero-prompt.en.txt](hero-prompt.en.txt) | Original English generation prompt. The 2560 × 1440 size is an ideal request, not the actual delivered size. |
| [hero-refinement.en.txt](hero-refinement.en.txt) | Actual corrective edit instructions for the selected version. The only reference was the first AI-generated concept. |
| [compose-hero.ps1](compose-hero.ps1) | Deterministic Windows typesetting/crop script using the already bundled Saira font. It refuses to overwrite an existing hero unless explicitly passed `-Force`. |
| [hero-manifest.json](hero-manifest.json) | Asset sizes, hashes, roles, text, crop and generation provenance, separate from the actual application-screenshot manifest. |

To reproduce only the lettering/crop from the saved base in a reviewed working copy:

```powershell
.\docs\branding\compose-hero.ps1 -Force
```

Regeneration changes hashes; inspect the output and refresh the manifest before accepting it. The owner confirmed public distribution of the source and icons and chose MIT copyright name chenjinxian1 on 2026-10-24. Original project material follows the root MIT grant; the font and other third-party material retain separate terms. This is not trademark clearance or an independent guarantee of copyrightability. No certification badges are added.

## Application screenshots

[Selected application screenshots](../SCREENSHOTS.md) come from an isolated real Electron renderer using fictional state and simulated native adapters. Keep their in-image synthetic-data label and explanatory captions. They are separate from the AI concept above and do not certify physical microphone/system behavior.

The default interface retains its Chinese title. The optional English presentation mode displays Dictpin and English interface labels; dictated text, dictionary terms and input values are never translated. Executable identity, package IDs, configuration paths and user data are unchanged. Do not redraw an actual screenshot to suggest an unimplemented branded UI.

All six READMEs show the concept first with a localized disclosure, followed by a separate actual-application section. Historical evidence retains its original names and results; it is not rewritten as fresh acceptance.
