<div align="center">
  <img src="/docs/images/logo.png" alt="KrillinAI" height="90">

  # Minimalistisches AI-Videoübersetzungs- und Synchronisationstool

  <a href="https://trendshift.io/repositories/13360" target="_blank"><img src="https://trendshift.io/api/badge/repositories/13360" alt="krillinai%2FKrillinAI | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

  **[English](/README.md)｜[简体中文](/docs/zh/README.md)｜[日本語](/docs/jp/README.md)｜[한국어](/docs/kr/README.md)｜[Tiếng Việt](/docs/vi/README.md)｜[Français](/docs/fr/README.md)｜[Deutsch](/docs/de/README.md)｜[Español](/docs/es/README.md)｜[Português](/docs/pt/README.md)｜[Русский](/docs/rus/README.md)｜[اللغة العربية](/docs/ar/README.md)**

[![Twitter](https://img.shields.io/badge/Twitter-KrillinAI-orange?logo=twitter)](https://x.com/KrillinAI)
[![QQ 群](https://img.shields.io/badge/QQ%20群-754069680-green?logo=tencent-qq)](https://jq.qq.com/?_wv=1027&k=754069680)
[![Bilibili](https://img.shields.io/badge/dynamic/json?label=Bilibili&query=%24.data.follower&suffix=粉丝&url=https%3A%2F%2Fapi.bilibili.com%2Fx%2Frelation%2Fstat%3Fvmid%3D242124650&logo=bilibili&color=00A1D6&labelColor=FE7398&logoColor=FFFFFF)](https://space.bilibili.com/242124650)

</div>

### 📢 Neue Veröffentlichung für Win & Mac Desktop, Feedback willkommen [Dokumentation wird aktualisiert]

 ## Projektübersicht  

Krillin AI ist eine umfassende Lösung für die Lokalisierung und Verbesserung von Audio und Video. Dieses einfache, aber leistungsstarke Tool vereint Videoübersetzung, Synchronisation und Sprachklonung, unterstützt sowohl Quer- als auch Hochformat-Ausgaben und sorgt dafür, dass Inhalte auf allen gängigen Plattformen (Bilibili, Xiaohongshu, Douyin, Video-Nummer, Kuaishou, YouTube, TikTok usw.) perfekt präsentiert werden. Mit einem End-to-End-Workflow kann Krillin AI mit nur wenigen Klicks Rohmaterial in ansprechende, plattformübergreifende Inhalte umwandeln.

## Hauptmerkmale und Funktionen:
🎯 **Ein-Klick-Start**: Keine komplexe Umgebungsinstallation erforderlich, Abhängigkeiten werden automatisch installiert, sofort einsatzbereit, neue Desktop-Version für mehr Benutzerfreundlichkeit!

📥 **Videoerfassung**: Unterstützt yt-dlp-Downloads oder lokale Datei-Uploads

📜 **Präzise Erkennung**: Hohe Genauigkeit bei der Spracherkennung basierend auf Whisper

🧠 **Intelligente Segmentierung**: Verwendung von LLM zur Untertitel-Segmentierung und -Ausrichtung

🔄 **Terminologie-Austausch**: Fachbegriffe mit einem Klick ersetzen 

🌍 **Professionelle Übersetzung**: LLM-basierte, absatzweise Übersetzung mit semantischer Kohärenz

🎙️ **Synchronisationsklon**: Bietet ausgewählte Stimmen von CosyVoice oder benutzerdefinierte Stimmklonung

🎬 **Videozusammenstellung**: Automatische Verarbeitung von Quer- und Hochformatvideos sowie Untertitel-Layout


## Effekt-Demonstration
Das folgende Bild zeigt die Ergebnisse eines 46-minütigen lokal importierten Videos, das nach einem Klick auf die Ausführung generierte Untertiteldatei ohne manuelle Anpassungen. Keine Auslassungen oder Überlappungen, natürliche Satztrennung und eine sehr hohe Übersetzungsqualität.
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
_**Alle lokalen Modelle in der folgenden Tabelle unterstützen die automatische Installation von ausführbaren Dateien + Modell-Dateien. Du musst nur auswählen, der Rest wird von KrillinAI für dich vorbereitet.**_

| Dienstquelle          | Unterstützte Plattformen | Modelloptionen                            | Lokal/Cloud | Anmerkungen          |
|----------------------|-------------------------|------------------------------------------|-------------|----------------------|
| **OpenAI Whisper**   | Alle Plattformen        | -                                        | Cloud       | Schnell und effektiv  |
| **FasterWhisper**    | Windows/Linux           | `tiny`/`medium`/`large-v2` (empfohlen medium+) | Lokal       | Noch schneller, keine Cloud-Kosten |
| **WhisperKit**       | macOS (nur M-Serie Chips) | `large-v2`                               | Lokal       | Native Optimierung für Apple-Chips |
| **WhisperCpp**       | Alle Plattformen        | `large-v2`                               | Lokal       | Unterstützt alle Plattformen |
| **Alibaba Cloud ASR**| Alle Plattformen        | -                                        | Cloud       | Vermeidung von Netzwerkproblemen in Festland-China |

## 🚀 Unterstützung für große Sprachmodelle

✅ Kompatibel mit allen Cloud-/Lokal-Diensten für große Sprachmodelle, die den **OpenAI API-Spezifikationen** entsprechen, einschließlich, aber nicht beschränkt auf:
- OpenAI
- DeepSeek
- Tongyi Qianwen
- Lokal bereitgestellte Open-Source-Modelle
- Andere API-Dienste, die mit OpenAI-Format kompatibel sind

## Sprachunterstützung
Eingabesprachen: Chinesisch, Englisch, Japanisch, Deutsch, Türkisch, Koreanisch, Russisch, Malaiisch (wird kontinuierlich erweitert)

Übersetzungssprachen: Englisch, Chinesisch, Russisch, Spanisch, Französisch und weitere 101 Sprachen

## Benutzeroberflächenvorschau
![Benutzeroberflächenvorschau](/docs/images/ui_desktop.png)


## 🚀 Schnellstart
### Grundlegende Schritte
Lade zunächst die ausführbare Datei aus den [Release](https://github.com/krillinai/KrillinAI/releases), die mit deinem Betriebssystem kompatibel ist, herunter. Wähle dann gemäß der folgenden Anleitung zwischen der Desktop- und der Nicht-Desktop-Version und lege sie in einen leeren Ordner. Lade die Software in einen leeren Ordner herunter, da nach dem Ausführen einige Verzeichnisse erstellt werden, die in einem leeren Ordner besser verwaltet werden können.  

【Wenn es sich um die Desktop-Version handelt, also die Release-Datei mit "desktop" endet, siehe hier】  
_Die Desktop-Version ist neu veröffentlicht worden, um das Problem zu lösen, dass neue Benutzer Schwierigkeiten haben, die Konfigurationsdateien korrekt zu bearbeiten. Es gibt noch einige Bugs, die kontinuierlich aktualisiert werden._
1. Doppelklicke auf die Datei, um zu beginnen (auch die Desktop-Version muss konfiguriert werden, die Konfiguration erfolgt innerhalb der Software)

【Wenn es sich um die Nicht-Desktop-Version handelt, also die Release-Datei ohne "desktop", siehe hier】  
_Die Nicht-Desktop-Version ist die ursprüngliche Version, die Konfiguration ist komplexer, aber die Funktionen sind stabil und sie eignet sich gut für die Serverbereitstellung, da sie eine UI über das Web bereitstellt._
1. Erstelle einen Ordner namens `config` im Verzeichnis, dann erstelle eine Datei namens `config.toml` im `config`-Ordner. Kopiere den Inhalt der Datei `config-example.toml` aus dem Quellcodeverzeichnis in die `config.toml` und fülle deine Konfigurationsinformationen entsprechend aus.
2. Doppelklicke oder führe die ausführbare Datei im Terminal aus, um den Dienst zu starten 
3. Öffne den Browser und gib `http://127.0.0.1:8888` ein, um zu beginnen (ersetze 8888 durch den Port, den du in der Konfigurationsdatei angegeben hast)

### An: macOS-Benutzer
【Wenn es sich um die Desktop-Version handelt, also die Release-Datei mit "desktop" endet, siehe hier】  
Die aktuelle Verpackungsmethode für die Desktop-Version kann aufgrund von Signaturproblemen nicht direkt durch Doppelklick oder DMG-Installation ausgeführt werden. Du musst die Anwendung manuell vertrauen, wie folgt:
1. Öffne das Terminal im Verzeichnis der ausführbaren Datei (angenommen, der Dateiname ist KrillinAI_1.0.0_desktop_macOS_arm64)
2. Führe nacheinander die folgenden Befehle aus:
```
sudo xattr -cr ./KrillinAI_1.0.0_desktop_macOS_arm64
sudo chmod +x ./KrillinAI_1.0.0_desktop_macOS_arm64 
./KrillinAI_1.0.0_desktop_macOS_arm64
```

【Wenn es sich um die Nicht-Desktop-Version handelt, also die Release-Datei ohne "desktop", siehe hier】  
Diese Software ist nicht signiert, daher musst du beim Ausführen auf macOS nach der Konfiguration der Dateien in den "Grundschritten" die Anwendung manuell vertrauen, wie folgt:
1. Öffne das Terminal im Verzeichnis der ausführbaren Datei (angenommen, der Dateiname ist KrillinAI_1.0.0_macOS_arm64)
2. Führe nacheinander die folgenden Befehle aus:
   ```
    sudo xattr -rd com.apple.quarantine ./KrillinAI_1.0.0_macOS_arm64
    sudo chmod +x ./KrillinAI_1.0.0_macOS_arm64
    ./KrillinAI_1.0.0_macOS_arm64
    ```
    um den Dienst zu starten

### Docker-Bereitstellung
Dieses Projekt unterstützt die Docker-Bereitstellung. Bitte siehe die [Docker-Bereitstellungsanleitung](./docker.md)

### Cookie-Konfigurationshinweise (nicht erforderlich)

Wenn du auf Probleme beim Herunterladen von Videos stößt,

siehe die [Cookie-Konfigurationsanleitung](./get_cookies.md) zur Konfiguration deiner Cookie-Informationen.

### Konfigurationshilfe (unbedingt lesen)
Die schnellste und einfachste Konfigurationsmethode:
* Wähle sowohl `transcription_provider` als auch `llm_provider` als `openai`, sodass du nur `openai.apikey` in den drei Konfigurationskategorien `openai`, `local_model` und `aliyun` ausfüllen musst, um die Untertitelübersetzung durchzuführen. (`app.proxy`, `model` und `openai.base_url` können je nach Bedarf ausgefüllt werden)

Verwendung eines lokalen Sprachmodell-Erkennungsmodells (derzeit nicht für macOS unterstützt) zur Konfiguration (unter Berücksichtigung von Kosten, Geschwindigkeit und Qualität):
* Fülle `transcription_provider` mit `fasterwhisper` und `llm_provider` mit `openai`, sodass du nur `openai.apikey` und `local_model.faster_whisper` in den drei Konfigurationskategorien `openai` und `local_model` ausfüllen musst, um die Untertitelübersetzung durchzuführen. Das lokale Modell wird automatisch heruntergeladen. (`app.proxy` und `openai.base_url` wie oben)

In den folgenden Fällen musst du die Alibaba Cloud konfigurieren:
* Wenn `llm_provider` auf `aliyun` gesetzt ist, benötigst du den großen Modellservice von Alibaba Cloud, daher musst du die Konfiguration für `aliyun.bailian` ausfüllen.
* Wenn `transcription_provider` auf `aliyun` gesetzt ist oder die Funktion "Synchronisation" beim Starten der Aufgabe aktiviert ist, benötigst du den Sprachdienst von Alibaba Cloud, daher musst du die Konfiguration für `aliyun.speech` ausfüllen.
* Wenn die Funktion "Synchronisation" aktiviert ist und du lokale Audiodateien zum Klonen von Stimmen hochgeladen hast, benötigst du auch den OSS-Cloudspeicherdienst von Alibaba Cloud, daher musst du die Konfiguration für `aliyun.oss` ausfüllen.  
Hilfe zur Alibaba Cloud-Konfiguration: [Alibaba Cloud Konfigurationsanleitung](./aliyun.md)

## Häufige Fragen

Bitte besuche die [Häufigen Fragen](./faq.md)

## Beitragsrichtlinien
1. Reiche keine unnötigen Dateien wie .vscode, .idea usw. ein, verwende .gitignore, um sie herauszufiltern.
2. Reiche nicht config.toml ein, sondern verwende config-example.toml zur Einreichung.

## Kontaktiere uns
1. Trete unserer QQ-Gruppe bei, um Fragen zu klären: 754069680
2. Folge unseren Social-Media-Kanälen, [Bilibili](https://space.bilibili.com/242124650), täglich hochwertige Inhalte im Bereich AI-Technologie teilen.

## Star-Historie

[![Star-Historie-Diagramm](https://api.star-history.com/svg?repos=krillinai/KrillinAI&type=Date)](https://star-history.com/#krillinai/KrillinAI&Date)