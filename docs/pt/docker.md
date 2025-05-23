# Guia de Implantação do Docker

## Começando Rápido
Primeiro, prepare o arquivo de configuração, definindo a porta de escuta do servidor como `8888` e o endereço de escuta do servidor como `0.0.0.0`.

### Iniciar com docker run
```bash
docker run -d \
  -p 8888:8888 \
  -v /path/to/config.toml:/app/config/config.toml \
  -v /path/to/tasks:/app/tasks \
  asteria798/krillinai
```

### Iniciar com docker-compose
```yaml
version: '3'
services:
  krillin:
    image: asteria798/krillinai
    ports:
      - "8888:8888"
    volumes:
      - /path/to/config.toml:/app/config/config.toml # Arquivo de configuração
      - /path/to/tasks:/app/tasks # Diretório de saída
```

## Persistência do Modelo
Se você usar o modelo fasterwhisper, o KrillinAI fará o download automático dos arquivos necessários para o modelo nos diretórios `/app/models` e `/app/bin`. Esses arquivos serão perdidos após a exclusão do contêiner. Se precisar persistir o modelo, você pode mapear esses dois diretórios para um diretório no host.

### Iniciar com docker run
```bash
docker run -d \
  -p 8888:8888 \
  -v /path/to/config.toml:/app/config/config.toml \
  -v /path/to/tasks:/app/tasks \
  -v /path/to/models:/app/models \
  -v /path/to/bin:/app/bin \
  asteria798/krillinai
```

### Iniciar com docker-compose
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

## Observações
1. Se o modo de rede do contêiner Docker não for host, recomenda-se definir o endereço de escuta do servidor no arquivo de configuração como `0.0.0.0`, caso contrário, pode não ser possível acessar o serviço.
2. Se o contêiner precisar acessar o proxy de rede do host, configure o item de configuração do proxy `proxy` de `127.0.0.1` para `host.docker.internal`, por exemplo, `http://host.docker.internal:7890`.