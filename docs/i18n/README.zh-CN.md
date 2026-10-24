<h1 align="center">Dictpin</h1>

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

**AI 生成的概念配图，不是软件实际截图，也不代表已实现的功能。**

Dictpin 是一款 Windows 桌面语音转文字应用的开发候选版，采用 Electron、本地 SenseVoice 识别、用户明确设定的个人词典规则，以及通过兼容服务提供的可选轻整理。适合短消息、随手笔记、人名与专业术语：开始、说话、检查、复制。

> **这是源码开发候选版。** 源码仓库：[chenjinxian1/Dictpin](https://github.com/chenjinxian1/Dictpin)。项目代码和原创项目素材由 chenjinxian1 以 MIT 许可公开，第三方组件保留各自条款。目前没有经过验收的安装程序或正式版本下载。Dictpin 已做初步重名检索，不代表商标可用性保证。程序包标识与数据路径保留原名称。本项目独立于 Typeless，与其没有官方关联。

## 查看应用

### 主界面 · 英文显示模式

![Dictpin 英文主界面，显示演示结果](../images/results.png)

这是生产版 Electron 界面的真实渲染，采用可选英文显示模式、纯英文演示文本和模拟系统适配器。预置示例文本经过真实本地词典规则纠正，没有开启麦克风或执行声学识别。

### API 配置 · 英文显示模式

![Dictpin 英文 API 配置界面，密钥为空](../images/settings.png)

展示 Qwen 地址和模型配置示例，API 密钥为空。没有执行连接测试、付费请求，也没有伪造已连接状态或延迟数据。详见[截图制作说明](../SCREENSHOTS.md)。

## 当前已实现

- **本地识别：**CPU SenseVoice 配合 Silero 语音活动检测，不会自动回退到云端识别。
- **明确的词典纠正：**保存正确词语，可选填写常见错写。在本机按最长匹配规则单次替换，不猜同音词、不自动学习。可查看变化并撤销。
- **整理完成前即可使用文字：**可以立即编辑或复制。任一操作都会结束当前整理，迟到响应不能覆盖该版本。识别原文始终独立保留。
- **主动恢复：**已完成文字保留，有界的未处理 PCM 在取消后保留 30 秒、识别失败后保留最多 5 分钟，仅存内存；重试须主动操作，且不启用远程整理。
- **小巧的工作空间：**结果、词典、设置三页，加上一条录音浮条。已实现浅色／深色、高对比、减少动态效果与键盘焦点支持。
- **可选轻整理：**通过文本 Chat Completions 服务补标点、分段和处理口语停顿或明显口吃。失败或达到 12 秒等待上限时，本地纠正稿仍然可用。

实际优势是文字由你掌握、词典规则可离线生效、失败后不必立即重新录音。我们不承诺适用于所有情况的准确率、延迟、内存占用或竞品性能优势。翻译、问答、扩写和大型历史面板不在产品范围内。

## 使用流程

```text
主动开始 → 选定麦克风 → 本地识别
         → 明确词典规则 → 可选轻整理
         → 检查／编辑 → 主动复制
```

一次只录一场，由一个本地识别器依次处理。结束后先完成已接收的片段，再进行可选轻整理和投递。整理期间复制或编辑会结束整理。`Ctrl+Enter` 复制完整结果，`Ctrl+C` 保持普通选区复制。可选复制快捷键默认不占用系统组合。

## 长时间听写、继续追加与安全粘贴

录音现在进入有界的本地流水线，不再等结束后才解码整段容器。按停顿优先分段，每个片段最多 20 秒，由同一个 SenseVoice 识别器依次处理，录音期间即可查看已保存的文字。已解除单次 60 秒限制；单次 30 分钟、100,000 字符及识别积压仍受资源保护，已接收音频不会静默裁剪。

点击**继续追加**，保留前一稿的手动修改并添加下一次录音；也可在设置中开启快捷键追加。此前文字不会再次轻整理，自动投递只发送新增部分，避免把已有文档重复粘贴。主动复制仍复制完整结果。录音及剩余片段识别期间，预览只读；进入轻整理后可编辑或复制以结束整理。

**安全自动粘贴默认关闭。**先编译独立 Windows 投递组件，在设置中主动开启并保存，再让支持的可编辑输入框获得焦点，用听写快捷键开始。明确结束后，只尝试粘贴一次。密码框、终端、提权或无法确认的控件，以及焦点、光标、进程或剪贴板变化均会阻止投递。只有在本应用内明确点结束时，才允许尝试恢复原窗口焦点；不会强行激活无关应用。从应用内开始没有可靠外部目标，仍须主动复制。

投递会用新增文字替换剪贴板，不读取或备份原剪贴板内容。“已发送粘贴按键”不代表目标程序已经接收；结果不确定时须先核对原输入框，不会自动重试。投递等待期间不能开始、追加或改写结果。资源保护、识别积压停止及恢复不授权自动粘贴。

已识别文字会逐段保留；只有有界的**未处理** PCM 片段集合可恢复：取消后 30 秒、识别失败后最多 5 分钟，仅在内存，须主动重试且不调用远程整理。这不是完整长录音存档，到期、清除或退出即清空临时音频。

持续不停顿时，强制分段可能影响边界词识别。真实麦克风质量、原生输入框兼容、焦点、剪贴板与竞品性能仍需人工验收；目前不宣称超过 Typeless。详见[更新日志](../../CHANGELOG.md)。

## 快速开始：开发环境

**当前目标平台：Windows x64。**安装 Node.js **24 或更高版本**。准备外置的完整 Electron **44.8.0**、sherpa-onnx **1.13.8** 共享运行库、SenseVoice int8 模型与 tokens、Silero VAD 模型，以及独立的 Local03 原生 worker。这些资源没有随仓库打包。具体布局与官方来源见[安装说明](../INSTALL.md)。

准备好资源后，在仓库根目录执行：

```powershell
.\native\build-local03.cmd
.\native\build-delivery.cmd
npm run doctor
npm run check
node scripts/package-inputs.cjs
npm run dev
```

根目录脚本使用 Node 内置模块，不需要在根目录安装依赖。`doctor` 检查现有资源布局，不代表完成全新环境安装或识别质量验收。`dev` 会打开开发资料对应的独立实例，不会开始录音。不要通过历史 bootstrap 或 resume 脚本启动。

如需**不配置 API 的本地使用**，请保持**轻整理**关闭。进入**设置**，选择 Windows 录音机实际使用的麦克风，点击**保存更改**，然后主动开始听写。尚未保存的设备选择不会生效。结束后检查并复制文字；需要时再配置快捷键。

`npm run check` 检查应用语法、本地依赖、构建输入和文档。此仓库只保留应用主体；测试、性能评测、旧界面和内部发布工具保留在本地。详见[验证与构建状态](../INSTALL.md#validation-and-build-status)。目前没有已验证可用的安装包构建命令。

## 可选 API 配置

在**设置 → 模型连接**填写 API 地址、准确的文本模型 ID 和密钥，选择是否使用系统安全存储保存密钥。请在空闲时保存，再开启轻整理，无需重启应用。目前不支持通过 API 环境变量或 `.env` 配置。

此处仅支持**文本 Chat Completions**，不支持 ASR、TTS、Responses 或 DashScope 原生音频端点。Qwen 是可选服务：使用地域、业务空间相匹配的地址与密钥，以及该服务可用的文本模型，例如 `qwen-plus`。请从服务商控制台复制兼容地址，不要将单个示例视为通用配置。可以连接兼容的本地文本服务器，但应用不包含该服务器。

准确字段、官方密钥入口、示例与排查方法见 [API 配置](../API_CONFIGURATION.md)。**连接测试和主动重试轻整理都可能产生费用。**

## 隐私与本地存储

- 本地识别与词典纠正无需 API。当前产品不保存新的录音文件；恢复音频只是临时内存，过期、清除或退出后即丢弃。崩溃后不保证恢复。
- **最近一次结果会以明文保存在本机**，包括识别原文和编辑后的文字；即使关闭多条历史记录，也会保存。当前没有转写自动到期或保留开关。开发资料位于被 Git 忽略的 `work/dev/profile/`，切勿提交。
- 开启轻整理后，会将纠正稿和有大小上限的正确词语列表发送到已配置的服务。请求不包含原始音频或常见错写别名。服务商的数据保留与计费规则适用。
- 新密钥默认仅供当前会话使用，除非选择加密保存。已保存密钥使用 Electron 的操作系统安全存储，不可用时不会退回明文保存。它无法防御已取得同一系统用户权限的恶意软件。
- 用量记录只包含请求、模型、计时和 token 元数据，不含正文或密钥。缺少用量或价格信息意味着费用未知，不代表零费用。

使用私人内容前，请先阅读[隐私说明](../PRIVACY.md)。本地识别不等于可选轻整理不上传内容，也不等于文字从不写入磁盘。

## 语言、限制与验证

应用 UI 默认使用**简体中文**，并提供可选的**英文显示模式**；这里的示例使用英文模式。六语言文档不代表界面或语音识别支持全部六种语言。SenseVoice 上游列明支持普通话、粤语、英语、日语与韩语；此前固定文件评估仅覆盖普通话和英语。本项目不宣称支持法语或马来语识别。

运行 `npm run dev -- --ui-language=en` 可使用英文界面；不加该参数时保留默认中文。此选项只改变界面显示，不改写转写文本或词典内容。

此仓库包含应用源码和使用文档，不包含内部测试样例及性能报告。系统快捷键、系统剪贴板、设备拔插、焦点、多屏、Windows DPI、真实服务质量和全新环境安装仍需独立验收。

历史基准仅适用于当时的设备与语料，不代表通用速度或准确率。打包输入检查明确报告 **`distributionReady:false`**。

## 常见问题

| 问题 | 建议处理 |
| --- | --- |
| 缺少运行库或模型 | 执行 `npm run doctor`，检查完整外部布局、版本和许可声明。 |
| 音量没有波动或未检出语音 | 按名称选择实际可用的麦克风并保存，检查 Windows 权限与静音，再主动录音。系统默认输入可能是另一只设备。 |
| 没有配置 API | 关闭轻整理，本地识别与词典规则仍可使用。 |
| 401/403 或 404 | 检查密钥、地域、权限、模型 ID 与 Chat Completions 地址。切勿将密钥贴到 Issue。 |
| 限流或超时 | 使用已经保留的文字，确认后再主动重试；此前请求仍可能计费。 |
| 保存失败 | 保留草稿、先复制重要文字，检查磁盘空间与写入权限后重试。 |
| TLS／网络失败 | 检查官方域名、系统时间、证书信任链与防火墙。不要关闭证书校验。 |

## 路线图与贡献

下一步包括全新环境安装与打包、更多设备验收、转写保留与删除控制，以及以实测数据为依据的识别改善。这些是计划，尚非现有功能。应用会继续保持小巧的听写工具定位。

安全的本地检查方式见 [CONTRIBUTING.md](../../CONTRIBUTING.md)，安全问题披露渠道的限制见 [SECURITY.md](../../SECURITY.md)。[CHANGELOG.md](../../CHANGELOG.md) 记录源码变更。

## 许可证与致谢

项目原创代码、文档和原创项目素材采用 [MIT 许可证](../../LICENSE)，版权署名为 Copyright 2026 chenjinxian1。[许可范围说明](../../THIRD_PARTY_NOTICES.md)将项目材料与第三方字体、生成的接口声明、运行库和模型权重分别列明。

第三方组件保留各自的授权条件，包括 Electron/Chromium、sherpa-onnx/ONNX Runtime、SenseVoice 权重、Silero VAD 和 Saira。模型条款独立于任何应用代码许可证。请阅读 [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md)。感谢这些组件的维护者与 FLEURS 贡献者。克制的工业设计方向受到 [endfield-ui-skill](https://github.com/hhikr/endfield-ui-skill) 启发；品牌资产没有使用游戏角色、标志或现成美术素材。
