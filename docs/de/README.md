<div align="center">
  <img src="/docs/images/logo.jpg" alt="KlicStudio" height="90">

# Minimalistisches KI-Videoübersetzungs- und Synchronisationstool

<a href="https://trendshift.io/repositories/13360" target="_blank"><img src="https://trendshift.io/api/badge/repositories/13360" alt="KrillinAI%2FKlicStudio | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

**[English](/README.md)｜[简体中文](/docs/zh/README.md)｜[日本語](/docs/jp/README.md)｜[한국어](/docs/kr/README.md)｜[Tiếng Việt](/docs/vi/README.md)｜[Français](/docs/fr/README.md)｜[Deutsch](/docs/de/README.md)｜[Español](/docs/es/README.md)｜[Português](/docs/pt/README.md)｜[Русский](/docs/rus/README.md)｜[اللغة العربية](/docs/ar/README.md)**

[![Twitter](https://img.shields.io/badge/Twitter-KrillinAI-orange?logo=twitter)](https://x.com/KrillinAI)
[![QQ 群](https://img.shields.io/badge/QQ%20群-754069680-green?logo=tencent-qq)](https://jq.qq.com/?_wv=1027&k=754069680)
[![Bilibili](https://img.shields.io/badge/dynamic/json?label=Bilibili&query=%24.data.follower&suffix=粉丝&url=https%3A%2F%2Fapi.bilibili.com%2Fx%2Frelation%2Fstat%3Fvmid%3D242124650&logo=bilibili&color=00A1D6&labelColor=FE7398&logoColor=FFFFFF)](https://space.bilibili.com/242124650)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/krillinai/KlicStudio)

</div>

## Projektvorstellung  ([Probieren Sie jetzt die Online-Version aus!](https://www.klic.studio/))
[**Schnellstart**](#-quick-start)

Klic Studio ist eine vielseitige Lösung zur Lokalisierung und Verbesserung von Audio und Video, die von Krillin AI entwickelt wurde. Dieses minimalistische, aber leistungsstarke Tool integriert Videoübersetzung, Synchronisation und Sprachklonierung und unterstützt sowohl Quer- als auch Hochformat, um eine perfekte Präsentation auf allen wichtigen Plattformen (Bilibili, Xiaohongshu, Douyin, WeChat Video, Kuaishou, YouTube, TikTok usw.) zu gewährleisten. Mit einem End-to-End-Workflow können Sie Rohmaterialien mit nur wenigen Klicks in wunderschön bereitgestellte plattformübergreifende Inhalte verwandeln.

## Hauptmerkmale und Funktionen:

🎯 **Ein-Klick-Start**: Keine komplexe Umgebungs-Konfiguration erforderlich, automatische Abhängigkeitsinstallation, sofort einsatzbereit, mit einer neuen Desktop-Version für einfacheren Zugriff!

📥 **Videoerfassung**: Unterstützt yt-dlp-Downloads oder lokale Datei-Uploads

📜 **Genauigkeit der Erkennung**: Hochgenaue Spracherkennung basierend auf Whisper

🧠 **Intelligente Segmentierung**: Untertitel-Segmentierung und -Ausrichtung mit LLM

🔄 **Terminologieersetzung**: Ein-Klick-Ersetzung von Fachvokabular

🌍 **Professionelle Übersetzung**: LLM-Übersetzung mit Kontext zur Beibehaltung natürlicher Semantik

🎙️ **Sprachklonierung**: Bietet ausgewählte Sprachstimmen von CosyVoice oder benutzerdefinierte Sprachklonierung

🎬 **Videokomposition**: Automatische Verarbeitung von Quer- und Hochformatvideos sowie Untertitel-Layout

💻 **Plattformübergreifend**: Unterstützt Windows, Linux, macOS und bietet sowohl Desktop- als auch Serverversionen

## Effekt-Demonstration

Das Bild unten zeigt den Effekt der Untertiteldatei, die nach dem Import eines 46-minütigen lokalen Videos und der Ausführung mit einem Klick ohne manuelle Anpassungen generiert wurde. Es gibt keine Auslassungen oder Überlappungen, die Segmentierung ist natürlich und die Übersetzungsqualität ist sehr hoch.
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

### Hochformatmodus

---

https://github.com/user-attachments/assets/c2c7b528-0ef8-4ba9-b8ac-f9f92f6d4e71

</td>

</tr>
</table>

## 🔍 Unterstützte Spracherkennungsdienste

_**Alle lokalen Modelle in der folgenden Tabelle unterstützen die automatische Installation von ausführbaren Dateien + Modell-Dateien; Sie müssen nur auswählen, und Klic wird alles für Sie vorbereiten.**_

| Dienstquelle           | Unterstützte Plattformen | Modelloptionen                             | Lokal/Cloud | Anmerkungen                     |
|------------------------|-------------------------|-------------------------------------------|-------------|---------------------------------|
| **OpenAI Whisper**     | Alle Plattformen        | -                                         | Cloud       | Schnelle Geschwindigkeit und gute Wirkung  |
| **FasterWhisper**      | Windows/Linux           | `tiny`/`medium`/`large-v2` (empfohlen medium+) | Lokal       | Schnellere Geschwindigkeit, keine Kosten für Cloud-Dienste |
| **WhisperKit**         | macOS (nur M-Serie)     | `large-v2`                               | Lokal       | Native Optimierung für Apple-Chips |
| **WhisperCpp**         | Alle Plattformen        | `large-v2`                               | Lokal       | Unterstützt alle Plattformen       |
| **Alibaba Cloud ASR**  | Alle Plattformen        | -                                         | Cloud       | Vermeidet Netzwerkprobleme in Festland-China |

## 🚀 Unterstützung für große Sprachmodelle

✅ Kompatibel mit allen Cloud-/lokalen großen Sprachmodell-Diensten, die den **OpenAI API-Spezifikationen** entsprechen, einschließlich, aber nicht beschränkt auf:

- OpenAI
- Gemini
- DeepSeek
- Tongyi Qianwen
- Lokal bereitgestellte Open-Source-Modelle
- Andere API-Dienste, die mit dem OpenAI-Format kompatibel sind

## 🎤 TTS Text-to-Speech Unterstützung

- Alibaba Cloud Voice Service
- OpenAI TTS

## Sprachunterstützung

Unterstützte Eingabesprachen: Chinesisch, Englisch, Japanisch, Deutsch, Türkisch, Koreanisch, Russisch, Malaiisch (kontinuierlich steigend)

Unterstützte Übersetzungssprachen: Englisch, Chinesisch, Russisch, Spanisch, Französisch und 101 andere Sprachen

## Schnittstellenvorschau

![Schnittstellenvorschau](/docs/images/ui_desktop_light.png)
![Schnittstellenvorschau](/docs/images/ui_desktop_dark.png)

## 🚀 Schnellstart

Sie können Fragen auf dem [Deepwiki von KlicStudio](https://deepwiki.com/krillinai/KlicStudio) stellen. Es indiziert die Dateien im Repository, sodass Sie schnell Antworten finden können.

### Grundlegende Schritte

Laden Sie zunächst die ausführbare Datei herunter, die mit Ihrem Gerätesystem von der [Release](https://github.com/KrillinAI/KlicStudio/releases) übereinstimmt, und folgen Sie dann dem Tutorial unten, um zwischen der Desktop-Version oder der Nicht-Desktop-Version zu wählen. Platzieren Sie den Software-Download in einem leeren Ordner, da beim Ausführen einige Verzeichnisse generiert werden, und das Halten in einem leeren Ordner erleichtert die Verwaltung.

【Wenn es sich um die Desktop-Version handelt, d.h. die Release-Datei mit "desktop", siehe hier】
_Die Desktop-Version wurde neu veröffentlicht, um die Probleme neuer Benutzer zu beheben, die Schwierigkeiten haben, Konfigurationsdateien korrekt zu bearbeiten, und es gibt einige Fehler, die kontinuierlich aktualisiert werden._

1. Doppelklicken Sie auf die Datei, um sie zu verwenden (die Desktop-Version erfordert auch eine Konfiguration innerhalb der Software)

【Wenn es sich um die Nicht-Desktop-Version handelt, d.h. die Release-Datei ohne "desktop", siehe hier】
_Die Nicht-Desktop-Version ist die ursprüngliche Version, die eine komplexere Konfiguration hat, aber in der Funktionalität stabil ist und sich für die Serverbereitstellung eignet, da sie eine Benutzeroberfläche im Webformat bietet._

1. Erstellen Sie einen `config`-Ordner innerhalb des Ordners, und erstellen Sie dann eine `config.toml`-Datei im `config`-Ordner. Kopieren Sie den Inhalt der `config-example.toml`-Datei aus dem Quellcodeverzeichnis `config` in `config.toml` und fügen Sie Ihre Konfigurationsinformationen gemäß den Kommentaren ein.
2. Doppelklicken Sie oder führen Sie die ausführbare Datei im Terminal aus, um den Dienst zu starten
3. Öffnen Sie Ihren Browser und geben Sie `http://127.0.0.1:8888` ein, um ihn zu verwenden (ersetzen Sie 8888 durch den Port, den Sie in der Konfigurationsdatei angegeben haben)

### An: macOS-Benutzer

【Wenn es sich um die Desktop-Version handelt, d.h. die Release-Datei mit "desktop", siehe hier】
Aufgrund von Signierungsproblemen kann die Desktop-Version derzeit nicht durch Doppelklick ausgeführt oder über dmg installiert werden; Sie müssen die Anwendung manuell vertrauen. Die Methode ist wie folgt:

1. Öffnen Sie das Terminal im Verzeichnis, in dem sich die ausführbare Datei (angenommen, der Dateiname ist KlicStudio_1.0.0_desktop_macOS_arm64) befindet
2. Führen Sie die folgenden Befehle der Reihe nach aus:

```
sudo xattr -cr ./KlicStudio_1.0.0_desktop_macOS_arm64
sudo chmod +x ./KlicStudio_1.0.0_desktop_macOS_arm64 
./KlicStudio_1.0.0_desktop_macOS_arm64
```

【Wenn es sich um die Nicht-Desktop-Version handelt, d.h. die Release-Datei ohne "desktop", siehe hier】
Diese Software ist nicht signiert, daher müssen Sie beim Ausführen auf macOS nach Abschluss der Datei-Konfiguration in den "Grundlegenden Schritten" auch der Anwendung manuell vertrauen. Die Methode ist wie folgt:

1. Öffnen Sie das Terminal im Verzeichnis, in dem sich die ausführbare Datei (angenommen, der Dateiname ist KlicStudio_1.0.0_macOS_arm64) befindet
2. Führen Sie die folgenden Befehle der Reihe nach aus:
   ```
   sudo xattr -rd com.apple.quarantine ./KlicStudio_1.0.0_macOS_arm64
   sudo chmod +x ./KlicStudio_1.0.0_macOS_arm64
   ./KlicStudio_1.0.0_macOS_arm64
   ```
   
   Dies wird den Dienst starten

### Docker-Bereitstellung

Dieses Projekt unterstützt die Docker-Bereitstellung; bitte beziehen Sie sich auf die [Docker-Bereitstellungsanweisungen](./docker.md)

### CLI-Verwendung

KrillinAI bietet jetzt eine stufenbasierte CLI für Skripte, Automatisierungspipelines und AI Agents. Die CLI läuft standardmäßig synchron, gibt nach Abschluss eine JSON-Zeile über stdout aus und schreibt `krillinai_manifest.json` in das Arbeitsverzeichnis, damit spätere Stufen vorhandene Artefakte wiederverwenden können.

CLI aus dem Quellcode bauen:

```bash
go build -o build/krillinai-cli ./cmd/cli
```

Befehlsübersicht:

| Befehl | Zweck | Häufige Artefakte |
|---|---|---|
| `subtitle` | Untertitel aus YouTube-/Bilibili-Links oder lokalen Videos erzeugen; Plattformuntertitel werden bevorzugt, bei Fehlschlag wird auf Whisper zurückgegriffen | `origin_language_srt.srt`, `target_language_srt.srt`, `bilingual_srt.srt`, `short_origin_mixed_srt.srt` |
| `tts` | Zielsprachige Vertonung aus Zieluntertiteln erzeugen | `tts_final_audio.wav`, `video_with_tts.mp4` |
| `render-horizontal` | Querformatvideo erzeugen: Originalvideo + zweisprachige Untertitel oder vertontes Video + Zielsprachenuntertitel | `horizontal_bilingual.mp4` |
| `render-vertical` | Hochformatvideo erzeugen: Originalvideo ins Hochformat umwandeln + kurze Untertitel oder vertontes Video + Zielsprachenuntertitel | `transferred_vertical_video.mp4`, `vertical_bilingual.mp4` |
| `pipeline` | Mehrere Stufen anhand von outputs verbinden | Abhängig von den gewählten Stufen |
| `cover` | Cover aus dem ursprünglichen Videocover und einer Prompt-Vorlage erzeugen | `generated_cover.png` |

Typischer Workflow:

```bash
# 1. Quell-, Ziel-, zweisprachige und kurze Hochformat-Untertitel erzeugen
./build/krillinai-cli subtitle "https://www.youtube.com/watch?v=dQw4w9WgXcQ" \
  --origin-lang en \
  --target-lang zh_cn \
  --workdir tasks/demo \
  --caption-source any

# 2. Vertonung aus Zielsprachenuntertiteln erzeugen
./build/krillinai-cli tts \
  --workdir tasks/demo \
  --input-srt tasks/demo/target_language_srt.srt \
  --line-mode target-only \
  --video tasks/demo/origin_video.mp4

# 3. Querformatvideo mit zweisprachigen Untertiteln erzeugen
./build/krillinai-cli render-horizontal \
  --workdir tasks/demo \
  --video tasks/demo/origin_video.mp4 \
  --subtitle tasks/demo/bilingual_srt.srt

# 4. Hochformatvideo mit kurzen zweisprachigen Untertiteln erzeugen
./build/krillinai-cli render-vertical \
  --workdir tasks/demo \
  --video tasks/demo/origin_video.mp4 \
  --subtitle tasks/demo/short_origin_mixed_srt.srt \
  --major-title "Heutiges Thema" \
  --minor-title "AI Video"
```

Agent-Integrationsregeln:

- Zuerst die letzte JSON-Zeile in stdout und `krillinai_manifest.json` auswerten; normale Logs nicht parsen.
- Das Feld `outputs` enthält Artefaktpfade; spätere Befehle können nur mit `--workdir` das Manifest wiederverwenden.
- `--dry-run` prüft Parameter und erzeugt ein Manifest, ohne Videos herunterzuladen oder externe AI-Dienste aufzurufen.
- Fehler nach `error.kind` behandeln: `usage` bedeutet Parameter korrigieren, `retryable` bedeutet erneut versuchen, `dependency` bedeutet `ffmpeg` / `ffprobe` / `yt-dlp` installieren.

Weitere Parameterdetails finden Sie in der [CLI-Funktionsübersicht](../zh/cli.md).

### Agent Skills

Das Repository enthält außerdem sofort nutzbare Agent Skills unter `skills/`, damit Agents die CLI mit stabilen Konventionen aufrufen können:

- [`krillinai-cli`](../../skills/krillinai-cli/SKILL.md): zentrale Routing-Skill zur Auswahl von Untertitel-, TTS-, Render-, Pipeline- oder Cover-Workflows.
- [`krillinai-subtitle`](../../skills/krillinai-subtitle/SKILL.md), [`krillinai-tts`](../../skills/krillinai-tts/SKILL.md), [`krillinai-render-horizontal`](../../skills/krillinai-render-horizontal/SKILL.md) und [`krillinai-render-vertical`](../../skills/krillinai-render-vertical/SKILL.md): stufenspezifische Betriebsanleitungen.
- [`krillinai-pipeline`](../../skills/krillinai-pipeline/SKILL.md) und [`krillinai-cover`](../../skills/krillinai-cover/SKILL.md): Planungs-/Reservierungsleitfäden für Pipeline-Orchestrierung und Cover-Erzeugung, bis diese Ausführungspfade vollständig verdrahtet sind.
- [`cli-contract.md`](../../skills/krillinai-cli/references/cli-contract.md): gemeinsamer Vertrag für JSON, Manifest, Ausgaben und Fehlerbehandlung.

Basierend auf der bereitgestellten Konfigurationsdatei finden Sie hier den aktualisierten Abschnitt "Konfigurationshilfe (Unbedingt lesen)" für Ihre README-Datei:

### Konfigurationshilfe (Unbedingt lesen)

Die Konfigurationsdatei ist in mehrere Abschnitte unterteilt: `[app]`, `[server]`, `[llm]`, `[transcribe]` und `[tts]`. Eine Aufgabe besteht aus Spracherkennung (`transcribe`) + Übersetzung durch ein großes Modell (`llm`) + optionale Sprachdienste (`tts`). Dies zu verstehen, wird Ihnen helfen, die Konfigurationsdatei besser zu erfassen.

**Einfachste und schnellste Konfiguration:**

**Nur für Untertitelübersetzung:**
   * Setzen Sie im Abschnitt `[transcribe]` `provider.name` auf `openai`.
   * Sie müssen dann nur noch Ihren OpenAI-API-Schlüssel im Block `[llm]` ausfüllen, um mit der Untertitelübersetzung zu beginnen. `app.proxy`, `model` und `openai.base_url` können nach Bedarf ausgefüllt werden.

**Ausgewogenes Kosten-, Geschwindigkeits- und Qualitätsverhältnis (Verwendung der lokalen Spracherkennung):**

* Setzen Sie im Abschnitt `[transcribe]` `provider.name` auf `fasterwhisper`.
* Setzen Sie `transcribe.fasterwhisper.model` auf `large-v2`.
* Füllen Sie Ihre Konfiguration für das große Sprachmodell im Block `[llm]` aus.
* Das erforderliche lokale Modell wird automatisch heruntergeladen und installiert.

**Text-to-Speech (TTS) Konfiguration (Optional):**

* Die TTS-Konfiguration ist optional.
* Setzen Sie zunächst den `provider.name` im Abschnitt `[tts]` (z.B. `aliyun` oder `openai`).
* Füllen Sie dann den entsprechenden Konfigurationsblock für den ausgewählten Anbieter aus. Wenn Sie beispielsweise `aliyun` wählen, müssen Sie den Abschnitt `[tts.aliyun]` ausfüllen.
* Sprachcodes in der Benutzeroberfläche sollten basierend auf der Dokumentation des ausgewählten Anbieters ausgewählt werden.
* **Hinweis:** Wenn Sie die Sprachklonierungsfunktion verwenden möchten, müssen Sie `aliyun` als TTS-Anbieter auswählen.

**Alibaba Cloud Konfiguration:**

* Für Details zum Erhalt des erforderlichen `AccessKey`, `Bucket` und `AppKey` für Alibaba Cloud-Dienste, siehe die [Alibaba Cloud Konfigurationsanweisungen](https://www.google.com/search?q=./aliyun.md). Die wiederholten Felder für AccessKey usw. sind so gestaltet, dass eine klare Konfigurationsstruktur aufrechterhalten wird.

## Häufig gestellte Fragen

Bitte besuchen Sie die [Häufig gestellten Fragen](./faq.md)

## Beitragsrichtlinien

1. Reichen Sie keine nutzlosen Dateien ein, wie .vscode, .idea usw.; verwenden Sie bitte .gitignore, um sie herauszufiltern.
2. Reichen Sie keine config.toml ein; reichen Sie stattdessen config-example.toml ein.

## Kontaktieren Sie uns

1. Treten Sie unserer QQ-Gruppe für Fragen bei: 754069680
2. Folgen Sie unseren Social-Media-Konten, [Bilibili](https://space.bilibili.com/242124650), wo wir täglich qualitativ hochwertige Inhalte im Bereich der KI-Technologie teilen.

## Star-Historie

[![Star-Historien-Diagramm](https://api.star-history.com/svg?repos=KrillinAI/KlicStudio&type=Date)](https://star-history.com/#KrillinAI/KlicStudio&Date)
