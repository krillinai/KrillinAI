### 1. Não consigo ver o arquivo de configuração `app.log`, não sei o que está causando o erro
Usuários do Windows, por favor, coloque o diretório de trabalho deste software em uma pasta que não seja no disco C.

### 2. O arquivo de configuração foi criado, mas ainda aparece o erro "arquivo de configuração não encontrado"
Certifique-se de que o nome do arquivo de configuração é `config.toml`, e não `config.toml.txt` ou outro.
Após a configuração, a estrutura da pasta de trabalho deste software deve ser assim:
```
/── config/
│   └── config.toml
├── cookies.txt （<- arquivo cookies.txt opcional）
└── krillinai.exe
```

### 3. Preenchi a configuração do modelo grande, mas aparece o erro "xxxxx precisa da configuração da chave API xxxxx"
Embora os serviços de modelo e de voz possam usar os serviços da OpenAI, também existem cenários em que o modelo grande usa serviços que não são da OpenAI, portanto, essas duas configurações são separadas. Além da configuração do modelo grande, procure a configuração do whisper abaixo para preencher a chave correspondente e outras informações.

### 4. O erro contém "yt-dlp error"
Problemas com o downloader de vídeo, atualmente parece ser apenas um problema de rede ou de versão do downloader. Verifique se o proxy de rede está ativado e configurado na seção de proxy do arquivo de configuração, e recomenda-se escolher um nó em Hong Kong. O downloader é instalado automaticamente por este software, a fonte da instalação será atualizada, mas não é uma fonte oficial, então pode haver desatualizações. Se encontrar problemas, tente atualizar manualmente, o método de atualização é:

Abra o terminal na localização do diretório bin do software e execute
```
./yt-dlp.exe -U
```
Aqui, substitua `yt-dlp.exe` pelo nome real do software ytdlp no seu sistema.

### 5. Após a implantação, a geração de legendas está normal, mas as legendas incorporadas no vídeo têm muitos caracteres estranhos
A maioria dos casos é devido à falta de fontes chinesas no Linux. Baixe as fontes [Microsoft YaHei](https://modelscope.cn/models/Maranello/KrillinAI_dependency_cn/resolve/master/%E5%AD%97%E4%BD%93/msyh.ttc) e [Microsoft YaHei Bold](https://modelscope.cn/models/Maranello/KrillinAI_dependency_cn/resolve/master/%E5%AD%97%E4%BD%93/msyhbd.ttc) (ou escolha fontes que atendam às suas necessidades) e siga os passos abaixo:
1. Crie uma pasta msyh em /usr/share/fonts/ e copie as fontes baixadas para esse diretório.
2. 
    ```
    cd /usr/share/fonts/msyh
    sudo mkfontscale
    sudo mkfontdir
    fc-cache
    ```

### 6. Como preencher o código de timbre para síntese de voz?
Por favor, consulte a documentação do provedor de serviços de voz, aqui estão os relacionados a este projeto:  
[Documentação OpenAI TTS](https://platform.openai.com/docs/guides/text-to-speech/api-reference), localizada em Opções de voz  
[Documentação de Interação de Voz Inteligente da Alibaba Cloud](https://help.aliyun.com/zh/isi/developer-reference/overview-of-speech-synthesis), localizada na lista de timbres - valor do parâmetro voice