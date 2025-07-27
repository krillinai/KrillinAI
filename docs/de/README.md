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

Klic Studio ist eine umfassende Audio- und Video-Lokalisierungslösung, die von Krillin AI entwickelt wurde. Sie vereint Videoübersetzung, Synchronisation und Sprachklonierung und generiert mit einem Klick Hollywood-ähnliche Untertitel. Unterstützt sowohl Quer- als auch Hochformat-Ausgaben, um sicherzustellen, dass sie auf allen gängigen Plattformen (Bilibili, Xiaohongshu, Douyin, Video-Nummer, Kuaishou, YouTube, TikTok usw.) perfekt präsentiert werden und die Anforderungen an die Globalisierung von Inhalten mühelos erfüllen!

## Hauptmerkmale und Funktionen:
🎯 **Ein-Klick-Start**: Keine komplexe Umgebungskonfiguration erforderlich, automatische Installation von Abhängigkeiten, sofort einsatzbereit. Neue Desktop-Version für einfachere Nutzung!

📥 **Videoerfassung**: Unterstützt yt-dlp-Downloads oder lokale Datei-Uploads

📜 **Präzise Erkennung**: Hochgenaue Spracherkennung basierend auf Whisper

🧠 **Qualitätsübersetzung**: Anpassung an gängige SOTA große Sprachmodelle, Übersetzungsqualität auf Untertitelgruppen-Niveau

🌍 **Filmreife Untertitel**: Wortgenaue Schnitt- und Ausrichtungsalgorithmen, die die Qualität von Hollywood-Untertiteln erreichen, ohne Zeilenumbruch

🎙️ **Synchronisationsklon**: Bietet ausgewählte Stimmen von CosyVoice oder benutzerdefinierte Stimmklonierung

🎬 **Quer- und Hochformat-Ausgabe**: Automatische Verarbeitung von Quer- und Hochformatvideos sowie Untertitel-Layouts, plattformübergreifendes Format in einem Schritt

🔄 **Terminologieersetzung**: Ein-Klick-Ersetzung von Fachbegriffen

💻 **Plattformübergreifend**: Unterstützt Windows, Linux, macOS, bietet Desktop- und Server-Versionen


## Effektanzeige
Das folgende Bild zeigt die Ergebnisse eines 46-minütigen lokal importierten Videos, bei dem nach einem Klick die generierte Untertiteldatei ohne manuelle Anpassungen eingebaut wurde. Keine Auslassungen oder Überlappungen, natürliche Satztrennung und sehr hohe Übersetzungsqualität.
![Ausrichteffekt](/docs/images/alignment.png)

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
_**Alle lokalen Modelle in der folgenden Tabelle unterstützen die automatische Installation von ausführbaren Dateien + Modell-Dateien. Du musst nur auswählen, den Rest erledigt Klic für dich.**_

| Dienstquelle          | Unterstützte Plattformen | Modelloptionen                             | Lokal/Cloud | Anmerkungen          |
|----------------------|-------------------------|-------------------------------------------|-------------|----------------------|
| **OpenAI Whisper**   | Alle Plattformen        | -                                         | Cloud       | Schnell und effektiv  |
| **FasterWhisper**    | Windows/Linux           | `tiny`/`medium`/`large-v2` (empfohlen medium+) | Lokal       | Noch schneller, keine Cloud-Kosten |
| **WhisperKit**       | macOS (nur M-Serie Chips) | `large-v2`                               | Lokal       | Native Optimierung für Apple-Chips |
| **WhisperCpp**       | Alle Plattformen        | `large-v2`                               | Lokal       | Unterstützt alle Plattformen |
| **Alibaba Cloud ASR**| Alle Plattformen        | -                                         | Cloud       | Vermeidung von Netzwerkproblemen in Festland-China |

## 🚀 Unterstützung für große Sprachmodelle

