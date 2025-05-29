<div align="center">
  <img src="/docs/images/logo.jpg" alt="KlicStudio" height="90">

  # Minimalistisches AI-Videoübersetzungs- und Synchronisationstool

  <a href="https://trendshift.io/repositories/13360" target="_blank"><img src="https://trendshift.io/api/badge/repositories/13360" alt="KrillinAI%2FKlicStudio | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

  **[English](/README.md)｜[简体中文](/docs/zh/README.md)｜[日本語](/docs/jp/README.md)｜[한국어](/docs/kr/README.md)｜[Tiếng Việt](/docs/vi/README.md)｜[Français](/docs/fr/README.md)｜[Deutsch](/docs/de/README.md)｜[Español](/docs/es/README.md)｜[Português](/docs/pt/README.md)｜[Русский](/docs/rus/README.md)｜[اللغة العربية](/docs/ar/README.md)**

[![Twitter](https://img.shields.io/badge/Twitter-KrillinAI-orange?logo=twitter)](https://x.com/KrillinAI)
[![QQ 群](https://img.shields.io/badge/QQ%20群-754069680-green?logo=tencent-qq)](https://jq.qq.com/?_wv=1027&k=754069680)
[![Bilibili](https://img.shields.io/badge/dynamic/json?label=Bilibili&query=%24.data.follower&suffix=粉丝&url=https%3A%2F%2Fapi.bilibili.com%2Fx%2Frelation%2Fstat%3Fvmid%3D242124650&logo=bilibili&color=00A1D6&labelColor=FE7398&logoColor=FFFFFF)](https://space.bilibili.com/242124650)

</div>

 ## Projektübersicht  ([Jetzt die Online-Version ausprobieren!](https://www.klic.studio/))

Klic Studio ist eine umfassende Audio- und Video-Lokalisierungs- und Verbesserungslösung, die von Krillin AI entwickelt wurde. Dieses minimalistische und leistungsstarke Tool vereint Videoübersetzung, Synchronisation und Sprachklonung und unterstützt sowohl Quer- als auch Hochformat-Ausgaben, um auf allen gängigen Plattformen (Bilibili, Xiaohongshu, Douyin, Video-Nummer, Kuaishou, YouTube, TikTok usw.) perfekt präsentiert zu werden. Mit einem End-to-End-Workflow können Sie mit nur wenigen Klicks Rohmaterial in ansprechende, plattformübergreifende Inhalte umwandeln.

## Hauptmerkmale und Funktionen:
🎯 **Ein-Klick-Start**: Keine komplexe Umgebungskonfiguration erforderlich, automatische Installation von Abhängigkeiten, sofort einsatzbereit, neue Desktop-Version für mehr Benutzerfreundlichkeit!

📥 **Videoerfassung**: Unterstützt yt-dlp-Downloads oder lokale Datei-Uploads

📜 **Präzise Erkennung**: Hochgenaue Spracherkennung basierend auf Whisper

🧠 **Intelligente Segmentierung**: Verwendung von LLM zur Untertitelsegmentierung und -ausrichtung

🔄 **Terminologieersetzung**: Ein-Klick-Ersetzung von Fachbegriffen 

🌍 **Professionelle Übersetzung**: LLM-Übersetzung mit Kontext für natürliche Semantik

🎙️ **Synchronisationsklon**: Bietet ausgewählte Stimmen von CosyVoice oder benutzerdefinierte Stimmklonung

🎬 **Videokomposition**: Automatische Verarbeitung von Quer- und Hochformatvideos sowie Untertitel-Layout

💻 **Plattformübergreifend**: Unterstützt Windows, Linux, macOS, bietet Desktop- und Server-Versionen


## Effektanzeige
Das folgende Bild zeigt die Ergebnisse eines 46-minütigen lokal importierten Videos, das nach einem Ein-Klick-Vorgang generierte Untertiteldateien ohne manuelle Anpassungen enthält. Keine Auslassungen, Überlappungen, natürliche Satztrennung und die Übersetzungsqualität ist ebenfalls sehr hoch.
![Ausrichtungseffekt](/docs/images/alignment.png)

<table>
<tr>
<td width="33%">

### Untertitelübersetzung
---
https://github.com/user-attachments/assets/bba1ac0a-fe6b-4947-b58d-ba99306d0339

</td>
<td width="33%">



### Synchronisation
---
https://github.com/user-attachments/assets/0b32fad3-c3ad-4b6a-abf0-0865f0dd2385

</td>

<td width="33%">

### Hochformat
---
https://github.com/user-attachments/assets/c2c7b528-0ef8-4ba9-b8ac-f9f92f6d4e71

</td>

</tr>
</table>

## 🔍 Unterstützung für Spracherkennungsdienste
_**Alle lokalen Modelle in der folgenden Tabelle unterstützen die automatische Installation von ausführbaren Dateien + Modell-Dateien. Sie müssen nur auswählen, der Rest wird von Klic für Sie vorbereitet.**_

| Dienstquelle          | Unterstützte Plattformen | Modelloptionen                             | Lokal/Cloud | Anmerkungen          |
|----------------------|-------------------------|-------------------------------------------|-------------|----------------------|
| **OpenAI Whisper**   | Alle Plattformen        | -                                         | Cloud       | Schnell und effektiv  |
| **FasterWhisper**    | Windows/Linux           | `tiny`/`medium`/`large-v2` (empfohlen: medium+) | Lokal       | Noch schneller, keine Cloud-Service-Kosten |
| **WhisperKit**       | macOS (nur M-Serie Chips) | `large-v2`                               | Lokal       | Native Optimierung für Apple-Chips |
| **WhisperCpp**       | Alle Plattformen        | `large-v2`                               | Lokal       | Unterstützt alle Plattformen |
| **Alibaba Cloud ASR**| Alle Plattformen        | -                                         | Cloud       | Vermeidung von Netzwerkproblemen in Festland-China |

## 🚀 Unterstützung für große Sprachmodelle

✅ Kompatibel mit allen Cloud-/lokalen großen Sprachmodell-Diensten, die den **OpenAI API-Spezifikationen** entsprechen, einschließlich, aber nicht beschränkt auf:
- OpenAI
- Gemini
- DeepSeek
- Tongyi Qianwen
- Lokal bereitgestellte Open-Source-Modelle
- Andere API-Dienste, die mit OpenAI-Format kompatibel sind

## 🎤 TTS Text-zu-Sprache Unterstützung
- Alibaba Cloud Sprachdienst
- OpenAI TTS

## Sprachunterstützung
Eingabesprachen: Chinesisch, Englisch, Japanisch, Deutsch, Türkisch, Koreanisch, Russisch, Malaiisch (wird kontinuierlich erweitert)

Übersetzungssprachen: Englisch, Chinesisch, Russisch, Spanisch, Französisch und weitere 101 Sprachen

## Benutzeroberflächenvorschau
![Benutzeroberflächenvorschau](/docs/images/ui_desktop.png)


## 🚀 Schnellstart
### Grundlegende Schritte
Laden Sie zunächst die ausführbare Datei herunter, die mit Ihrem Betriebssystem im [Release](https://github.com/KrillinAI/KlicStudio/releases) übereinstimmt. Wählen Sie dann je nach Anleitung die Desktop- oder Nicht-Desktop-Version aus und legen Sie sie in einen leeren Ordner. Laden Sie die Software in einen leeren Ordner herunter, da nach dem Ausführen einige Verzeichnisse erstellt werden, die so besser verwaltet werden können.  

【Wenn es sich um die Desktop-Version handelt, d.h. die Release-Datei mit "desktop" versehen ist, lesen Sie hier】  
_Die Desktop-Version ist neu veröffentlicht worden, um das Problem zu lösen, dass neue Benutzer Schwierigkeiten haben, die Konfigurationsdateien korrekt zu bearbeiten. Es gibt einige Bugs, die kontinuierlich aktualisiert werden._
1. Doppelklicken Sie auf die Datei, um zu beginnen (auch die Desktop-Version muss konfiguriert werden, dies erfolgt innerhalb der Software)

【Wenn es sich um die Nicht-Desktop-Version handelt, d.h. die Release-Datei ohne "desktop", lesen Sie hier】  
_Die Nicht-Desktop-Version ist die ursprüngliche Version, die Konfiguration ist komplexer, aber die Funktionen sind stabil und sie eignet sich gut für die Serverbereitstellung, da sie die Benutzeroberfläche webbasiert bereitstellt._
1. Erstellen Sie im Ordner einen `config`-Ordner und erstellen Sie dann im `config`-Ordner eine `config.toml`-Datei. Kopieren Sie den Inhalt der `config-example.toml`-Datei im Quellcodeverzeichnis `config` in die `config.toml` und füllen Sie Ihre Konfigurationsinformationen gemäß den Kommentaren aus.
2. Doppelklicken Sie oder führen Sie die ausführbare Datei im Terminal aus, um den Dienst zu starten 
3. Öffnen Sie den Browser und geben Sie `http://127.0.0.1:8888` ein, um zu beginnen (ersetzen Sie 8888 durch den Port, den Sie in der Konfigurationsdatei angegeben haben)

### An: macOS-Benutzer
【Wenn es sich um die Desktop-Version handelt, d.h. die Release-Datei mit "desktop" versehen ist, lesen Sie hier】  
Aufgrund von Problemen mit der Signierung kann die Desktop-Version derzeit nicht durch Doppelklicken oder DMG-Installation direkt ausgeführt werden. Sie müssen die Anwendung manuell vertrauen. Die Methode ist wie folgt:
1. Öffnen Sie das Verzeichnis, in dem sich die ausführbare Datei (angenommen, der Dateiname ist KlicStudio_1.0.0_desktop_macOS_arm64) befindet, im Terminal
2. Führen Sie nacheinander die folgenden Befehle aus:
```
sudo xattr -cr ./KlicStudio_1.0.0_desktop_macOS_arm64
sudo chmod +x ./KlicStudio_1.0.0_desktop_macOS_arm64 
./KlicStudio_1.0.0_desktop_macOS_arm64
```

【Wenn es sich um die Nicht-Desktop-Version handelt, d.h. die Release-Datei ohne "desktop", lesen Sie hier】  
Diese Software hat keine Signierung, daher müssen Sie beim Ausführen unter macOS nach Abschluss der Datei-Konfiguration in den "Grundlegenden Schritten" die Anwendung manuell vertrauen. Die Methode ist wie folgt:
1. Öffnen Sie das Verzeichnis, in dem sich die ausführbare Datei (angenommen, der Dateiname ist KlicStudio_1.0.0_macOS_arm64) befindet, im Terminal
2. Führen Sie nacheinander die folgenden Befehle aus:
   ```
    sudo xattr -rd com.apple.quarantine ./KlicStudio_1.0.0_macOS_arm64
    sudo chmod +x ./KlicStudio_1.0.0_macOS_arm64
    ./KlicStudio_1.0.0_macOS_arm64
    ```
    um den Dienst zu starten

### Docker-Bereitstellung
Dieses Projekt unterstützt die Docker-Bereitstellung. Bitte beachten Sie die [Docker-Bereitstellungsanleitung](./docker.md)

### Cookie-Konfigurationsanleitung (nicht erforderlich)

Wenn Sie auf Probleme beim Herunterladen von Videos stoßen

Bitte beachten Sie die [Cookie-Konfigurationsanleitung](./get_cookies.md), um Ihre Cookie-Informationen zu konfigurieren.

### Konfigurationshilfe (unbedingt lesen)
Die schnellste und einfachste Konfigurationsmethode:
* Füllen Sie `transcribe.provider.name` mit `openai`, dann müssen Sie nur den Block `transcribe.openai` sowie die Konfiguration des großen Modells im Block `llm` ausfüllen, um die Untertitelübersetzung durchzuführen. (`app.proxy`, `model` und `openai.base_url` können je nach Bedarf ausgefüllt werden)

Verwendung der Konfiguration für lokale Spracherkennungsmodelle (eine Auswahl, die Kosten, Geschwindigkeit und Qualität berücksichtigt)
* Füllen Sie `transcribe.provider.name` mit `fasterwhisper`, `transcribe.fasterwhisper.model` mit `large-v2`, und füllen Sie dann den Block `llm` mit der Konfiguration des großen Modells aus, um die Untertitelübersetzung durchzuführen. Das lokale Modell wird automatisch heruntergeladen und installiert. (`app.proxy` und `openai.base_url` wie oben)

Text-zu-Sprache (TTS) ist optional, die Konfigurationslogik ist die gleiche wie oben, füllen Sie `tts.provider.name` aus und dann die entsprechenden Konfigurationsblöcke unter `tts`. Die Stimmencodes im UI sollten gemäß der Dokumentation des gewählten Anbieters ausgefüllt werden (die Dokumentationsadressen finden Sie im Abschnitt häufige Fragen weiter unten). Das Ausfüllen von Alibaba Cloud's aksk usw. kann sich wiederholen, um die Struktur der Konfiguration klar zu halten.  
Hinweis: Bei der Verwendung von Stimmklonung unterstützt `tts` nur die Auswahl von `aliyun`.

**Für den Erhalt von Alibaba Cloud AccessKey, Bucket, AppKey lesen Sie bitte**: [Alibaba Cloud Konfigurationsanleitung](./aliyun.md) 

Bitte verstehen Sie, dass die Aufgabe = Spracherkennung + großes Modellübersetzung + Sprachdienst (TTS usw., optional) ist, was Ihnen beim Verständnis der Konfigurationsdatei sehr helfen wird.

## Häufige Fragen

Bitte besuchen Sie die [Häufigen Fragen](./faq.md)

## Beitragsrichtlinien
1. Reichen Sie keine unnötigen Dateien wie .vscode, .idea usw. ein, verwenden Sie .gitignore zur Filterung
2. Reichen Sie nicht config.toml ein, sondern verwenden Sie config-example.toml zur Einreichung

## Kontaktieren Sie uns
1. Treten Sie unserer QQ-Gruppe bei, um Fragen zu klären: 754069680
2. Folgen Sie unseren Social-Media-Konten, [Bilibili](https://space.bilibili.com/242124650), wo wir täglich hochwertige Inhalte im Bereich AI-Technologie teilen

## Star-Historie

[![Star-Historie-Diagramm](https://api.star-history.com/svg?repos=KrillinAI/KlicStudio&type=Date)](https://star-history.com/#KrillinAI/KlicStudio&Date)