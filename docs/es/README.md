<div align="center">
  <img src="/docs/images/logo.png" alt="KrillinAI" height="90">

  # Herramienta de traducción y doblaje de videos AI de despliegue minimalista

  <a href="https://trendshift.io/repositories/13360" target="_blank"><img src="https://trendshift.io/api/badge/repositories/13360" alt="krillinai%2FKrillinAI | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

  **[English](/README.md)｜[简体中文](/docs/zh/README.md)｜[日本語](/docs/jp/README.md)｜[한국어](/docs/kr/README.md)｜[Tiếng Việt](/docs/vi/README.md)｜[Français](/docs/fr/README.md)｜[Deutsch](/docs/de/README.md)｜[Español](/docs/es/README.md)｜[Português](/docs/pt/README.md)｜[Русский](/docs/rus/README.md)｜[اللغة العربية](/docs/ar/README.md)**

[![Twitter](https://img.shields.io/badge/Twitter-KrillinAI-orange?logo=twitter)](https://x.com/KrillinAI)
[![QQ 群](https://img.shields.io/badge/QQ%20群-754069680-green?logo=tencent-qq)](https://jq.qq.com/?_wv=1027&k=754069680)
[![Bilibili](https://img.shields.io/badge/dynamic/json?label=Bilibili&query=%24.data.follower&suffix=粉丝&url=https%3A%2F%2Fapi.bilibili.com%2Fx%2Frelation%2Fstat%3Fvmid%3D242124650&logo=bilibili&color=00A1D6&labelColor=FE7398&logoColor=FFFFFF)](https://space.bilibili.com/242124650)

</div>

### 📢 Nueva versión para escritorio en win&mac, ¡bienvenidos a probar y dar feedback! [La documentación está un poco desactualizada, se está actualizando continuamente]

 ## Introducción al proyecto  

Krillin AI es una solución integral para la localización y mejora de audio y video. Esta herramienta simple pero poderosa combina traducción de audio y video, doblaje y clonación de voz, soportando formatos de salida en vertical y horizontal, asegurando una presentación perfecta en todas las plataformas principales (Bilibili, Xiaohongshu, Douyin, WeChat Video, Kuaishou, YouTube, TikTok, etc.). A través de un flujo de trabajo de extremo a extremo, Krillin AI puede transformar el material original en contenido multiplataforma listo para usar con solo unos pocos clics.

## Principales características y funciones:
🎯 **Inicio con un clic**: Sin configuraciones de entorno complicadas, instalación automática de dependencias, ¡listo para usar de inmediato! Nueva versión de escritorio, ¡más conveniente!

📥 **Obtención de videos**: Soporta descarga con yt-dlp o carga de archivos locales.

📜 **Reconocimiento preciso**: Reconocimiento de voz de alta precisión basado en Whisper.

🧠 **Segmentación inteligente**: Utiliza LLM para segmentar y alinear subtítulos.

🔄 **Reemplazo de términos**: Reemplazo de vocabulario especializado con un clic.

🌍 **Traducción profesional**: Traducción a nivel de párrafo basada en LLM que mantiene la coherencia semántica.

🎙️ **Clonación de voz**: Ofrece voces seleccionadas de CosyVoice o clonación de voces personalizadas.

🎬 **Composición de video**: Procesa automáticamente videos en formato horizontal y vertical y la disposición de subtítulos.

## Ejemplo de resultados
La imagen a continuación muestra el efecto de un archivo de subtítulos generado tras importar un video local de 46 minutos y ejecutar con un clic, sin ajustes manuales. Sin faltas, superposiciones, con pausas naturales y una calidad de traducción muy alta.
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

| Fuente de servicio       | Plataformas soportadas | Opciones de modelo                          | Local/Nube | Notas          |
|-------------------------|-----------------------|--------------------------------------------|------------|----------------|
| **OpenAI Whisper**      | Todas las plataformas  | -                                          | Nube       | Rápido y de buena calidad |
| **FasterWhisper**       | Windows/Linux         | `tiny`/`medium`/`large-v2` (recomendado medium+) | Local      | Más rápido, sin costos de nube |
| **WhisperKit**          | macOS (solo para chips M) | `large-v2`                               | Local      | Optimización nativa para chips Apple |
| **WhisperCpp**          | Todas las plataformas  | `large-v2`                               | Local      | Soporta todas las plataformas |
| **Aliyun ASR**          | Todas las plataformas  | -                                          | Nube       | Evita problemas de red en China continental |

## 🚀 Soporte para modelos de lenguaje grande

✅ Compatible con todos los servicios de modelos de lenguaje grande en la nube/local que cumplen con las **especificaciones de la API de OpenAI**, incluyendo pero no limitado a:
- OpenAI
- DeepSeek
- Tongyi Qianwen
- Modelos de código abierto desplegados localmente
- Otros servicios de API compatibles con el formato de OpenAI

## Soporte de idiomas
Idiomas de entrada soportados: chino, inglés, japonés, alemán, turco, coreano, ruso, malayo (en constante aumento)

Idiomas de traducción soportados: inglés, chino, ruso, español, francés y otros 101 idiomas.

## Vista previa de la interfaz
![Vista previa de la interfaz](/docs/images/ui_desktop.png)

## 🚀 Comenzar rápidamente
### Pasos básicos
Primero descarga el archivo ejecutable que coincida con tu sistema operativo en [Release](https://github.com/krillinai/KrillinAI/releases), elige entre la versión de escritorio o no de acuerdo con el tutorial a continuación, y colócalo en una carpeta vacía. Descarga el software en una carpeta vacía, ya que se generarán algunos directorios al ejecutarlo, y será más fácil de gestionar en una carpeta vacía.

【Si es la versión de escritorio, es decir, el archivo de release que lleva desktop, consulta aquí】  
_La versión de escritorio es nueva y se ha lanzado para resolver el problema de que los nuevos usuarios no pueden editar correctamente los archivos de configuración, aún hay algunos errores, se está actualizando continuamente._
1. Haz doble clic en el archivo para comenzar a usarlo (la versión de escritorio también necesita configuración, se configura dentro del software).

【Si es la versión no de escritorio, es decir, el archivo de release que no lleva desktop, consulta aquí】  
_La versión no de escritorio es la versión inicial, la configuración es más compleja, pero la funcionalidad es estable y es adecuada para el despliegue en servidores, ya que proporcionará una interfaz de usuario de forma web._
1. Crea una carpeta `config` dentro de la carpeta, luego crea un archivo `config.toml` dentro de la carpeta `config`, copia el contenido del archivo `config-example.toml` en el directorio de código fuente y pégalo en `config.toml`, y completa tu información de configuración.
2. Haz doble clic o ejecuta el archivo ejecutable en la terminal para iniciar el servicio.
3. Abre el navegador e ingresa `http://127.0.0.1:8888` para comenzar a usarlo (reemplaza 8888 con el puerto que ingresaste en el archivo de configuración).

### Para: usuarios de macOS
【Si es la versión de escritorio, es decir, el archivo de release que lleva desktop, consulta aquí】  
Actualmente, debido a problemas de firma, la versión de escritorio no puede ejecutarse directamente con un doble clic o instalación de dmg, necesitas confiar manualmente en la aplicación, el método es el siguiente:
1. Abre la terminal en el directorio donde se encuentra el archivo ejecutable (supongamos que el nombre del archivo es KrillinAI_1.0.0_desktop_macOS_arm64).
2. Ejecuta los siguientes comandos uno por uno:
```
sudo xattr -cr ./KrillinAI_1.0.0_desktop_macOS_arm64
sudo chmod +x ./KrillinAI_1.0.0_desktop_macOS_arm64 
./KrillinAI_1.0.0_desktop_macOS_arm64
```

【Si es la versión no de escritorio, es decir, el archivo de release que no lleva desktop, consulta aquí】  
Este software no tiene firma, por lo que al ejecutarlo en macOS, después de completar la configuración de archivos en "pasos básicos", también necesitas confiar manualmente en la aplicación, el método es el siguiente:
1. Abre la terminal en el directorio donde se encuentra el archivo ejecutable (supongamos que el nombre del archivo es KrillinAI_1.0.0_macOS_arm64).
2. Ejecuta los siguientes comandos uno por uno:
   ```
    sudo xattr -rd com.apple.quarantine ./KrillinAI_1.0.0_macOS_arm64
    sudo chmod +x ./KrillinAI_1.0.0_macOS_arm64
    ./KrillinAI_1.0.0_macOS_arm64
    ```
    Esto iniciará el servicio.

### Despliegue con Docker
Este proyecto soporta despliegue con Docker, por favor consulta [Instrucciones de despliegue con Docker](./docker.md).

### Instrucciones de configuración de Cookies (no obligatorio)

Si encuentras problemas al descargar videos,

por favor consulta [Instrucciones de configuración de Cookies](./get_cookies.md) para configurar tu información de Cookies.

### Ayuda de configuración (imprescindible)
La forma más rápida y conveniente de configurar:
* Selecciona `openai` para `transcription_provider` y `llm_provider`, así en las tres categorías de configuración `openai`, `local_model`, `aliyun` solo necesitas completar `openai.apikey` para realizar la traducción de subtítulos. (`app.proxy`, `model` y `openai.base_url` se pueden completar según tu situación).

Para usar un modelo de reconocimiento de voz local (no soportado en macOS) la forma de configuración es (considerando costo, velocidad y calidad):
* Completa `transcription_provider` con `fasterwhisper` y `llm_provider` con `openai`, así en las categorías de configuración `openai` y `local_model` solo necesitas completar `openai.apikey` y `local_model.faster_whisper` para realizar la traducción de subtítulos, el modelo local se descargará automáticamente. (`app.proxy` y `openai.base_url` igual que arriba).

Las siguientes situaciones requieren configuración de Aliyun:
* Si `llm_provider` está configurado como `aliyun`, necesitarás usar el servicio de modelo grande de Aliyun, por lo que necesitas completar la configuración de `aliyun.bailian`.
* Si `transcription_provider` está configurado como `aliyun`, o si activaste la función de "doblaje" al iniciar la tarea, necesitarás usar el servicio de voz de Aliyun, por lo que debes completar la configuración de `aliyun.speech`.
* Si activaste la función de "doblaje" y subiste audio local para clonación de voz, también necesitarás usar el servicio de almacenamiento en la nube OSS de Aliyun, por lo que debes completar la configuración de `aliyun.oss`.  
Ayuda de configuración de Aliyun: [Instrucciones de configuración de Aliyun](./aliyun.md).

## Preguntas frecuentes

Por favor consulta [Preguntas frecuentes](./faq.md).

## Normas de contribución
1. No envíes archivos innecesarios, como .vscode, .idea, etc., usa .gitignore para filtrarlos.
2. No envíes config.toml, sino usa config-example.toml para enviar.

## Contáctanos
1. Únete a nuestro grupo de QQ para resolver dudas: 754069680.
2. Sigue nuestras cuentas en redes sociales, [Bilibili](https://space.bilibili.com/242124650), compartimos contenido de calidad en el campo de la tecnología AI todos los días.

## Historial de estrellas

[![Gráfico de historial de estrellas](https://api.star-history.com/svg?repos=krillinai/KrillinAI&type=Date)](https://star-history.com/#krillinai/KrillinAI&Date)