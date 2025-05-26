## Voraussetzungen
Sie benötigen ein [Alibaba Cloud](https://www.aliyun.com) Konto, das durch eine echte Identitätsprüfung verifiziert wurde. Die meisten Dienste bieten ein kostenloses Kontingent.

## Abrufen von `access_key_id` und `access_key_secret` für Alibaba Cloud
1. Gehen Sie zur [Alibaba Cloud AccessKey-Verwaltungsseite](https://ram.console.aliyun.com/profile/access-keys).
2. Klicken Sie auf "AccessKey erstellen". Wählen Sie bei Bedarf die Verwendungsmethode "In der lokalen Entwicklungsumgebung verwenden".
![Alibaba Cloud access key](/docs/images/aliyun_accesskey_1.png)
3. Bewahren Sie diese sicher auf, am besten kopieren Sie sie in eine lokale Datei.

## Aktivierung des Alibaba Cloud Sprachdienstes
1. Gehen Sie zur [Alibaba Cloud Sprachdienstverwaltungsseite](https://nls-portal.console.aliyun.com/applist). Bei der ersten Anmeldung müssen Sie den Dienst aktivieren.
2. Klicken Sie auf "Projekt erstellen".
![Alibaba Cloud speech](/docs/images/aliyun_speech_1.png)
3. Wählen Sie die Funktionen aus und aktivieren Sie sie.
![Alibaba Cloud speech](/docs/images/aliyun_speech_2.png)
4. "Stream Text-to-Speech (CosyVoice großes Modell)" muss auf die kommerzielle Version aktualisiert werden, andere Dienste können mit der kostenlosen Testversion verwendet werden.
![Alibaba Cloud speech](/docs/images/aliyun_speech_3.png)
5. Kopieren Sie einfach den App-Key.
![Alibaba Cloud speech](/docs/images/aliyun_speech_4.png)

## Aktivierung des Alibaba Cloud OSS-Dienstes
1. Gehen Sie zur [Alibaba Cloud Object Storage Service-Konsole](https://oss.console.aliyun.com/overview). Bei der ersten Anmeldung müssen Sie den Dienst aktivieren.
2. Wählen Sie in der linken Spalte die Bucket-Liste aus und klicken Sie auf "Erstellen".
![Alibaba Cloud OSS](/docs/images/aliyun_oss_1.png)
3. Wählen Sie "Schneller erstellen", geben Sie einen Bucket-Namen ein, der den Anforderungen entspricht, und wählen Sie die Region **Shanghai** aus, um die Erstellung abzuschließen (der hier eingegebene Name ist der Wert für die Konfiguration `aliyun.oss.bucket`).
![Alibaba Cloud OSS](/docs/images/aliyun_oss_2.png)
4. Nach der Erstellung gehen Sie in den Bucket.
![Alibaba Cloud OSS](/docs/images/aliyun_oss_3.png)
5. Deaktivieren Sie den Schalter "Öffentlichen Zugriff blockieren" und setzen Sie die Lese- und Schreibberechtigungen auf "Öffentlich lesbar".
![Alibaba Cloud OSS](/docs/images/aliyun_oss_4.png)
![Alibaba Cloud OSS](/docs/images/aliyun_oss_5.png)