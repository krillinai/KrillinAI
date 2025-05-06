### 1. `app.log` Konfigurationsdatei ist nicht sichtbar, daher kann der Fehlerinhalt nicht ermittelt werden
Windows-Benutzer sollten das Arbeitsverzeichnis dieser Software in einen Ordner außerhalb des C-Laufwerks legen.

### 2. Die Konfigurationsdatei wurde zwar erstellt, aber es erscheint der Fehler „Konfigurationsdatei nicht gefunden“
Stellen Sie sicher, dass der Dateiname der Konfigurationsdatei `config.toml` ist und nicht `config.toml.txt` oder etwas anderes.
Nach der Konfiguration sollte die Struktur des Arbeitsordners dieser Software wie folgt aussehen:
```
/── config/
│   └── config.toml
├── cookies.txt （<- optionaler cookies.txt Datei）
└── krillinai.exe
```

### 3. Große Modellkonfiguration ausgefüllt, aber der Fehler „xxxxx benötigt die Konfiguration des xxxxx API-Schlüssels“ erscheint
Obwohl sowohl der Modellservice als auch der Sprachdienst die Dienste von OpenAI nutzen können, gibt es auch Szenarien, in denen große Modelle unabhängig von OpenAI verwendet werden. Daher sind diese beiden Konfigurationen getrennt. Neben der großen Modellkonfiguration sollten Sie im unteren Bereich der Konfiguration nach den Whisper-Konfigurationen suchen und die entsprechenden Schlüssel und Informationen ausfüllen.

### 4. Fehler enthält „yt-dlp error“
Das Problem mit dem Video-Downloader scheint derzeit nur ein Netzwerkproblem oder ein Versionsproblem des Downloaders zu sein. Überprüfen Sie, ob der Netzwerkproxy aktiviert ist und ob er in den Proxy-Konfigurationseinstellungen der Konfigurationsdatei korrekt konfiguriert ist. Es wird auch empfohlen, einen Hongkong-Knoten auszuwählen. Der Downloader wird automatisch von dieser Software installiert. Ich werde die Installationsquelle aktualisieren, aber da es sich nicht um eine offizielle Quelle handelt, kann es zu Verzögerungen kommen. Wenn Probleme auftreten, versuchen Sie, manuell zu aktualisieren. Die Aktualisierungsmethode:

Öffnen Sie ein Terminal im Verzeichnis der Software-Bin-Datei und führen Sie aus:
```
./yt-dlp.exe -U
```
Ersetzen Sie hier `yt-dlp.exe` durch den tatsächlichen Namen der ytdlp-Software in Ihrem System.