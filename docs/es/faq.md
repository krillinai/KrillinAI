### 1. El programa informa "Archivo de configuración no encontrado" o "xxxxx requiere la configuración de la clave API de xxxxx". ¿Cómo puedo solucionarlo?

Este es un problema común de configuración. Hay varias razones por las que esto puede suceder:

1. **Ubicación o Nombre de Archivo Incorrecto:**

* El programa requiere un archivo de configuración llamado exactamente `config.toml`. Asegúrate de no haberlo nombrado accidentalmente `config.toml.txt`.
* Este archivo debe colocarse dentro de una carpeta `config`. La estructura correcta del directorio de trabajo debe ser:
  ```
  /── config/
  │   └── config.toml
  └── krillinai.exe (tu archivo ejecutable)
  ```
* **Para usuarios de Windows:** Se recomienda colocar todo el directorio del software en una carpeta que no esté en la unidad C: para evitar posibles problemas de permisos.

2. **Configuración Incompleta de la Clave API:**

* La aplicación requiere configuraciones separadas para el modelo de lenguaje grande (para traducción), el servicio de voz (para transcripción y síntesis de voz) y el servicio de tts.
* Incluso si usas OpenAI para todo, debes completar la clave en diferentes secciones del archivo `config.toml`. Busca la sección `llm`, la sección `transcribe`, la sección `tts` y completa las claves API correspondientes y otra información requerida.

### 2. Estoy recibiendo un error que contiene "error de yt-dlp". ¿Qué debo hacer?

Este error indica un problema con el descargador de videos, que generalmente está relacionado con tu red o la versión del descargador.

* **Red:** Si usas un proxy, asegúrate de que esté configurado correctamente en la configuración de proxy dentro de tu archivo `config.toml`.
* **Actualizar `yt-dlp`:** La versión de `yt-dlp` incluida con el software puede estar desactualizada. Puedes actualizarla manualmente abriendo una terminal en el directorio `bin` del software y ejecutando el comando:
  ```
  ./yt-dlp.exe -U
  ```
  
  (Reemplaza `yt-dlp.exe` con el nombre de archivo correcto para tu sistema operativo si es diferente).

### 3. Los subtítulos en el video final están distorsionados o aparecen como bloques cuadrados, especialmente en Linux.

Esto casi siempre es causado por fuentes faltantes en el sistema, particularmente aquellas que soportan caracteres chinos. Para solucionarlo, necesitas instalar las fuentes necesarias.

