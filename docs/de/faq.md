### 1. Das Programm meldet "Konfigurationsdatei nicht gefunden" oder "xxxxx erfordert die Konfiguration des xxxxx API-Schlüssels." Wie kann ich das beheben?

Dies ist ein häufiges Einrichtungsproblem. Es gibt einige Gründe, warum dies passieren könnte:

1. **Falscher Dateipfad oder Name:**

* Das Programm benötigt eine Konfigurationsdatei mit dem genauen Namen `config.toml`. Stellen Sie sicher, dass Sie sie nicht versehentlich `config.toml.txt` genannt haben.
* Diese Datei muss sich in einem `config`-Ordner befinden. Die korrekte Struktur des Arbeitsverzeichnisses sollte wie folgt aussehen:
  ```
  /── config/
  │   └── config.toml
  └── krillinai.exe (Ihre ausführbare Datei)
  ```
* **Für Windows-Benutzer:** Es wird empfohlen, das gesamte Softwareverzeichnis in einen Ordner zu legen, der sich nicht auf dem C:-Laufwerk befindet, um mögliche Berechtigungsprobleme zu vermeiden.

2. **Unvollständige API-Schlüssel-Konfiguration:**

* Die Anwendung benötigt separate Konfigurationen für das große Sprachmodell (für Übersetzungen), den Sprachdienst (für Transkription und Sprachsynthese) und den TTS-Dienst.
* Selbst wenn Sie OpenAI für alles verwenden, müssen Sie den Schlüssel in verschiedenen Abschnitten der `config.toml`-Datei ausfüllen. Suchen Sie nach dem Abschnitt `llm`, dem Abschnitt `transcribe`, dem Abschnitt `tts` und fügen Sie die entsprechenden API-Schlüssel und andere erforderliche Informationen ein.

### 2. Ich erhalte einen Fehler, der "yt-dlp error" enthält. Was soll ich tun?

Dieser Fehler weist auf ein Problem mit dem Video-Downloader hin, das normalerweise mit Ihrem Netzwerk oder der Version des Downloaders zusammenhängt.

* **Netzwerk:** Wenn Sie einen Proxy verwenden, stellen Sie sicher, dass er in den Proxy-Einstellungen in Ihrer `config.toml`-Datei korrekt konfiguriert ist.
* **Aktualisieren Sie `yt-dlp`:** Die mit der Software gebündelte Version von `yt-dlp` könnte veraltet sein. Sie können sie manuell aktualisieren, indem Sie ein Terminal im `bin`-Verzeichnis der Software öffnen und den Befehl ausführen:
  ```
  ./yt-dlp.exe -U
  ```
  
  (Ersetzen Sie `yt-dlp.exe` durch den korrekten Dateinamen für Ihr Betriebssystem, falls er abweicht).

### 3. Die Untertitel im endgültigen Video sind unleserlich oder erscheinen als quadratische Blöcke, insbesondere unter Linux.

Dies wird fast immer durch fehlende Schriftarten im System verursacht, insbesondere solche, die chinesische Zeichen unterstützen. Um dies zu beheben, müssen Sie die erforderlichen Schriftarten installieren.

