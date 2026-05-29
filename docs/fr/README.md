<div align="center">
  <img src="/docs/images/logo.jpg" alt="KlicStudio" height="90">

# Outil de traduction et de doublage vidéo AI minimaliste

<a href="https://trendshift.io/repositories/13360" target="_blank"><img src="https://trendshift.io/api/badge/repositories/13360" alt="KrillinAI%2FKlicStudio | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

**[English](/README.md)｜[简体中文](/docs/zh/README.md)｜[日本語](/docs/jp/README.md)｜[한국어](/docs/kr/README.md)｜[Tiếng Việt](/docs/vi/README.md)｜[Français](/docs/fr/README.md)｜[Deutsch](/docs/de/README.md)｜[Español](/docs/es/README.md)｜[Português](/docs/pt/README.md)｜[Русский](/docs/rus/README.md)｜[اللغة العربية](/docs/ar/README.md)**

[![Twitter](https://img.shields.io/badge/Twitter-KrillinAI-orange?logo=twitter)](https://x.com/KrillinAI)
[![QQ 群](https://img.shields.io/badge/QQ%20群-754069680-green?logo=tencent-qq)](https://jq.qq.com/?_wv=1027&k=754069680)
[![Bilibili](https://img.shields.io/badge/dynamic/json?label=Bilibili&query=%24.data.follower&suffix=粉丝&url=https%3A%2F%2Fapi.bilibili.com%2Fx%2Frelation%2Fstat%3Fvmid%3D242124650&logo=bilibili&color=00A1D6&labelColor=FE7398&logoColor=FFFFFF)](https://space.bilibili.com/242124650)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/krillinai/KlicStudio)

</div>

## Introduction au projet  ([Essayez la version en ligne maintenant !](https://www.klic.studio/))
[**Démarrage rapide**](#-quick-start)

Klic Studio est une solution polyvalente de localisation et d'amélioration audio et vidéo développée par Krillin AI. Cet outil minimaliste mais puissant intègre la traduction vidéo, le doublage et le clonage vocal, prenant en charge les formats paysage et portrait pour garantir une présentation parfaite sur toutes les principales plateformes (Bilibili, Xiaohongshu, Douyin, WeChat Video, Kuaishou, YouTube, TikTok, etc.). Avec un flux de travail de bout en bout, vous pouvez transformer des matériaux bruts en contenu prêt à l'emploi et multiplateforme en quelques clics.

## Caractéristiques et fonctions clés :

🎯 **Démarrage en un clic** : Pas de configuration d'environnement complexe requise, installation automatique des dépendances, prêt à l'emploi immédiatement, avec une nouvelle version de bureau pour un accès plus facile !

📥 **Acquisition vidéo** : Prend en charge les téléchargements yt-dlp ou les téléchargements de fichiers locaux

📜 **Reconnaissance précise** : Reconnaissance vocale de haute précision basée sur Whisper

🧠 **Segmentation intelligente** : Segmentation et alignement des sous-titres utilisant LLM

🔄 **Remplacement de terminologie** : Remplacement en un clic du vocabulaire professionnel

🌍 **Traduction professionnelle** : Traduction LLM avec contexte pour maintenir une sémantique naturelle

🎙️ **Clonage vocal** : Offre des tons de voix sélectionnés de CosyVoice ou un clonage vocal personnalisé

🎬 **Composition vidéo** : Traite automatiquement les vidéos paysage et portrait ainsi que la mise en page des sous-titres

💻 **Multiplateforme** : Prend en charge Windows, Linux, macOS, fournissant à la fois des versions de bureau et serveur

## Démonstration d'effet

L'image ci-dessous montre l'effet du fichier de sous-titres généré après l'importation d'une vidéo locale de 46 minutes et son exécution en un clic, sans aucun ajustement manuel. Il n'y a pas d'omissions ni de chevauchements, la segmentation est naturelle et la qualité de la traduction est très élevée.
![Effet d'alignement](/docs/images/alignment.png)

<table>
<tr>
<td width="33%">

### Traduction de sous-titres

---

https://github.com/user-attachments/assets/bba1ac0a-fe6b-4947-b58d-ba99306d0339

</td>
<td width="33%">

### Doublage

---

https://github.com/user-attachments/assets/0b32fad3-c3ad-4b6a-abf0-0865f0dd2385

</td>

<td width="33%">

### Mode portrait

---

https://github.com/user-attachments/assets/c2c7b528-0ef8-4ba9-b8ac-f9f92f6d4e71

</td>

</tr>
</table>

## 🔍 Services de reconnaissance vocale pris en charge

_**Tous les modèles locaux dans le tableau ci-dessous prennent en charge l'installation automatique des fichiers exécutables + fichiers de modèle ; vous n'avez qu'à choisir, et Klic préparera tout pour vous.**_

| Source de service       | Plateformes prises en charge | Options de modèle                             | Local/Cloud | Remarques                     |
|------------------------|------------------------------|-----------------------------------------------|-------------|-------------------------------|
| **OpenAI Whisper**     | Toutes les plateformes        | -                                             | Cloud       | Vitesse rapide et bon effet   |
| **FasterWhisper**      | Windows/Linux                | `tiny`/`medium`/`large-v2` (recommandé medium+) | Local       | Vitesse plus rapide, pas de coût de service cloud |
| **WhisperKit**         | macOS (M-series uniquement)  | `large-v2`                                   | Local       | Optimisation native pour les puces Apple |
| **WhisperCpp**         | Toutes les plateformes        | `large-v2`                                   | Local       | Prend en charge toutes les plateformes |
| **Alibaba Cloud ASR**  | Toutes les plateformes        | -                                             | Cloud       | Évite les problèmes de réseau en Chine continentale |

## 🚀 Support des grands modèles de langage

✅ Compatible avec tous les services de grands modèles de langage cloud/local conformes aux **spécifications de l'API OpenAI**, y compris mais sans s'y limiter :

- OpenAI
- Gemini
- DeepSeek
- Tongyi Qianwen
- Modèles open-source déployés localement
- Autres services API compatibles avec le format OpenAI

## 🎤 Support TTS (Texte à Parole)

- Service vocal Alibaba Cloud
- OpenAI TTS

## Support linguistique

Langues d'entrée prises en charge : chinois, anglais, japonais, allemand, turc, coréen, russe, malais (augmentation continue)

Langues de traduction prises en charge : anglais, chinois, russe, espagnol, français et 101 autres langues

## Aperçu de l'interface

![Aperçu de l'interface](/docs/images/ui_desktop_light.png)
![Aperçu de l'interface](/docs/images/ui_desktop_dark.png)

## 🚀 Démarrage rapide

Vous pouvez poser des questions sur le [Deepwiki de KlicStudio](https://deepwiki.com/krillinai/KlicStudio). Il indexe les fichiers dans le dépôt, vous pouvez donc trouver des réponses rapidement.

### Étapes de base

Tout d'abord, téléchargez le fichier exécutable qui correspond à votre système de périphérique depuis le [Release](https://github.com/KrillinAI/KlicStudio/releases), puis suivez le tutoriel ci-dessous pour choisir entre la version de bureau ou la version non de bureau. Placez le téléchargement du logiciel dans un dossier vide, car son exécution générera certains répertoires, et le garder dans un dossier vide facilitera la gestion.

【Si c'est la version de bureau, c'est-à-dire le fichier de version avec "desktop", voir ici】
_La version de bureau est nouvellement publiée pour résoudre les problèmes des nouveaux utilisateurs qui ont du mal à éditer correctement les fichiers de configuration, et il y a quelques bugs qui sont continuellement mis à jour._

1. Double-cliquez sur le fichier pour commencer à l'utiliser (la version de bureau nécessite également une configuration au sein du logiciel)

【Si c'est la version non de bureau, c'est-à-dire le fichier de version sans "desktop", voir ici】
_La version non de bureau est la version initiale, qui a une configuration plus complexe mais est stable en fonctionnalité et convient au déploiement sur serveur, car elle fournit une interface utilisateur au format web._

1. Créez un dossier `config` dans le dossier, puis créez un fichier `config.toml` dans le dossier `config`. Copiez le contenu du fichier `config-example.toml` du répertoire `config` du code source dans `config.toml`, et remplissez vos informations de configuration selon les commentaires.
2. Double-cliquez ou exécutez le fichier exécutable dans le terminal pour démarrer le service
3. Ouvrez votre navigateur et entrez `http://127.0.0.1:8888` pour commencer à l'utiliser (remplacez 8888 par le port que vous avez spécifié dans le fichier de configuration)

### À : Utilisateurs de macOS

【Si c'est la version de bureau, c'est-à-dire le fichier de version avec "desktop", voir ici】
En raison de problèmes de signature, la version de bureau ne peut actuellement pas être exécutée par double-clic ou installée via dmg ; vous devez faire confiance manuellement à l'application. La méthode est la suivante :

1. Ouvrez le terminal dans le répertoire où se trouve le fichier exécutable (en supposant que le nom du fichier est KlicStudio_1.0.0_desktop_macOS_arm64)
2. Exécutez les commandes suivantes dans l'ordre :

```
sudo xattr -cr ./KlicStudio_1.0.0_desktop_macOS_arm64
sudo chmod +x ./KlicStudio_1.0.0_desktop_macOS_arm64 
./KlicStudio_1.0.0_desktop_macOS_arm64
```

【Si c'est la version non de bureau, c'est-à-dire le fichier de version sans "desktop", voir ici】
Ce logiciel n'est pas signé, donc lors de l'exécution sur macOS, après avoir terminé la configuration du fichier dans les "Étapes de base", vous devez également faire confiance manuellement à l'application. La méthode est la suivante :

1. Ouvrez le terminal dans le répertoire où se trouve le fichier exécutable (en supposant que le nom du fichier est KlicStudio_1.0.0_macOS_arm64)
2. Exécutez les commandes suivantes dans l'ordre :
   ```
   sudo xattr -rd com.apple.quarantine ./KlicStudio_1.0.0_macOS_arm64
   sudo chmod +x ./KlicStudio_1.0.0_macOS_arm64
   ./KlicStudio_1.0.0_macOS_arm64
   ```
   
   Cela démarrera le service

### Déploiement Docker

Ce projet prend en charge le déploiement Docker ; veuillez vous référer aux [Instructions de déploiement Docker](./docker.md)

### Utilisation de la CLI

KrillinAI propose désormais une CLI par étapes, adaptée aux scripts, aux pipelines d'automatisation et aux agents IA. Par défaut, la CLI s'exécute de manière synchrone, imprime une ligne JSON sur stdout à la fin, et écrit `krillinai_manifest.json` dans le répertoire de travail afin que les étapes suivantes puissent réutiliser les artefacts existants.

Compiler la CLI depuis le code source :

```bash
go build -o build/krillinai-cli ./cmd/cli
```

Résumé des commandes :

| Commande | Usage | Artefacts courants |
|---|---|---|
| `subtitle` | Génère des sous-titres depuis un lien YouTube / Bilibili ou une vidéo locale ; tente d'abord les sous-titres de la plateforme, puis revient à Whisper en cas d'échec | `origin_language_srt.srt`, `target_language_srt.srt`, `bilingual_srt.srt`, `short_origin_mixed_srt.srt` |
| `tts` | Génère un doublage dans la langue cible à partir des sous-titres cibles | `tts_final_audio.wav`, `video_with_tts.mp4` |
| `render-horizontal` | Génère une vidéo horizontale : vidéo originale + sous-titres bilingues, ou vidéo doublée + sous-titres en langue cible | `horizontal_bilingual.mp4` |
| `render-vertical` | Génère une vidéo verticale : vidéo originale convertie en vertical + sous-titres courts, ou vidéo doublée + sous-titres en langue cible | `transferred_vertical_video.mp4`, `vertical_bilingual.mp4` |
| `pipeline` | Enchaîne plusieurs étapes selon outputs | Dépend des étapes sélectionnées |
| `cover` | Génère une couverture à partir de la couverture originale de la vidéo et d'un modèle de prompt | `generated_cover.png` |

Flux de travail typique :

```bash
# 1. Générer les sous-titres source, cible, bilingues et courts pour vertical
./build/krillinai-cli subtitle "https://www.youtube.com/watch?v=dQw4w9WgXcQ" \
  --origin-lang en \
  --target-lang zh_cn \
  --workdir tasks/demo \
  --caption-source any

# 2. Générer le doublage à partir des sous-titres de la langue cible
./build/krillinai-cli tts \
  --workdir tasks/demo \
  --input-srt tasks/demo/target_language_srt.srt \
  --line-mode target-only \
  --video tasks/demo/origin_video.mp4

# 3. Générer une vidéo horizontale avec sous-titres bilingues
./build/krillinai-cli render-horizontal \
  --workdir tasks/demo \
  --video tasks/demo/origin_video.mp4 \
  --subtitle tasks/demo/bilingual_srt.srt

# 4. Générer une vidéo verticale avec sous-titres bilingues courts
./build/krillinai-cli render-vertical \
  --workdir tasks/demo \
  --video tasks/demo/origin_video.mp4 \
  --subtitle tasks/demo/short_origin_mixed_srt.srt \
  --major-title "Sujet du jour" \
  --minor-title "AI Video"
```

Conventions d'intégration pour les agents :

- Lire en priorité la dernière ligne JSON de stdout et `krillinai_manifest.json` ; ne pas analyser les logs ordinaires.
- Le champ `outputs` enregistre les chemins des artefacts ; les commandes suivantes peuvent réutiliser le manifest avec seulement `--workdir`.
- `--dry-run` valide les paramètres et génère le manifest sans télécharger de vidéo ni appeler de service IA externe.
- Traiter les erreurs selon `error.kind` : `usage` pour corriger les paramètres, `retryable` pour réessayer, `dependency` pour installer `ffmpeg` / `ffprobe` / `yt-dlp`.

Pour une description plus complète des paramètres, consultez le [résumé des capacités CLI](../zh/cli.md).

### Agent Skills

Le dépôt inclut également des Agent Skills prêts à l'emploi dans `skills/`, afin que les agents puissent appeler la CLI avec des conventions stables :

- [`krillinai-cli`](../../skills/krillinai-cli/SKILL.md) : skill d'entrée principale pour choisir les workflows de sous-titres, TTS, rendu, pipeline ou couverture.
- [`krillinai-subtitle`](../../skills/krillinai-subtitle/SKILL.md), [`krillinai-tts`](../../skills/krillinai-tts/SKILL.md), [`krillinai-render-horizontal`](../../skills/krillinai-render-horizontal/SKILL.md) et [`krillinai-render-vertical`](../../skills/krillinai-render-vertical/SKILL.md) : guides opérationnels propres à chaque étape.
- [`krillinai-pipeline`](../../skills/krillinai-pipeline/SKILL.md) et [`krillinai-cover`](../../skills/krillinai-cover/SKILL.md) : guides de planification/réservation pour l'orchestration pipeline et la génération de couverture tant que ces chemins d'exécution ne sont pas entièrement connectés.
- [`cli-contract.md`](../../skills/krillinai-cli/references/cli-contract.md) : contrat partagé pour JSON, manifest, outputs et gestion des erreurs.

Basé sur le fichier de configuration fourni, voici la section mise à jour "Aide à la configuration (À lire absolument)" pour votre fichier README :

### Aide à la configuration (À lire absolument)

Le fichier de configuration est divisé en plusieurs sections : `[app]`, `[server]`, `[llm]`, `[transcribe]`, et `[tts]`. Une tâche est composée de reconnaissance vocale (`transcribe`) + traduction de grand modèle (`llm`) + services vocaux optionnels (`tts`). Comprendre cela vous aidera à mieux saisir le fichier de configuration.

**Configuration la plus facile et rapide :**

**Pour la traduction de sous-titres uniquement :**
   * Dans la section `[transcribe]`, définissez `provider.name` sur `openai`.
   * Vous n'aurez alors qu'à remplir votre clé API OpenAI dans le bloc `[llm]` pour commencer à effectuer des traductions de sous-titres. Les champs `app.proxy`, `model`, et `openai.base_url` peuvent être remplis selon les besoins.

**Coût, vitesse et qualité équilibrés (Utilisation de la reconnaissance vocale locale) :**

* Dans la section `[transcribe]`, définissez `provider.name` sur `fasterwhisper`.
* Définissez `transcribe.fasterwhisper.model` sur `large-v2`.
* Remplissez votre configuration de grand modèle de langage dans le bloc `[llm]`.
* Le modèle local requis sera automatiquement téléchargé et installé.

**Configuration TTS (Texte à Parole) (Optionnel) :**

* La configuration TTS est optionnelle.
* Tout d'abord, définissez `provider.name` sous la section `[tts]` (par exemple, `aliyun` ou `openai`).
* Ensuite, remplissez le bloc de configuration correspondant pour le fournisseur sélectionné. Par exemple, si vous choisissez `aliyun`, vous devez remplir la section `[tts.aliyun]`.
* Les codes vocaux dans l'interface utilisateur doivent être choisis en fonction de la documentation du fournisseur sélectionné.
* **Remarque :** Si vous prévoyez d'utiliser la fonction de clonage vocal, vous devez sélectionner `aliyun` comme fournisseur TTS.

**Configuration Alibaba Cloud :**

* Pour des détails sur l'obtention des `AccessKey`, `Bucket`, et `AppKey` nécessaires pour les services Alibaba Cloud, veuillez vous référer aux [Instructions de configuration Alibaba Cloud](https://www.google.com/search?q=./aliyun.md). Les champs répétés pour AccessKey, etc., sont conçus pour maintenir une structure de configuration claire.

## Questions Fréquemment Posées

Veuillez visiter [Questions Fréquemment Posées](./faq.md)

## Directives de contribution

1. Ne soumettez pas de fichiers inutiles, tels que .vscode, .idea, etc. ; veuillez utiliser .gitignore pour les filtrer.
2. Ne soumettez pas config.toml ; soumettez plutôt config-example.toml.

## Contactez-nous

1. Rejoignez notre groupe QQ pour des questions : 754069680
2. Suivez nos comptes de médias sociaux, [Bilibili](https://space.bilibili.com/242124650), où nous partageons chaque jour du contenu de qualité dans le domaine de la technologie AI.

## Historique des étoiles

[![Graphique de l'historique des étoiles](https://api.star-history.com/svg?repos=KrillinAI/KlicStudio&type=Date)](https://star-history.com/#KrillinAI/KlicStudio&Date)
