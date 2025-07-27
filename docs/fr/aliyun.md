## Prérequis
Vous devez avoir un compte [Alibaba Cloud](https://www.aliyun.com) et compléter la vérification d'identité. La plupart des services ont des quotas gratuits.

## Obtention de `access_key_id` et `access_key_secret` d'Alibaba Cloud
1. Allez sur la [page de gestion des AccessKey d'Alibaba Cloud](https://ram.console.aliyun.com/profile/access-keys).
2. Cliquez sur "Créer AccessKey." Si nécessaire, sélectionnez la méthode d'utilisation comme "Utilisé dans l'environnement de développement local."
![Clé d'accès Alibaba Cloud](/docs/images/aliyun_accesskey_1.png)
3. Gardez-le en sécurité ; il est préférable de le copier dans un fichier local pour le stockage.

## Activation du service vocal Alibaba Cloud
1. Allez sur la [page de gestion du service vocal Alibaba Cloud](https://nls-portal.console.aliyun.com/applist). Vous devez activer le service lors de votre première visite.
2. Cliquez sur "Créer un projet."
![Parole Alibaba Cloud](/docs/images/aliyun_speech_1.png)
3. Sélectionnez les fonctionnalités et activez-les.
![Parole Alibaba Cloud](/docs/images/aliyun_speech_2.png)
4. Le "Streaming Text-to-Speech (CosyVoice Large Model)" doit être mis à niveau vers la version commerciale ; les autres services peuvent utiliser la version d'essai gratuite.
![Parole Alibaba Cloud](/docs/images/aliyun_speech_3.png)
5. Copiez simplement la clé de l'application.
![Parole Alibaba Cloud](/docs/images/aliyun_speech_4.png)

## Activation du service OSS d'Alibaba Cloud
1. Allez sur la [console du service de stockage d'objets Alibaba Cloud](https://oss.console.aliyun.com/overview). Vous devez activer le service lors de votre première visite.
2. Sélectionnez la liste des Buckets à gauche, puis cliquez sur "Créer."
![OSS Alibaba Cloud](/docs/images/aliyun_oss_1.png)
3. Choisissez "Création rapide", remplissez un nom de Bucket conforme et sélectionnez la région **Shanghai** pour compléter la création (le nom que vous entrez ici sera la valeur pour l'élément de configuration `aliyun.oss.bucket`).
![OSS Alibaba Cloud](/docs/images/aliyun_oss_2.png)
4. Après la création, entrez dans le Bucket.
![OSS Alibaba Cloud](/docs/images/aliyun_oss_3.png)
5. Désactivez l'interrupteur "Bloquer l'accès public" et définissez les permissions de lecture et d'écriture sur "Lecture publique."
![OSS Alibaba Cloud](/docs/images/aliyun_oss_4.png)
![OSS Alibaba Cloud](/docs/images/aliyun_oss_5.png)