## Prérequis
Vous devez d'abord avoir un compte [Alibaba Cloud](https://www.aliyun.com) et avoir vérifié votre identité. La plupart des services offrent un quota gratuit.

## Obtention de la clé de la plateforme de modèles de Baolian d'Alibaba Cloud
1. Connectez-vous à la [plateforme de services de modèles Baolian d'Alibaba Cloud](https://bailian.console.aliyun.com/), survolez l'icône de votre centre personnel en haut à droite de la page, puis cliquez sur API-KEY dans le menu déroulant.
![Baolian](/docs/images/bailian_1.png)
2. Dans la barre de navigation à gauche, sélectionnez Tous les API-KEY ou Mes API-KEY, puis créez ou consultez votre clé API.

## Obtention de `access_key_id` et `access_key_secret` d'Alibaba Cloud
1. Accédez à la [page de gestion des AccessKey d'Alibaba Cloud](https://ram.console.aliyun.com/profile/access-keys).
2. Cliquez sur Créer AccessKey, et si nécessaire, choisissez le mode d'utilisation, sélectionnez "Utilisation dans un environnement de développement local".
![Access Key Alibaba Cloud](/docs/images/aliyun_accesskey_1.png)
3. Conservez-les en toute sécurité, il est préférable de les copier dans un fichier local.

## Activation du service de voix d'Alibaba Cloud
1. Accédez à la [page de gestion du service de voix d'Alibaba Cloud](https://nls-portal.console.aliyun.com/applist), vous devez activer le service lors de votre première connexion.
2. Cliquez sur Créer un projet.
![Voix Alibaba Cloud](/docs/images/aliyun_speech_1.png)
3. Sélectionnez les fonctionnalités et activez-les.
![Voix Alibaba Cloud](/docs/images/aliyun_speech_2.png)
4. La "synthèse vocale de texte en continu (modèle CosyVoice)" doit être mise à niveau vers la version commerciale, les autres services peuvent utiliser la version d'essai gratuite.
![Voix Alibaba Cloud](/docs/images/aliyun_speech_3.png)
5. Copiez simplement la clé de l'application.
![Voix Alibaba Cloud](/docs/images/aliyun_speech_4.png)

## Activation du service OSS d'Alibaba Cloud
1. Accédez à la [console de service de stockage d'objets d'Alibaba Cloud](https://oss.console.aliyun.com/overview), vous devez activer le service lors de votre première connexion.
2. Sélectionnez la liste des Buckets à gauche, puis cliquez sur Créer.
![OSS Alibaba Cloud](/docs/images/aliyun_oss_1.png)
3. Choisissez Création rapide, remplissez un nom de Bucket conforme aux exigences et sélectionnez la région **Shanghai**, puis terminez la création (le nom que vous remplissez ici est la valeur de la configuration `aliyun.oss.bucket`).
![OSS Alibaba Cloud](/docs/images/aliyun_oss_2.png)
4. Une fois la création terminée, accédez au Bucket.
![OSS Alibaba Cloud](/docs/images/aliyun_oss_3.png)
5. Désactivez l'interrupteur "Bloquer l'accès public" et définissez les autorisations de lecture et d'écriture sur "Lecture publique".
![OSS Alibaba Cloud](/docs/images/aliyun_oss_4.png)
![OSS Alibaba Cloud](/docs/images/aliyun_oss_5.png)