<div align="center">
  <img src="/docs/images/logo.jpg" alt="KrillinAI" height="90">

# Ferramenta Minimalista de Tradução e Dublagem de Vídeo com IA

<a href="https://trendshift.io/repositories/13360" target="_blank"><img src="https://trendshift.io/api/badge/repositories/13360" alt="KrillinAI%2FKrillinAI | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

**[English](/README.md)｜[简体中文](/docs/zh/README.md)｜[日本語](/docs/jp/README.md)｜[한국어](/docs/kr/README.md)｜[Tiếng Việt](/docs/vi/README.md)｜[Français](/docs/fr/README.md)｜[Deutsch](/docs/de/README.md)｜[Español](/docs/es/README.md)｜[Português](/docs/pt/README.md)｜[Русский](/docs/rus/README.md)｜[اللغة العربية](/docs/ar/README.md)**

[![Twitter](https://img.shields.io/badge/Twitter-KrillinAI-orange?logo=twitter)](https://x.com/KrillinAI)
[![QQ 群](https://img.shields.io/badge/QQ%20群-754069680-green?logo=tencent-qq)](https://jq.qq.com/?_wv=1027&k=754069680)
[![Bilibili](https://img.shields.io/badge/dynamic/json?label=Bilibili&query=%24.data.follower&suffix=粉丝&url=https%3A%2F%2Fapi.bilibili.com%2Fx%2Frelation%2Fstat%3Fvmid%3D242124650&logo=bilibili&color=00A1D6&labelColor=FE7398&logoColor=FFFFFF)](https://space.bilibili.com/242124650)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/krillinai/KrillinAI)

</div>

## Introdução ao Projeto  ([Experimente a versão online agora!](https://www.klic.studio/))
[**Início Rápido**](#-quick-start)

KrillinAI é uma solução versátil de localização e aprimoramento de áudio e vídeo desenvolvida pela Krillin AI. Esta ferramenta minimalista, mas poderosa, integra tradução de vídeo, dublagem e clonagem de voz, suportando formatos paisagem e retrato para garantir uma apresentação perfeita em todas as principais plataformas (Bilibili, Xiaohongshu, Douyin, WeChat Video, Kuaishou, YouTube, TikTok, etc.). Com um fluxo de trabalho de ponta a ponta, você pode transformar materiais brutos em conteúdo pronto para uso em várias plataformas com apenas alguns cliques.

## Principais Recursos e Funções:

🎯 **Início com um Clique**: Sem configuração de ambiente complexa, instalação automática de dependências, pronto para uso imediatamente, com uma nova versão para desktop para facilitar o acesso!

📥 **Aquisição de Vídeo**: Suporta downloads via yt-dlp ou uploads de arquivos locais

📜 **Reconhecimento Preciso**: Reconhecimento de fala de alta precisão baseado no Whisper

🧠 **Segmentação Inteligente**: Segmentação e alinhamento de legendas usando LLM

🔄 **Substituição de Terminologia**: Substituição de vocabulário profissional com um clique

🌍 **Tradução Profissional**: Tradução LLM com contexto para manter a semântica natural

🎙️ **Clonagem de Voz**: Oferece tons de voz selecionados do CosyVoice ou clonagem de voz personalizada

🎬 **Composição de Vídeo**: Processa automaticamente vídeos em paisagem e retrato e layout de legendas

💻 **Multiplataforma**: Suporta Windows, Linux, macOS, oferecendo versões para desktop e servidor

## Demonstração de Efeito

A imagem abaixo mostra o efeito do arquivo de legenda gerado após a importação de um vídeo local de 46 minutos e sua execução com um clique, sem ajustes manuais. Não há omissões ou sobreposições, a segmentação é natural e a qualidade da tradução é muito alta.
![Efeito de Alinhamento](/docs/images/alignment.png)

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

## 🔍 Serviços de Reconhecimento de Fala Suportados

_**Todos os modelos locais na tabela abaixo suportam instalação automática de arquivos executáveis + arquivos de modelo; você só precisa escolher, e o Klic preparará tudo para você.**_

| Fonte do Serviço       | Plataformas Suportadas | Opções de Modelo                          | Local/Nuvem | Observações                  |
|------------------------|------------------------|-------------------------------------------|-------------|------------------------------|
| **OpenAI Whisper**     | Todas as Plataformas    | -                                         | Nuvem       | Velocidade rápida e bom efeito |
| **FasterWhisper**      | Windows/Linux          | `tiny`/`medium`/`large-v2` (recomendado medium+) | Local       | Velocidade mais rápida, sem custo de serviço em nuvem |
| **WhisperKit**         | macOS (apenas M-series) | `large-v2`                               | Local       | Otimização nativa para chips Apple |
| **WhisperCpp**         | Todas as Plataformas    | `large-v2`                               | Local       | Suporta todas as plataformas   |
| **Alibaba Cloud ASR**  | Todas as Plataformas    | -                                         | Nuvem       | Evita problemas de rede na China continental |

## 🚀 Suporte a Modelos de Linguagem Grande

✅ Compatível com todos os serviços de modelos de linguagem grande em nuvem/local que atendem às **especificações da API OpenAI**, incluindo, mas não se limitando a:

- OpenAI
- Gemini
- DeepSeek
- Tongyi Qianwen
- Modelos de código aberto implantados localmente
- Outros serviços de API compatíveis com o formato OpenAI

## 🎤 Suporte a TTS (Texto para Fala)

- Serviço de Voz da Alibaba Cloud
- TTS da OpenAI

## Suporte a Idiomas

Idiomas de entrada suportados: Chinês, Inglês, Japonês, Alemão, Turco, Coreano, Russo, Malaio (aumentando continuamente)

Idiomas de tradução suportados: Inglês, Chinês, Russo, Espanhol, Francês e outros 101 idiomas

## Prévia da Interface

![Prévia da Interface](/docs/images/ui_desktop_light.png)
![Prévia da Interface](/docs/images/ui_desktop_dark.png)

## 🚀 Início Rápido

Você pode fazer perguntas na [Deepwiki do KrillinAI](https://deepwiki.com/krillinai/KrillinAI). Ele indexa os arquivos no repositório, para que você possa encontrar respostas rapidamente.

### Passos Básicos

Primeiro, baixe o arquivo executável que corresponde ao sistema do seu dispositivo na [Release](https://github.com/KrillinAI/KrillinAI/releases), depois siga o tutorial abaixo para escolher entre a versão para desktop ou a versão não desktop. Coloque o download do software em uma pasta vazia, pois executá-lo gerará alguns diretórios, e mantê-lo em uma pasta vazia facilitará a gestão.

【Se for a versão para desktop, ou seja, o arquivo de release com "desktop", veja aqui】
_A versão para desktop foi recém-lançada para resolver os problemas de novos usuários que têm dificuldade em editar arquivos de configuração corretamente, e há alguns bugs que estão sendo atualizados continuamente._

1. Clique duas vezes no arquivo para começar a usá-lo (a versão para desktop também requer configuração dentro do software)

【Se for a versão não desktop, ou seja, o arquivo de release sem "desktop", veja aqui】
_A versão não desktop é a versão inicial, que possui uma configuração mais complexa, mas é estável em funcionalidade e adequada para implantação em servidor, pois fornece uma interface em formato web._

1. Crie uma pasta `config` dentro da pasta, depois crie um arquivo `config.toml` na pasta `config`. Copie o conteúdo do arquivo `config-example.toml` do diretório `config` do código-fonte para `config.toml`, e preencha suas informações de configuração de acordo com os comentários.
2. Clique duas vezes ou execute o arquivo executável no terminal para iniciar o serviço
3. Abra seu navegador e digite `http://127.0.0.1:8888` para começar a usá-lo (substitua 8888 pela porta que você especificou no arquivo de configuração)

### Para: Usuários de macOS

【Se for a versão para desktop, ou seja, o arquivo de release com "desktop", veja aqui】
Devido a problemas de assinatura, a versão para desktop atualmente não pode ser executada com um clique ou instalada via dmg; você precisa confiar manualmente no aplicativo. O método é o seguinte:

1. Abra o terminal no diretório onde o arquivo executável (supondo que o nome do arquivo seja KrillinAI_1.0.0_desktop_macOS_arm64) está localizado
2. Execute os seguintes comandos em ordem:

```
sudo xattr -cr ./KrillinAI_1.0.0_desktop_macOS_arm64
sudo chmod +x ./KrillinAI_1.0.0_desktop_macOS_arm64
./KrillinAI_1.0.0_desktop_macOS_arm64
```

【Se for a versão não desktop, ou seja, o arquivo de release sem "desktop", veja aqui】
Este software não está assinado, então ao executá-lo no macOS, após completar a configuração do arquivo nos "Passos Básicos", você também precisa confiar manualmente no aplicativo. O método é o seguinte:

1. Abra o terminal no diretório onde o arquivo executável (supondo que o nome do arquivo seja KrillinAI_1.0.0_macOS_arm64) está localizado
2. Execute os seguintes comandos em ordem:
   ```
   sudo xattr -rd com.apple.quarantine ./KrillinAI_1.0.0_macOS_arm64
   sudo chmod +x ./KrillinAI_1.0.0_macOS_arm64
   ./KrillinAI_1.0.0_macOS_arm64
   ```

   Isso iniciará o serviço

### Implantação com Docker

Este projeto suporta implantação com Docker; consulte as [Instruções de Implantação com Docker](./docker.md)

### Uso da CLI

O KrillinAI agora oferece uma CLI em etapas, adequada para scripts, pipelines de automação e agentes de IA. Por padrão, a CLI executa de forma síncrona, imprime uma linha JSON no stdout ao concluir e grava `krillinai_manifest.json` no diretório de trabalho para que etapas posteriores possam reutilizar artefatos existentes.

Compile a CLI a partir do código-fonte:

```bash
go build -o build/krillinai-cli ./cmd/cli
```

Resumo dos comandos:

| Comando | Uso | Artefatos comuns |
|---|---|---|
| `subtitle` | Gera legendas a partir de links do YouTube / Bilibili ou vídeos locais; tenta primeiro baixar legendas da plataforma e recorre ao Whisper se falhar | `origin_language_srt.srt`, `target_language_srt.srt`, `bilingual_srt.srt`, `short_origin_mixed_srt.srt` |
| `tts` | Gera dublagem no idioma de destino a partir das legendas de destino | `tts_final_audio.wav`, `video_with_tts.mp4` |
| `render-horizontal` | Gera vídeo horizontal: vídeo original + legendas bilíngues, ou vídeo dublado + legendas no idioma de destino | `horizontal_bilingual.mp4` |
| `render-vertical` | Gera vídeo vertical: vídeo original convertido para vertical + legendas curtas, ou vídeo dublado + legendas no idioma de destino | `transferred_vertical_video.mp4`, `vertical_bilingual.mp4` |
| `pipeline` | Encadeia várias etapas de acordo com outputs | Depende das etapas selecionadas |
| `cover` | Gera uma capa a partir da capa original do vídeo e de um modelo de prompt | `generated_cover.png` |

Fluxo de trabalho típico:

```bash
# 1. Gerar legendas de origem, destino, bilíngues e curtas para vertical
./build/krillinai-cli subtitle "https://www.youtube.com/watch?v=dQw4w9WgXcQ" \
  --origin-lang en \
  --target-lang zh_cn \
  --workdir tasks/demo \
  --caption-source any

# 2. Gerar dublagem a partir das legendas no idioma de destino
./build/krillinai-cli tts \
  --workdir tasks/demo \
  --input-srt tasks/demo/target_language_srt.srt \
  --line-mode target-only \
  --video tasks/demo/origin_video.mp4

# 3. Gerar vídeo horizontal com legendas bilíngues
./build/krillinai-cli render-horizontal \
  --workdir tasks/demo \
  --video tasks/demo/origin_video.mp4 \
  --subtitle tasks/demo/bilingual_srt.srt

# 4. Gerar vídeo vertical com legendas bilíngues curtas
./build/krillinai-cli render-vertical \
  --workdir tasks/demo \
  --video tasks/demo/origin_video.mp4 \
  --subtitle tasks/demo/short_origin_mixed_srt.srt \
  --major-title "Tema de hoje" \
  --minor-title "AI Video"
```

Convenções de integração para Agent:

- Leia primeiro a última linha JSON do stdout e `krillinai_manifest.json`; não analise logs comuns.
- O campo `outputs` registra os caminhos dos artefatos, e comandos posteriores podem reutilizar o manifest passando apenas `--workdir`.
- `--dry-run` valida parâmetros e gera o manifest sem baixar vídeo nem chamar serviços externos de IA.
- Trate erros por `error.kind`: `usage` corrige parâmetros, `retryable` permite tentar novamente, `dependency` exige instalar `ffmpeg` / `ffprobe` / `yt-dlp`.

Para uma explicação mais completa dos parâmetros, consulte o [resumo de capacidades da CLI](../zh/cli.md).

Com base no arquivo de configuração fornecido, aqui está a seção atualizada "Ajuda de Configuração (Leitura Obrigatória)" para o seu arquivo README:

### Ajuda de Configuração (Leitura Obrigatória)

O arquivo de configuração é dividido em várias seções: `[app]`, `[server]`, `[llm]`, `[transcribe]` e `[tts]`. Uma tarefa é composta por reconhecimento de fala (`transcribe`) + tradução de modelo grande (`llm`) + serviços de voz opcionais (`tts`). Compreender isso ajudará você a entender melhor o arquivo de configuração.

**Configuração Mais Fácil e Rápida:**

**Para Tradução de Legendas Apenas:**
   * Na seção `[transcribe]`, defina `provider.name` como `openai`.
   * Você só precisará preencher sua chave da API OpenAI no bloco `[llm]` para começar a realizar traduções de legendas. O `app.proxy`, `model` e `openai.base_url` podem ser preenchidos conforme necessário.

**Custo, Velocidade e Qualidade Balanceados (Usando Reconhecimento de Fala Local):**

* Na seção `[transcribe]`, defina `provider.name` como `fasterwhisper`.
* Defina `transcribe.fasterwhisper.model` como `large-v2`.
* Preencha sua configuração de modelo de linguagem grande no bloco `[llm]`.
* O modelo local necessário será baixado e instalado automaticamente.

**Configuração de Texto para Fala (TTS) (Opcional):**

* A configuração de TTS é opcional.
* Primeiro, defina o `provider.name` na seção `[tts]` (por exemplo, `aliyun` ou `openai`).
* Em seguida, preencha o bloco de configuração correspondente para o provedor selecionado. Por exemplo, se você escolher `aliyun`, deve preencher a seção `[tts.aliyun]`.
* Os códigos de voz na interface do usuário devem ser escolhidos com base na documentação do provedor selecionado.
* **Nota:** Se você planeja usar o recurso de clonagem de voz, deve selecionar `aliyun` como o provedor de TTS.

**Configuração da Alibaba Cloud:**

* Para detalhes sobre como obter o necessário `AccessKey`, `Bucket` e `AppKey` para os serviços da Alibaba Cloud, consulte as [Instruções de Configuração da Alibaba Cloud](https://www.google.com/search?q=./aliyun.md). Os campos repetidos para AccessKey, etc., são projetados para manter uma estrutura de configuração clara.

## Perguntas Frequentes

Por favor, visite [Perguntas Frequentes](./faq.md)

## Diretrizes de Contribuição

1. Não envie arquivos inúteis, como .vscode, .idea, etc.; use .gitignore para filtrá-los.
2. Não envie config.toml; em vez disso, envie config-example.toml.

## Contate-Nos

1. Junte-se ao nosso grupo QQ para perguntas: 754069680
2. Siga nossas contas de mídia social, [Bilibili](https://space.bilibili.com/242124650), onde compartilhamos conteúdo de qualidade na área de tecnologia de IA todos os dias.

## Histórico de Estrelas

[![Gráfico de Histórico de Estrelas](https://api.star-history.com/svg?repos=KrillinAI/KrillinAI&type=Date)](https://star-history.com/#KrillinAI/KrillinAI&Date)
