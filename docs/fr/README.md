<div align="center">
  <img src="/docs/images/logo.png" alt="KrillinAI" height="90">

  # Outil de traduction et de doublage vidéo AI minimaliste

  <a href="https://trendshift.io/repositories/13360" target="_blank"><img src="https://trendshift.io/api/badge/repositories/13360" alt="krillinai%2FKrillinAI | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

  **[English](/README.md)｜[简体中文](/docs/zh/README.md)｜[日本語](/docs/jp/README.md)｜[한국어](/docs/kr/README.md)｜[Tiếng Việt](/docs/vi/README.md)｜[Français](/docs/fr/README.md)｜[Deutsch](/docs/de/README.md)｜[Español](/docs/es/README.md)｜[Português](/docs/pt/README.md)｜[Русский](/docs/rus/README.md)｜[اللغة العربية](/docs/ar/README.md)**

[![Twitter](https://img.shields.io/badge/Twitter-KrillinAI-orange?logo=twitter)](https://x.com/KrillinAI)
[![QQ 群](https://img.shields.io/badge/QQ%20群-754069680-green?logo=tencent-qq)](https://jq.qq.com/?_wv=1027&k=754069680)
[![Bilibili](https://img.shields.io/badge/dynamic/json?label=Bilibili&query=%24.data.follower&suffix=粉丝&url=https%3A%2F%2Fapi.bilibili.com%2Fx%2Frelation%2Fstat%3Fvmid%3D242124650&logo=bilibili&color=00A1D6&labelColor=FE7398&logoColor=FFFFFF)](https://space.bilibili.com/242124650)

</div>

 ## Présentation du projet  ([Essayez la version en ligne maintenant !](https://www.klic.studio/))

Krillin AI est une solution complète de localisation et d'amélioration audio-vidéo. Cet outil puissant et minimaliste combine traduction vidéo, doublage et clonage vocal, prenant en charge les formats paysage et portrait, garantissant une présentation parfaite sur toutes les principales plateformes (Bilibili, Xiaohongshu, Douyin, WeChat Video, Kuaishou, YouTube, TikTok, etc.). Grâce à un flux de travail de bout en bout, Krillin AI peut transformer le matériel brut en contenu prêt à l'emploi multiplateforme en quelques clics.

## Principales caractéristiques et fonctionnalités :
🎯 **Démarrage en un clic** : Pas de configuration d'environnement complexe, installation automatique des dépendances, prêt à l'emploi, avec une nouvelle version de bureau pour plus de commodité !

📥 **Acquisition vidéo** : Prise en charge du téléchargement yt-dlp ou du téléchargement de fichiers locaux

📜 **Reconnaissance précise** : Reconnaissance vocale de haute précision basée sur Whisper

🧠 **Segmentation intelligente** : Utilisation de LLM pour la segmentation et l'alignement des sous-titres

🔄 **Remplacement de termes** : Remplacement d'un clic des vocabulaire spécialisés 

🌍 **Traduction professionnelle** : Traduction LLM avec contexte pour maintenir la naturalité sémantique

🎙️ **Clonage vocal** : Fournit des voix sélectionnées par CosyVoice ou un clonage de voix personnalisé

🎬 **Synthèse vidéo** : Traitement automatique des vidéos et de la mise en page des sous-titres en mode paysage et portrait

💻 **Multiplateforme** : Prise en charge de Windows, Linux, macOS, avec des versions de bureau et serveur


## Exemples de résultats
L'image ci-dessous montre l'importation d'une vidéo locale de 46 minutes, avec le fichier de sous-titres généré après une exécution en un clic, sans aucun ajustement manuel. Pas de pertes, de chevauchements, des phrases naturelles, et la qualité de la traduction est également très élevée.
![Effet d'alignement](/docs/images/alignment.png)

<table>
<tr>
<td width="33%">

### Traduction des sous-titres
---
https://github.com/user-attachments/assets/bba1ac0a-fe6b-4947-b58d-ba99306d0339

</td>
<td width="33%">



### Doublage
---
https://github.com/user-attachments/assets/0b32fad3-c3ad-4b6a-abf0-0865f0dd2385

</td>

<td width="33%">

### Portrait
---
https://github.com/user-attachments/assets/c2c7b528-0ef8-4ba9-b8ac-f9f92f6d4e71

</td>

</tr>
</table>

## 🔍 Support des services de reconnaissance vocale
_**Tous les modèles locaux dans le tableau ci-dessous prennent en charge l'installation automatique des fichiers exécutables + des fichiers de modèle, il vous suffit de choisir, KrillinAI s'occupe du reste.**_

| Source de service        | Plateformes prises en charge | Options de modèle                          | Local/Cloud | Remarques        |
|--------------------------|------------------------------|-------------------------------------------|-------------|------------------|
| **OpenAI Whisper**       | Toutes les plateformes        | -                                         | Cloud       | Rapide et efficace |
| **FasterWhisper**        | Windows/Linux                | `tiny`/`medium`/`large-v2` (recommandé medium+) | Local       | Plus rapide, sans frais de service cloud |
| **WhisperKit**           | macOS (M-series uniquement)  | `large-v2`                               | Local       | Optimisé pour les puces Apple |
| **WhisperCpp**           | Toutes les plateformes        | `large-v2`                               | Local       | Prise en charge de toutes les plateformes |
| **Aliyun ASR**           | Toutes les plateformes        | -                                         | Cloud       | Évite les problèmes de réseau en Chine continentale |

## 🚀 Support des grands modèles de langage

✅ Compatible avec tous les services de grands modèles de langage cloud/local conformes aux **spécifications de l'API OpenAI**, y compris mais sans s'y limiter :
- OpenAI
- Gemini
- DeepSeek
- Tongyi Qianwen
- Modèles open source déployés localement
- Autres services API compatibles avec le format OpenAI

## 🎤 Support TTS (texte à parole)
- Service vocal d'Aliyun
- OpenAI TTS

## Support linguistique
Langues d'entrée prises en charge : chinois, anglais, japonais, allemand, turc, coréen, russe, malais (en augmentation continue)

Langues de traduction prises en charge : anglais, chinois, russe, espagnol, français et 101 autres langues

## Aperçu de l'interface
![Aperçu de l'interface](/docs/images/ui_desktop.png)


## 🚀 Démarrage rapide
### Étapes de base
Tout d'abord, téléchargez le fichier exécutable correspondant à votre système d'exploitation dans les [Releases](https://github.com/krillinai/KrillinAI/releases), puis choisissez entre la version de bureau ou non, et placez-le dans un dossier vide. Téléchargez le logiciel dans un dossier vide, car il générera certains répertoires après exécution, ce qui sera plus facile à gérer.

【Pour la version de bureau, c'est-à-dire le fichier release avec desktop, consultez ici】  
_La version de bureau est nouvellement publiée pour résoudre les problèmes de configuration des fichiers pour les utilisateurs novices, et il y a encore quelques bugs, mises à jour continues en cours._
1. Double-cliquez sur le fichier pour commencer à l'utiliser (la version de bureau nécessite également une configuration dans le logiciel)

【Pour la version non de bureau, c'est-à-dire le fichier release sans desktop, consultez ici】  
_La version non de bureau est la version initiale, la configuration est plus complexe, mais les fonctionnalités sont stables, et elle est adaptée au déploiement sur serveur, car elle fournira une interface utilisateur via le web._
1. Créez un dossier `config` dans le dossier, puis créez un fichier `config.toml` dans le dossier `config`, copiez le contenu du fichier `config-example.toml` dans le répertoire `config` et remplissez vos informations de configuration selon les commentaires.
2. Double-cliquez ou exécutez le fichier exécutable dans le terminal pour démarrer le service 
3. Ouvrez votre navigateur et entrez `http://127.0.0.1:8888` pour commencer à utiliser (remplacez 8888 par le port que vous avez renseigné dans le fichier de configuration)

### À l'attention des utilisateurs de macOS
【Pour la version de bureau, c'est-à-dire le fichier release avec desktop, consultez ici】  
Actuellement, en raison de problèmes de signature, la version de bureau ne peut pas être exécutée directement par double-clic ou installation dmg, vous devez faire confiance à l'application manuellement, comme suit :
1. Ouvrez le fichier exécutable dans le terminal (supposons que le nom du fichier soit KrillinAI_1.0.0_desktop_macOS_arm64)
2. Exécutez les commandes suivantes :
```
sudo xattr -cr ./KrillinAI_1.0.0_desktop_macOS_arm64
sudo chmod +x ./KrillinAI_1.0.0_desktop_macOS_arm64 
./KrillinAI_1.0.0_desktop_macOS_arm64
```

【Pour la version non de bureau, c'est-à-dire le fichier release sans desktop, consultez ici】  
Ce logiciel n'a pas été signé, donc lors de l'exécution sur macOS, après avoir terminé la configuration des fichiers dans "Étapes de base", vous devez également faire confiance à l'application manuellement, comme suit :
1. Ouvrez le fichier exécutable dans le terminal (supposons que le nom du fichier soit KrillinAI_1.0.0_macOS_arm64)
2. Exécutez les commandes suivantes :
   ```
    sudo xattr -rd com.apple.quarantine ./KrillinAI_1.0.0_macOS_arm64
    sudo chmod +x ./KrillinAI_1.0.0_macOS_arm64
    ./KrillinAI_1.0.0_macOS_arm64
    ```
    Cela démarrera le service

### Déploiement Docker
Ce projet prend en charge le déploiement Docker, veuillez consulter [les instructions de déploiement Docker](./docker.md)

### Instructions de configuration des cookies (non obligatoire)

Si vous rencontrez des problèmes de téléchargement de vidéos

Veuillez consulter [les instructions de configuration des cookies](./get_cookies.md) pour configurer vos informations de cookie.

### Aide à la configuration (à lire)
La manière la plus rapide et la plus simple de configurer :
* Remplissez `transcribe.provider.name` avec `openai`, ainsi vous n'aurez qu'à remplir le bloc `transcribe.openai` et la configuration du grand modèle dans le bloc `llm` pour effectuer la traduction des sous-titres. (`app.proxy`, `model` et `openai.base_url` sont facultatifs selon votre situation)

Pour utiliser un modèle de reconnaissance vocale local (en tenant compte du coût, de la vitesse et de la qualité) :
* Remplissez `transcribe.provider.name` avec `fasterwhisper`, `transcribe.fasterwhisper.model` avec `large-v2`, puis remplissez le bloc `llm` avec la configuration du grand modèle pour effectuer la traduction des sous-titres, le modèle local sera automatiquement téléchargé et installé. (`app.proxy` et `openai.base_url` comme ci-dessus)

La conversion texte-parole (TTS) est optionnelle, la logique de configuration est la même que ci-dessus, remplissez `tts.provider.name`, puis remplissez le bloc de configuration correspondant sous `tts`. Les codes de voix dans l'interface utilisateur doivent être remplis selon la documentation du fournisseur choisi. Les informations telles que les aksk d'Aliyun peuvent être répétées pour garantir une structure de configuration claire.  
Remarque : si vous utilisez le clonage vocal, `tts` ne prend en charge que le choix de `aliyun`.

**Pour obtenir l'AccessKey, le Bucket et l'AppKey d'Aliyun, veuillez lire** : [Instructions de configuration d'Aliyun](./aliyun.md) 

Veuillez comprendre que la tâche = reconnaissance vocale + traduction par grand modèle + service vocal (TTS, etc., optionnel), cela vous aidera à comprendre le fichier de configuration.

## Questions fréquentes

Veuillez consulter [les questions fréquentes](./faq.md)

## Règles de contribution
1. Ne soumettez pas de fichiers inutiles, tels que .vscode, .idea, etc., utilisez .gitignore pour filtrer.
2. Ne soumettez pas config.toml, mais utilisez config-example.toml pour la soumission.

## Contactez-nous
1. Rejoignez notre groupe QQ pour poser des questions : 754069680
2. Suivez nos comptes de médias sociaux, [Bilibili](https://space.bilibili.com/242124650), partageant quotidiennement du contenu de qualité dans le domaine de la technologie AI.

## Historique des étoiles

[![Star History Chart](https://api.star-history.com/svg?repos=krillinai/KrillinAI&type=Date)](https://star-history.com/#krillinai/KrillinAI&Date)