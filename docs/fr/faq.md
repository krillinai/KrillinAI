### 1. Le programme signale "Fichier de configuration introuvable" ou "xxxxx nécessite la configuration de la clé API xxxxx." Comment puis-je résoudre ce problème ?

C'est un problème de configuration courant. Il y a plusieurs raisons pour lesquelles cela peut se produire :

1. **Emplacement ou nom de fichier incorrect :**

* Le programme nécessite un fichier de configuration nommé exactement `config.toml`. Assurez-vous de ne pas l'avoir accidentellement nommé `config.toml.txt`.
* Ce fichier doit être placé dans un dossier `config`. La structure correcte du répertoire de travail devrait être :
  ```
  /── config/
  │   └── config.toml
  └── krillinai.exe(votre fichier exécutable)
  ```
* **Pour les utilisateurs de Windows :** Il est recommandé de placer l'ensemble du répertoire logiciel dans un dossier qui n'est pas sur le disque C: pour éviter d'éventuels problèmes de permission.

2. **Configuration incomplète de la clé API :**

* L'application nécessite des configurations séparées pour le modèle de langage large (pour la traduction), le service vocal (pour la transcription et la synthèse vocale) et le service tts.
* Même si vous utilisez OpenAI pour tout, vous devez remplir la clé dans différentes sections du fichier `config.toml`. Recherchez la section `llm`, la section `transcribe`, la section `tts` et remplissez les clés API correspondantes et d'autres informations requises.

### 2. Je reçois une erreur contenant "erreur yt-dlp". Que dois-je faire ?

Cette erreur indique un problème avec le téléchargeur de vidéos, qui est généralement lié à votre réseau ou à la version du téléchargeur.

* **Réseau :** Si vous utilisez un proxy, assurez-vous qu'il est correctement configuré dans les paramètres du proxy de votre fichier `config.toml`.
* **Mettre à jour `yt-dlp` :** La version de `yt-dlp` fournie avec le logiciel peut être obsolète. Vous pouvez la mettre à jour manuellement en ouvrant un terminal dans le répertoire `bin` du logiciel et en exécutant la commande :
  ```
  ./yt-dlp.exe -U
  ```
  
  (Remplacez `yt-dlp.exe` par le nom de fichier correct pour votre système d'exploitation s'il diffère).

### 3. Les sous-titres dans la vidéo finale sont illisibles ou apparaissent sous forme de blocs carrés, surtout sur Linux.

Cela est presque toujours causé par des polices manquantes sur le système, en particulier celles qui prennent en charge les caractères chinois. Pour résoudre ce problème, vous devez installer les polices nécessaires.

