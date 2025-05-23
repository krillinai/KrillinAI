### 1. Impossible de voir le fichier de configuration `app.log`, impossible de connaître le contenu de l'erreur
Les utilisateurs de Windows doivent placer le répertoire de travail de ce logiciel dans un dossier qui n'est pas sur le disque C.

### 2. La version non desktop a bien créé le fichier de configuration, mais affiche toujours l'erreur "fichier de configuration introuvable"
Assurez-vous que le nom du fichier de configuration est `config.toml`, et non `config.toml.txt` ou autre.
Une fois la configuration terminée, la structure du dossier de travail de ce logiciel devrait être la suivante :
```
/── config/
│   └── config.toml
├── cookies.txt （<- fichier cookies.txt optionnel）
└── krillinai.exe
```

### 3. La configuration du grand modèle a été remplie, mais l'erreur "xxxxx nécessite la configuration de la clé API xxxxx" apparaît
Bien que les services de modèle et de voix puissent tous deux utiliser les services d'OpenAI, il existe également des scénarios où le grand modèle utilise séparément des services non OpenAI. Par conséquent, ces deux configurations sont distinctes. En plus de la configuration du grand modèle, veuillez chercher la configuration de whisper en bas pour remplir les clés et autres informations correspondantes.

### 4. L'erreur contient "yt-dlp error"
Le problème du téléchargeur vidéo semble être soit un problème de réseau, soit un problème de version du téléchargeur. Vérifiez si le proxy réseau est activé et configuré dans les options de proxy du fichier de configuration, et il est conseillé de choisir un nœud à Hong Kong. Le téléchargeur est installé automatiquement par ce logiciel, la source d'installation sera mise à jour, mais ce n'est pas une source officielle, donc il peut y avoir des retards. En cas de problème, essayez de mettre à jour manuellement, la méthode de mise à jour est :

Ouvrez un terminal dans le répertoire bin du logiciel et exécutez
```
./yt-dlp.exe -U
```
Remplacez `yt-dlp.exe` par le nom réel du logiciel ytdlp sur votre système.

### 5. Après le déploiement, la génération de sous-titres fonctionne normalement, mais les sous-titres intégrés dans la vidéo contiennent beaucoup de caractères illisibles
La plupart du temps, cela est dû à l'absence de polices chinoises sur Linux. Veuillez télécharger la police Microsoft YaHei dans le dossier "polices" [ici](https://modelscope.cn/models/Maranello/KrillinAI_dependency_cn/resolve/master/%E5%AD%97%E4%BD%93/msyh.ttc) (ou choisir une police qui répond à vos exigences), puis suivez les étapes ci-dessous :
1. Créez un dossier msyh sous /usr/share/fonts/ et copiez la police téléchargée dans ce répertoire.
2. 
    ```
    cd /usr/share/fonts/msyh
    sudo mkfontscale
    sudo mkfontdir
    fc-cache
    ```