✅ Kompatibel mit allen Cloud-/Lokal-Diensten für große Sprachmodelle, die den **OpenAI API-Spezifikationen** entsprechen, einschließlich, aber nicht beschränkt auf:
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
Lade zunächst die ausführbare Datei aus dem [Release](https://github.com/KrillinAI/KlicStudio/releases) herunter, die mit deinem Betriebssystem kompatibel ist. Wähle dann gemäß der folgenden Anleitung zwischen der Desktop- und der Nicht-Desktop-Version und lege sie in einen leeren Ordner. Lade die Software in einen leeren Ordner herunter, da nach dem Ausführen einige Verzeichnisse erstellt werden, die in einem leeren Ordner besser verwaltet werden können.  

【Wenn es sich um die Desktop-Version handelt, also die Release-Datei mit "desktop" endet, siehe hier】  
_Die Desktop-Version ist neu veröffentlicht worden, um das Problem zu lösen, dass neue Benutzer Schwierigkeiten haben, die Konfigurationsdateien korrekt zu bearbeiten. Es gibt einige Bugs, die kontinuierlich aktualisiert werden._
1. Doppelklicke auf die Datei, um sie zu verwenden (auch die Desktop-Version muss konfiguriert werden, die Konfiguration erfolgt innerhalb der Software)

【Wenn es sich um die Nicht-Desktop-Version handelt, also die Release-Datei ohne "desktop", siehe hier】  
_Die Nicht-Desktop-Version ist die ursprüngliche Version, die Konfiguration ist komplexer, aber die Funktionen sind stabil und sie eignet sich gut für die Serverbereitstellung, da sie die Benutzeroberfläche webbasiert bereitstellt._
1. Erstelle einen `config`-Ordner im Verzeichnis und dann eine `config.toml`-Datei im `config`-Ordner. Kopiere den Inhalt der `config-example.toml`-Datei aus dem Quellcodeverzeichnis in die `config.toml`-Datei und fülle deine Konfigurationsinformationen gemäß den Kommentaren aus.
2. Doppelklicke oder führe die ausführbare Datei im Terminal aus, um den Dienst zu starten 
3. Öffne den Browser und gib `http://127.0.0.1:8888` ein, um zu beginnen (ersetze 8888 durch den Port, den du in der Konfigurationsdatei angegeben hast)

### An: macOS-Benutzer
【Wenn es sich um die Desktop-Version handelt, also die Release-Datei mit "desktop" endet, siehe hier】  
Die aktuelle Verpackungsmethode für die Desktop-Version kann aufgrund von Signaturproblemen nicht direkt durch Doppelklick oder DMG-Installation ausgeführt werden. Du musst die Anwendung manuell vertrauen, wie folgt:
1. Öffne das Terminal im Verzeichnis der ausführbaren Datei (angenommen, der Dateiname ist KlicStudio_1.0.0_desktop_macOS_arm64)
2. Führe nacheinander die folgenden Befehle aus:
```
sudo xattr -cr ./KlicStudio_1.0.0_desktop_macOS_arm64
sudo chmod +x ./KlicStudio_1.0.0_desktop_macOS_arm64 
./KlicStudio_1.0.0_desktop_macOS_arm64
```

【Wenn es sich um die Nicht-Desktop-Version handelt, also die Release-Datei ohne "desktop", siehe hier】  
Diese Software ist nicht signiert, daher musst du beim Ausführen auf macOS nach der Konfiguration der Dateien in den "Grundschritten" die Anwendung manuell vertrauen, wie folgt:
1. Öffne das Terminal im Verzeichnis der ausführbaren Datei (angenommen, der Dateiname ist KlicStudio_1.0.0_macOS_arm64)
2. Führe nacheinander die folgenden Befehle aus:
   ```
    sudo xattr -rd com.apple.quarantine ./KlicStudio_1.0.0_macOS_arm64
    sudo chmod +x ./KlicStudio_1.0.0_macOS_arm64
    ./KlicStudio_1.0.0_macOS_arm64
    ```
    um den Dienst zu starten

### Docker-Bereitstellung
Dieses Projekt unterstützt die Docker-Bereitstellung. Bitte siehe die [Docker-Bereitstellungsanleitung](./docker.md)

### Cookie-Konfigurationsanleitung (nicht erforderlich)

Wenn du auf Probleme beim Herunterladen von Videos stößt,

bitte siehe die [Cookie-Konfigurationsanleitung](./get_cookies.md), um deine Cookie-Informationen zu konfigurieren.

### Konfigurationshilfe (unbedingt lesen)
Die schnellste und einfachste Konfigurationsmethode:
* Fülle `transcribe.provider.name` mit `openai`, dann musst du nur den Block `transcribe.openai` und die Konfiguration des großen Modells im Block `llm` ausfüllen, um die Untertitelübersetzung durchzuführen. (`app.proxy`, `model` und `openai.base_url` können je nach Bedarf ausgefüllt werden)

Verwendung der Konfiguration für lokale Spracherkennungsmodelle (Kombination von Kosten, Geschwindigkeit und Qualität):
* Fülle `transcribe.provider.name` mit `fasterwhisper`, `transcribe.fasterwhisper.model` mit `large-v2`, und fülle dann `llm` mit der Konfiguration des großen Modells aus, um die Untertitelübersetzung durchzuführen. Das lokale Modell wird automatisch heruntergeladen und installiert. (`app.proxy` und `openai.base_url` wie oben)

Text-zu-Sprache (TTS) ist optional, die Konfigurationslogik ist die gleiche wie oben. Fülle `tts.provider.name` aus und dann die entsprechenden Konfigurationsblöcke unter `tts`. Die Stimmen-Codes im UI sollten gemäß der Dokumentation des gewählten Anbieters ausgefüllt werden (die Dokumentationsadressen sind im Abschnitt häufige Fragen unten aufgeführt). Das Ausfüllen von Alibaba Cloud's aksk usw. kann sich wiederholen, um die Klarheit der Konfigurationsstruktur zu gewährleisten.  
Hinweis: Bei Verwendung von Sprachklonierung unterstützt `tts` nur die Auswahl von `aliyun`.

**Für den Erhalt von Alibaba Cloud AccessKey, Bucket, AppKey lies bitte**: [Alibaba Cloud Konfigurationsanleitung](./aliyun.md) 

Bitte verstehe, dass die Aufgabe = Spracherkennung + große Modellübersetzung + Sprachdienst (TTS usw., optional) ist, was dir beim Verständnis der Konfigurationsdatei sehr helfen wird.

## Häufige Fragen

Bitte gehe zu [Häufige Fragen](./faq.md)

## Beitragsrichtlinien
1. Reiche keine unnötigen Dateien ein, wie .vscode, .idea usw. Bitte nutze .gitignore, um sie herauszufiltern.
2. Reiche nicht config.toml ein, sondern verwende config-example.toml zur Einreichung.

## Kontaktiere uns
1. Trete unserer QQ-Gruppe bei, um Fragen zu klären: 754069680
2. Folge unseren Social-Media-Kanälen, [Bilibili](https://space.bilibili.com/242124650), wo wir täglich hochwertige Inhalte im Bereich AI-Technologie teilen.

## Star-Historie

[![Star-Historien-Diagramm](https://api.star-history.com/svg?repos=KrillinAI/KlicStudio&type=Date)](https://star-history.com/#KrillinAI/KlicStudio&Date)