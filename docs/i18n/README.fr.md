<h1 align="center">Dictpin v0.2.2-dev.34</h1>

<p align="center">
  <strong>La dictée de bureau en petit format. Parlez, gardez la maîtrise de vos mots, puis passez à la suite.</strong>
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
  <a href="../../README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <strong>Français</strong> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.ms.md">Bahasa Melayu</a>
</p>

![Illustration conceptuelle de Dictpin : du son à un texte clair](../branding/hero.png)

<!-- overview -->
Dictpin est une version de développement d’une application de dictée pour Windows, fondée sur Electron, la reconnaissance locale SenseVoice, des règles explicites de dictionnaire personnel et un nettoyage facultatif du texte via un service compatible. Pour les messages courts, les notes, les noms et les termes techniques : démarrer, parler, vérifier, copier.
<!-- /overview -->

## Fonctionnalités

- **Reconnaissance locale :** SenseVoice utilise le processeur, avec la détection vocale Silero.
- **Dictionnaire personnel :** enregistrez les termes corrects et leurs erreurs courantes, consultez les changements et annulez les corrections.
- **Nettoyage automatique :** le mode Fluide supprime les hésitations et répétitions ; le mode Léger ajoute ponctuation et coupures de phrases. La transcription originale reste disponible.
- **Dictée longue :** aperçu du texte pendant l’enregistrement, ajout d’une autre dictée, édition et copie. L’audio temporaire reste récupérable en mémoire pendant 30 secondes après annulation ou cinq minutes après un échec de reconnaissance.
- **Interface compacte :** résultats, dictionnaire, paramètres et barre flottante, avec raccourcis et thèmes clair/sombre.
- **Collage protégé :** une option à activer pour envoyer le texte au champ de saisie d’origine.

## Captures du logiciel

Captures du logiciel · démonstration en anglais

### Interface principale

![Interface principale](../images/results.png)

### Paramètres API

![Paramètres API](../images/settings.png)

[Détails des captures](../SCREENSHOTS.md)

## Démarrage rapide

Windows x64 et Node.js 24+. Préparez Electron 44.8.0, sherpa-onnx 1.13.8, SenseVoice et Silero VAD selon le guide d’installation. [Guide d’installation](../INSTALL.md)

```powershell
.\native\build-local03.cmd
.\native\build-delivery.cmd
npm run doctor
npm run check
node scripts/package-inputs.cjs
npm run dev
```

Choisissez le microphone dans les paramètres et enregistrez, puis démarrez et arrêtez la dictée. Le texte final apparaît dans l’éditeur. `Ctrl+Enter` copie tout ; `Ctrl+C` copie la sélection.

Le démarrage normal réutilise la configuration de développement enregistrée. Utilisez `npm run dev -- --profile=isolated` pour un profil distinct.

## Connexion au modèle

Dans **Paramètres → Connexion au modèle**, choisissez Qwen, DeepSeek, OpenAI, SiliconFlow, un service local compatible ou Personnalisé. Saisissez l’adresse, le modèle et la clé, puis enregistrez. Le nettoyage démarre après la dictée ; sans connexion utilisable, la dictée reste locale.

Les suggestions intégrées fonctionnent hors ligne. **Obtenir les modèles** et **Tester le nettoyage** s’exécutent au clic. Le fournisseur peut facturer les appels. [Configuration API et dépannage](../API_CONFIGURATION.md)

## Confidentialité

La reconnaissance vocale s’effectue localement. Si le nettoyage est activé, le texte et les termes du dictionnaire sont envoyés au service configuré. Les clés peuvent être chiffrées avec le stockage sécurisé de Windows ; le dernier résultat est enregistré localement. [Traitement des données](../PRIVACY.md)

## Documentation et licence

[Installation](../INSTALL.md) · [Configuration API](../API_CONFIGURATION.md) · [Confidentialité](../PRIVACY.md) · [Journal des modifications](../../CHANGELOG.md) · [Contribuer](../../CONTRIBUTING.md) · [Sécurité](../../SECURITY.md)

[MIT © 2026 chenjinxian1.](../../LICENSE) [Mentions des composants tiers](../../THIRD_PARTY_NOTICES.md)
