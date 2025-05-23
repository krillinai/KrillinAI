### 1. No se puede ver el archivo de configuración `app.log`, no se puede saber el contenido del error
Los usuarios de Windows deben colocar el directorio de trabajo de este software en una carpeta que no esté en la unidad C.

### 2. Aunque se creó el archivo de configuración en la versión no de escritorio, sigue mostrando el error "no se encuentra el archivo de configuración"
Asegúrate de que el nombre del archivo de configuración sea `config.toml`, y no `config.toml.txt` u otro.
Una vez completada la configuración, la estructura de la carpeta de trabajo de este software debería ser la siguiente:
```
/── config/
│   └── config.toml
├── cookies.txt （<- archivo cookies.txt opcional）
└── krillinai.exe
```

### 3. Se completó la configuración del modelo grande, pero aparece el error "xxxxx necesita configurar la clave API de xxxxx"
Aunque los servicios de modelo y de voz pueden utilizar ambos los servicios de OpenAI, también hay escenarios en los que el modelo grande utiliza servicios que no son de OpenAI, por lo que estas dos configuraciones están separadas. Además de la configuración del modelo grande, busca la configuración de whisper más abajo para completar la clave y otra información correspondiente.

### 4. El error contiene "yt-dlp error"
El problema con el descargador de videos parece ser simplemente un problema de red o de versión del descargador. Verifica si el proxy de red está habilitado y configurado en la sección de configuración del archivo de configuración, y se recomienda elegir un nodo de Hong Kong. El descargador se instala automáticamente con este software; actualizaré la fuente de instalación, pero dado que no es la fuente oficial, puede haber desactualizaciones. Si encuentras problemas, intenta actualizar manualmente con el siguiente método:

Abre una terminal en la ubicación del directorio bin del software y ejecuta
```
./yt-dlp.exe -U
```
Aquí, reemplaza `yt-dlp.exe` con el nombre real del software ytdlp en tu sistema.

### 5. Después de la implementación, la generación de subtítulos es normal, pero los subtítulos incrustados en el video tienen muchos caracteres extraños
La mayoría de las veces esto se debe a la falta de fuentes chinas en Linux. Descarga las fuentes [Microsoft YaHei](https://modelscope.cn/models/Maranello/KrillinAI_dependency_cn/resolve/master/%E5%AD%97%E4%BD%93/msyh.ttc) y [Microsoft YaHei Bold](https://modelscope.cn/models/Maranello/KrillinAI_dependency_cn/resolve/master/%E5%AD%97%E4%BD%93/msyhbd.ttc) (o elige fuentes que satisfagan tus requisitos) y luego sigue estos pasos:
1. Crea una carpeta msyh en /usr/share/fonts/ y copia las fuentes descargadas en ese directorio.
2. 
    ```
    cd /usr/share/fonts/msyh
    sudo mkfontscale
    sudo mkfontdir
    fc-cache
    ```