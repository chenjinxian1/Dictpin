<h1 align="center">Dictpin v0.2.2-dev.34</h1>

<p align="center">
  <strong>Alat imlak desktop yang ringkas. Bercakap, kekalkan kawalan terhadap teks anda, kemudian teruskan kerja.</strong>
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
  <a href="../../README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.fr.md">Français</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <strong>Bahasa Melayu</strong>
</p>

![Ilustrasi konsep Dictpin: suara menjadi teks yang jelas](../branding/hero.png)

<!-- overview -->
Dictpin ialah versi pembangunan aplikasi suara-ke-teks desktop Windows yang menggunakan Electron, pengecaman SenseVoice setempat, peraturan kamus peribadi yang ditetapkan secara jelas, serta kemasan teks pilihan melalui perkhidmatan serasi. Untuk mesej ringkas, nota, nama dan istilah teknikal: mula, bercakap, semak, salin.
<!-- /overview -->

## Ciri

- **Pengecaman setempat:** SenseVoice berjalan pada CPU dengan pengesanan aktiviti suara Silero.
- **Kamus peribadi:** simpan istilah yang betul serta kesilapan lazim, semak perubahan dan buat asal pembetulan.
- **Kemasan automatik:** mod Lancar membuang kata pengisi dan pengulangan; mod Ringan menambah tanda baca dan pemisah ayat. Transkripsi asal dikekalkan.
- **Imlak panjang:** pratonton teks semasa merakam, sambung rakaman, sunting dan salin. Audio sementara boleh dipulihkan dalam memori selama 30 saat selepas pembatalan atau lima minit selepas pengecaman gagal.
- **Antara muka ringkas:** hasil, kamus, tetapan dan bar rakaman terapung, dengan pintasan serta tema cerah/gelap.
- **Tampalan terlindung:** pilihan yang boleh dihidupkan untuk menghantar teks ke medan input asal.

## Paparan aplikasi

Tangkapan skrin aplikasi · kandungan demo bahasa Inggeris

### Antara muka utama

![Antara muka utama](../images/results.png)

### Tetapan API

![Tetapan API](../images/settings.png)

[Butiran tangkapan skrin](../SCREENSHOTS.md)

## Mula pantas

Memerlukan Windows x64 dan Node.js 24+. Sediakan Electron 44.8.0, sherpa-onnx 1.13.8, SenseVoice dan Silero VAD mengikut panduan pemasangan. [Panduan pemasangan](../INSTALL.md)

```powershell
.\native\build-local03.cmd
.\native\build-delivery.cmd
npm run doctor
npm run check
node scripts/package-inputs.cjs
npm run dev
```

Pilih mikrofon dalam Tetapan dan simpan, kemudian mula dan hentikan imlak. Teks akhir dipaparkan dalam penyunting. `Ctrl+Enter` menyalin semua teks; `Ctrl+C` menyalin pilihan.

Permulaan biasa menggunakan semula konfigurasi pembangunan tersimpan. Gunakan `npm run dev -- --profile=isolated` untuk profil berasingan.

## Sambungan model

Dalam **Tetapan → Sambungan model**, pilih Qwen, DeepSeek, OpenAI, SiliconFlow, perkhidmatan setempat serasi atau Tersuai. Isi alamat, model dan kunci, kemudian simpan. Kemasan berjalan selepas imlak selesai; tanpa sambungan yang boleh digunakan, imlak setempat diteruskan.

Cadangan terbina dalam berfungsi di luar talian. **Dapatkan model** dan **Uji kemasan** dijalankan apabila diklik. Penggunaan perkhidmatan mungkin dikenakan bayaran. [Persediaan API dan penyelesaian masalah](../API_CONFIGURATION.md)

## Privasi

Pengecaman suara berjalan secara setempat. Apabila kemasan dihidupkan, teks dan istilah kamus dihantar ke perkhidmatan yang dikonfigurasikan. Kunci boleh disulitkan dengan storan selamat Windows; hasil terkini disimpan secara setempat. [Pengendalian data](../PRIVACY.md)

## Dokumentasi dan lesen

[Pemasangan](../INSTALL.md) · [Konfigurasi API](../API_CONFIGURATION.md) · [Privasi](../PRIVACY.md) · [Log perubahan](../../CHANGELOG.md) · [Sumbangan](../../CONTRIBUTING.md) · [Keselamatan](../../SECURITY.md)

[MIT © 2026 chenjinxian1.](../../LICENSE) [Notis pihak ketiga](../../THIRD_PARTY_NOTICES.md)
