# Application examples and concept artwork

The README uses two **actual production Electron renderer captures**, taken on 2026-10-28 in the optional English presentation mode at 640 × 480. They use fictional text and isolated simulated system/service adapters. They are not AI-generated or retouched interfaces. The UI defaults to Simplified Chinese; see [Installation](INSTALL.md) for the English launch option.

## Main window

![English main window with a fictional result](images/results.png)

The real local dictionary changes the seeded misspellings `dict pin` and `sense voice` to `Dictpin` and `SenseVoice`. The result shows editing, explicit copying, the Append more action and access to the original text. The current source also supports ordered live previews; this picture is a seeded completed result and does not claim acoustic performance. This illustrates the application and local correction, not acoustic recognition quality.

## API configuration

![English API configuration with an empty key](images/settings.png)

The provider selector, OpenAI address and `gpt-6-luna` are configuration examples. The key field is empty. The capture fixture exercises sample tests with in-memory responses only; no live connection test or paid request was made. No connected state or service latency result is implied. Read [API configuration](API_CONFIGURATION.md) for the correct address/model for your account.

## Separate concept artwork

The [hero image](branding/hero.png) is AI-generated concept artwork with manually added typography. It is labeled as concept art and is not a software screenshot or a feature claim.

Capture generation and test fixtures remain in the full local maintenance workspace, outside this public tree. No physical microphone, real ASR, system clipboard, native focus/DPI or live text service was used to produce these examples.
