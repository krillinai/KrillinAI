### 1. O programa relata "Arquivo de configuração não encontrado" ou "xxxxx requer configuração da chave da API xxxxx." Como posso corrigir isso?

Este é um problema comum de configuração. Existem algumas razões pelas quais isso pode acontecer:

1. **Localização ou Nome do Arquivo Incorretos:**

* O programa requer um arquivo de configuração nomeado exatamente `config.toml`. Certifique-se de que você não o nomeou acidentalmente como `config.toml.txt`.
* Este arquivo deve ser colocado dentro de uma pasta `config`. A estrutura correta do diretório de trabalho deve ser:
  ```
  /── config/
  │   └── config.toml
  └── krillinai.exe (seu arquivo executável)
  ```
* **Para usuários do Windows:** É recomendável colocar todo o diretório do software em uma pasta que não esteja na unidade C: para evitar possíveis problemas de permissão.

2. **Configuração Incompleta da Chave da API:**

* O aplicativo requer configurações separadas para o modelo de linguagem grande (para tradução), o serviço de voz (para transcrição e síntese de fala) e o serviço de tts.
* Mesmo que você use a OpenAI para tudo, deve preencher a chave em diferentes seções do arquivo `config.toml`. Procure pela seção `llm`, a seção `transcribe`, a seção `tts` e preencha as respectivas Chaves da API e outras informações necessárias.

### 2. Estou recebendo um erro que contém "erro yt-dlp." O que devo fazer?

Esse erro aponta para um problema com o downloader de vídeo, que geralmente está relacionado à sua rede ou à versão do downloader.

* **Rede:** Se você usa um proxy, certifique-se de que ele está configurado corretamente nas configurações de proxy dentro do seu arquivo `config.toml`.
* **Atualizar `yt-dlp`:** A versão do `yt-dlp` incluída com o software pode estar desatualizada. Você pode atualizá-la manualmente abrindo um terminal no diretório `bin` do software e executando o comando:
  ```
  ./yt-dlp.exe -U
  ```
  
  (Substitua `yt-dlp.exe` pelo nome correto do arquivo para o seu sistema operacional, se for diferente).

### 3. As legendas no vídeo final estão embaralhadas ou aparecem como blocos quadrados, especialmente no Linux.

Isso é quase sempre causado pela falta de fontes no sistema, particularmente aquelas que suportam caracteres chineses. Para corrigir isso, você precisa instalar as fontes necessárias.

