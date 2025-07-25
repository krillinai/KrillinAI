## Voraussetzungen
Sie benötigen ein [Alibaba Cloud](https://www.aliyun.com) Konto und müssen die Echtheitsprüfung abschließen. Die meisten Dienste haben kostenlose Kontingente.

## Erhalten von Alibaba Cloud `access_key_id` und `access_key_secret`
1. Gehen Sie zur [Alibaba Cloud AccessKey-Verwaltungsseite](https://ram.console.aliyun.com/profile/access-keys).
2. Klicken Sie auf "AccessKey erstellen." Wählen Sie bei Bedarf die Nutzungsmethode "In der lokalen Entwicklungsumgebung verwenden."
![Alibaba Cloud access key](/docs/images/aliyun_accesskey_1.png)
3. Bewahren Sie es sicher auf; es ist am besten, es in eine lokale Datei zu kopieren.

## Aktivierung des Alibaba Cloud Voice Service
1. Gehen Sie zur [Alibaba Cloud Voice Service-Verwaltungsseite](https://nls-portal.console.aliyun.com/applist). Sie müssen den Dienst bei Ihrem ersten Besuch aktivieren.
2. Klicken Sie auf "Projekt erstellen."
![Alibaba Cloud speech](/docs/images/aliyun_speech_1.png)
3. Wählen Sie Funktionen aus und aktivieren Sie diese.
![Alibaba Cloud speech](/docs/images/aliyun_speech_2.png)
4. Das "Streaming Text-to-Speech (CosyVoice Large Model)" muss auf die kommerzielle Version aktualisiert werden; andere Dienste können die kostenlose Testversion nutzen.
![Alibaba Cloud speech](/docs/images/aliyun_speech_3.png)
5. Kopieren Sie einfach den App-Schlüssel.
![Alibaba Cloud speech](/docs/images/aliyun_speech_4.png)

## Aktivierung des Alibaba Cloud OSS Service
1. Gehen Sie zur [Alibaba Cloud Object Storage Service-Konsole](https://oss.console.aliyun.com/overview). Sie müssen den Dienst bei Ihrem ersten Besuch aktivieren.
2. Wählen Sie die Bucket-Liste auf der linken Seite und klicken Sie dann auf "Erstellen."
![Alibaba Cloud OSS](/docs/images/aliyun_oss_1.png)
3. Wählen Sie "Schnell erstellen", füllen Sie einen konformen Bucket-Namen aus und wählen Sie die **Shanghai**-Region, um die Erstellung abzuschließen (der hier eingegebene Name wird der Wert für das Konfigurationselement `aliyun.oss.bucket` sein).
![Alibaba Cloud OSS](/docs/images/aliyun_oss_2.png)
4. Nach der Erstellung betreten Sie den Bucket.
![Alibaba Cloud OSS](/docs/images/aliyun_oss_3.png)
5. Schalten Sie den Schalter "Öffentlichen Zugriff blockieren" aus und setzen Sie die Lese- und Schreibberechtigungen auf "Öffentlich lesen."
![Alibaba Cloud OSS](/docs/images/aliyun_oss_4.png)
![Alibaba Cloud OSS](/docs/images/aliyun_oss_5.png)