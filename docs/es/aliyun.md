## Requisitos previos
Se necesita tener una cuenta de [Alibaba Cloud](https://www.aliyun.com) y haber completado la verificación de identidad. La mayoría de los servicios tienen un límite gratuito.

## Obtención de la clave de la plataforma de modelos de Alibaba Cloud
1. Inicie sesión en la [plataforma de servicios de modelos de Alibaba Cloud](https://bailian.console.aliyun.com/), pase el mouse sobre el ícono del centro personal en la esquina superior derecha de la página y haga clic en API-KEY en el menú desplegable.
![百炼](/docs/images/bailian_1.png)
2. En la barra de navegación izquierda, seleccione Todos los API-KEY o Mis API-KEY, y luego cree o consulte la clave API.

## Obtención de `access_key_id` y `access_key_secret` de Alibaba Cloud
1. Acceda a la [página de gestión de AccessKey de Alibaba Cloud](https://ram.console.aliyun.com/profile/access-keys).
2. Haga clic en Crear AccessKey, y si es necesario, seleccione el método de uso, eligiendo "Uso en entorno de desarrollo local".
![阿里云access key](/docs/images/aliyun_accesskey_1.png)
3. Guarde de manera segura, preferiblemente copie en un archivo local.

## Activación del servicio de voz de Alibaba Cloud
1. Acceda a la [página de gestión del servicio de voz de Alibaba Cloud](https://nls-portal.console.aliyun.com/applist), y la primera vez que ingrese, deberá activar el servicio.
2. Haga clic en Crear proyecto.
![阿里云speech](/docs/images/aliyun_speech_1.png)
3. Seleccione las funciones y actívelas.
![阿里云speech](/docs/images/aliyun_speech_2.png)
4. "Síntesis de voz de texto en streaming (modelo CosyVoice)" necesita actualizarse a la versión comercial, otros servicios pueden usar la versión de prueba gratuita.
![阿里云speech](/docs/images/aliyun_speech_3.png)
5. Simplemente copie la clave de la aplicación.
![阿里云speech](/docs/images/aliyun_speech_4.png)

## Activación del servicio OSS de Alibaba Cloud
1. Acceda a la [consola de servicio de almacenamiento de objetos de Alibaba Cloud](https://oss.console.aliyun.com/overview), y la primera vez que ingrese, deberá activar el servicio.
2. Seleccione la lista de Buckets en el lado izquierdo y luego haga clic en Crear.
![阿里云OSS](/docs/images/aliyun_oss_1.png)
3. Seleccione Creación rápida, complete un nombre de Bucket que cumpla con los requisitos y elija la región **Shanghái**, y complete la creación (el nombre ingresado aquí será el valor de la configuración `aliyun.oss.bucket`).
![阿里云OSS](/docs/images/aliyun_oss_2.png)
4. Una vez creado, acceda al Bucket.
![阿里云OSS](/docs/images/aliyun_oss_3.png)
5. Desactive el interruptor de "Bloquear acceso público" y configure los permisos de lectura y escritura como "Lectura pública".
![阿里云OSS](/docs/images/aliyun_oss_4.png)
![阿里云OSS](/docs/images/aliyun_oss_5.png)