# Guide de déploiement Docker

## Démarrage rapide
Préparez d'abord le fichier de configuration, en définissant le port d'écoute du serveur sur `8888` et l'adresse d'écoute du serveur sur `0.0.0.0`.

### Démarrage avec docker run
```bash
docker run -d \
  -p 8888:8888 \
  -v /path/to/config.toml:/app/config/config.toml \
  -v /path/to/tasks:/app/tasks \
  asteria798/krillinai
```

### Démarrage avec docker-compose
```yaml
version: '3'
services:
  krillin:
    image: asteria798/krillinai
    ports:
      - "8888:8888"
    volumes:
      - /path/to/config.toml:/app/config/config.toml # Fichier de configuration
      - /path/to/tasks:/app/tasks # Répertoire de sortie
```

## Modèle de persistance
Si vous utilisez le modèle fasterwhisper, KrillinAI téléchargera automatiquement les fichiers nécessaires au modèle dans le répertoire `/app/models` et le répertoire `/app/bin`. Ces fichiers seront perdus après la suppression du conteneur. Si vous avez besoin de persister le modèle, vous pouvez mapper ces deux répertoires sur un répertoire de l'hôte.

### Démarrage avec docker run
```bash
docker run -d \
  -p 8888:8888 \
  -v /path/to/config.toml:/app/config/config.toml \
  -v /path/to/tasks:/app/tasks \
  -v /path/to/models:/app/models \
  -v /path/to/bin:/app/bin \
  asteria798/krillinai
```

### Démarrage avec docker-compose
```yaml
version: '3'
services:
  krillin:
    image: asteria798/krillinai
    ports:
      - "8888:8888"
    volumes:
      - /path/to/config.toml:/app/config/config.toml      
      - /path/to/tasks:/app/tasks
      - /path/to/models:/app/models
      - /path/to/bin:/app/bin
```

## Remarques
1. Si le mode réseau du conteneur Docker n'est pas `host`, il est recommandé de définir l'adresse d'écoute du serveur dans le fichier de configuration sur `0.0.0.0`, sinon le service pourrait ne pas être accessible.
2. Si le conteneur a besoin d'accéder au proxy réseau de l'hôte, veuillez configurer l'option d'adresse du proxy `proxy` de `127.0.0.1` à `host.docker.internal`, par exemple `http://host.docker.internal:7890`.