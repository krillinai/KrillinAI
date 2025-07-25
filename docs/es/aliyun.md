## Requisitos previos
Necesitas tener una cuenta de [Alibaba Cloud](https://www.aliyun.com) y completar la verificación de nombre real. La mayoría de los servicios tienen cuotas gratuitas.

## Obtención de `access_key_id` y `access_key_secret` de Alibaba Cloud
1. Ve a la [página de gestión de AccessKey de Alibaba Cloud](https://ram.console.aliyun.com/profile/access-keys).
2. Haz clic en "Crear AccessKey". Si es necesario, selecciona el método de uso como "Usado en el entorno de desarrollo local".
![Clave de acceso de Alibaba Cloud](/docs/images/aliyun_accesskey_1.png)
3. Mantenlo a salvo; lo mejor es copiarlo en un archivo local para su almacenamiento.

## Activación del Servicio de Voz de Alibaba Cloud
1. Ve a la [página de gestión del Servicio de Voz de Alibaba Cloud](https://nls-portal.console.aliyun.com/applist). Necesitas activar el servicio en tu primera visita.
2. Haz clic en "Crear Proyecto".
![Voz de Alibaba Cloud](/docs/images/aliyun_speech_1.png)
3. Selecciona las características y actívalas.
![Voz de Alibaba Cloud](/docs/images/aliyun_speech_2.png)
4. El "Texto a Voz en Streaming (Modelo Grande CosyVoice)" necesita ser actualizado a la versión comercial; otros servicios pueden usar la versión de prueba gratuita.
![Voz de Alibaba Cloud](/docs/images/aliyun_speech_3.png)
5. Simplemente copia la clave de la aplicación.
![Voz de Alibaba Cloud](/docs/images/aliyun_speech_4.png)

## Activación del Servicio OSS de Alibaba Cloud
1. Ve a la [Consola del Servicio de Almacenamiento de Objetos de Alibaba Cloud](https://oss.console.aliyun.com/overview). Necesitas activar el servicio en tu primera visita.
2. Selecciona la lista de Buckets a la izquierda, luego haz clic en "Crear".
![OSS de Alibaba Cloud](/docs/images/aliyun_oss_1.png)
3. Elige "Creación Rápida", completa un nombre de Bucket conforme y selecciona la región **Shanghái** para completar la creación (el nombre que ingreses aquí será el valor para el ítem de configuración `aliyun.oss.bucket`).
![OSS de Alibaba Cloud](/docs/images/aliyun_oss_2.png)
4. Después de la creación, entra en el Bucket.
![OSS de Alibaba Cloud](/docs/images/aliyun_oss_3.png)
5. Apaga el interruptor de "Bloquear Acceso Público" y establece los permisos de lectura y escritura en "Lectura Pública".
![OSS de Alibaba Cloud](/docs/images/aliyun_oss_4.png)
![OSS de Alibaba Cloud](/docs/images/aliyun_oss_5.png)