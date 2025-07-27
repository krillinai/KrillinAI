<div align="center">
  <img src="/docs/images/logo.jpg" alt="KlicStudio" height="90">

  # Herramienta de traducción y doblaje de video AI de despliegue minimalista

  <a href="https://trendshift.io/repositories/13360" target="_blank"><img src="https://trendshift.io/api/badge/repositories/13360" alt="KrillinAI%2FKlicStudio | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

  **[English](/README.md)｜[简体中文](/docs/zh/README.md)｜[日本語](/docs/jp/README.md)｜[한국어](/docs/kr/README.md)｜[Tiếng Việt](/docs/vi/README.md)｜[Français](/docs/fr/README.md)｜[Deutsch](/docs/de/README.md)｜[Español](/docs/es/README.md)｜[Português](/docs/pt/README.md)｜[Русский](/docs/rus/README.md)｜[اللغة العربية](/docs/ar/README.md)**

[![Twitter](https://img.shields.io/badge/Twitter-KrillinAI-orange?logo=twitter)](https://x.com/KrillinAI)
[![QQ 群](https://img.shields.io/badge/QQ%20群-754069680-green?logo=tencent-qq)](https://jq.qq.com/?_wv=1027&k=754069680)
[![Bilibili](https://img.shields.io/badge/dynamic/json?label=Bilibili&query=%24.data.follower&suffix=粉丝&url=https%3A%2F%2Fapi.bilibili.com%2Fx%2Frelation%2Fstat%3Fvmid%3D242124650&logo=bilibili&color=00A1D6&labelColor=FE7398&logoColor=FFFFFF)](https://space.bilibili.com/242124650)

</div>

 ## Introducción al proyecto  ([¡Experimenta la versión en línea ahora!](https://www.klic.studio/))

Klic Studio es una solución integral de localización de audio y video desarrollada por Krillin AI, que combina traducción de audio y video, doblaje y clonación de voz, generando subtítulos de calidad cinematográfica de Hollywood con un solo clic. Soporta formatos de pantalla horizontal y vertical, asegurando una presentación perfecta en todas las plataformas principales (Bilibili, Xiaohongshu, Douyin, WeChat Video, Kuaishou, YouTube, TikTok, etc.), satisfaciendo fácilmente las necesidades de globalización de contenido.

## Principales características y funciones:
🎯 **Inicio con un clic**: Sin configuraciones de entorno complicadas, instalación automática de dependencias, listo para usar. Nueva versión de escritorio, ¡más conveniente!

📥 **Obtención de video**: Soporta descarga con yt-dlp o carga de archivos locales.

📜 **Reconocimiento preciso**: Reconocimiento de voz de alta precisión basado en Whisper.

🧠 **Traducción de calidad**: Adaptado a modelos de lenguaje de última generación, calidad de traducción a nivel de grupo de subtítulos.

🌍 **Subtítulos de calidad cinematográfica**: Algoritmo de alineación a nivel de palabra, alineando la calidad de subtítulos de Hollywood, subtítulos de una sola línea sin saltos de línea.

🎙️ **Clonación de voz**: Ofrece voces seleccionadas de CosyVoice o clonación de voces personalizadas.

🎬 **Salida en horizontal y vertical**: Procesamiento automático de videos y subtítulos en formato horizontal y vertical, formato multiplataforma listo en un solo paso.

🔄 **Reemplazo de términos**: Reemplazo de vocabulario especializado con un clic.

💻 **Multiplataforma**: Soporta Windows, Linux, macOS, ofreciendo versiones de escritorio y servidor.

## Demostración de efectos
La imagen a continuación muestra el efecto de los archivos de subtítulos generados tras importar un video local de 46 minutos y ejecutar con un clic, sin ajustes manuales. Sin pérdidas, superposiciones, con pausas naturales y calidad de traducción muy alta.
![Efecto de alineación](/docs/images/alignment.png)

<table>
<tr>
<td width="33%">

### Traducción de subtítulos
---
https://github.com/user-attachments/assets/bba1ac0a-fe6b-4947-b58d-ba99306d0339

</td>
<td width="33%">



### Doblaje
---
https://github.com/user-attachments/assets/0b32fad3-c3ad-4b6a-abf0-0865f0dd2385

</td>

<td width="33%">

### Pantalla vertical
---
https://github.com/user-attachments/assets/c2c7b528-0ef8-4ba9-b8ac-f9f92f6d4e71

</td>

</tr>
</table>

## 🔍 Soporte de servicio de reconocimiento de voz
_**Todos los modelos locales en la tabla a continuación son compatibles con la instalación automática de archivos ejecutables + archivos de modelo, solo necesitas elegir, Klic se encargará del resto.**_

| Fuente de servicio       | Plataformas soportadas | Opciones de modelo                           | Local/Nube | Notas          |
|-------------------------|-----------------------|---------------------------------------------|------------|----------------|
| **OpenAI Whisper**      | Todas las plataformas  | -                                           | Nube       | Rápido y de buena calidad      |
| **FasterWhisper**       | Windows/Linux         | `tiny`/`medium`/`large-v2` (recomendado medium+) | Local      | Más rápido, sin costos de nube |
| **WhisperKit**          | macOS (solo para chips M) | `large-v2`                                | Local      | Optimización nativa para chips Apple |
| **WhisperCpp**          | Todas las plataformas  | `large-v2`                                | Local      | Soporte para todas las plataformas       |
| **Aliyun ASR**          | Todas las plataformas  | -                                           | Nube       | Evitar problemas de red en China continental  |

## 🚀 Soporte para modelos de lenguaje grandes

✅ Compatible con todos los servicios de modelos de lenguaje grandes en la nube/local que cumplen con las **especificaciones de la API de OpenAI**, incluyendo pero no limitado a:
- OpenAI
- Gemini
- DeepSeek
- Tongyi Qianwen
- Modelos de código abierto desplegados localmente
- Otros servicios de API compatibles con el formato de OpenAI

## 🎤 Soporte para TTS (texto a voz)
- Servicio de voz de Aliyun
- OpenAI TTS

## Soporte de idiomas
Idiomas de entrada soportados: chino, inglés, japonés, alemán, turco, coreano, ruso, malayo (en continuo aumento)

Idiomas de traducción soportados: inglés, chino, ruso, español, francés y otros 101 idiomas.

## Vista previa de la interfaz
![Vista previa de la interfaz](/docs/images/ui_desktop.png)

## 🚀 Comenzar rápidamente
### Pasos básicos
Primero descarga el archivo ejecutable que coincida con tu sistema operativo en [Release](https://github.com/KrillinAI/KlicStudio/releases), según el tutorial a continuación, elige entre la versión de escritorio o no de escritorio, y colócalo en una carpeta vacía. Descarga el software en una carpeta vacía, ya que generará algunos directorios después de ejecutarse, lo que facilitará la gestión.

【Si es la versión de escritorio, es decir, el archivo de release que lleva desktop, mira aquí】  
_La versión de escritorio es nueva, diseñada para resolver problemas de edición de archivos de configuración para usuarios novatos, y hay algunos errores que se están corrigiendo continuamente._
1. Haz doble clic en el archivo para comenzar a usarlo (la versión de escritorio también necesita configuración dentro del software).

【Si es la versión no de escritorio, es decir, el archivo de release que no lleva desktop, mira aquí】  
_La versión no de escritorio es la versión inicial, con una configuración más compleja, pero funcionalmente estable, adecuada para despliegue en servidores, ya que proporcionará una interfaz de usuario de forma web._
1. Crea una carpeta `config` dentro de la carpeta, luego crea un archivo `config.toml` dentro de la carpeta `config`, copia el contenido del archivo `config-example.toml` en el directorio `config` y completa tu información de configuración según las anotaciones.
2. Haz doble clic o ejecuta el archivo ejecutable en la terminal para iniciar el servicio.
3. Abre el navegador e ingresa `http://127.0.0.1:8888` para comenzar a usarlo (reemplaza 8888 con el puerto que ingresaste en el archivo de configuración).

### Para: usuarios de macOS
【Si es la versión de escritorio, es decir, el archivo de release que lleva desktop, mira aquí】  
Actualmente, debido a problemas de firma, la versión de escritorio no puede ejecutarse con un doble clic o instalarse como dmg, necesitas confiar manualmente en la aplicación, el método es el siguiente:
1. Abre el archivo ejecutable en la terminal (suponiendo que el nombre del archivo es KlicStudio_1.0.0_desktop_macOS_arm64) en el directorio donde se encuentra.
2. Ejecuta los siguientes comandos uno por uno:
```
sudo xattr -cr ./KlicStudio_1.0.0_desktop_macOS_arm64
sudo chmod +x ./KlicStudio_1.0.0_desktop_macOS_arm64 
./KlicStudio_1.0.0_desktop_macOS_arm64
```

【Si es la versión no de escritorio, es decir, el archivo de release que no lleva desktop, mira aquí】  
Este software no está firmado, por lo que al ejecutarlo en macOS, después de completar la configuración de archivos en "pasos básicos", también necesitas confiar manualmente en la aplicación, el método es el siguiente:
1. Abre el archivo ejecutable en la terminal (suponiendo que el nombre del archivo es KlicStudio_1.0.0_macOS_arm64) en el directorio donde se encuentra.
2. Ejecuta los siguientes comandos uno por uno:
   ```
    sudo xattr -rd com.apple.quarantine ./KlicStudio_1.0.0_macOS_arm64
    sudo chmod +x ./KlicStudio_1.0.0_macOS_arm64
    ./KlicStudio_1.0.0_macOS_arm64
    ```
    Esto iniciará el servicio.

### Despliegue con Docker
Este proyecto soporta despliegue con Docker, por favor consulta [Instrucciones de despliegue con Docker](./docker.md).

### Instrucciones de configuración de Cookies (opcional)

Si encuentras problemas al descargar videos,

por favor consulta [Instrucciones de configuración de Cookies](./get_cookies.md) para configurar tu información de Cookies.

### Ayuda de configuración (importante)
La forma más rápida y conveniente de configurar:
* Rellena `transcribe.provider.name` con `openai`, así solo necesitas completar el bloque `transcribe.openai` y la configuración del modelo grande en el bloque `llm` para realizar la traducción de subtítulos. (`app.proxy`, `model` y `openai.base_url` son opcionales según tu situación).

Forma de configuración para usar modelos de reconocimiento de voz locales (equilibrando costo, velocidad y calidad):
* Rellena `transcribe.provider.name` con `fasterwhisper`, `transcribe.fasterwhisper.model` con `large-v2`, y luego completa el bloque `llm` con la configuración del modelo grande para realizar la traducción de subtítulos, el modelo local se descargará e instalará automáticamente. (`app.proxy` y `openai.base_url` son iguales a lo anterior).

La conversión de texto a voz (TTS) es opcional, la lógica de configuración es la misma que la anterior, rellena `tts.provider.name`, y luego completa el bloque de configuración correspondiente debajo de `tts`, en la interfaz de usuario, los códigos de voz se completan según la documentación del proveedor seleccionado (la dirección de la documentación está en las preguntas frecuentes más abajo). La configuración de ak, sk y otros de Aliyun puede repetirse, esto es para asegurar que la estructura de configuración sea clara.  
Nota: Si usas clonación de voz, `tts` solo soporta seleccionar `aliyun`.

**Para obtener el AccessKey, Bucket y AppKey de Aliyun, por favor lee**: [Instrucciones de configuración de Aliyun](./aliyun.md).

Por favor entiende que la tarea = reconocimiento de voz + traducción de modelo grande + servicio de voz (TTS, etc., opcional), esto te ayudará a entender el archivo de configuración.

## Preguntas frecuentes

Por favor visita [Preguntas frecuentes](./faq.md).

## Normas de contribución
1. No envíes archivos innecesarios, como .vscode, .idea, etc., usa .gitignore para filtrarlos.
2. No envíes config.toml, sino usa config-example.toml para enviar.

## Contáctanos
1. Únete a nuestro grupo de QQ para resolver dudas: 754069680.
2. Sigue nuestras cuentas en redes sociales, [Bilibili](https://space.bilibili.com/242124650), compartiendo contenido de calidad en el campo de la tecnología AI todos los días.

## Historial de estrellas

[![Gráfico de historial de estrellas](https://api.star-history.com/svg?repos=KrillinAI/KlicStudio&type=Date)](https://star-history.com/#KrillinAI/KlicStudio&Date)