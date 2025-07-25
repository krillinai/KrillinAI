<div align="center">
  <img src="/docs/images/logo.jpg" alt="KlicStudio" height="90">

  # Outil de traduction et de doublage vidéo AI minimaliste

  <a href="https://trendshift.io/repositories/13360" target="_blank"><img src="https://trendshift.io/api/badge/repositories/13360" alt="KrillinAI%2FKlicStudio | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

  **[English](/README.md)｜[简体中文](/docs/zh/README.md)｜[日本語](/docs/jp/README.md)｜[한국어](/docs/kr/README.md)｜[Tiếng Việt](/docs/vi/README.md)｜[Français](/docs/fr/README.md)｜[Deutsch](/docs/de/README.md)｜[Español](/docs/es/README.md)｜[Português](/docs/pt/README.md)｜[Русский](/docs/rus/README.md)｜[اللغة العربية](/docs/ar/README.md)**

[![Twitter](https://img.shields.io/badge/Twitter-KrillinAI-orange?logo=twitter)](https://x.com/KrillinAI)
[![QQ 群](https://img.shields.io/badge/QQ%20群-754069680-green?logo=tencent-qq)](https://jq.qq.com/?_wv=1027&k=754069680)
[![Bilibili](https://img.shields.io/badge/dynamic/json?label=Bilibili&query=%24.data.follower&suffix=粉丝&url=https%3A%2F%2Fapi.bilibili.com%2Fx%2Frelation%2Fstat%3Fvmid%3D242124650&logo=bilibili&color=00A1D6&labelColor=FE7398&logoColor=FFFFFF)](https://space.bilibili.com/242124650)

</div>

 ## Présentation du projet  ([Essayez la version en ligne maintenant !](https://www.klic.studio/))

Klic Studio est une solution de localisation audio et vidéo tout-en-un développée par Krillin AI, intégrant traduction audio et vidéo, doublage et clonage vocal, permettant de générer des sous-titres de qualité cinématographique en un clic. Il prend en charge les formats d'affichage horizontal et vertical, garantissant une présentation parfaite sur toutes les plateformes majeures (Bilibili, Xiaohongshu, Douyin, WeChat Video, Kuaishou, YouTube, TikTok, etc.), répondant facilement aux besoins de mondialisation du contenu !

## Principales caractéristiques et fonctionnalités :
🎯 **Démarrage en un clic** : Pas besoin de configuration complexe, installation automatique des dépendances, prêt à l'emploi. Nouvelle version de bureau pour une utilisation plus pratique !

📥 **Acquisition vidéo** : Prend en charge le téléchargement via yt-dlp ou le téléchargement de fichiers locaux

📜 **Reconnaissance précise** : Reconnaissance vocale de haute précision basée sur Whisper

🧠 **Traduction de qualité** : Adaptée aux modèles de langage SOTA, qualité de traduction au niveau des groupes de sous-titres

🌍 **Sous-titres de qualité cinématographique** : Algorithme d'alignement de découpage au niveau des mots, alignement avec la qualité des sous-titres de Hollywood, sous-titres en une seule ligne sans retour à la ligne

🎙️ **Clonage vocal** : Propose des voix sélectionnées de CosyVoice ou un clonage de voix personnalisé

🎬 **Sortie en mode horizontal et vertical** : Traitement automatique des vidéos et de la mise en page des sous-titres en mode horizontal et vertical, format multiplateforme prêt en une seule fois

🔄 **Remplacement de termes** : Remplacement d'un clic des termes spécialisés

💻 **Multiplateforme** : Prend en charge Windows, Linux, macOS, avec versions de bureau et serveur


## Exemples de résultats
L'image ci-dessous montre l'importation d'une vidéo locale de 46 minutes, avec le fichier de sous-titres généré après une exécution en un clic, sans aucun ajustement manuel. Pas de pertes, de chevauchements, les phrases sont naturelles et la qualité de traduction est très élevée.
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

### Mode vertical
---
https://github.com/user-attachments/assets/c2c7b528-0ef8-4ba9-b8ac-f9f92f6d4e71

</td>

</tr>
</table>

## 🔍 Support des services de reconnaissance vocale
_**Tous les modèles locaux dans le tableau ci-dessous prennent en charge l'installation automatique des fichiers exécutables + fichiers de modèle, il vous suffit de choisir, Klic s'occupe du reste.**_

| Source de service        | Plateformes prises en charge | Options de modèle                             | Local/Cloud | Remarques          |
|-------------------------|-----------------------------|---------------------------------------------|-------------|--------------------|
| **OpenAI Whisper**      | Toutes les plateformes       | -                                           | Cloud       | Rapide et efficace  |
| **FasterWhisper**       | Windows/Linux               | `tiny`/`medium`/`large-v2` (recommandé medium+) | Local       | Plus rapide, sans frais de service cloud |
| **WhisperKit**          | macOS (uniquement pour les puces M) | `large-v2`                                | Local       | Optimisé pour les puces Apple |
| **WhisperCpp**          | Toutes les plateformes       | `large-v2`                                | Local       | Prise en charge de toutes les plateformes |
| **Aliyun ASR**          | Toutes les plateformes       | -                                           | Cloud       | Évite les problèmes de réseau en Chine continentale |

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
Langues d'entrée prises en charge : chinois, anglais, japonais, allemand, turc, coréen, russe, malais (en cours d'ajout)

Langues de traduction prises en charge : anglais, chinois, russe, espagnol, français et 101 autres langues

## Aperçu de l'interface
![Aperçu de l'interface](/docs/images/ui_desktop.png)


## 🚀 Démarrage rapide
### Étapes de base
Tout d'abord, téléchargez le fichier exécutable correspondant à votre système d'exploitation dans les [Releases](https://github.com/KrillinAI/KlicStudio/releases), choisissez ensuite la version de bureau ou non de bureau selon le tutoriel ci-dessous, puis placez-le dans un dossier vide. Téléchargez le logiciel dans un dossier vide, car il générera certains répertoires après exécution, ce qui sera plus facile à gérer.

【Pour la version de bureau, c'est-à-dire les fichiers release avec "desktop", consultez ici】  
_La version de bureau est nouvellement publiée pour résoudre les problèmes de configuration des fichiers pour les nouveaux utilisateurs, avec quelques bugs, mises à jour continues_
1. Double-cliquez sur le fichier pour commencer à l'utiliser (la version de bureau nécessite également une configuration dans le logiciel)

【Pour la version non de bureau, c'est-à-dire les fichiers release sans "desktop", consultez ici】  
_La version non de bureau est la version initiale, la configuration est plus complexe, mais la fonctionnalité est stable, adaptée au déploiement sur serveur, car elle fournit une interface utilisateur via le web_
1. Créez un dossier `config` dans le dossier, puis créez un fichier `config.toml` dans le dossier `config`, copiez le contenu du fichier `config-example.toml` dans le répertoire `config` et remplissez vos informations de configuration en vous référant aux commentaires.
2. Double-cliquez ou exécutez le fichier exécutable dans le terminal pour démarrer le service 
3. Ouvrez votre navigateur et entrez `http://127.0.0.1:8888` pour commencer à utiliser (remplacez 8888 par le port que vous avez rempli dans le fichier de configuration)

### À l'attention des utilisateurs de macOS
【Pour la version de bureau, c'est-à-dire les fichiers release avec "desktop", consultez ici】  
Actuellement, en raison de problèmes de signature, la version de bureau ne peut pas être exécutée par double-clic ou installée via dmg, vous devez faire confiance à l'application manuellement, voici comment :
1. Ouvrez le terminal dans le répertoire où se trouve le fichier exécutable (supposons que le nom du fichier soit KlicStudio_1.0.0_desktop_macOS_arm64)
2. Exécutez les commandes suivantes :
```
sudo xattr -cr ./KlicStudio_1.0.0_desktop_macOS_arm64
sudo chmod +x ./KlicStudio_1.0.0_desktop_macOS_arm64 
./KlicStudio_1.0.0_desktop_macOS_arm64
```

【Pour la version non de bureau, c'est-à-dire les fichiers release sans "desktop", consultez ici】  
Ce logiciel n'a pas été signé, donc lors de l'exécution sur macOS, après avoir complété la configuration des fichiers dans les "Étapes de base", vous devez également faire confiance à l'application manuellement, voici comment :
1. Ouvrez le terminal dans le répertoire où se trouve le fichier exécutable (supposons que le nom du fichier soit KlicStudio_1.0.0_macOS_arm64)
2. Exécutez les commandes suivantes :
   ```
    sudo xattr -rd com.apple.quarantine ./KlicStudio_1.0.0_macOS_arm64
    sudo chmod +x ./KlicStudio_1.0.0_macOS_arm64
    ./KlicStudio_1.0.0_macOS_arm64
    ```
    Cela démarrera le service

### Déploiement Docker
Ce projet prend en charge le déploiement Docker, veuillez consulter [les instructions de déploiement Docker](./docker.md)

### Instructions de configuration des cookies (non obligatoire)

Si vous rencontrez des échecs de téléchargement de vidéos

Veuillez consulter [les instructions de configuration des cookies](./get_cookies.md) pour configurer vos informations de cookie.

### Aide à la configuration (à lire)
La manière la plus rapide et la plus pratique de configurer :
* Remplissez `transcribe.provider.name` avec `openai`, ainsi vous n'aurez qu'à remplir le bloc `transcribe.openai` et la configuration du grand modèle dans le bloc `llm` pour effectuer la traduction des sous-titres. (`app.proxy`, `model` et `openai.base_url` sont à remplir selon votre situation)

Pour utiliser un modèle de reconnaissance vocale local (équilibrant coût, vitesse et qualité) :
* Remplissez `transcribe.provider.name` avec `fasterwhisper`, `transcribe.fasterwhisper.model` avec `large-v2`, puis remplissez le bloc `llm` avec la configuration du grand modèle, la configuration du modèle local sera automatiquement téléchargée et installée. (`app.proxy` et `openai.base_url` comme ci-dessus)

La conversion texte-parole (TTS) est optionnelle, la logique de configuration est la même que ci-dessus, remplissez `tts.provider.name`, puis remplissez le bloc de configuration correspondant sous `tts`, le code de voix dans l'interface utilisateur doit être rempli selon la documentation du fournisseur choisi (les adresses de documentation sont disponibles dans la section des questions fréquentes ci-dessous). Les informations telles que l'aksk d'Aliyun peuvent être répétées pour garantir la clarté de la structure de configuration.  
Remarque : Si vous utilisez le clonage vocal, `tts` ne prend en charge que le choix de `aliyun`.

**Pour obtenir l'AccessKey, le Bucket et l'AppKey d'Aliyun, veuillez lire** : [Instructions de configuration d'Aliyun](./aliyun.md) 

Veuillez comprendre que la tâche = reconnaissance vocale + traduction par grand modèle + service vocal (TTS, etc., optionnel), cela vous aidera à comprendre le fichier de configuration.

## Questions fréquentes

Veuillez consulter [les questions fréquentes](./faq.md)

## Règles de contribution
1. Ne soumettez pas de fichiers inutiles, tels que .vscode, .idea, etc., utilisez .gitignore pour filtrer
2. Ne soumettez pas config.toml, mais soumettez config-example.toml

## Contactez-nous
1. Rejoignez notre groupe QQ pour poser des questions : 754069680
2. Suivez nos comptes de médias sociaux, [Bilibili](https://space.bilibili.com/242124650), partageant quotidiennement du contenu de qualité dans le domaine de la technologie AI

## Historique des étoiles

[![Star History Chart](https://api.star-history.com/svg?repos=KrillinAI/KlicStudio&type=Date)](https://star-history.com/#KrillinAI/KlicStudio&Date)