1. Descarga las fuentes requeridas, como [Microsoft YaHei](https://modelscope.cn/models/Maranello/KrillinAI_dependency_cn/resolve/master/%E5%AD%97%E4%BD%93/msyh.ttc) y [Microsoft YaHei Bold](https://modelscope.cn/models/Maranello/KrillinAI_dependency_cn/resolve/master/%E5%AD%97%E4%BD%93/msyhbd.ttc).
2. Crea un nuevo directorio de fuentes: `sudo mkdir -p /usr/share/fonts/msyh`.
3. Copia los archivos de fuentes `.ttc` descargados en este nuevo directorio.
4. Ejecuta los siguientes comandos para reconstruir la caché de fuentes:
    ```
    cd /usr/share/fonts/msyh
    sudo mkfontscale
    sudo mkfontdir
    sudo fc-cache -fv
    ```

### 4. En macOS, la aplicación no se inicia y muestra un error como "KrillinAI está dañado y no se puede abrir".

Esto es causado por la función de seguridad de macOS, Gatekeeper, que restringe las aplicaciones de desarrolladores no identificados. Para solucionarlo, debes eliminar manualmente el atributo de cuarentena.

1. Abre la aplicación **Terminal**.
2. Escribe el comando `xattr -cr` seguido de un espacio, luego arrastra el archivo `KrillinAI.app` desde tu ventana de Finder a la Terminal. El comando se verá algo así:
    ```
    xattr -cr /Applications/KrillinAI.app
    ```
3. Presiona Enter. Ahora deberías poder abrir la aplicación.

### 5. Estoy recibiendo errores como `error de ffmpeg`, `error de audioToSrt` o `estado de salida 1` durante el procesamiento.

Estos errores generalmente indican problemas con las dependencias o los recursos del sistema.

* **`error de ffmpeg`:** Esto indica que `ffmpeg` no está instalado o no es accesible desde el PATH del sistema. Asegúrate de tener una versión completa y oficial de `ffmpeg` instalada y que su ubicación esté añadida a las variables de entorno de tu sistema.
* **`error de audioToSrt` o `estado de salida 1`:** Este error ocurre durante la fase de transcripción (audio a texto). Las causas comunes son:
  * **Problemas con el Modelo:** El modelo de transcripción local (por ejemplo, `fasterwhisper`) no se pudo cargar o se corrompió durante la descarga.
  * **Memoria Insuficiente (RAM):** Ejecutar modelos locales es intensivo en recursos. Si tu máquina se queda sin memoria, el sistema operativo puede terminar el proceso, resultando en un error.
  * **Fallo de Red:** Si estás utilizando un servicio de transcripción en línea (como la API Whisper de OpenAI), esto indica un problema con tu conexión de red o una clave API inválida.

### 6. La barra de progreso no se mueve. ¿Está el programa congelado?

No, mientras no veas un mensaje de error, el programa está funcionando. La barra de progreso solo se actualiza después de que una tarea importante (como la transcripción o la codificación de video) se completa por completo. Estas tareas pueden llevar mucho tiempo, lo que puede hacer que la barra de progreso se detenga durante un período prolongado. Por favor, ten paciencia y espera a que la tarea termine.

### 7. Mi GPU de la serie NVIDIA 5000 no es compatible con `fasterwhisper`. ¿Qué debo hacer?

Se ha observado que el modelo `fasterwhisper` puede no funcionar correctamente con las GPU de la serie NVIDIA 5000 (a partir de mediados de 2025). Tienes algunas alternativas para la transcripción:

1. **Usar un Modelo Basado en la Nube:** Establece `transcribe.provider.name` a `openai` o `aliyun` en tu archivo `config.toml`. Luego, completa la clave API correspondiente y los detalles de configuración. Esto utilizará el modelo Whisper del proveedor en la nube en lugar del local.
2. **Usar Otro Modelo Local:** Puedes experimentar con otros modelos de transcripción locales, como el original `whisper.cpp`.

### 8. ¿Cómo puedo encontrar y completar el código de voz/tono correcto para la síntesis de texto a voz?

Las voces disponibles y sus códigos correspondientes están definidos por el proveedor del servicio de voz que estás utilizando. Por favor, consulta su documentación oficial.

* **OpenAI TTS:** [Documentación](https://platform.openai.com/docs/guides/text-to-speech/api-reference) (ver las opciones de `voice`).
* **Alibaba Cloud:** [Documentación](https://help.aliyun.com/zh/isi/developer-reference/overview-of-speech-synthesis) (ver el parámetro `voice` en la lista de tonos).

### 9. ¿Cómo puedo usar un Modelo de Lenguaje Grande (LLM) local, como uno que se ejecute en Ollama, para traducción?

Sí, puedes configurar KrillinAI para usar cualquier LLM local que proporcione un punto de API compatible con OpenAI.

1. **Inicia tu LLM Local:** Asegúrate de que tu servicio local (por ejemplo, Ollama ejecutando Llama3) esté activo y accesible.
2. **Edita `config.toml`:** En la sección para el modelo de lenguaje grande (traductor):

* Establece el `name` (o `type`) del proveedor a `"openai"`.
* Establece la `api_key` a cualquier cadena aleatoria (por ejemplo, `"ollama"`), ya que no se necesita para llamadas locales.
* Establece el `base_url` a tu punto de API del modelo local. Para Ollama, esto es típicamente `http://localhost:11434/v1`.
* Establece el `model` al nombre del modelo que estás sirviendo, por ejemplo, `"llama3"`.

### 10. ¿Puedo personalizar el estilo de los subtítulos (fuente, tamaño, color) en el video final?

No. Actualmente, KrillinAI genera **subtítulos codificados**, lo que significa que están grabados directamente en los fotogramas del video. La aplicación **no ofrece opciones para personalizar el estilo de los subtítulos**; utiliza un estilo preestablecido.

Para una personalización avanzada, la solución recomendada es:

1. Usar KrillinAI para generar el archivo de subtítulos `.srt` traducido.
2. Importar tu video original y este archivo `.srt` en un editor de video profesional (por ejemplo, Premiere Pro, Final Cut Pro, DaVinci Resolve) para aplicar estilos personalizados antes de renderizar.

### 11. Ya tengo un archivo `.srt` traducido. ¿Puede KrillinAI usarlo solo para realizar el doblaje?

No, esta función no está actualmente soportada. La aplicación ejecuta un pipeline completo desde la transcripción hasta la generación del video final.