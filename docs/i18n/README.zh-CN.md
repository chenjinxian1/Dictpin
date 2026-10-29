<h1 align="center">Dictpin v0.2.2-dev.34</h1>

<p align="center">
  <strong>精致小巧的桌面听写工具。说出想法，掌握文字，然后继续手头的事。</strong>
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
  <a href="../../README.md">English</a> · <strong>简体中文</strong> · <a href="README.fr.md">Français</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.ms.md">Bahasa Melayu</a>
</p>

![Dictpin 概念配图：声音转化为清晰文字](../branding/hero.png)

<!-- overview -->
Dictpin 是一款 Windows 桌面语音转文字应用的开发候选版，采用 Electron、本地 SenseVoice 识别、用户明确设定的个人词典规则，以及通过兼容服务提供的可选文字整理。适合短消息、随手笔记、人名与专业术语：开始、说话、检查、复制。
<!-- /overview -->

## 功能

- **本地识别：**SenseVoice 在 CPU 上运行，配合 Silero 语音活动检测。
- **个人词典：**保存正确词语和明确的常见错写，可查看变化并撤销纠正。
- **自动整理：**顺畅模式删除口头禅和重复；轻整理补标点、断句。识别原文始终保留。
- **长时间听写：**录音中预览文字，支持继续追加、编辑和复制。取消后的临时音频可在 30 秒内恢复，识别失败后保留最多 5 分钟，仅存内存。
- **小巧界面：**结果、词典、设置三页，加上录音浮条，支持快捷键和浅深主题。
- **安全粘贴：**主动开启后，可将文字投递到原输入框。

## 软件截图

软件实际截图 · 英文演示内容

### 主界面

![主界面](../images/results.png)

### API 设置

![API 设置](../images/settings.png)

[截图说明](../SCREENSHOTS.md)

## 快速开始

需要 Windows x64 和 Node.js 24+。按安装指南准备 Electron 44.8.0、sherpa-onnx 1.13.8、SenseVoice 和 Silero VAD。 [安装指南](../INSTALL.md)

```powershell
.\native\build-local03.cmd
.\native\build-delivery.cmd
npm run doctor
npm run check
node scripts/package-inputs.cjs
npm run dev
```

在设置中选择麦克风并保存，然后开始、结束听写，最终文字会直接显示在编辑框。`Ctrl+Enter` 复制全文，`Ctrl+C` 复制选区。

普通启动沿用已保存的开发配置；使用 `npm run dev -- --profile=isolated` 可打开独立资料。

## 模型连接

在**设置 → 模型连接**中选择通义千问、DeepSeek、OpenAI、硅基流动、本地兼容服务或自定义，填写地址、模型和密钥后保存。听写结束后自动整理；连接尚不可用时继续使用本地文字。

内置建议无需联网；**获取模型**和**测试整理**在点击后执行。服务商可能按调用计费。 [API 配置与排查](../API_CONFIGURATION.md)

## 隐私

语音识别在本机运行。开启整理后，文字和词典词语会发送给已配置的服务。密钥可用 Windows 安全存储加密，最近一次结果保存在本机。 [数据处理说明](../PRIVACY.md)

## 文档与许可证

[安装](../INSTALL.md) · [API 配置](../API_CONFIGURATION.md) · [隐私](../PRIVACY.md) · [更新日志](../../CHANGELOG.md) · [参与贡献](../../CONTRIBUTING.md) · [安全反馈](../../SECURITY.md)

[MIT © 2026 chenjinxian1。](../../LICENSE) [第三方声明](../../THIRD_PARTY_NOTICES.md)