1. Laden Sie die benötigten Schriftarten herunter, wie [Microsoft YaHei](https://modelscope.cn/models/Maranello/KrillinAI_dependency_cn/resolve/master/%E5%AD%97%E4%BD%93/msyh.ttc) und [Microsoft YaHei Bold](https://modelscope.cn/models/Maranello/KrillinAI_dependency_cn/resolve/master/%E5%AD%97%E4%BD%93/msyhbd.ttc).
2. Erstellen Sie ein neues Schriftartenverzeichnis: `sudo mkdir -p /usr/share/fonts/msyh`.
3. Kopieren Sie die heruntergeladenen `.ttc`-Schriftartdateien in dieses neue Verzeichnis.
4. Führen Sie die folgenden Befehle aus, um den Schriftarten-Cache neu zu erstellen:
    ```
    cd /usr/share/fonts/msyh
    sudo mkfontscale
    sudo mkfontdir
    sudo fc-cache -fv
    ```

### 4. Unter macOS startet die Anwendung nicht und zeigt einen Fehler wie "KrillinAI ist beschädigt und kann nicht geöffnet werden."

Dies wird durch die Sicherheitsfunktion von macOS, Gatekeeper, verursacht, die Apps von nicht identifizierten Entwicklern einschränkt. Um dies zu beheben, müssen Sie manuell das Quarantäne-Attribut entfernen.

1. Öffnen Sie die **Terminal**-App.
2. Geben Sie den Befehl `xattr -cr` gefolgt von einem Leerzeichen ein, und ziehen Sie dann die Datei `KrillinAI.app` aus Ihrem Finder-Fenster in das Terminal. Der Befehl sieht dann etwa so aus:
    ```
    xattr -cr /Applications/KrillinAI.app
    ```
3. Drücken Sie die Eingabetaste. Sie sollten nun in der Lage sein, die Anwendung zu öffnen.

### 5. Ich erhalte Fehler wie `ffmpeg error`, `audioToSrt error` oder `exit status 1` während der Verarbeitung.

Diese Fehler weisen normalerweise auf Probleme mit Abhängigkeiten oder Systemressourcen hin.

* **`ffmpeg error`:** Dies deutet darauf hin, dass `ffmpeg` entweder nicht installiert oder nicht im System-Pfad zugänglich ist. Stellen Sie sicher, dass Sie eine vollständige, offizielle Version von `ffmpeg` installiert haben und dass ihr Speicherort zu den Umgebungsvariablen Ihres Systems hinzugefügt wurde.
* **`audioToSrt error` oder `exit status 1`:** Dieser Fehler tritt während der Transkriptionsphase (Audio-zu-Text) auf. Die häufigsten Ursachen sind:
  * **Modellprobleme:** Das lokale Transkriptionsmodell (z. B. `fasterwhisper`) konnte nicht geladen werden oder war während des Downloads beschädigt.
  * **Unzureichender Speicher (RAM):** Das Ausführen lokaler Modelle ist ressourcenintensiv. Wenn Ihr Computer nicht genügend Speicher hat, kann das Betriebssystem den Prozess beenden, was zu einem Fehler führt.
  * **Netzwerkausfall:** Wenn Sie einen Online-Transkriptionsdienst (wie die Whisper-API von OpenAI) verwenden, deutet dies auf ein Problem mit Ihrer Netzwerkverbindung oder einen ungültigen API-Schlüssel hin.

### 6. Der Fortschrittsbalken bewegt sich nicht. Ist das Programm eingefroren?

Nein, solange Sie keine Fehlermeldung sehen, arbeitet das Programm. Der Fortschrittsbalken wird nur nach Abschluss einer größeren Aufgabe (wie Transkription oder Video-Encoding) aktualisiert. Diese Aufgaben können sehr zeitaufwendig sein, was dazu führen kann, dass der Fortschrittsbalken für längere Zeit pausiert. Bitte haben Sie Geduld und warten Sie, bis die Aufgabe abgeschlossen ist.

### 7. Meine NVIDIA 5000-Serie GPU wird von `fasterwhisper` nicht unterstützt. Was soll ich tun?

Es wurde beobachtet, dass das `fasterwhisper`-Modell möglicherweise nicht korrekt mit NVIDIA 5000-Serie GPUs funktioniert (Stand Mitte 2025). Sie haben einige Alternativen für die Transkription:

1. **Verwenden Sie ein cloudbasiertes Modell:** Setzen Sie `transcribe.provider.name` in Ihrer `config.toml`-Datei auf `openai` oder `aliyun`. Füllen Sie dann den entsprechenden API-Schlüssel und die Konfigurationsdetails aus. Dies verwendet das Whisper-Modell des Cloud-Anbieters anstelle des lokalen.
2. **Verwenden Sie ein anderes lokales Modell:** Sie können mit anderen lokalen Transkriptionsmodellen experimentieren, wie dem ursprünglichen `whisper.cpp`.

### 8. Wie finde und fülle ich den richtigen Sprach-/Toncode für die Sprachsynthese aus?

Die verfügbaren Stimmen und ihre entsprechenden Codes werden vom Sprachdienstanbieter definiert, den Sie verwenden. Bitte beziehen Sie sich auf deren offizielle Dokumentation.

* **OpenAI TTS:** [Dokumentation](https://platform.openai.com/docs/guides/text-to-speech/api-reference) (siehe die `voice`-Optionen).
* **Alibaba Cloud:** [Dokumentation](https://help.aliyun.com/zh/isi/developer-reference/overview-of-speech-synthesis) (siehe den `voice`-Parameter in der Tonliste).

### 9. Wie kann ich ein lokales großes Sprachmodell (LLM), wie eines, das auf Ollama läuft, für Übersetzungen verwenden?

Ja, Sie können KrillinAI so konfigurieren, dass es jedes lokale LLM verwendet, das einen OpenAI-kompatiblen API-Endpunkt bereitstellt.

1. **Starten Sie Ihr lokales LLM:** Stellen Sie sicher, dass Ihr lokaler Dienst (z. B. Ollama, das Llama3 ausführt) aktiv und zugänglich ist.
2. **Bearbeiten Sie `config.toml`:** Im Abschnitt für das große Sprachmodell (Übersetzer):

* Setzen Sie den Anbieter `name` (oder `type`) auf `"openai"`.
* Setzen Sie den `api_key` auf einen beliebigen zufälligen String (z. B. `"ollama"`), da er für lokale Aufrufe nicht benötigt wird.
* Setzen Sie die `base_url` auf den API-Endpunkt Ihres lokalen Modells. Für Ollama ist dies typischerweise `http://localhost:11434/v1`.
* Setzen Sie das `model` auf den Namen des Modells, das Sie bereitstellen, zum Beispiel `"llama3"`.

### 10. Kann ich den Untertitelstil (Schriftart, Größe, Farbe) im endgültigen Video anpassen?

Nein. Derzeit generiert KrillinAI **hardcodierte Untertitel**, was bedeutet, dass sie direkt in die Videorahmen eingebrannt werden. Die Anwendung **bietet keine Optionen zur Anpassung des Untertitelstils**; sie verwendet einen vordefinierten Stil.

Für eine erweiterte Anpassung ist der empfohlene Workaround:

1. Verwenden Sie KrillinAI, um die übersetzte `.srt`-Untertiteldatei zu generieren.
2. Importieren Sie Ihr Originalvideo und diese `.srt`-Datei in einen professionellen Video-Editor (z. B. Premiere Pro, Final Cut Pro, DaVinci Resolve), um benutzerdefinierte Stile vor dem Rendern anzuwenden.

### 11. Ich habe bereits eine übersetzte `.srt`-Datei. Kann KrillinAI sie verwenden, um nur das Synchronisieren durchzuführen?

Nein, diese Funktion wird derzeit nicht unterstützt. Die Anwendung führt eine vollständige Pipeline von der Transkription bis zur endgültigen Videoerstellung aus.