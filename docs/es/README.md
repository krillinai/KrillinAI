<div align="center">
  <img src="/docs/images/logo.png" alt="KrillinAI" height="90">

  # Herramienta de traducción y doblaje de videos AI de despliegue minimalista

  <a href="https://trendshift.io/repositories/13360" target="_blank"><img src="https://trendshift.io/api/badge/repositories/13360" alt="krillinai%2FKrillinAI | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

  **[English](/README.md)｜[简体中文](/docs/zh/README.md)｜[日本語](/docs/jp/README.md)｜[한국어](/docs/kr/README.md)｜[Tiếng Việt](/docs/vi/README.md)｜[Français](/docs/fr/README.md)｜[Deutsch](/docs/de/README.md)｜[Español](/docs/es/README.md)｜[Português](/docs/pt/README.md)｜[Русский](/docs/rus/README.md)｜[اللغة العربية](/docs/ar/README.md)**

[![Twitter](https://img.shields.io/badge/Twitter-KrillinAI-orange?logo=twitter)](https://x.com/KrillinAI)
[![Discord](https://img.shields.io/discord/1333374141092331605?label=Discord&logo=discord&style=flat-square)](https://discord.gg/sKUAsHfy)
[![QQ 群](https://img.shields.io/badge/QQ%20群-754069680-green?logo=tencent-qq)](https://jq.qq.com/?_wv=1027&k=754069680)
[![Bilibili](https://img.shields.io/badge/dynamic/json?label=Bilibili&query=%24.data.follower&suffix=粉丝&url=https%3A%2F%2Fapi.bilibili.com%2Fx%2Frelation%2Fstat%3Fvmid%3D242124650&logo=bilibili&color=00A1D6&labelColor=FE7398&logoColor=FFFFFF)](https://space.bilibili.com/242124650)

</div>

### 📢 Nueva versión para escritorio en win&mac ¡Bienvenido a probar y dar feedback! [La documentación está un poco desactualizada, se está actualizando continuamente]

 ## Introducción al proyecto  

Krillin AI es una solución integral para la localización y mejora de audio y video. Esta herramienta simple pero poderosa combina traducción de audio y video, doblaje y clonación de voz, soportando formatos de salida en horizontal y vertical, asegurando una presentación perfecta en todas las plataformas principales (Bilibili, Xiaohongshu, Douyin, WeChat Video, Kuaishou, YouTube, TikTok, etc.). A través de un flujo de trabajo de extremo a extremo, Krillin AI puede transformar materiales originales en contenido multiplataforma listo para usar con solo unos pocos clics.

## Características y funciones principales:
🎯 **Inicio con un clic**: Sin configuraciones de entorno complicadas, instalación automática de dependencias, ¡listo para usar de inmediato! Nueva versión de escritorio, ¡más conveniente!

📥 **Obtención de videos**: Soporta descarga con yt-dlp o carga de archivos locales.

📜 **Reconocimiento preciso**: Reconocimiento de voz de alta precisión basado en Whisper.

🧠 **Segmentación inteligente**: Uso de LLM para segmentar y alinear subtítulos.

🔄 **Reemplazo de términos**: Reemplazo de vocabulario especializado con un clic.

🌍 **Traducción profesional**: Traducción a nivel de párrafo basada en LLM que mantiene la coherencia semántica.

🎙️ **Clonación de voz**: Ofrece tonos seleccionados de CosyVoice o clonación de tonos personalizados.

🎬 **Composición de video**: Procesamiento automático de videos en formato horizontal y vertical y diseño de subtítulos.

## Ejemplo de resultados
La imagen a continuación muestra el efecto de un archivo de subtítulos generado tras importar un video local de 46 minutos y ejecutar con un clic, sin ajustes manuales. Sin pérdidas, superposiciones, con pausas naturales y una calidad de traducción muy alta.
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

### Vertical
---
https://github.com/user-attachments/assets/c2c7b528-0ef8-4ba9-b8ac-f9f92f6d4e71

</td>

</tr>
</table>

## 🔍 Soporte para servicios de reconocimiento de voz
_**Todos los modelos locales en la tabla a continuación soportan instalación automática de archivos ejecutables + archivos de modelo, solo necesitas elegir, KrillinAI se encargará del resto.**_

| Fuente de servicio    | Plataformas soportadas | Opciones de modelo                         | Local/Nube | Notas                  |
| --------------------- | ---------------------- | ------------------------------------------ | ---------- | ---------------------- |
| **OpenAI Whisper**    | Todas las plataformas   | -                                          | Nube       | Rápido y efectivo      |
| **FasterWhisper**     | Windows/Linux          | `tiny`/`medium`/`large-v2` (recomendado medium+) | Local      | Más rápido, sin costos de nube |
| **WhisperKit**        | macOS (solo para chips M) | `large-v2`                               | Local      | Optimización nativa para chips Apple |
| **Aliyun ASR**        | Todas las plataformas   | -                                          | Nube       | Evita problemas de red en China continental |

## 🚀 Soporte para modelos de lenguaje grande

✅ Compatible con todos los servicios de modelos de lenguaje grandes en la nube/local que cumplen con las **especificaciones de la API de OpenAI**, incluyendo pero no limitado a:
- OpenAI
- DeepSeek
- Tongyi Qianwen
- Modelos de código abierto desplegados localmente
- Otros servicios de API compatibles con el formato de OpenAI

## Soporte de idiomas
Idiomas de entrada soportados: chino, inglés, japonés, alemán, turco, coreano, ruso, malayo (en continuo aumento)

Idiomas de traducción soportados: inglés, chino, ruso, español, francés y otros 101 idiomas.

## Vista previa de la interfaz
![Vista previa de la interfaz](/docs/images/ui_desktop.png)

## 🚀 Comenzar rápidamente
### Pasos básicos
Primero descarga el [Release](https://github.com/krillinai/KrillinAI/releases) correspondiente a tu sistema operativo, sigue el tutorial a continuación para elegir entre la versión de escritorio o no de escritorio, y coloca el software en una carpeta vacía, ya que al ejecutarlo se generarán algunos directorios, lo que será más fácil de gestionar en una carpeta vacía.  

【Si es la versión de escritorio, es decir, el archivo release que contiene desktop, mira aquí】  
_La versión de escritorio es nueva, lanzada para resolver problemas de edición de archivos de configuración para nuevos usuarios, aún hay algunos errores, se está actualizando continuamente._
1. Haz doble clic en el archivo para comenzar a usarlo (la versión de escritorio también necesita configuración dentro del software).

【Si es la versión no de escritorio, es decir, el archivo release que no contiene desktop, mira aquí】  
_La versión no de escritorio es la versión inicial, con configuraciones más complejas, pero funciones estables, adecuada para despliegue en servidores, ya que proporcionará una interfaz de usuario a través de la web._
1. Crea una carpeta `config` dentro de la carpeta, luego crea un archivo `config.toml` dentro de la carpeta `config`, copia el contenido del archivo `config-example.toml` en el directorio de código fuente en `config` y completa tu información de configuración.
2. Haz doble clic o ejecuta el archivo ejecutable en la terminal para iniciar el servicio.
3. Abre el navegador e ingresa `http://127.0.0.1:8888` para comenzar a usarlo (reemplaza 8888 con el puerto que hayas configurado en el archivo de configuración).

### Para: usuarios de macOS
【Si es la versión de escritorio, es decir, el archivo release que contiene desktop, mira aquí】  
Actualmente, debido a problemas de firma, la versión de escritorio no puede ejecutarse directamente con un doble clic o instalación de dmg, se necesita confiar manualmente en la aplicación, el método es el siguiente:
1. Abre el archivo ejecutable en la terminal (supongamos que el nombre del archivo es KrillinAI_1.0.0_desktop_macOS_arm64) en el directorio donde se encuentra.
2. Ejecuta los siguientes comandos uno por uno:
```
sudo xattr -cr ./KrillinAI_1.0.0_desktop_macOS_arm64
sudo chmod +x ./KrillinAI_1.0.0_desktop_macOS_arm64 
./KrillinAI_1.0.0_desktop_macOS_arm64
```

【Si es la versión no de escritorio, es decir, el archivo release que no contiene desktop, mira aquí】  
Este software no tiene firma, por lo que al ejecutarse en macOS, después de completar la configuración de archivos en "Pasos básicos", también necesitas confiar manualmente en la aplicación, el método es el siguiente:
1. Abre el archivo ejecutable en la terminal (supongamos que el nombre del archivo es KrillinAI_1.0.0_macOS_arm64) en el directorio donde se encuentra.
2. Ejecuta los siguientes comandos uno por uno:
   ```
    sudo xattr -rd com.apple.quarantine ./KrillinAI_1.0.0_macOS_arm64
    sudo chmod +x ./KrillinAI_1.0.0_macOS_arm64
    ./KrillinAI_1.0.0_macOS_arm64
    ```
    Esto iniciará el servicio.

### Despliegue en Docker
Este proyecto soporta despliegue en Docker, por favor consulta las [Instrucciones de despliegue en Docker](./docker.md).

### Instrucciones de configuración de cookies (no obligatorio)

Si encuentras problemas al descargar videos,

por favor consulta las [Instrucciones de configuración de cookies](./get_cookies.md) para configurar tu información de cookies.

### Ayuda de configuración (imprescindible)
La forma más rápida y conveniente de configurar:
* Selecciona `openai` para `transcription_provider` y `llm_provider`, así en las categorías de configuración `openai`, `local_model`, `aliyun` solo necesitas llenar `openai.apikey` para realizar la traducción de subtítulos. (`app.proxy`, `model` y `openai.base_url` se pueden completar según tu situación).

Configuración para usar modelos de reconocimiento de voz locales (no soportado en macOS) (una opción que equilibra costo, velocidad y calidad):
* Rellena `transcription_provider` con `fasterwhisper` y `llm_provider` con `openai`, así en las categorías de configuración `openai` y `local_model` solo necesitas llenar `openai.apikey` y `local_model.faster_whisper` para realizar la traducción de subtítulos, el modelo local se descargará automáticamente. (`app.proxy` y `openai.base_url` igual).

Las siguientes situaciones requieren configuración de Aliyun:
* Si `llm_provider` está configurado como `aliyun`, necesitarás usar el servicio de modelo grande de Aliyun, por lo que deberás configurar el ítem `aliyun.bailian`.
* Si `transcription_provider` está configurado como `aliyun`, o si has activado la función de "doblaje" al iniciar la tarea, necesitarás usar el servicio de voz de Aliyun, por lo que deberás llenar el ítem `aliyun.speech`.
* Si has activado la función de "doblaje" y has subido audio local para clonación de voz, también necesitarás usar el servicio de almacenamiento en la nube OSS de Aliyun, por lo que deberás llenar el ítem `aliyun.oss`.  
Ayuda de configuración de Aliyun: [Instrucciones de configuración de Aliyun](./aliyun.md).

## Preguntas frecuentes

Por favor visita [Preguntas frecuentes](./faq.md).

## Normas de contribución
1. No envíes archivos innecesarios, como .vscode, .idea, etc., usa .gitignore para filtrarlos.
2. No envíes config.toml, sino usa config-example.toml para enviar.

## Contáctanos
1. Únete a nuestro grupo de QQ para resolver dudas: 754069680.
2. Sigue nuestras cuentas en redes sociales, [Bilibili](https://space.bilibili.com/242124650), compartimos contenido de calidad en el campo de la tecnología AI todos los días.

## Historial de estrellas

[![Gráfico de historial de estrellas](https://api.star-history.com/svg?repos=krillinai/KrillinAI&type=Date)](https://star-history.com/#krillinai/KrillinAI&Date)