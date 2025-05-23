## Pré-requisitos
É necessário ter uma conta no [Alibaba Cloud](https://www.aliyun.com) e passar pela verificação de identidade. A maioria dos serviços tem uma cota gratuita.

## Obtenção da chave da plataforma Bailian do Alibaba Cloud
1. Faça login na [plataforma de serviços de modelos grandes do Alibaba Cloud](https://bailian.console.aliyun.com/), passe o mouse sobre o ícone do centro pessoal no canto superior direito da página e clique em API-KEY no menu suspenso.
![Bailian](/docs/images/bailian_1.png)
2. No menu de navegação à esquerda, selecione Todos os API-KEY ou Meus API-KEY, e então crie ou visualize a chave da API.

## Obtenção do `access_key_id` e `access_key_secret` do Alibaba Cloud
1. Acesse a [página de gerenciamento de AccessKey do Alibaba Cloud](https://ram.console.aliyun.com/profile/access-keys).
2. Clique em Criar AccessKey e, se necessário, escolha o modo de uso, selecionando "Usar no ambiente de desenvolvimento local".
![Access Key do Alibaba Cloud](/docs/images/aliyun_accesskey_1.png)
3. Guarde com segurança, preferencialmente copie para um arquivo local.

## Ativação do serviço de voz do Alibaba Cloud
1. Acesse a [página de gerenciamento do serviço de voz do Alibaba Cloud](https://nls-portal.console.aliyun.com/applist), e ao entrar pela primeira vez, ative o serviço.
2. Clique em Criar projeto.
![Voz do Alibaba Cloud](/docs/images/aliyun_speech_1.png)
3. Selecione as funcionalidades e ative.
![Voz do Alibaba Cloud](/docs/images/aliyun_speech_2.png)
4. A "Síntese de voz de texto em fluxo (modelo grande CosyVoice)" precisa ser atualizada para a versão comercial, outros serviços podem ser usados na versão de experiência gratuita.
![Voz do Alibaba Cloud](/docs/images/aliyun_speech_3.png)
5. Copie a chave do aplicativo.
![Voz do Alibaba Cloud](/docs/images/aliyun_speech_4.png)

## Ativação do serviço OSS do Alibaba Cloud
1. Acesse o [console de serviços de armazenamento de objetos do Alibaba Cloud](https://oss.console.aliyun.com/overview), e ao entrar pela primeira vez, ative o serviço.
2. Selecione a lista de Buckets à esquerda e clique em Criar.
![OSS do Alibaba Cloud](/docs/images/aliyun_oss_1.png)
3. Selecione Criação rápida, preencha um nome de Bucket que atenda aos requisitos e escolha a região **Xangai**, e conclua a criação (o nome preenchido aqui será o valor da configuração `aliyun.oss.bucket`).
![OSS do Alibaba Cloud](/docs/images/aliyun_oss_2.png)
4. Após a criação, acesse o Bucket.
![OSS do Alibaba Cloud](/docs/images/aliyun_oss_3.png)
5. Desative o interruptor "Impedir acesso público" e defina as permissões de leitura e escrita como "Leitura pública".
![OSS do Alibaba Cloud](/docs/images/aliyun_oss_4.png)
![OSS do Alibaba Cloud](/docs/images/aliyun_oss_5.png)