<h1 align="center">Dictpin v0.2.2-dev.29</h1>

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

**Ilustrasi konsep yang dijana AI, bukan tangkapan skrin perisian atau bukti fungsi yang telah dilaksanakan.**

Dictpin ialah calon pembangunan aplikasi suara kepada teks untuk desktop Windows, dibina menggunakan Electron, pengecaman SenseVoice setempat, peraturan kamus peribadi yang ditetapkan secara jelas, serta kemasan teks pilihan melalui perkhidmatan yang serasi. Untuk mesej pendek, nota, nama dan istilah teknikal: mula, bercakap, semak, salin.

> **Calon pembangunan yang diedarkan sebagai kod sumber.** Repositori: [chenjinxian1/Dictpin](https://github.com/chenjinxian1/Dictpin). Kod dan aset asal projek dilesenkan di bawah MIT atas nama chenjinxian1; komponen pihak ketiga mengekalkan syarat masing-masing. Belum ada pemasang atau muat turun keluaran yang disahkan. Nama Dictpin telah melalui saringan nama awal, bukan jaminan ketersediaan cap dagangan. Pengenal pakej dan laluan data kekal dengan nama sedia ada. Projek ini bebas daripada Typeless dan tiada hubungan rasmi dengannya.

## Lihat aplikasi

### Antara muka utama · paparan bahasa Inggeris

![Antara muka utama Dictpin dalam bahasa Inggeris dengan hasil demo](../images/results.png)

Rendiran sebenar UI Electron produksi dalam mod paparan bahasa Inggeris pilihan, menggunakan teks demo bahasa Inggeris dan penyesuai sistem simulasi. Teks yang disediakan diproses oleh peraturan kamus setempat sebenar; tiada mikrofon atau pengecaman akustik digunakan.

### Konfigurasi API · paparan bahasa Inggeris

![Konfigurasi API Dictpin dalam bahasa Inggeris dengan kunci kosong](../images/settings.png)

Pilihan penyedia, alamat dan model ialah contoh konfigurasi, manakala kunci API kosong. Hanya respons simulasi digunakan, tanpa sambungan sebenar, permintaan berbayar atau dakwaan kependaman. Lihat [butiran tangkapan](../SCREENSHOTS.md).

## Fungsi yang sudah dilaksanakan

- **Pengecaman setempat:** SenseVoice pada CPU dengan pengesanan aktiviti suara Silero; tiada pertukaran automatik kepada pengecaman awan.
- **Pembetulan kamus yang jelas:** simpan istilah yang betul dan, jika perlu, ejaan salah yang kerap berlaku. Penggantian setempat dilakukan sekali sahaja dengan mengutamakan padanan peraturan terpanjang; tiada tekaan homofon atau pembelajaran automatik. Anda boleh menyemak pembetulan dan membuat asal.
- **Teks tersedia sebelum kemasan selesai:** terus sunting atau salin. Kedua-dua tindakan menamatkan kemasan yang sedang berjalan; respons lewat tidak boleh menggantikan versi itu. Transkrip asal kekal tersedia.
- **Pemulihan yang jelas:** teks siap dikekalkan; PCM belum diproses yang terhad disimpan dalam memori selama 30 saat selepas Batal atau sehingga lima minit selepas kegagalan. Cuba semula memerlukan tindakan dan tidak menggunakan kemasan jauh.
- **Ruang kerja kecil:** halaman hasil, kamus, tetapan dan bar rakaman terapung. Tema cerah/gelap, kontras tinggi, pengurangan gerakan dan fokus papan kekunci telah dilaksanakan.
- **Kemasan ringan pilihan:** tanda baca, pembahagian perenggan dan pembuangan ketidaklancaran pertuturan melalui perkhidmatan teks Chat Completions. Jika gagal atau mencapai had 12 saat, draf yang dibetulkan secara setempat masih boleh digunakan.

Kelebihan praktikalnya ialah kawalan terhadap perkataan, peraturan kamus luar talian dan pemulihan tanpa perlu terus merakam semula. Kami tidak membuat dakwaan menyeluruh tentang ketepatan, kependaman, penggunaan memori atau prestasi berbanding pesaing. Terjemahan, soal jawab, pengembangan teks, papan pemuka sejarah yang besar berada di luar skop.

## Aliran kerja

```text
Mula sendiri → mikrofon dipilih → pengecaman setempat
             → peraturan kamus jelas → kemasan teks pilihan
             → semak / sunting → salin sendiri
```

Hanya satu sesi rakaman dan satu penyahkod setempat berjalan. Henti menyelesaikan segmen yang diterima sebelum kemasan dan penghantaran pilihan. Sunting atau salin semasa kemasan menamatkannya. `Ctrl+Enter` menyalin seluruh hasil; `Ctrl+C` kekal menyalin pilihan biasa. Pintasan salin pilihan tidak ditetapkan secara lalai.

## Imlak panjang, sambung teks dan tampalan terlindung

Rakaman kini dihantar ke saluran setempat yang terhad kapasiti semasa anda bercakap. Segmen mengutamakan jeda dan dihadkan kepada 20 saat; satu pekerja SenseVoice memprosesnya mengikut turutan, dengan pratonton dan simpanan teks semasa rakaman. Had sesi 60 saat telah dibuang. Perlindungan menghentikan sesi pada 30 minit, 100,000 aksara atau apabila barisan pengecaman bertambah; audio yang diterima tidak dipotong secara senyap.

**Append more** mengekalkan draf terdahulu termasuk suntingan manual dan menyambung rakaman berikutnya. Pilihan sambung melalui pintasan juga tersedia. Teks lama tidak dikemas semula; penghantaran automatik hanya menghantar bahagian baharu supaya dokumen tidak ditampal dua kali. Salin masih merangkumi keseluruhan hasil. Pratonton adalah baca sahaja sehingga pengecaman selesai; menyunting atau menyalin semasa kemasan akan menamatkannya.

**Tampalan terlindung dimatikan secara lalai.** Bina pembantu Windows berasingan, hidupkan pilihan dalam tetapan dan simpan, kemudian mulakan melalui pintasan dari medan boleh sunting yang disokong. Selepas Henti yang jelas, satu tampalan dicuba. Kata laluan, terminal, aplikasi berkeistimewaan tinggi, kawalan yang tidak dapat disahkan serta perubahan fokus, kursor, proses atau papan klip akan menyekatnya. Fokus hanya boleh dipulihkan selepas Henti yang jelas dalam Dictpin; aplikasi lain tidak diaktifkan secara paksa. Rakaman yang bermula dari aplikasi kekal menggunakan salinan manual.

Penghantaran menggantikan papan klip dengan teks baharu tanpa membaca atau menyandarkan kandungan lama. Kekunci dihantar tidak membuktikan penerimaan oleh aplikasi sasaran. Jika hasil tidak pasti, semak medan asal; tiada cubaan semula automatik. Mula, sambung dan sunting disekat semasa penghantaran. Hentian perlindungan dan pemulihan tidak membenarkan tampalan automatik.

Teks yang siap disimpan. Hanya koleksi PCM **belum diproses** yang terhad boleh dipulihkan dalam memori: 30 saat selepas Batal atau sehingga lima minit selepas kegagalan. Cuba semula secara jelas, tanpa kemasan jauh. Ini bukan arkib keseluruhan rakaman panjang. Luput, kosongkan dan keluar membuang audio sementara.

Pemisahan paksa boleh menjejaskan perkataan yang disebut tanpa jeda. Mikrofon sebenar, kawalan input, fokus, papan klip dan perbandingan prestasi masih memerlukan penerimaan berasingan. Tiada dakwaan mengatasi Typeless. Lihat [log perubahan](../../CHANGELOG.md).

## Mula pantas: persediaan pembangunan

**Sasaran semasa: Windows x64.** Pasang Node.js **24 atau lebih baharu**. Sediakan pengedaran penuh Electron **44.8.0** luaran, masa jalan dikongsi sherpa-onnx **1.13.8**, model SenseVoice int8 dan token, model Silero VAD, serta worker natif Local03 yang berasingan. Sumber ini tidak disertakan. Ikuti susun atur tepat dan sumber rasmi dalam [Pemasangan](../INSTALL.md).

Selepas sumber disediakan, jalankan dari akar repositori:

```powershell
.\native\build-local03.cmd
.\native\build-delivery.cmd
npm run doctor
npm run check
node scripts/package-inputs.cjs
npm run dev
```

Skrip di akar menggunakan modul terbina dalam Node; tiada langkah pemasangan kebergantungan di akar repositori. `doctor` memeriksa susun atur sedia ada, bukan pemasangan baharu atau mutu pengecaman. `dev` membuka profil pembangunan tanpa memulakan rakaman. Jangan lancarkan aplikasi melalui skrip bootstrap atau resume lama.

Untuk **penggunaan setempat tanpa API**, biarkan **轻整理** (kemasan ringan) dimatikan. Buka **设置** (Tetapan), pilih mikrofon yang benar-benar digunakan oleh Windows Recorder, klik **保存更改** (Simpan perubahan), kemudian mulakan imlak sendiri. Pilihan peranti yang belum disimpan belum berkuat kuasa. Hentikan, semak dan salin. Tetapkan pintasan hanya jika diperlukan.

`npm run check` menyemak sintaks aplikasi, kebergantungan setempat, fail pengedaran dan dokumentasi. Ujian, penilaian prestasi, antara muka lama serta alat penerbitan dalaman tidak disertakan dalam repositori ini. Lihat [status pengesahan dan binaan](../INSTALL.md#validation-and-build-status). Belum ada arahan pembinaan pemasang yang disahkan.

## Persediaan API pilihan

Dalam **设置 → 模型连接** (Tetapan → Sambungan model), pilih **Qwen, DeepSeek, OpenAI, SiliconFlow, perkhidmatan setempat serasi atau Tersuai**. Pratetap mengisi alamat dan cadangan model; Qwen mencadangkan `qwen-flash` atau `qwen-plus` dan memerlukan rantau serta ruang kerja yang dipilih sendiri; SiliconFlow tidak memilih model secara automatik. Setiap penyedia/rantau mengingati konfigurasi dan kuncinya, tetapi hanya satu aktif. Pilihan dan input mengubah draf sahaja. **Simpan perubahan** ketika tiada tugas untuk menyimpan dan mengaktifkan semuanya; kegagalan mengekalkan konfigurasi lama. Tiada mula semula atau permintaan automatik.

**Uji kemasan** menyemak draf API yang belum disimpan menggunakan contoh rekaan bahasa Cina/Inggeris, peraturan kemasan sebenar dan had 12 saat. Perubahan alamat, model atau kunci membatalkan hasil lama. **Dapatkan model** ialah tindakan sendiri, dihadkan kepada 10 saat, 500 model dan 2 MiB. Cadangan dan input manual kekal jika senarai gagal atau tidak disokong. Tersenarai atau lulus satu contoh tidak menjamin mutu keseluruhan.

Kunci diasingkan mengikut konfigurasi dan titik akhir. Medan kosong mengekalkan kunci profil itu; **Buang kunci** boleh dibatalkan sebelum disimpan. Kunci baharu hanya untuk sesi kecuali penyulitan sistem dipilih. Perubahan alamat memerlukan penggantian atau pembuangan kunci secara jelas; kegagalan penyulitan/tulisan membatalkan seluruh simpanan. Jika kunci tidak tersedia, petikan itu terus menggunakan imlak setempat tanpa menukar pilihan tersimpan atau penyedia secara automatik.

Hanya teks **Chat Completions bukan penstriman** disokong; tiada konfigurasi API melalui pemboleh ubah persekitaran atau `.env`. Dokumentasi pratetap disemak pada 2026-10-28, bukan pengesahan akaun sebenar. Pelayan teks setempat tidak disertakan. Lihat [Konfigurasi API](../API_CONFIGURATION.md) untuk medan, pautan kunci, had rantau/senarai dan penyelesaian masalah. **Ujian contoh serta cubaan semula yang disengajakan mungkin dicaj; pembatalan tidak menjamin pengebilan jauh berhenti.**

## Privasi dan storan setempat

- Pengecaman setempat dan pembetulan kamus tidak memerlukan API. Produk semasa tidak menyimpan fail rakaman baharu. Audio pemulihan disimpan sementara dalam memori; luput tempoh, tindakan padam dan keluar aplikasi akan membuangnya. Pemulihan selepas aplikasi ranap tidak boleh dijamin.
- **Hasil terkini disimpan secara setempat sebagai teks biasa**, termasuk teks asal dan teks yang disunting, walaupun sejarah berbilang item dimatikan. Tiada luput automatik transkrip atau suis pengekalan. Data pembangunan berada di bawah `work/dev/profile/` yang diabaikan oleh Git; jangan sekali-kali memasukkannya dalam komit.
- Mengaktifkan kemasan menghantar transkrip yang dibetulkan serta senarai terhad istilah kamus yang betul kepada perkhidmatan yang dikonfigurasikan. Audio mentah dan alias ejaan salah tidak disertakan. Dasar pengekalan data dan pengebilan penyedia terpakai.
- Kunci baharu hanya digunakan untuk sesi semasa melainkan penyimpanan disulitkan dipilih. Kunci yang disimpan menggunakan storan berasaskan sistem operasi melalui Electron; tiada simpanan teks biasa sebagai gantian jika storan selamat tidak tersedia. Ini tidak melindungi daripada perisian hasad yang bertindak sebagai pengguna sistem operasi anda.
- Rekod penggunaan mengandungi metadata permintaan, model, masa dan token, bukan isi teks atau kunci. Maklumat penggunaan atau harga yang tiada bermaksud kos tidak diketahui, bukannya sifar.

Baca [Privasi](../PRIVACY.md) sebelum menggunakan bahan peribadi. Pengecaman setempat tidak bermaksud kemasan pilihan tidak memuat naik apa-apa, atau teks tidak pernah ditulis ke cakera.

## Bahasa, had dan pengesahan

UI menggunakan **bahasa Cina Ringkas** secara lalai, dengan **mod paparan bahasa Inggeris** pilihan yang digunakan dalam contoh ini. Dokumentasi enam bahasa tidak bermaksud UI atau pengecaman menyokong keenam-enam bahasa tersebut. SenseVoice asal menyenaraikan Mandarin, Kantonis, bahasa Inggeris, bahasa Jepun dan bahasa Korea. Penilaian fail tetap terdahulu meliputi Mandarin dan bahasa Inggeris; tiada dakwaan sokongan pengecaman bahasa Perancis atau bahasa Melayu.

Untuk membuka UI bahasa Inggeris, jalankan `npm run dev -- --ui-language=en`; tanpa pilihan ini, UI lalai bahasa Cina dikekalkan. Pilihan ini hanya menukar paparan, bukan teks transkripsi atau kandungan kamus.

Repositori ini mengandungi kod aplikasi dan panduan penggunaan. Data ujian dalaman dan laporan prestasi tidak disertakan. Pintasan global, papan klip sistem, pertukaran mikrofon, fokus, berbilang paparan, DPI Windows, mutu perkhidmatan sebenar dan pemasangan pada mesin bersih masih memerlukan pengesahan berasingan.

Penanda aras terdahulu hanya terpakai pada mesin dan korpus berkenaan, bukan kelajuan atau ketepatan sejagat. Pemeriksaan pembungkusan secara jelas melaporkan **`distributionReady:false`**.

## Penyelesaian masalah

| Masalah | Langkah yang boleh dicuba |
| --- | --- |
| Masa jalan/model tiada | Jalankan `npm run doctor`; semak susun atur luaran yang lengkap, versi dan notis. |
| Penunjuk aras tidak bergerak atau tiada pertuturan | Pilih mikrofon yang benar-benar berfungsi mengikut nama, simpan, semak kebenaran/senyap dalam Windows, kemudian rakam sendiri. Peranti lalai sistem mungkin input yang berbeza. |
| API belum dikonfigurasikan | Matikan kemasan; pengecaman setempat dan peraturan kamus masih berfungsi. |
| 401/403 atau 404 | Semak kunci/rantau/kebenaran, ID model dan alamat Chat Completions. Jangan tampal kunci dalam isu. |
| Had kadar atau tamat masa | Kekalkan teks yang telah dipelihara. Cuba semula dengan sengaja; permintaan terdahulu mungkin masih dikenakan bayaran. |
| Gagal menyimpan | Kekalkan draf, salin teks penting dan semak ruang cakera/kebenaran menulis sebelum mencuba semula. |
| Kegagalan TLS/rangkaian | Semak hos rasmi, jam sistem operasi, rantaian kepercayaan sijil dan tembok api. Jangan nyahaktifkan pengesahan sijil. |

## Pelan seterusnya dan sumbangan

Seterusnya: persediaan pada mesin bersih dan pembungkusan, pengesahan peranti yang lebih luas, kawalan pengekalan/pemadaman transkrip serta penambahbaikan pengecaman yang diukur. Ini ialah rancangan, bukan ciri sedia ada. Aplikasi akan kekal sebagai alat imlak yang ringkas.

Baca [CONTRIBUTING.md](../../CONTRIBUTING.md) untuk semakan setempat yang selamat dan [SECURITY.md](../../SECURITY.md) untuk had pelaporan keselamatan. [CHANGELOG.md](../../CHANGELOG.md) merekodkan perubahan kod sumber.

## Lesen dan penghargaan

Kod asal, dokumentasi dan aset asal projek ditawarkan di bawah [Lesen MIT](../../LICENSE), hak cipta 2026 chenjinxian1. [Skop lesen](../../THIRD_PARTY_NOTICES.md) membezakan bahan projek daripada fon, pengisytiharan janaan, masa jalan dan pemberat model pihak ketiga.

Komponen pihak ketiga mengekalkan syarat masing-masing: Electron/Chromium, sherpa-onnx/ONNX Runtime, pemberat SenseVoice, Silero VAD dan Saira. Syarat model berasingan daripada sebarang lesen kod aplikasi. Baca [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md). Terima kasih kepada penyelenggara komponen ini dan penyumbang FLEURS. Arah visual perindustrian yang terkawal diinspirasikan oleh [endfield-ui-skill](https://github.com/hhikr/endfield-ui-skill); tiada watak permainan, logo atau karya seni permainan digunakan sebagai aset jenama.
