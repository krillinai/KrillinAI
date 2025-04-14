<div align="center">
  <img src="../docs/images/logo.png" alt="KrillinAI" height="90">


  # Outil de Traduction et Doublage Audio/Video par IA

<a href="https://trendshift.io/repositories/13360" target="_blank"><img src="https://trendshift.io/api/badge/repositories/13360" alt="krillinai%2FKrillinAI | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

  **[English](../README.md)｜[简体中文](../docs/README_zh.md)｜[日本語](../docs/README_jp.md)｜[한국어](../docs/README_kr.md)｜[Français](../docs/README_fr.md)｜[Deutsch](../docs/README_de.md)｜[Español](../docs/README_es.md)｜[Português](../docs/README_pt.md)｜[Русский](../docs/README_rus.md)｜[اللغة العربية](../docs/README_ar.md)**

  [![Twitter](https://img.shields.io/badge/Twitter-KrillinAI-orange?logo=twitter)](https://x.com/KrillinAI)
[![Bilibili](https://img.shields.io/badge/dynamic/json?label=Bilibili&query=%24.data.follower&suffix=%20followers&url=https%3A%2F%2Fapi.bilibili.com%2Fx%2Frelation%2Fstat%3Fvmid%3D242124650&logo=bilibili&color=00A1D6&labelColor=FE7398&logoColor=FFFFFF)](https://space.bilibili.com/242124650)
[![QQ 群](https://img.shields.io/badge/QQ%20群-754069680-green?logo=tencent-qq)](https://jq.qq.com/?_wv=1027&k=754069680)

</div>

### 📢 Nouvelle Version Bureau pour Windows & Mac – Testez et Donnez Votre Avis

## Présentation

Krillin AI est une solution tout-en-un pour la localisation et l'amélioration simplifiée de vidéos. Cet outil minimaliste mais puissant gère tout : traduction, doublage, clonage vocal, et reformatage – convertissant facilement les vidéos entre formats paysage et portrait pour un affichage optimal sur toutes les plateformes (YouTube, TikTok, Bilibili, Douyin, WeChat Channel, RedNote, Kuaishou). Avec son workflow intégré, Krillin AI transforme des vidéos brutes en contenu professionnel en quelques clics.

## Fonctionnalités Clés :

🎯 **Lancement Instantané** - Démarrez votre workflow en un clic. Nouvelle version bureau plus intuitive !  

📥 **Téléchargement Vidéo** - Prise en charge d'yt-dlp et des fichiers locaux 

📜 **Sous-titres Précis** - Reconnaissance haute précision via Whisper  

🧠 **Segmentation Intelligente** - Découpage des sous-titres par IA (LLM)  

🌍 **Traduction Professionnelle** - Traduction cohérente par paragraphes  

🔄 **Remplacement de Termes** - Échange de vocabulaire spécialisé en un clic  

🎙️ **Doublage et Clonage Vocal** - Sélection de voix CosyVoice ou clonage  

🎬 **Composition Vidéo** - Formatage automatique paysage/portrait  

## Démonstration
L'image ci-dessous montre le résultat après insertion automatique des sous-titres générés pour une vidéo locale de 46 minutes (sans ajustement manuel). Aucun sous-titre manquant ou chevauchant, une segmentation naturelle et une traduction de qualité.
![Alignment](../docs/images/alignment.png)

<table>
<tr>
<td width="33%">

### Traduction de Sous-titres
---
https://github.com/user-attachments/assets/bba1ac0a-fe6b-4947-b58d-ba99306d0339

</td>
<td width="33%">

### Doublage
---
https://github.com/user-attachments/assets/0b32fad3-c3ad-4b6a-abf0-0865f0dd2385

</td>

<td width="33%">

### Format Portrait
---
https://github.com/user-attachments/assets/c2c7b528-0ef8-4ba9-b8ac-f9f92f6d4e71

</td>

</tr>
</table>

## 🌍 Langues Prises en Charge
Langues d'entrée : Chinois, Anglais, Japonais, Allemand, Turc (autres en cours d'ajout)  
Langues de traduction : 56 langues dont Anglais, Chinois, Russe, Espagnol, Français, etc.

## Aperçu de l'Interface
![ui preview](../docs/images/ui_desktop.png)

## 🚀 Guide de Démarrage Rapide
### Étapes de Base
Téléchargez d'abord le fichier exécutable de la version Release correspondant à votre système. Suivez les instructions ci-dessous pour choisir entre la version bureau ou standard, puis placez le logiciel dans un dossier vide. L'exécution du programme générera des répertoires supplémentaires - un dossier vide facilite la gestion.

[Pour la version bureau (fichiers avec "desktop" dans le nom)]  
_La version bureau est une nouveauté conçue pour simplifier la configuration (sans éditer de fichiers). Elle contient encore quelques bugs et est mise à jour régulièrement._  

Double-cliquez sur le fichier pour l'utiliser.

[Pour la version standard (fichiers sans "desktop" dans le nom), voir ici]  
_La version standard est la publication originale, offrant une configuration plus complexe mais une fonctionnalité stable. Elle convient également au déploiement sur serveur grâce à son interface web._  

Créez un dossier `config` dans le répertoire, puis créez un fichier `config.toml` à l'intérieur. Copiez le contenu du fichier `config-example.toml` du dossier `config` du code source dans votre `config.toml` et remplissez les détails de configuration. (Si vous souhaitez utiliser les modèles OpenAI mais ne savez pas comment obtenir une clé, vous pouvez rejoindre le groupe pour un accès d'essai gratuit.)

Double-cliquez sur l'exécutable ou exécutez-le dans le terminal pour démarrer le service.

Ouvrez votre navigateur et entrez http://127.0.0.1:8888 pour commencer à l'utiliser. (Remplacez 8888 par le numéro de port que vous avez spécifié dans le fichier config.)

### Pour les utilisateurs macOS
[Pour la version bureau (fichiers avec "desktop" dans le nom), voir ici]  
La méthode actuelle d'empaquetage ne permet pas d'exécution par double-clic ni d'installation via DMG en raison de problèmes de signature. Une configuration manuelle de confiance est nécessaire :

1. Ouvrez dans le Terminal le répertoire contenant le fichier exécutable (nommé par exemple KrillinAI_1.0.0_desktop_macOS_arm64)

2. Exécutez les commandes suivantes dans l'ordre :

```
sudo xattr -cr ./KrillinAI_1.0.0_desktop_macOS_arm64  
sudo chmod +x ./KrillinAI_1.0.0_desktop_macOS_arm64  
./KrillinAI_1.0.0_desktop_macOS_arm64  
```

[Pour la version standard (fichiers sans "desktop" dans le nom), voir ici]  
Ce logiciel n'est pas signé. Après avoir complété la configuration des fichiers comme décrit dans les "Étapes de base", vous devrez approuver manuellement l'application sur macOS. Procédez comme suit :

1. Ouvrez le terminal et accédez au répertoire contenant le fichier exécutable (par exemple `KrillinAI_1.0.0_macOS_arm64`)
2. Exécutez les commandes suivantes dans l'ordre :
```
sudo xattr -rd com.apple.quarantine ./KrillinAI_1.0.0_macOS_arm64
sudo chmod +x ./KrillinAI_1.0.0_macOS_arm64
./KrillinAI_1.0.0_macOS_arm64
```
Cela démarrera le service.

### Déploiement Docker
Consultez le [Docker Deployment Instructions](../docs/docker.md).

### Configuration des Cookies

En cas d'échec de téléchargement, suivez le [Cookie Configuration Instructions](../docs/get_cookies.md) .

### Aide à la Configuration
La méthode de configuration la plus rapide et pratique :
* Sélectionnez `openai` pour `transcription_provider` et `llm_provider`. Ainsi, vous n'aurez qu'à renseigner `openai.apikey` dans les trois catégories de configuration principales (`openai`, `local_model`, et `aliyun`) pour effectuer la traduction de sous-titres. (Complétez `app.proxy`, `model` et `openai.base_url` selon votre situation.)

Méthode utilisant le modèle local de reconnaissance vocale (non supporté sur macOS pour le moment) (optimisant coût, vitesse et qualité) :
* Utilisez `fasterwhisper` pour `transcription_provider` et `openai` pour `llm_provider`. Vous devrez alors renseigner `openai.apikey` et `local_model.faster_whisper` dans les catégories `openai` et `local_model`. Le modèle local sera téléchargé automatiquement. (`app.proxy` et `openai.base_url` restent configurables comme mentionné ci-dessus.)

Cas nécessitant la configuration d'Alibaba Cloud :
* Si `llm_provider` est défini sur `aliyun`, le service de grands modèles d'Alibaba Cloud sera utilisé. Configurez alors `aliyun.bailian`.
* Si `transcription_provider` est sur `aliyun` ou si la fonction "doublage vocal" est activée, le service vocal d'Alibaba Cloud sera utilisé. Configurez `aliyun.speech`.
* Si le "doublage vocal" est activé avec clonage de timbre vocal via fichiers audio locaux, le service OSS d'Alibaba Cloud sera aussi utilisé. Configurez alors `aliyun.oss`.
Guide : [Instructions de configuration Alibaba Cloud](./docs/aliyun.md)

## Foire Aux Questions
Consultez la [FAQ](../docs/faq.md) (Foire Aux Questions)

## Directives de Contribution

- Ne soumettez pas de fichiers inutiles comme `.vscode`, `.idea`, etc. Utilisez correctement le fichier `.gitignore` pour les exclure.
- Ne soumettez pas `config.toml` ; soumettez plutôt `config-example.toml`.

## Historique des Stars

[![Star History Chart](https://api.star-history.com/svg?repos=krillinai/KrillinAI&type=Date)](https://star-history.com/#krillinai/KrillinAI&Date)
