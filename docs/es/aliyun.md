## Requisitos previos
Se necesita tener una cuenta de [Alibaba Cloud](https://www.aliyun.com) y haber completado la verificación de identidad, la mayoría de los servicios tienen un límite gratuito.

## Obtención de `access_key_id` y `access_key_secret` de Alibaba Cloud
1. Accede a la [página de gestión de AccessKey de Alibaba Cloud](https://ram.console.aliyun.com/profile/access-keys).
2. Haz clic en crear AccessKey, si es necesario, selecciona el método de uso, elige "Usar en un entorno de desarrollo local".
![Clave de acceso de Alibaba Cloud](/docs/images/aliyun_accesskey_1.png)
3. Guarda de manera segura, lo mejor es copiarlo en un archivo local.

## Activación del servicio de voz de Alibaba Cloud
1. Accede a la [página de gestión del servicio de voz de Alibaba Cloud](https://nls-portal.console.aliyun.com/applist), la primera vez que entres necesitarás activar el servicio.
2. Haz clic en crear proyecto.
![Voz de Alibaba Cloud](/docs/images/aliyun_speech_1.png)
3. Selecciona las funciones y actívalas.
![Voz de Alibaba Cloud](/docs/images/aliyun_speech_2.png)
4. "Síntesis de voz de texto en streaming (modelo grande CosyVoice)" necesita ser actualizado a la versión comercial, otros servicios pueden usar la versión de prueba gratuita.
![Voz de Alibaba Cloud](/docs/images/aliyun_speech_3.png)
5. Copia la clave de la aplicación.
![Voz de Alibaba Cloud](/docs/images/aliyun_speech_4.png)

## Activación del servicio OSS de Alibaba Cloud
1. Accede a la [consola del servicio de almacenamiento de objetos de Alibaba Cloud](https://oss.console.aliyun.com/overview), la primera vez que entres necesitarás activar el servicio.
2. En el lado izquierdo, selecciona la lista de Buckets y luego haz clic en crear.
![OSS de Alibaba Cloud](/docs/images/aliyun_oss_1.png)
3. Selecciona creación rápida, completa un nombre de Bucket que cumpla con los requisitos y selecciona la región **Shanghái**, completa la creación (el nombre que ingreses aquí será el valor de la configuración `aliyun.oss.bucket`).
![OSS de Alibaba Cloud](/docs/images/aliyun_oss_2.png)
4. Una vez creado, accede al Bucket.
![OSS de Alibaba Cloud](/docs/images/aliyun_oss_3.png)
5. Desactiva el interruptor de "Bloquear acceso público" y establece los permisos de lectura y escritura en "Lectura pública".
![OSS de Alibaba Cloud](/docs/images/aliyun_oss_4.png)
![OSS de Alibaba Cloud](/docs/images/aliyun_oss_5.png)