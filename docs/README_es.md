<div align="center">
  <img src="../docs/images/logo.png" alt="KrillinAI" height="90">


  # Herramienta de Traducción y Doblaje de Audio y Video con IA

<a href="https://trendshift.io/repositories/13360" target="_blank"><img src="https://trendshift.io/api/badge/repositories/13360" alt="krillinai%2FKrillinAI | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

  **[English](../README.md)｜[简体中文](../docs/README_zh.md)｜[日本語](../docs/README_jp.md)｜[한국어](../docs/README_kr.md)｜[Tiếng Việt](../docs/README_vi.md)｜[Français](../docs/README_fr.md)｜[Deutsch](../docs/README_de.md)｜[Español](../docs/README_es.md)｜[Português](../docs/README_pt.md)｜[Русский](../docs/README_rus.md)｜[اللغة العربية](../docs/README_ar.md)**

  [![Twitter](https://img.shields.io/badge/Twitter-KrillinAI-orange?logo=twitter)](https://x.com/KrillinAI)
  [![Discord](https://img.shields.io/discord/1333374141092331605?label=Discord&logo=discord&style=flat-square)](https://discord.gg/kYRUEQus)
[![Bilibili](https://img.shields.io/badge/dynamic/json?label=Bilibili&query=%24.data.follower&suffix=%20followers&url=https%3A%2F%2Fapi.bilibili.com%2Fx%2Frelation%2Fstat%3Fvmid%3D242124650&logo=bilibili&color=00A1D6&labelColor=FE7398&logoColor=FFFFFF)](https://space.bilibili.com/242124650)

</div>

### 📢 Nueva Versión para Escritorio Win y Mac - Bienvenidos a Probar y Enviar Feedback

## Resumen

Krillin AI es una solución todo-en-uno para la localización y mejora de vídeos sin esfuerzo. Esta herramienta minimalista pero potente maneja todo, desde traducción, doblaje hasta clonación de voz y formato, convirtiendo vídeos entre modos horizontal y vertical de forma fluida para una visualización óptima en todas las plataformas de contenido (YouTube, TikTok, Bilibili, Douyin, WeChat Channel, RedNote, Kuaishou). Con su flujo de trabajo integral, Krillin AI transforma material sin editar en contenido pulido y listo para plataformas con solo unos clics.

## Funcionalidades Clave:

🎯 **Inicio con Un Clic** - Lanza tu flujo de trabajo al instante. ¡Nueva versión de escritorio disponible, más fácil de usar!

📥 **Descarga de Videos** - Compatible con yt-dlp y carga de archivos locales

📜 **Subtítulos Precisos** - Reconocimiento de alta precisión con tecnología Whisper

🧠 **Segmentación Inteligente** - Fragmentación y alineación de subtítulos basada en modelos de lenguaje (LLM)

🌍 **Traducción Profesional** - Traducción a nivel de párrafo para mayor coherencia

🔄 **Reemplazo de Términos** - Cambio de vocabulario específico por dominio con un clic

🎙️ **Doblaje y Clonación de Voz** - Voces seleccionadas de CosyVoice o clonación personalizada

🎬 **Composición de Video** - Formateo automático para diseños horizontales/verticales

## Ejemplo Práctico
La siguiente imagen demuestra el resultado obtenido después de insertar automáticamente en la pista de tiempo el archivo de subtítulos generado con un solo clic a partir de un vídeo local de 46 minutos. No se realizó ningún ajuste manual. Los subtítulos no presentan omisiones ni solapamientos, la segmentación de frases es natural y la calidad de traducción es notablemente alta.
![Alignment](../docs/images/alignment.png)

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

### Formato Vertical
---
https://github.com/user-attachments/assets/c2c7b528-0ef8-4ba9-b8ac-f9f92f6d4e71

</td>

</tr>
</table>

## 🔍 Soporte de Reconocimiento de Voz
_**Todos los modelos locales en la siguiente tabla soportan instalación automática de archivos ejecutables + archivos de modelo. Solo haz tu selección y KrillinAI se encargará de todo lo demás.**_

| Servicio         | Plataformas Soportadas	          | Opciones de Modelo	                    | Local/Nube	 | Notas          |
|-----------------|------------------------------|-----------------------------------|-------------|----------------|
| **OpenAI Whisper** | Multiplataforma       | -                                 | Nube       | Rápido con excelentes resultados |
| **FasterWhisper** | Windows/Linux     | `tiny`/`medium`/`large-v2` (recomendado medium+) | Local    | Mayor velocidad, sin sobrecarga de servicios en la nube |
| **WhisperKit**    | macOS (solo Apple Silicon)   | `large-v2`                        | Local       | Optimización nativa para chips Apple |
| **Alibaba Cloud ASR** | Multiplataforma   | -                                 | Nube       | Evita problemas de red en China continental |

## 🚀 Soporte para Modelos de Lenguaje Grande

✅ Compatible con todos los servicios **compatibles con API OpenAI** locales/en la nube incluyendo pero no limitado a:
- OpenAI
- DeepSeek
- Qwen (Tongyi Qianwen)
- Modelos de código abierto autoalojados
- Otros servicios API compatibles con formato OpenAI

## 🌍 Idiomas Soportados
Idiomas de entrada: Chino, Inglés, Japonés, Alemán, Turco (se están añadiendo más idiomas)
Idiomas de traducción: **101** idiomas soportados, incluyendo Inglés, Chino, Ruso, Español, Francés, etc.

## Vista Previa de la Interfaz
![ui preview](../docs/images/ui_desktop.png)

## 🚀 Inicio Rápido
### Pasos Básicos
Primero, descarga el archivo ejecutable de la versión Release que coincida con el sistema de tu dispositivo. Sigue las instrucciones a continuación para elegir entre la versión de escritorio o la versión no-de-escritorio, luego coloca el software en una carpeta vacía. Al ejecutar el programa se generarán algunos directorios, por lo que mantenerlo en una carpeta vacía facilita su gestión.

[Para la versión de escritorio (archivos release con "desktop" en el nombre), consulta aquí]
La versión de escritorio es de reciente lanzamiento para solucionar la dificultad que tienen los principiantes al editar archivos de configuración. Aún contiene algunos errores y se actualiza continuamente.

Haz doble clic en el archivo para comenzar a usarlo.

[Para la versión no-de-escritorio (archivos release sin "desktop" en el nombre), consulta aquí]
La versión no-de-escritorio es el lanzamiento original, con configuración más compleja pero funcionalidad estable. También es adecuada para despliegue en servidores, ya que proporciona una interfaz web.

Crea una carpeta llamada config en el directorio principal, luego crea un archivo config.toml dentro de esta. Copia el contenido del archivo config-example.toml (ubicado en el directorio config del código fuente) a tu archivo config.toml y completa los detalles de configuración. (Si deseas usar modelos de OpenAI pero no sabes cómo obtener una clave, puedes unirte al grupo para obtener acceso de prueba gratuito).

Ejecuta el archivo haciendo doble clic o inicia el servicio desde la terminal con el comando correspondiente.

Abre tu navegador e ingresa http://127.0.0.1:8888 para comenzar a usarlo. (Reemplaza 8888 con el número de puerto que especificaste en el archivo de configuración).

### Para usuarios de macOS
[Para la versión de escritorio (archivos release con "desktop" en el nombre), consulta aquí]
El método actual de empaquetado para la versión de escritorio no permite la ejecución directa al hacer doble clic ni la instalación mediante DMG debido a problemas de certificación. Se requiere configuración manual de confianza como se indica a continuación:

1. Abre el directorio que contiene el archivo ejecutable (asumiendo que el nombre del archivo es KrillinAI_1.0.0_desktop_macOS_arm64) en Terminal

2. Ejecuta los siguientes comandos en secuencia:

```
sudo xattr -cr ./KrillinAI_1.0.0_desktop_macOS_arm64  
sudo chmod +x ./KrillinAI_1.0.0_desktop_macOS_arm64  
./KrillinAI_1.0.0_desktop_macOS_arm64  
```

[Para la versión no de escritorio (archivos release sin "desktop" en el nombre), consulta aquí]
Este software no está certificado, por lo que después de completar la configuración de archivos en los "Pasos Básicos", necesitarás autorizar manualmente la aplicación en macOS. Sigue estos pasos:
1. Abre la terminal y navega al directorio donde se encuentra el archivo ejecutable (asumiendo que el nombre del archivo es KrillinAI_1.0.0_macOS_arm64).
2. Ejecuta los siguientes comandos en secuencia:
```
sudo xattr -rd com.apple.quarantine ./KrillinAI_1.0.0_macOS_arm64
sudo chmod +x ./KrillinAI_1.0.0_macOS_arm64
./KrillinAI_1.0.0_macOS_arm64
```
Esto iniciará el servicio.

### Implementación con Docker
Este proyecto admite implementación con Docker. Consulta las [Docker Deployment Instructions](../docs/docker.md).

### Instrucciones de Configuración de Cookies

Si experimentas fallos al descargar videos, consulta las [Cookie Configuration Instructions](../docs/get_cookies.md) para configurar tu información de cookies.

### Ayuda para Configuración
El método más rápido y conveniente para configurar:
* Select `openai` for both `transcription_provider` and `llm_provider`. In this way, you only need to fill in `openai.apikey` in the following three major configuration item categories, namely `openai`, `local_model`, and `aliyun`, and then you can conduct subtitle translation. (Fill in `app.proxy`, `model` and `openai.base_url` as per your own situation.)

El método de configuración para usar el modelo local de reconocimiento de voz (macOS no es compatible por el momento) (una opción que equilibra costo, velocidad y calidad):
* Configura fasterwhisper para transcription_provider y openai para llm_provider. De esta forma, solo necesitarás completar openai.apikey y local_model.faster_whisper en estas dos categorías principales de configuración: openai y local_model, y podrás realizar traducciones de subtítulos. El modelo local se descargará automáticamente. (Lo mismo aplica para app.proxy y openai.base_url como se mencionó anteriormente).

Los siguientes casos de uso requieren configuración con Alibaba Cloud:
* Si llm_provider se configura como aliyun, indica que se usará el servicio de modelos grandes de Alibaba Cloud. Por lo tanto, será necesario configurar el ítem aliyun.bailian.
* Si transcription_provider se configura como aliyun, o si se habilita la función de "doblaje de voz" al iniciar una tarea, se utilizará el servicio de voz de Alibaba Cloud. En consecuencia, será necesario completar la configuración del ítem aliyun.speech.
* Si se habilita la función de "doblaje de voz" y simultáneamente se suben archivos de audio locales para clonación de timbre vocal, también se usará el servicio de almacenamiento en la nube OSS de Alibaba Cloud. Por lo tanto, será necesario completar la configuración del ítem aliyun.oss.
Guía de configuración: [Alibaba Cloud Configuration Instructions](../docs/aliyun.md)

## Preguntas Frecuentes
Consulta las [Frequently Asked Questions](../docs/faq.md)

## Directrices de Contribución
- No envíes archivos innecesarios como .vscode, .idea, etc. Utiliza adecuadamente .gitignore para filtrarlos.
- No envíes config.toml; en su lugar, envía config-example.toml.

## Historial de Estrellas

[![Star History Chart](https://api.star-history.com/svg?repos=krillinai/KrillinAI&type=Date)](https://star-history.com/#krillinai/KrillinAI&Date)

