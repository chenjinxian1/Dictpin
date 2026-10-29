<h1 align="center">Dictpin v0.2.2-dev.34</h1>

<p align="center">
  <strong>작고 간결한 데스크톱 받아쓰기 도구. 말하고, 내 글을 직접 확인한 뒤, 다음 일로 넘어가세요.</strong>
</p>

<p align="center">
  <a href="https://github.com/electron/electron/releases/tag/v44.8.0"><img src="https://img.shields.io/badge/Electron-44.8.0-47848F?style=flat&amp;labelColor=343B43&amp;logo=electron&amp;logoColor=white" alt="Electron 44.8.0"></a>
  <a href="../../app/renderer/dictation-app.js"><img src="https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?style=flat&amp;labelColor=343B43&amp;logo=javascript&amp;logoColor=F7DF1E" alt="JavaScript: Vanilla"></a>
  <a href="../../native/LocalAsrWorker.Local03.cs"><img src="https://img.shields.io/badge/Local%20ASR-SenseVoice-E3B341?style=flat&amp;labelColor=343B43" alt="Local ASR: SenseVoice"></a>
  <a href="../API_CONFIGURATION.md"><img src="https://img.shields.io/badge/Cleanup-Qwen%20%28optional%29-8B6BD6?style=flat&amp;labelColor=343B43" alt="Cleanup: Qwen (optional)"></a>
  <a href="../INSTALL.md"><img src="https://img.shields.io/badge/Windows-x64-0078D4?style=flat&amp;labelColor=343B43" alt="Platform: Windows x64"></a>
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/License-MIT-2E9D70?style=flat&amp;labelColor=343B43" alt="License: MIT"></a>
</p>

<p align="center">
  <a href="../../README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.fr.md">Français</a> · <a href="README.ja.md">日本語</a> · <strong>한국어</strong> · <a href="README.ms.md">Bahasa Melayu</a>
</p>

![Dictpin 컨셉 이미지: 소리가 명확한 텍스트로 바뀌는 과정](../branding/hero.png)

<!-- overview -->
Dictpin은 Electron, 로컬 SenseVoice 인식, 사용자가 명시한 개인 사전 규칙, 호환 서비스의 선택적 텍스트 다듬기를 사용하는 Windows 데스크톱 음성 입력 앱의 개발 버전입니다. 짧은 메시지, 메모, 이름, 전문 용어를 위해 시작하고, 말하고, 확인한 뒤 복사하세요.
<!-- /overview -->

## 기능

- **로컬 인식:** SenseVoice가 CPU에서 실행되고 Silero가 음성 구간을 감지합니다.
- **개인 사전:** 올바른 용어와 자주 생기는 오기를 저장하고 수정 내역을 확인하거나 되돌립니다.
- **자동 다듬기:** 자연스러운 모드는 군더더기와 반복을 줄이고, 가벼운 모드는 문장 부호와 문장 구분을 다듬습니다. 인식 원문은 보존됩니다.
- **긴 받아쓰기:** 녹음 중 텍스트 미리 보기, 이어 녹음하기, 편집, 복사를 지원합니다. 임시 음성은 취소 후 30초, 인식 실패 후 최대 5분 동안 메모리에서 복구할 수 있습니다.
- **작은 인터페이스:** 결과, 사전, 설정과 녹음 표시줄. 단축키와 밝은 테마·어두운 테마를 지원합니다.
- **안전한 붙여넣기:** 직접 활성화하면 원래 입력란에 텍스트를 전달합니다.

## 앱 화면

실제 앱 화면 · 영어 데모 내용

### 메인 화면

![메인 화면](../images/results.png)

### API 설정

![API 설정](../images/settings.png)

[화면 설명](../SCREENSHOTS.md)

## 빠른 시작

Windows x64와 Node.js 24+가 필요합니다. 설치 안내에 따라 Electron 44.8.0, sherpa-onnx 1.13.8, SenseVoice, Silero VAD를 준비하세요. [설치 안내](../INSTALL.md)

```powershell
.\native\build-local03.cmd
.\native\build-delivery.cmd
npm run doctor
npm run check
node scripts/package-inputs.cjs
npm run dev
```

설정에서 마이크를 선택해 저장한 다음 받아쓰기를 시작하고 끝내세요. 최종 문장이 편집기에 표시됩니다. `Ctrl+Enter`는 전체 텍스트, `Ctrl+C`는 선택 영역을 복사합니다.

일반 실행은 저장한 개발 설정을 재사용합니다. 별도 프로필은 `npm run dev -- --profile=isolated`로 실행하세요.

## 모델 연결

**설정 → 모델 연결**에서 Qwen, DeepSeek, OpenAI, SiliconFlow, 로컬 호환 서비스 또는 사용자 지정을 선택하세요. 주소, 모델, 키를 입력해 저장하면 받아쓰기 후 자동으로 다듬습니다. 사용 가능한 연결이 없으면 로컬 텍스트를 사용합니다.

내장 모델 제안은 오프라인으로 사용할 수 있습니다. **모델 가져오기**와 **다듬기 테스트**는 클릭할 때 실행됩니다. 서비스 사용에 요금이 부과될 수 있습니다. [API 설정과 문제 해결](../API_CONFIGURATION.md)

## 개인정보

음성 인식은 로컬에서 실행됩니다. 다듬기를 켜면 텍스트와 사전 용어를 설정한 서비스로 보냅니다. 키는 Windows 보안 저장소로 암호화할 수 있으며 최근 결과는 로컬에 저장됩니다. [데이터 처리](../PRIVACY.md)

## 문서와 라이선스

[설치](../INSTALL.md) · [API 설정](../API_CONFIGURATION.md) · [개인정보](../PRIVACY.md) · [변경 기록](../../CHANGELOG.md) · [기여 방법](../../CONTRIBUTING.md) · [보안](../../SECURITY.md)

[MIT © 2026 chenjinxian1.](../../LICENSE) [타사 고지](../../THIRD_PARTY_NOTICES.md)
