## Pré-requisitos
Você precisa ter uma conta na [Alibaba Cloud](https://www.aliyun.com) e completar a verificação de nome real. A maioria dos serviços possui cotas gratuitas.

## Obtendo `access_key_id` e `access_key_secret` da Alibaba Cloud
1. Vá para a [página de gerenciamento de AccessKey da Alibaba Cloud](https://ram.console.aliyun.com/profile/access-keys).
2. Clique em "Criar AccessKey". Se necessário, selecione o método de uso como "Usado no ambiente de desenvolvimento local."
![Chave de acesso da Alibaba Cloud](/docs/images/aliyun_accesskey_1.png)
3. Mantenha em segurança; é melhor copiá-la para um arquivo local para armazenamento.

## Ativando o Serviço de Voz da Alibaba Cloud
1. Vá para a [página de gerenciamento do Serviço de Voz da Alibaba Cloud](https://nls-portal.console.aliyun.com/applist). Você precisa ativar o serviço na sua primeira visita.
2. Clique em "Criar Projeto."
![Fala da Alibaba Cloud](/docs/images/aliyun_speech_1.png)
3. Selecione os recursos e ative-os.
![Fala da Alibaba Cloud](/docs/images/aliyun_speech_2.png)
4. O "Streaming Text-to-Speech (Modelo Grande CosyVoice)" precisa ser atualizado para a versão comercial; outros serviços podem usar a versão de teste gratuita.
![Fala da Alibaba Cloud](/docs/images/aliyun_speech_3.png)
5. Simplesmente copie a chave do aplicativo.
![Fala da Alibaba Cloud](/docs/images/aliyun_speech_4.png)

## Ativando o Serviço OSS da Alibaba Cloud
1. Vá para o [Console do Serviço de Armazenamento de Objetos da Alibaba Cloud](https://oss.console.aliyun.com/overview). Você precisa ativar o serviço na sua primeira visita.
2. Selecione a lista de Buckets à esquerda e clique em "Criar."
![OSS da Alibaba Cloud](/docs/images/aliyun_oss_1.png)
3. Escolha "Criação Rápida", preencha um nome de Bucket compatível e selecione a região **Xangai** para completar a criação (o nome que você inserir aqui será o valor para o item de configuração `aliyun.oss.bucket`).
![OSS da Alibaba Cloud](/docs/images/aliyun_oss_2.png)
4. Após a criação, entre no Bucket.
![OSS da Alibaba Cloud](/docs/images/aliyun_oss_3.png)
5. Desative o interruptor "Bloquear Acesso Público" e defina as permissões de leitura e gravação como "Leitura Pública."
![OSS da Alibaba Cloud](/docs/images/aliyun_oss_4.png)
![OSS da Alibaba Cloud](/docs/images/aliyun_oss_5.png)