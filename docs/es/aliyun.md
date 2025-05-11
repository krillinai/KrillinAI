## Requisitos previos
Se necesita tener una cuenta de [Alibaba Cloud](https://www.aliyun.com) y haber pasado la verificación de identidad. La mayoría de los servicios tienen un límite gratuito.

## Obtención de la clave de la plataforma Bailian de Alibaba Cloud
1. Inicie sesión en la [plataforma de servicios de modelos grandes Bailian de Alibaba Cloud](https://bailian.console.aliyun.com/), pase el mouse sobre el ícono del centro personal en la esquina superior derecha de la página y haga clic en API-KEY en el menú desplegable.
![Bailian](/docs/images/bailian_1.png)
2. En la barra de navegación izquierda, seleccione Todos los API-KEY o Mis API-KEY, y luego cree o consulte la clave API.

## Obtención de `access_key_id` y `access_key_secret` de Alibaba Cloud
1. Acceda a la [página de gestión de AccessKey de Alibaba Cloud](https://ram.console.aliyun.com/profile/access-keys).
2. Haga clic en Crear AccessKey, y si es necesario, seleccione el método de uso, eligiendo "Uso en entorno de desarrollo local".
![Access Key de Alibaba Cloud](/docs/images/aliyun_accesskey_1.png)
3. Guarde la información de manera segura, es mejor copiarla en un archivo local.

## Activación del servicio de voz de Alibaba Cloud
1. Acceda a la [página de gestión del servicio de voz de Alibaba Cloud](https://nls-portal.console.aliyun.com/applist), y al ingresar por primera vez, deberá activar el servicio.
2. Haga clic en Crear proyecto.
![Voz de Alibaba Cloud](/docs/images/aliyun_speech_1.png)
3. Seleccione las funciones y actívelas.
![Voz de Alibaba Cloud](/docs/images/aliyun_speech_2.png)
4. "Síntesis de voz de texto en streaming (modelo grande CosyVoice)" necesita ser actualizado a la versión comercial, otros servicios pueden usar la versión de prueba gratuita.
![Voz de Alibaba Cloud](/docs/images/aliyun_speech_3.png)
5. Simplemente copie la clave de la aplicación.
![Voz de Alibaba Cloud](/docs/images/aliyun_speech_4.png)

## Activación del servicio OSS de Alibaba Cloud
1. Acceda a la [consola del servicio de almacenamiento de objetos de Alibaba Cloud](https://oss.console.aliyun.com/overview), y al ingresar por primera vez, deberá activar el servicio.
2. En el lado izquierdo, seleccione la lista de Buckets y luego haga clic en Crear.
![OSS de Alibaba Cloud](/docs/images/aliyun_oss_1.png)
3. Seleccione Creación rápida, complete un nombre de Bucket que cumpla con los requisitos y elija la región **Shanghái**, luego complete la creación (el nombre ingresado aquí es el valor de la configuración `aliyun.oss.bucket`).
![OSS de Alibaba Cloud](/docs/images/aliyun_oss_2.png)
4. Después de crear, ingrese al Bucket.
![OSS de Alibaba Cloud](/docs/images/aliyun_oss_3.png)
5. Apague el interruptor de "Bloquear acceso público" y configure los permisos de lectura y escritura como "Lectura pública".
![OSS de Alibaba Cloud](/docs/images/aliyun_oss_4.png)
![OSS de Alibaba Cloud](/docs/images/aliyun_oss_5.png)