1. Baixe as fontes necessárias, como [Microsoft YaHei](https://modelscope.cn/models/Maranello/KrillinAI_dependency_cn/resolve/master/%E5%AD%97%E4%BD%93/msyh.ttc) e [Microsoft YaHei Bold](https://modelscope.cn/models/Maranello/KrillinAI_dependency_cn/resolve/master/%E5%AD%97%E4%BD%93/msyhbd.ttc).
2. Crie um novo diretório de fontes: `sudo mkdir -p /usr/share/fonts/msyh`.
3. Copie os arquivos de fonte `.ttc` baixados para este novo diretório.
4. Execute os seguintes comandos para reconstruir o cache de fontes:
    ```
    cd /usr/share/fonts/msyh
    sudo mkfontscale
    sudo mkfontdir
    sudo fc-cache -fv
    ```

### 4. No macOS, o aplicativo não inicia e mostra um erro como "KrillinAI está danificado e não pode ser aberto."

Isso é causado pelo recurso de segurança do macOS, Gatekeeper, que restringe aplicativos de desenvolvedores não identificados. Para corrigir isso, você deve remover manualmente o atributo de quarentena.

1. Abra o aplicativo **Terminal**.
2. Digite o comando `xattr -cr` seguido de um espaço, e arraste o arquivo `KrillinAI.app` da sua janela do Finder para o Terminal. O comando ficará assim:
    ```
    xattr -cr /Applications/KrillinAI.app
    ```
3. Pressione Enter. Agora você deve conseguir abrir o aplicativo.

### 5. Estou recebendo erros como `erro ffmpeg`, `erro audioToSrt` ou `status de saída 1` durante o processamento.

Esses erros geralmente apontam para problemas com dependências ou recursos do sistema.

* **`erro ffmpeg`:** Isso indica que o `ffmpeg` não está instalado ou não é acessível a partir do PATH do sistema. Certifique-se de ter uma versão completa e oficial do `ffmpeg` instalada e que sua localização esteja adicionada às variáveis de ambiente do seu sistema.
* **`erro audioToSrt` ou `status de saída 1`:** Este erro ocorre durante a fase de transcrição (áudio para texto). As causas comuns são:
  * **Problemas com o Modelo:** O modelo de transcrição local (por exemplo, `fasterwhisper`) falhou ao carregar ou foi corrompido durante o download.
  * **Memória Insuficiente (RAM):** Executar modelos locais é intensivo em recursos. Se sua máquina ficar sem memória, o sistema operacional pode encerrar o processo, resultando em um erro.
  * **Falha na Rede:** Se você estiver usando um serviço de transcrição online (como a API Whisper da OpenAI), isso indica um problema com sua conexão de rede ou uma chave da API inválida.

### 6. A barra de progresso não está se movendo. O programa está congelado?

Não, enquanto você não ver uma mensagem de erro, o programa está funcionando. A barra de progresso só é atualizada após uma tarefa importante (como transcrição ou codificação de vídeo) ser totalmente concluída. Essas tarefas podem levar muito tempo, fazendo com que a barra de progresso pause por um período prolongado. Por favor, tenha paciência e aguarde a conclusão da tarefa.

### 7. Minha GPU da série NVIDIA 5000 não é suportada pelo `fasterwhisper`. O que devo fazer?

Foi observado que o modelo `fasterwhisper` pode não funcionar corretamente com GPUs da série NVIDIA 5000 (a partir de meados de 2025). Você tem algumas alternativas para transcrição:

1. **Use um Modelo Baseado em Nuvem:** Defina `transcribe.provider.name` como `openai` ou `aliyun` no seu arquivo `config.toml`. Em seguida, preencha a chave da API correspondente e os detalhes de configuração. Isso usará o modelo Whisper do provedor de nuvem em vez do local.
2. **Use Outro Modelo Local:** Você pode experimentar outros modelos de transcrição locais, como o original `whisper.cpp`.

### 8. Como posso encontrar e preencher o código de voz/tom correto para texto-para-fala?

As vozes disponíveis e seus códigos correspondentes são definidos pelo provedor de serviço de voz que você está usando. Consulte a documentação oficial deles.

* **OpenAI TTS:** [Documentação](https://platform.openai.com/docs/guides/text-to-speech/api-reference) (veja as opções de `voice`).
* **Alibaba Cloud:** [Documentação](https://help.aliyun.com/zh/isi/developer-reference/overview-of-speech-synthesis) (veja o parâmetro `voice` na lista de tons).

### 9. Como posso usar um Modelo de Linguagem Grande (LLM) local, como um rodando no Ollama, para tradução?

Sim, você pode configurar o KrillinAI para usar qualquer LLM local que forneça um endpoint de API compatível com OpenAI.

1. **Inicie Seu LLM Local:** Certifique-se de que seu serviço local (por exemplo, Ollama rodando Llama3) esteja ativo e acessível.
2. **Edite `config.toml`:** Na seção para o modelo de linguagem grande (tradutor):

* Defina o `name` (ou `type`) do provedor como `"openai"`.
* Defina a `api_key` como qualquer string aleatória (por exemplo, `"ollama"`), pois não é necessária para chamadas locais.
* Defina o `base_url` para o endpoint da API do seu modelo local. Para Ollama, isso é tipicamente `http://localhost:11434/v1`.
* Defina o `model` como o nome do modelo que você está servindo, por exemplo, `"llama3"`.

### 10. Posso personalizar o estilo das legendas (fonte, tamanho, cor) no vídeo final?

Não. Atualmente, o KrillinAI gera **legendas codificadas**, o que significa que elas são queimadas diretamente nos quadros do vídeo. O aplicativo **não oferece opções para personalizar o estilo das legendas**; ele usa um estilo predefinido.

Para personalização avançada, a solução alternativa recomendada é:

1. Usar o KrillinAI para gerar o arquivo de legenda traduzido `.srt`.
2. Importar seu vídeo original e este arquivo `.srt` em um editor de vídeo profissional (por exemplo, Premiere Pro, Final Cut Pro, DaVinci Resolve) para aplicar estilos personalizados antes da renderização.

### 11. Eu já tenho um arquivo `.srt` traduzido. O KrillinAI pode usá-lo apenas para fazer a dublagem?

Não, esse recurso não é atualmente suportado. O aplicativo executa um pipeline completo desde a transcrição até a geração do vídeo final.