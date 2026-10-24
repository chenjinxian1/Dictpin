# Naming check: Dictpin

Checked on **2026-10-24**. This is a public-name screening record for repository presentation, not a trademark search, legal opinion, domain reservation, or assurance that a name is available.

This screening predates creation of this project's own public repository. Search counts below are historical observations, not a live count after publication.

## Decision for this project

Use **Dictpin** as the working display name. It combines *dictation* and *pin*: a small tool that turns speech into text worth keeping. Suggested pronunciation: **dict-pin**. It describes a compact utility without promising writing, translation, or an assistant.

Do not use the preferred initial candidate **Voxlet**: multiple existing projects already use it for desktop dictation, including a Windows application. A different spelling of the same name or the addition of “Local” would not sufficiently distinguish this project in search results.

This decision changes presentation materials only. It does not change application identifiers, package names, executable names, settings fields, user-data directories, or existing local paths. The project is independent of Typeless and of the existing projects listed below.

## Candidate comparison

The four alternatives below were screened in addition to Voxlet. Their meanings are proposed brand interpretations, not claims about ownership.

| Candidate | Meaning and fit | Observed collision | Recommendation |
| --- | --- | --- | --- |
| **Voxlet** | Voice + a small utility; very close to the product brief. | Existing Windows and macOS dictation repositories, plus other voice projects. | Reject for this project’s display name. |
| **Dictpin** | Dictation + pin; compact, memorable, and focused on keeping useful text. | GitHub repository-name search returned zero matches. The web queries reviewed did not reveal an obvious same-name voice or dictation product; results included an unrelated `DICTPIN` variable in HylaFAX. | Recommended working display name, subject to the checks below. |
| **Voxnib** | Voice + a pen nib; a direct sound-to-writing metaphor. | [Voxnib](https://voxnib.com/) already offers voice-note transcription and summaries. | Reject because of direct voice-to-text overlap. |
| **Syllit** | Syllable + a small/light tool; short and easy to say. | [rakin406/syllit](https://github.com/rakin406/syllit) is already a syllable-counting tool, an adjacent text/language use. | Lower preference; the existing name weakens distinctiveness. |
| **Saypin** | Say + pin; speech captured in a small, useful form. | [SAYPIN](https://www.saypin.net/) is an existing Korean service; its [terms](https://www.saypin.net/cs/terms_4.asp) describe a payment and merchant service. A GitHub name match also exists. | Lower preference; unrelated sector, but an established identical name. |

## Direct evidence for rejecting Voxlet

These are first-party repository or project pages, read during this check. Their descriptions establish the naming conflict; their functional or privacy claims have not been independently tested here. No unknown project was installed, built, or run.

| Existing name | Source | What was checked |
| --- | --- | --- |
| Voxlet for Windows | [KrisEie/voxlet](https://github.com/KrisEie/voxlet) | Repository metadata and README describe a native Windows dictation, read-aloud, and local reference-voice application. Last push reported by GitHub: 2026-10-07. This is a direct platform and product-category collision. |
| Voxlet for macOS | [nahcmon/Voxlet](https://github.com/nahcmon/Voxlet) | Repository metadata and README describe a native macOS push-to-talk utility with local Parakeet transcription. Last push reported by GitHub: 2026-08-13. This is a direct dictation-category collision. |
| Voxlet for macOS | [seiry/voxlet](https://github.com/seiry/voxlet) | Repository metadata and README describe a small menu-bar push-to-talk dictation app. Last push reported by GitHub: 2026-10-20. This is another direct dictation-category collision. |
| VOXLET research project | [Galois project article](https://www.galois.com/articles/voxlet-pioneering-private-voice-changing-technology) | Official project article describes privacy-oriented voice transformation. This is an additional adjacent voice-technology use. |

The decision does not depend on stars, download counts, or a legal finding. Three existing dictation repositories are already enough to make Voxlet a poor identity for this application.

## Search scope and reproducibility

Public GitHub REST repository search was queried with `q=<candidate> in:name`, `per_page=10`. Counts include partial repository-name matches, such as plural forms; they are not exact-name ownership counts. The following counts were returned on the check date:

| Query | Returned total |
| --- | ---: |
| `Voxlet in:name` | 28 |
| `Dictpin in:name` | 0 |
| `Voxnib in:name` | 0 |
| `Syllit in:name` | 1 |
| `Saypin in:name` | 1 |

The public endpoint format was `https://api.github.com/search/repositories?q=Dictpin%20in%3Aname&per_page=10`. Public metadata and READMEs were then read for the relevant repositories above. GitHub repository search does not cover every code string, organization, private repository, unpublished project, or app-store listing. The Voxnib result demonstrates why a zero GitHub count alone is insufficient.

Web searches reviewed included:

- `"Voxlet" voice dictation`, `site:github.com "Voxlet"`, and `"Voxlet" software`.
- `"Voxnib"`, `"Syllit" voice dictation software`, `"Dictpin"`, and `"Saypin" voice dictation software`.
- `"Dictpin" app OR software OR dictation OR voice`, `"Dictpin" -hylafax -DICTPIN -dictionary.sh -opennet`, and `site:github.com "Dictpin"`.
- `"Syllit" software app`.

An incidental `DICTPIN` code identifier can be seen in the [Debian HylaFAX source](https://sources.debian.org/src/hylafax/3%3A6.0.7-13/util/notify-4.2.sh.in/). It is not evidence of a product called Dictpin. Conversely, failure to find a product is not evidence that no such product exists. Search indexes, ranking, and repository counts can change after this date. The SAYPIN site and terms were read during the initial check, but a same-day repeat check failed TLS or timed out; ongoing reachability was not verified. The directly conflicting Voxlet repositories remained reachable.

## Before adopting the public name

- Have the owner approve the working name and intended public repository address. No GitHub repository, account, domain, or handle has been created or reserved.
- Search the relevant trademark registries and jurisdictions, including similar spellings and sounds, with qualified advice where appropriate. This task did not establish trademark rights or clearance.
- Recheck software stores, package registries, domains, social handles, and public GitHub immediately before publication. Exhaustive checks of those channels were not performed here.
- Keep the new identity independent: no Typeless logo, no claim of affiliation, and no copied game characters or visual assets. Industrial typography and restrained geometry can inform an original design.
- If a conflict is found, update the display materials together. Any later technical rename needs its own compatibility and data-path review.

No public upload, push, repository creation, release, trademark registration, or name reservation was performed.
