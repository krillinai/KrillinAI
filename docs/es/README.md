<div align="center">
  <img src="/docs/images/logo.jpg" alt="KrillinAI" height="90">

# Herramienta Minimalista de Traducción y Doblaje de Video con IA

<a href="https://trendshift.io/repositories/13360" target="_blank"><img src="https://trendshift.io/api/badge/repositories/13360" alt="KrillinAI%2FKrillinAI | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

**[English](/README.md)｜[简体中文](/docs/zh/README.md)｜[日本語](/docs/jp/README.md)｜[한국어](/docs/kr/README.md)｜[Tiếng Việt](/docs/vi/README.md)｜[Français](/docs/fr/README.md)｜[Deutsch](/docs/de/README.md)｜[Español](/docs/es/README.md)｜[Português](/docs/pt/README.md)｜[Русский](/docs/rus/README.md)｜[اللغة العربية](/docs/ar/README.md)**

[![Twitter](https://img.shields.io/badge/Twitter-KrillinAI-orange?logo=twitter)](https://x.com/KrillinAI)
[![QQ 群](https://img.shields.io/badge/QQ%20群-754069680-green?logo=tencent-qq)](https://jq.qq.com/?_wv=1027&k=754069680)
[![Bilibili](https://img.shields.io/badge/dynamic/json?label=Bilibili&query=%24.data.follower&suffix=粉丝&url=https%3A%2F%2Fapi.bilibili.com%2Fx%2Frelation%2Fstat%3Fvmid%3D242124650&logo=bilibili&color=00A1D6&labelColor=FE7398&logoColor=FFFFFF)](https://space.bilibili.com/242124650)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/krillinai/KrillinAI)

</div>

## Introducción al Proyecto  ([¡Prueba la versión en línea ahora!](https://www.klic.studio/))
[**Inicio Rápido**](#-quick-start)

KrillinAI es una solución versátil de localización y mejora de audio y video desarrollada por Krillin AI. Esta herramienta minimalista pero poderosa integra traducción de video, doblaje y clonación de voz, soportando formatos tanto apaisados como verticales para asegurar una presentación perfecta en todas las plataformas principales (Bilibili, Xiaohongshu, Douyin, WeChat Video, Kuaishou, YouTube, TikTok, etc.). Con un flujo de trabajo de extremo a extremo, puedes transformar materiales en bruto en contenido listo para usar y multiplataforma con solo unos pocos clics.

## Características y Funciones Clave:

🎯 **Inicio con un clic**: No se requiere configuración compleja del entorno, instalación automática de dependencias, listo para usar de inmediato, ¡con una nueva versión de escritorio para un acceso más fácil!

📥 **Adquisición de Video**: Soporta descargas de yt-dlp o cargas de archivos locales

📜 **Reconocimiento Preciso**: Reconocimiento de voz de alta precisión basado en Whisper

🧠 **Segmentación Inteligente**: Segmentación y alineación de subtítulos utilizando LLM

🔄 **Reemplazo de Terminología**: Reemplazo de vocabulario profesional con un clic

🌍 **Traducción Profesional**: Traducción LLM con contexto para mantener la semántica natural

🎙️ **Clonación de Voz**: Ofrece tonos de voz seleccionados de CosyVoice o clonación de voz personalizada

🎬 **Composición de Video**: Procesa automáticamente videos apaisados y verticales y el diseño de subtítulos

💻 **Multiplataforma**: Soporta Windows, Linux, macOS, proporcionando versiones de escritorio y servidor

## Demostración de Efecto

La imagen a continuación muestra el efecto del archivo de subtítulos generado después de importar un video local de 46 minutos y ejecutarlo con un clic, sin ajustes manuales. No hay omisiones ni superposiciones, la segmentación es natural y la calidad de la traducción es muy alta.
![Efecto de Alineación](/docs/images/alignment.png)

<table>
<tr>
<td width="33%">

### Traducción de Subtítulos

---

https://github.com/user-attachments/assets/bba1ac0a-fe6b-4947-b58d-ba99306d0339

</td>
<td width="33%">

### Doblaje

---

https://github.com/user-attachments/assets/0b32fad3-c3ad-4b6a-abf0-0865f0dd2385

</td>

<td width="33%">

### Modo Vertical

---

https://github.com/user-attachments/assets/c2c7b528-0ef8-4ba9-b8ac-f9f92f6d4e71

</td>

</tr>
</table>

## 🔍 Servicios de Reconocimiento de Voz Soportados

_**Todos los modelos locales en la tabla a continuación soportan la instalación automática de archivos ejecutables + archivos de modelo; solo necesitas elegir, y Klic preparará todo por ti.**_

| Fuente del Servicio      | Plataformas Soportadas | Opciones de Modelo                         | Local/Nube | Observaciones                 |
|-------------------------|------------------------|--------------------------------------------|------------|-------------------------------|
| **OpenAI Whisper**      | Todas las Plataformas   | -                                          | Nube       | Velocidad rápida y buen efecto |
| **FasterWhisper**       | Windows/Linux          | `tiny`/`medium`/`large-v2` (recomendado medium+) | Local      | Velocidad más rápida, sin costo de servicio en la nube |
| **WhisperKit**          | macOS (solo M-series)  | `large-v2`                                | Local      | Optimización nativa para chips de Apple |
| **WhisperCpp**          | Todas las Plataformas   | `large-v2`                                | Local      | Soporta todas las plataformas   |
| **Alibaba Cloud ASR**   | Todas las Plataformas   | -                                          | Nube       | Evita problemas de red en China continental |

## 🚀 Soporte para Modelos de Lenguaje Grande

✅ Compatible con todos los servicios de modelos de lenguaje grande en la nube/local que cumplen con las **especificaciones de la API de OpenAI**, incluyendo pero no limitado a:

- OpenAI
- Gemini
- DeepSeek
- Tongyi Qianwen
- Modelos de código abierto desplegados localmente
- Otros servicios de API compatibles con el formato de OpenAI

## 🎤 Soporte TTS Texto a Voz

- Servicio de Voz de Alibaba Cloud
- OpenAI TTS

## Soporte de Idiomas

Idiomas de entrada soportados: Chino, Inglés, Japonés, Alemán, Turco, Coreano, Ruso, Malayo (en continuo aumento)

Idiomas de traducción soportados: Inglés, Chino, Ruso, Español, Francés y 101 otros idiomas

## Vista Previa de la Interfaz

![Vista Previa de la Interfaz](/docs/images/ui_desktop_light.png)
![Vista Previa de la Interfaz](/docs/images/ui_desktop_dark.png)

## 🚀 Inicio Rápido

Puedes hacer preguntas en el [Deepwiki de KrillinAI](https://deepwiki.com/krillinai/KrillinAI). Indexa los archivos en el repositorio, por lo que puedes encontrar respuestas rápidamente.

### Pasos Básicos

Primero, descarga el archivo ejecutable que coincida con el sistema de tu dispositivo desde el [Release](https://github.com/KrillinAI/KrillinAI/releases), luego sigue el tutorial a continuación para elegir entre la versión de escritorio o la versión no de escritorio. Coloca la descarga del software en una carpeta vacía, ya que ejecutarlo generará algunos directorios, y mantenerlo en una carpeta vacía facilitará la gestión.

【Si es la versión de escritorio, es decir, el archivo de lanzamiento con "desktop," consulta aquí】
_La versión de escritorio se ha lanzado recientemente para abordar los problemas de los nuevos usuarios que luchan por editar correctamente los archivos de configuración, y hay algunos errores que se están actualizando continuamente._

1. Haz doble clic en el archivo para comenzar a usarlo (la versión de escritorio también requiere configuración dentro del software)

【Si es la versión no de escritorio, es decir, el archivo de lanzamiento sin "desktop," consulta aquí】
_La versión no de escritorio es la versión inicial, que tiene una configuración más compleja pero es estable en funcionalidad y adecuada para el despliegue en servidores, ya que proporciona una interfaz de usuario en formato web._

1. Crea una carpeta `config` dentro de la carpeta, luego crea un archivo `config.toml` en la carpeta `config`. Copia el contenido del archivo `config-example.toml` del directorio `config` del código fuente en `config.toml`, y completa tu información de configuración según los comentarios.
2. Haz doble clic o ejecuta el archivo ejecutable en la terminal para iniciar el servicio
3. Abre tu navegador e ingresa `http://127.0.0.1:8888` para comenzar a usarlo (reemplaza 8888 con el puerto que especificaste en el archivo de configuración)

### Para: Usuarios de macOS

【Si es la versión de escritorio, es decir, el archivo de lanzamiento con "desktop," consulta aquí】
Debido a problemas de firma, la versión de escritorio actualmente no se puede ejecutar con doble clic ni instalar a través de dmg; necesitas confiar manualmente en la aplicación. El método es el siguiente:

1. Abre la terminal en el directorio donde se encuentra el archivo ejecutable (suponiendo que el nombre del archivo es KrillinAI_1.0.0_desktop_macOS_arm64)
2. Ejecuta los siguientes comandos en orden:

```
sudo xattr -cr ./KrillinAI_1.0.0_desktop_macOS_arm64
sudo chmod +x ./KrillinAI_1.0.0_desktop_macOS_arm64 
./KrillinAI_1.0.0_desktop_macOS_arm64
```

【Si es la versión no de escritorio, es decir, el archivo de lanzamiento sin "desktop," consulta aquí】
Este software no está firmado, por lo que al ejecutarlo en macOS, después de completar la configuración del archivo en los "Pasos Básicos," también necesitas confiar manualmente en la aplicación. El método es el siguiente:

1. Abre la terminal en el directorio donde se encuentra el archivo ejecutable (suponiendo que el nombre del archivo es KrillinAI_1.0.0_macOS_arm64)
2. Ejecuta los siguientes comandos en orden:
   ```
   sudo xattr -rd com.apple.quarantine ./KrillinAI_1.0.0_macOS_arm64
   sudo chmod +x ./KrillinAI_1.0.0_macOS_arm64
   ./KrillinAI_1.0.0_macOS_arm64
   ```
   
   Esto iniciará el servicio

### Despliegue en Docker

Este proyecto soporta el despliegue en Docker; por favor consulta las [Instrucciones de Despliegue en Docker](./docker.md)

Basado en el archivo de configuración proporcionado, aquí está la sección actualizada "Ayuda de Configuración (Debe Leer)" para tu archivo README:

### Ayuda de Configuración (Debe Leer)

El archivo de configuración se divide en varias secciones: `[app]`, `[server]`, `[llm]`, `[transcribe]`, y `[tts]`. Una tarea se compone de reconocimiento de voz (`transcribe`) + traducción de modelo grande (`llm`) + servicios de voz opcionales (`tts`). Entender esto te ayudará a comprender mejor el archivo de configuración.

**Configuración Más Fácil y Rápida:**

**Solo para Traducción de Subtítulos:**
   * En la sección `[transcribe]`, establece `provider.name` en `openai`.
   * Luego solo necesitarás llenar tu clave API de OpenAI en el bloque `[llm]` para comenzar a realizar traducciones de subtítulos. `app.proxy`, `model`, y `openai.base_url` se pueden llenar según sea necesario.

**Costo, Velocidad y Calidad Balanceados (Usando Reconocimiento de Voz Local):**

* En la sección `[transcribe]`, establece `provider.name` en `fasterwhisper`.
* Establece `transcribe.fasterwhisper.model` en `large-v2`.
* Completa tu configuración de modelo de lenguaje grande en el bloque `[llm]`.
* El modelo local requerido se descargará e instalará automáticamente.

**Configuración de Texto a Voz (TTS) (Opcional):**

* La configuración de TTS es opcional.
* Primero, establece `provider.name` en la sección `[tts]` (por ejemplo, `aliyun` o `openai`).
* Luego, completa el bloque de configuración correspondiente para el proveedor seleccionado. Por ejemplo, si eliges `aliyun`, debes llenar la sección `[tts.aliyun]`.
* Los códigos de voz en la interfaz de usuario deben elegirse según la documentación del proveedor seleccionado.
* **Nota:** Si planeas usar la función de clonación de voz, debes seleccionar `aliyun` como proveedor de TTS.

**Configuración de Alibaba Cloud:**

* Para detalles sobre cómo obtener el `AccessKey`, `Bucket`, y `AppKey` necesarios para los servicios de Alibaba Cloud, consulta las [Instrucciones de Configuración de Alibaba Cloud](https://www.google.com/search?q=./aliyun.md). Los campos repetidos para AccessKey, etc., están diseñados para mantener una estructura de configuración clara.

## Preguntas Frecuentes

Por favor visita [Preguntas Frecuentes](./faq.md)

## Directrices de Contribución

1. No envíes archivos inútiles, como .vscode, .idea, etc.; por favor usa .gitignore para filtrarlos.
2. No envíes config.toml; en su lugar, envía config-example.toml.

## Contáctanos

1. Únete a nuestro grupo de QQ para preguntas: 754069680
2. Sigue nuestras cuentas en redes sociales, [Bilibili](https://space.bilibili.com/242124650), donde compartimos contenido de calidad en el campo de la tecnología de IA todos los días.

## Historial de Estrellas

[![Gráfico de Historial de Estrellas](https://api.star-history.com/svg?repos=KrillinAI/KrillinAI&type=Date)](https://star-history.com/#KrillinAI/KrillinAI&Date)