<h1 align="center">Dictpin v0.2.2-dev.34</h1>

<p align="center">
  <strong>小さなデスクトップ音声入力ツール。話して、自分の言葉を確かめて、次の作業へ。</strong>
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
  <a href="../../README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.fr.md">Français</a> · <strong>日本語</strong> · <a href="README.ko.md">한국어</a> · <a href="README.ms.md">Bahasa Melayu</a>
</p>

![Dictpin のコンセプト画像：音声が明確な文章へ変わる](../branding/hero.png)

<!-- overview -->
Dictpin は Windows 向け音声入力アプリの開発候補版です。Electron、ローカルの SenseVoice 音声認識、ユーザーが明示的に定める個人辞書ルール、互換サービスによる任意のテキスト整形を組み合わせています。短いメッセージ、メモ、人名、専門用語に。開始、話す、確認、コピー。
<!-- /overview -->

## 機能

- **ローカル認識：** SenseVoice が CPU 上で動作し、Silero が音声区間を検出します。
- **個人辞書：** 正しい用語とよくある誤記を登録し、修正内容の確認や取り消しができます。
- **自動整形：**「順暢」は言いよどみや重複を除去し、「軽整形」は句読点と文の区切りを整えます。認識原文は保持されます。
- **長時間の音声入力：** 録音中のプレビュー、追加録音、編集、コピーに対応。一時音声はキャンセル後 30 秒、認識失敗後は最大 5 分間、メモリ内で復元できます。
- **小さな画面構成：** 結果、辞書、設定、録音用フローティングバー。ショートカットとライト／ダークテーマに対応します。
- **安全な貼り付け：** 有効にすると、元の入力欄へテキストを送れます。

## ソフトウェア画面

実際のソフトウェア画面 · 英語のデモ内容

### メイン画面

![メイン画面](../images/results.png)

### API 設定

![API 設定](../images/settings.png)

[画面の詳細](../SCREENSHOTS.md)

## クイックスタート

Windows x64 と Node.js 24+ が必要です。インストールガイドに従い、Electron 44.8.0、sherpa-onnx 1.13.8、SenseVoice、Silero VAD を準備してください。 [インストールガイド](../INSTALL.md)

```powershell
.\native\build-local03.cmd
.\native\build-delivery.cmd
npm run doctor
npm run check
node scripts/package-inputs.cjs
npm run dev
```

設定でマイクを選んで保存し、音声入力を開始・終了します。完成した文章が編集欄に表示されます。`Ctrl+Enter` で全文、`Ctrl+C` で選択範囲をコピーします。

通常起動では保存済みの開発設定を使用します。独立したプロファイルには `npm run dev -- --profile=isolated` を使います。

## モデル接続

**設定 → モデル接続**で Qwen、DeepSeek、OpenAI、SiliconFlow、ローカル互換サービス、またはカスタムを選び、アドレス、モデル、キーを入力して保存します。音声入力の終了後に自動整形します。接続が利用できない場合はローカルの文章を使えます。

組み込み候補はオフラインで使えます。**モデルを取得**と**整形をテスト**はクリック時に実行します。サービスの利用には料金が発生する場合があります。 [API 設定とトラブル対処](../API_CONFIGURATION.md)

## プライバシー

音声認識はローカルで動作します。整形を有効にすると、文章と辞書用語を設定済みサービスへ送信します。キーは Windows の安全なストレージで暗号化でき、直近の結果はローカルに保存されます。 [データの扱い](../PRIVACY.md)

## ドキュメントとライセンス

[インストール](../INSTALL.md) · [API 設定](../API_CONFIGURATION.md) · [プライバシー](../PRIVACY.md) · [変更履歴](../../CHANGELOG.md) · [貢献方法](../../CONTRIBUTING.md) · [セキュリティ](../../SECURITY.md)

[MIT © 2026 chenjinxian1。](../../LICENSE) [サードパーティーの表記](../../THIRD_PARTY_NOTICES.md)
