### 1. `app.log` Konfigurationsdatei nicht sichtbar, Fehlerinhalt kann nicht ermittelt werden
Windows-Benutzer sollten das Arbeitsverzeichnis dieser Software in einen Ordner außerhalb des C-Laufwerks legen.

### 2. Obwohl die Konfigurationsdatei für die Nicht-Desktop-Version erstellt wurde, erscheint der Fehler „Konfigurationsdatei nicht gefunden“
Stellen Sie sicher, dass der Name der Konfigurationsdatei `config.toml` ist und nicht `config.toml.txt` oder etwas anderes.
Nach der Konfiguration sollte die Struktur des Arbeitsordners dieser Software wie folgt aussehen:
```
/── config/
│   └── config.toml
├── cookies.txt （<- optionaler cookies.txt Datei）
└── krillinai.exe
```

### 3. Große Modellkonfiguration ausgefüllt, aber Fehler „xxxxx benötigt Konfiguration für xxxxx API Key“
Obwohl der Modellservice und der Sprachdienst beide die Dienste von OpenAI nutzen können, gibt es auch Szenarien, in denen das große Modell unabhängig von OpenAI verwendet wird. Daher sind diese beiden Konfigurationen getrennt. Neben der großen Modellkonfiguration sollten Sie im unteren Bereich der Konfiguration nach den Whisper-Konfigurationen suchen und die entsprechenden Schlüssel und Informationen ausfüllen.

### 4. Fehler enthält „yt-dlp error“
Das Problem mit dem Video-Downloader scheint derzeit nur ein Netzwerkproblem oder ein Versionsproblem des Downloaders zu sein. Überprüfen Sie, ob der Netzwerkproxy aktiviert ist und in den Proxy-Konfigurationseinstellungen der Konfigurationsdatei korrekt konfiguriert ist. Es wird empfohlen, einen Hongkong-Knoten auszuwählen. Der Downloader wird automatisch von dieser Software installiert. Ich werde die Installationsquelle aktualisieren, aber da es sich nicht um die offizielle Quelle handelt, kann es zu Verzögerungen kommen. Bei Problemen versuchen Sie, manuell zu aktualisieren. Die Aktualisierungsmethode:

Öffnen Sie ein Terminal im bin-Verzeichnis der Software und führen Sie aus:
```
./yt-dlp.exe -U
```
Ersetzen Sie hier `yt-dlp.exe` durch den tatsächlichen Namen der ytdlp-Software in Ihrem System.

### 5. Nach der Bereitstellung werden die Untertitel normal generiert, aber die eingebetteten Untertitel im Video enthalten viele Zeichenfehler
In den meisten Fällen liegt dies daran, dass auf Linux chinesische Schriftarten fehlen. Bitte laden Sie die Microsoft YaHei Schriftart im „Fonts“-Ordner [hier](https://modelscope.cn/models/Maranello/KrillinAI_dependency_cn/resolve/master/%E5%AD%97%E4%BD%93/msyh.ttc) herunter (oder wählen Sie eine Schriftart, die Ihren Anforderungen entspricht), und führen Sie dann die folgenden Schritte aus:
1. Erstellen Sie im Verzeichnis /usr/share/fonts/ einen neuen msyh-Ordner und kopieren Sie die heruntergeladene Schriftart in dieses Verzeichnis.
2. 
    ```
    cd /usr/share/fonts/msyh
    sudo mkfontscale
    sudo mkfontdir
    fc-cache
    ```