### 1. No se puede ver el archivo de configuración `app.log`, no se puede saber el contenido del error
Los usuarios de Windows deben colocar el directorio de trabajo de este software en una carpeta que no esté en la unidad C.

### 2. A pesar de que se creó el archivo de configuración en la versión no de escritorio, sigue mostrando el error "no se encuentra el archivo de configuración"
Asegúrate de que el nombre del archivo de configuración sea `config.toml`, y no `config.toml.txt` u otro.
Una vez completada la configuración, la estructura de la carpeta de trabajo de este software debería ser la siguiente:
```
/── config/
│   └── config.toml
├── cookies.txt （<- archivo cookies.txt opcional）
└── krillinai.exe
```

### 3. Se completó la configuración del modelo grande, pero muestra el error "xxxxx necesita configurar la clave API de xxxxx"
Aunque los servicios de modelo y de voz pueden utilizar ambos los servicios de OpenAI, también hay escenarios en los que el modelo grande utiliza servicios que no son de OpenAI, por lo que estas dos configuraciones son independientes. Además de la configuración del modelo grande, busca la configuración de whisper más abajo para completar la clave y otra información correspondiente.

### 4. El error contiene "yt-dlp error"
El problema con el descargador de videos parece ser simplemente un problema de red o de versión del descargador. Verifica si el proxy de red está habilitado y configurado en la sección de configuración del archivo de configuración, y se recomienda elegir un nodo en Hong Kong. El descargador se instala automáticamente con este software; la fuente de instalación la actualizaré, pero no es oficial, por lo que puede haber desactualizaciones. Si encuentras problemas, intenta actualizar manualmente. El método de actualización es:

Abre una terminal en la ubicación del directorio bin del software y ejecuta
```
./yt-dlp.exe -U
```
Aquí, reemplaza `yt-dlp.exe` con el nombre real del software ytdlp en tu sistema.