1. Téléchargez les polices requises, telles que [Microsoft YaHei](https://modelscope.cn/models/Maranello/KrillinAI_dependency_cn/resolve/master/%E5%AD%97%E4%BD%93/msyh.ttc) et [Microsoft YaHei Bold](https://modelscope.cn/models/Maranello/KrillinAI_dependency_cn/resolve/master/%E5%AD%97%E4%BD%93/msyhbd.ttc).
2. Créez un nouveau répertoire de polices : `sudo mkdir -p /usr/share/fonts/msyh`.
3. Copiez les fichiers de police `.ttc` téléchargés dans ce nouveau répertoire.
4. Exécutez les commandes suivantes pour reconstruire le cache des polices :
    ```
    cd /usr/share/fonts/msyh
    sudo mkfontscale
    sudo mkfontdir
    sudo fc-cache -fv
    ```

### 4. Sur macOS, l'application ne démarre pas et affiche une erreur comme "KrillinAI est endommagé et ne peut pas être ouvert."

Cela est causé par la fonctionnalité de sécurité de macOS, Gatekeeper, qui restreint les applications des développeurs non identifiés. Pour résoudre ce problème, vous devez supprimer manuellement l'attribut de quarantaine.

1. Ouvrez l'application **Terminal**.
2. Tapez la commande `xattr -cr` suivie d'un espace, puis faites glisser le fichier `KrillinAI.app` de votre fenêtre Finder dans le Terminal. La commande ressemblera à ceci :
    ```
    xattr -cr /Applications/KrillinAI.app
    ```
3. Appuyez sur Entrée. Vous devriez maintenant pouvoir ouvrir l'application.

### 5. Je reçois des erreurs comme `erreur ffmpeg`, `erreur audioToSrt` ou `statut de sortie 1` pendant le traitement.

Ces erreurs indiquent généralement des problèmes avec les dépendances ou les ressources système.

* **`erreur ffmpeg` :** Cela indique que `ffmpeg` n'est soit pas installé, soit pas accessible depuis le PATH du système. Assurez-vous d'avoir une version complète et officielle de `ffmpeg` installée et que son emplacement est ajouté aux variables d'environnement de votre système.
* **`erreur audioToSrt` ou `statut de sortie 1` :** Cette erreur se produit pendant la phase de transcription (audio en texte). Les causes courantes sont :
  * **Problèmes de modèle :** Le modèle de transcription local (par exemple, `fasterwhisper`) n'a pas pu se charger ou a été corrompu pendant le téléchargement.
  * **Mémoire insuffisante (RAM) :** L'exécution de modèles locaux est gourmande en ressources. Si votre machine manque de mémoire, le système d'exploitation peut terminer le processus, entraînant une erreur.
  * **Échec du réseau :** Si vous utilisez un service de transcription en ligne (comme l'API Whisper d'OpenAI), cela indique un problème avec votre connexion réseau ou une clé API invalide.

### 6. La barre de progression ne bouge pas. Le programme est-il gelé ?

Non, tant que vous ne voyez pas de message d'erreur, le programme fonctionne. La barre de progression ne se met à jour qu'après qu'une tâche majeure (comme la transcription ou le codage vidéo) soit entièrement terminée. Ces tâches peuvent prendre beaucoup de temps, ce qui peut amener la barre de progression à faire une pause pendant une période prolongée. Veuillez être patient et attendre la fin de la tâche.

### 7. Ma GPU NVIDIA de la série 5000 n'est pas prise en charge par `fasterwhisper`. Que dois-je faire ?

Il a été observé que le modèle `fasterwhisper` peut ne pas fonctionner correctement avec les GPU NVIDIA de la série 5000 (à partir de mi-2025). Vous avez quelques alternatives pour la transcription :

1. **Utiliser un modèle basé sur le cloud :** Définissez `transcribe.provider.name` sur `openai` ou `aliyun` dans votre fichier `config.toml`. Ensuite, remplissez la clé API correspondante et les détails de configuration. Cela utilisera le modèle Whisper du fournisseur cloud au lieu du modèle local.
2. **Utiliser un autre modèle local :** Vous pouvez expérimenter avec d'autres modèles de transcription locaux, tels que le `whisper.cpp` original.

### 8. Comment puis-je trouver et remplir le code de voix/ton correct pour la synthèse vocale ?

Les voix disponibles et leurs codes correspondants sont définis par le fournisseur de services vocaux que vous utilisez. Veuillez vous référer à leur documentation officielle.

* **OpenAI TTS :** [Documentation](https://platform.openai.com/docs/guides/text-to-speech/api-reference) (voir les options de `voice`).
* **Alibaba Cloud :** [Documentation](https://help.aliyun.com/zh/isi/developer-reference/overview-of-speech-synthesis) (voir le paramètre `voice` dans la liste des tons).

### 9. Comment puis-je utiliser un modèle de langage large (LLM) local, comme celui fonctionnant sur Ollama, pour la traduction ?

Oui, vous pouvez configurer KrillinAI pour utiliser n'importe quel LLM local qui fournit un point de terminaison API compatible avec OpenAI.

1. **Démarrez votre LLM local :** Assurez-vous que votre service local (par exemple, Ollama exécutant Llama3) est actif et accessible.
2. **Modifier `config.toml` :** Dans la section pour le modèle de langage large (traducteur) :

* Définissez le `name` (ou `type`) du fournisseur sur `"openai"`.
* Définissez la `api_key` sur une chaîne aléatoire (par exemple, `"ollama"`), car elle n'est pas nécessaire pour les appels locaux.
* Définissez le `base_url` sur le point de terminaison API de votre modèle local. Pour Ollama, c'est généralement `http://localhost:11434/v1`.
* Définissez le `model` sur le nom du modèle que vous servez, par exemple, `"llama3"`.

### 10. Puis-je personnaliser le style des sous-titres (police, taille, couleur) dans la vidéo finale ?

Non. Actuellement, KrillinAI génère des **sous-titres codés en dur**, ce qui signifie qu'ils sont intégrés directement dans les images de la vidéo. L'application **n'offre pas d'options pour personnaliser le style des sous-titres** ; elle utilise un style prédéfini.

Pour une personnalisation avancée, la solution de contournement recommandée est de :

1. Utiliser KrillinAI pour générer le fichier de sous-titres `.srt` traduit.
2. Importer votre vidéo originale et ce fichier `.srt` dans un éditeur vidéo professionnel (par exemple, Premiere Pro, Final Cut Pro, DaVinci Resolve) pour appliquer des styles personnalisés avant le rendu.

### 11. J'ai déjà un fichier `.srt` traduit. KrillinAI peut-il l'utiliser pour effectuer uniquement le doublage ?

Non, cette fonctionnalité n'est pas actuellement prise en charge. L'application exécute un pipeline complet de la transcription à la génération de la vidéo finale.