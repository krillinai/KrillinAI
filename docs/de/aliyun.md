## Voraussetzungen
Sie benötigen ein [Alibaba Cloud](https://www.aliyun.com) Konto, das durch eine echte Identitätsprüfung verifiziert wurde. Die meisten Dienste bieten ein kostenloses Kontingent.

## Abrufen des Alibaba Cloud Bailian-Plattform-Schlüssels
1. Melden Sie sich bei der [Alibaba Cloud Bailian-Modellservice-Plattform](https://bailian.console.aliyun.com/) an, fahren Sie mit der Maus über das Symbol für das persönliche Zentrum in der oberen rechten Ecke der Seite und klicken Sie im Dropdown-Menü auf API-KEY.
![Bailian](/docs/images/bailian_1.png)
2. Wählen Sie im linken Navigationsbereich Alle API-KEYs oder Meine API-KEYs aus und erstellen oder überprüfen Sie den API-Schlüssel.

## Abrufen von `access_key_id` und `access_key_secret` von Alibaba Cloud
1. Gehen Sie zur [Alibaba Cloud AccessKey-Verwaltungsseite](https://ram.console.aliyun.com/profile/access-keys).
2. Klicken Sie auf AccessKey erstellen. Wählen Sie bei Bedarf die Verwendungsmethode „In der lokalen Entwicklungsumgebung verwenden“ aus.
![Alibaba Cloud access key](/docs/images/aliyun_accesskey_1.png)
3. Bewahren Sie es sicher auf, am besten kopieren Sie es in eine lokale Datei.

## Aktivierung des Alibaba Cloud Sprachdienstes
1. Gehen Sie zur [Alibaba Cloud Sprachdienstverwaltungsseite](https://nls-portal.console.aliyun.com/applist). Bei der ersten Anmeldung müssen Sie den Dienst aktivieren.
2. Klicken Sie auf Projekt erstellen.
![Alibaba Cloud speech](/docs/images/aliyun_speech_1.png)
3. Wählen Sie die Funktionen aus und aktivieren Sie sie.
![Alibaba Cloud speech](/docs/images/aliyun_speech_2.png)
4. „Stream Text-to-Speech (CosyVoice großes Modell)“ muss auf die kommerzielle Version aktualisiert werden, andere Dienste können mit der kostenlosen Testversion verwendet werden.
![Alibaba Cloud speech](/docs/images/aliyun_speech_3.png)
5. Kopieren Sie einfach den App-Schlüssel.
![Alibaba Cloud speech](/docs/images/aliyun_speech_4.png)

## Aktivierung des Alibaba Cloud OSS-Dienstes
1. Gehen Sie zur [Alibaba Cloud Object Storage Service-Konsole](https://oss.console.aliyun.com/overview). Bei der ersten Anmeldung müssen Sie den Dienst aktivieren.
2. Wählen Sie links die Bucket-Liste aus und klicken Sie auf Erstellen.
![Alibaba Cloud OSS](/docs/images/aliyun_oss_1.png)
3. Wählen Sie Schnellerstellung, geben Sie einen Bucket-Namen ein, der den Anforderungen entspricht, und wählen Sie die Region **Shanghai** aus, um die Erstellung abzuschließen (der hier eingegebene Name ist der Wert der Konfiguration `aliyun.oss.bucket`).
![Alibaba Cloud OSS](/docs/images/aliyun_oss_2.png)
4. Nach der Erstellung gehen Sie zum Bucket.
![Alibaba Cloud OSS](/docs/images/aliyun_oss_3.png)
5. Deaktivieren Sie den Schalter „Öffentlichen Zugriff blockieren“ und setzen Sie die Lese- und Schreibberechtigung auf „Öffentlich lesen“.
![Alibaba Cloud OSS](/docs/images/aliyun_oss_4.png)
![Alibaba Cloud OSS](/docs/images/aliyun_oss_5.png)