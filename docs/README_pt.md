<div align="center">
  <img src="../docs/images/logo.png" alt="KrillinAI" height="90">


  # Ferramenta de Tradução e Dublagem de Áudio e Vídeo por IA

<a href="https://trendshift.io/repositories/13360" target="_blank"><img src="https://trendshift.io/api/badge/repositories/13360" alt="krillinai%2FKrillinAI | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

  **[English](../README.md)｜[简体中文](../docs/README_zh.md)｜[日本語](../docs/README_jp.md)｜[한국어](../docs/README_kr.md)｜[Français](../docs/README_fr.md)｜[Deutsch](../docs/README_de.md)｜[Español](../docs/README_es.md)｜[Português](../docs/README_pt.md)｜[Русский](../docs/README_rus.md)**

  [![Twitter](https://img.shields.io/badge/Twitter-KrillinAI-orange?logo=twitter)](https://x.com/KrillinAI)
[![Bilibili](https://img.shields.io/badge/dynamic/json?label=Bilibili&query=%24.data.follower&suffix=%20followers&url=https%3A%2F%2Fapi.bilibili.com%2Fx%2Frelation%2Fstat%3Fvmid%3D242124650&logo=bilibili&color=00A1D6&labelColor=FE7398&logoColor=FFFFFF)](https://space.bilibili.com/242124650)

</div>

### 📢  Novo Lançamento para a Versão Desktop Win & Mac – Bem-vindos para Testar e Enviar Feedback

## Visão Geral

O Krillin AI é uma solução completa para localização e aprimoramento de vídeos de forma simples. Esta ferramenta minimalista, porém poderosa, cuida de tudo, desde tradução, dublagem até clonagem de voz e formatação — convertendo perfeitamente vídeos entre modos paisagem e retrato para exibição ideal em todas as plataformas de conteúdo (YouTube, TikTok, Bilibili, Douyin, WeChat Channel, RedNote, Kuaishou). Com seu fluxo de trabalho de ponta a ponta, o Krillin AI transforma gravações brutas em conteúdo refinado e pronto para as plataformas com apenas alguns cliques.

## Principais Recursos:

🎯 **Início com Um Clique** - Inicie seu fluxo de trabalho instantaneamente. Nova versão desktop disponível — mais fácil de usar!

📥 **Download de Vídeos** - Suporte a yt-dlp e upload de arquivos locais

📜 **Legendas Precisas** - Reconhecimento de alta precisão com tecnologia Whisper

🧠 **Segmentação Inteligente** - Divisão e alinhamento de legendas baseados em LLM

🌍 **Tradução Profissional** - Tradução em nível de parágrafo para consistência

🔄 **Substituição de Termos** - Troca de vocabulário específico por domínio com um clique

🎙️ **Dublagem e Clonagem de Voz** - Seleção de vozes CosyVoice ou clonagem personalizada

🎬 **Composição de Vídeo** - Formatação automática para layouts horizontais/verticais

## Demonstração
A imagem abaixo mostra o resultado após o arquivo de legenda, gerado com um único clique após a importação de um vídeo local de 46 minutos, ser inserido na timeline. Nenhum ajuste manual foi necessário. Não há legendas faltando ou sobrepostas, a segmentação das frases é natural e a qualidade da tradução também é bastante alta.
![Alignment](../docs/images/alignment.png)

<table>
<tr>
<td width="33%">

### Tradução de Legendas
---
https://github.com/user-attachments/assets/bba1ac0a-fe6b-4947-b58d-ba99306d0339

</td>
<td width="33%">

### Dublagem
---
https://github.com/user-attachments/assets/0b32fad3-c3ad-4b6a-abf0-0865f0dd2385

</td>

<td width="33%">

### Modo Retrato
---
https://github.com/user-attachments/assets/c2c7b528-0ef8-4ba9-b8ac-f9f92f6d4e71

</td>

</tr>
</table>

## 🌍 Idiomas Suportados
Idiomas de entrada: Chinês, Inglês, Japonês, Alemão, Turco (mais idiomas em breve)
Idiomas para tradução: 56 idiomas suportados, incluindo Inglês, Chinês, Russo, Espanhol, Francês, etc.

## Prévia da Interface
![ui preview](../docs/images/ui_desktop.png)

## 🚀 Início Rápido
### Passos Básicos
Primeiro, baixe o arquivo executável da versão Release compatível com o sistema do seu dispositivo. Siga as instruções abaixo para escolher entre a versão desktop ou não-desktop, depois coloque o software em uma pasta vazia. A execução do programa irá gerar alguns diretórios, portanto, mantê-lo em uma pasta vazia facilita o gerenciamento.

[Para a versão desktop (arquivos de release com "desktop" no nome), consulte aqui]
A versão desktop foi lançada recentemente para facilitar o uso por iniciantes que têm dificuldade em editar arquivos de configuração. Ela ainda contém alguns bugs e está em constante atualização.

Clique duas vezes no arquivo para começar a usar.

[Para a versão não-desktop (arquivos de release sem "desktop" no nome), consulte aqui]
A versão não-desktop é o lançamento original, com configuração mais complexa porém funcionalidade estável. Também é adequada para implantação em servidores, pois fornece uma interface baseada na web.

Crie uma pasta config no diretório e, em seguida, crie um arquivo config.toml dentro dela. Copie o conteúdo do arquivo config-example.toml (localizado na pasta config do código-fonte) para o seu config.toml e preencha com os detalhes da sua configuração. (Se desejar usar modelos da OpenAI mas não souber como obter uma chave, você pode entrar no grupo para obter acesso gratuito de teste.)

Execute o arquivo com um duplo-clique ou rode-o no terminal para iniciar o serviço.

Abra seu navegador e acesse http://127.0.0.1:8888 para começar a usar. (Substitua 8888 pelo número da porta que você definiu no arquivo de configuração.)

### Para: Usuários macOS

[Para a versão desktop, ou seja, arquivos de release com "desktop" no nome, consulte aqui]
O método atual de empacotamento da versão desktop não suporta execução por duplo-clique ou instalação via DMG devido a problemas de assinatura. É necessário configurar manualmente a confiança da seguinte forma:

1. Abra o diretório contendo o arquivo executável (supondo que o nome do arquivo seja KrillinAI_1.0.0_desktop_macOS_arm64) no Terminal

2. Execute os seguintes comandos sequencialmente:

```
sudo xattr -cr ./KrillinAI_1.0.0_desktop_macOS_arm64  
sudo chmod +x ./KrillinAI_1.0.0_desktop_macOS_arm64  
./KrillinAI_1.0.0_desktop_macOS_arm64  
```

[Para a versão não-desktop, ou seja, arquivos de release sem "desktop" no nome, consulte aqui]
Este software não está assinado, portanto após completar a configuração do arquivo nos "Passos Básicos", você precisará aprovar manualmente o aplicativo no macOS. Siga estes passos:
1. Abra o Terminal e navegue até o diretório onde está o arquivo executável (assumindo que o nome do arquivo seja KrillinAI_1.0.0_macOS_arm64)
2. Execute os seguintes comandos em sequência:
```
sudo xattr -rd com.apple.quarantine ./KrillinAI_1.0.0_macOS_arm64
sudo chmod +x ./KrillinAI_1.0.0_macOS_arm64
./KrillinAI_1.0.0_macOS_arm64
```
Isso iniciará o serviço.

### Implantação com Docker
Implantação com Docker [Docker Deployment Instructions](../docs/docker.md) para mais detalhes.

### Instruções de Configuração de Cookies

Caso enfrente falhas ao baixar vídeos, consulte as [Cookie Configuration Instructions](../docs/get_cookies.md) para configurar suas informações de cookie.

### Ajuda de Configuração
O método mais rápido e conveniente de configuração:
* Selecione openai para ambos transcription_provider e llm_provider. Dessa forma, você só precisará preencher openai.apikey nas três principais categorias de configuração a seguir: openai, local_model e aliyun, e então poderá realizar tradução de legendas. (Preencha app.proxy, model e openai.base_url de acordo com sua própria situação.)

O método de configuração para usar o modelo local de reconhecimento de fala (macOS não é suportado temporariamente) - uma opção que equilibra custo, velocidade e qualidade:
* Preencha `fasterwhisper` para `transcription_provider` e `openai` para `llm_provider`. Desta forma, você só precisará preencher `openai.apikey` e `local_model.faster_whisper` nas seguintes três principais categorias de itens de configuração, ou seja, `openai` e `local_model`, e então você poderá realizar tradução de legendas. O modelo local será baixado automaticamente. (O mesmo se aplica a `app.proxy` e `openai.base_url` conforme mencionado acima.)

As seguintes situações de uso exigem a configuração da Alibaba Cloud:
* Se llm_provider for preenchido com aliyun, indica que o serviço de modelo grande da Alibaba Cloud será utilizado. Consequentemente, a configuração do item aliyun.bailian precisa ser definida.
* Se transcription_provider for preenchido com aliyun, ou se a função "dublagem de voz" for ativada ao iniciar uma tarefa, o serviço de voz da Alibaba Cloud será utilizado. Portanto, a configuração do item aliyun.speech precisa ser preenchida.
* Se a função "dublagem de voz" for ativada e arquivos de áudio locais forem enviados para clonagem de timbre de voz ao mesmo tempo, o serviço de armazenamento em nuvem OSS da Alibaba Cloud também será utilizado. Logo, a configuração do item aliyun.oss precisa ser preenchida.
Guia de Configuração: [Alibaba Cloud Configuration Instructions](../docs/aliyun.md)

## Perguntas Frequentes
Consulte [Frequently Asked Questions](../docs/faq.md)

## Diretrizes de Contribuição

- Não envie arquivos desnecessários como .vscode, .idea, etc. Por favor, utilize adequadamente o .gitignore para filtrá-los.
- Não envie o config.toml; em vez disso, envie o config-example.toml.

## Histórico de Estrelas

[![Star History Chart](https://api.star-history.com/svg?repos=krillinai/KrillinAI&type=Date)](https://star-history.com/#krillinai/KrillinAI&Date)

