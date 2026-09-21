# Ein Creation-Template beitragen (Deutsch)

> [English](../../contributing/templates-contributing.md) | [简体中文](../../zh/contributing/templates-contributing.md) | [日本語](../../ja/contributing/templates-contributing.md) | [한국어](../../ko/contributing/templates-contributing.md) | [Bahasa Indonesia](../../id/contributing/templates-contributing.md) | [Español](../../es/contributing/templates-contributing.md) | [Français](../../fr/contributing/templates-contributing.md) | **Deutsch** | [Português](../../pt/contributing/templates-contributing.md) | [Русский](../../ru/contributing/templates-contributing.md) | [العربية](../../ar/contributing/templates-contributing.md)

Ein Creation-Template ist ein Ordner unter [`template/<module>/<id>/<version>/`](../../../template/) mit einer `template.json` und lokalen Assets. Templates versorgen die visuellen Auswahldialoge für Bildgenerierung, Videogenerierung und Cover-Generierung — Nutzer starten mit deinem Preset statt mit einem leeren Prompt. Diese Anleitung zeigt, wie du eines hinzufügst.

---

## Was ein Creation-Template IST / NICHT ist

**Ein Template IST:**
- Ein abgestimmtes Preset: Prompt-Defaults, Stilhinweise, Verhältnis-/Dauer-/Qualitätseinstellungen, plus Cover und Vorschau, die das Ergebnis zeigen.
- Eigenständig. Alles, was der Picker anzeigt, liegt im Template-Ordner.

**Ein Template IST NICHT:**
- Ein neuer Template-*Typ*. Die aktuellen Module sind `image-generation`, `video-generation` und `cover-generator`. Wenn du ein neues Modul brauchst, öffne zuerst ein Issue — das ist eine Produktänderung, kein Template.
- Eine Prompt-Sammlung. Templates mit leerem oder generischem Prompt und ohne lokalisierte Defaults werden zurückgewiesen; der Wert liegt in der Abstimmung.
- Die Arbeit anderer ohne Rechte. Siehe [Namensnennung und Rechte](#namensnennung-und-rechte).

## Schnellstart

```bash
corepack enable && pnpm install
cp -r template/cover-generator/images-go-hard-thumbnail template/<module>/<deine-template-id>
# template.json bearbeiten, Cover-/Vorschau-Assets ersetzen
pnpm templates:validate     # muss vor dem PR bestehen
```

Template-IDs sind kleingeschrieben mit Bindestrichen und innerhalb des Moduls eindeutig. Die Version startet bei `1` — ein Ordner pro Version, Updates entstehen also als `<id>/2/` statt `<id>/1/` zu bearbeiten.

## Ordneraufbau

```
template/<module>/<id>/1/
├── template.json        # erforderlich: Metadaten, Defaults, lokalisierte Inhalte
├── cover.jpg            # erforderlich: im Template-Picker angezeigt
├── preview.jpg          # Bild-/Cover-Module: größere Ergebnisvorschau
├── previewVideo         # Video-Modul: Beispielclip, z. B. example.mp4
└── author-avatar.jpg    # optional: Avatar des genannten Autors
```

## template.json-Felder

| Feld | Pflicht | Hinweise |
|---|---|---|
| `schemaVersion` | ja | Derzeit `1`. |
| `id`, `version`, `module` | ja | Muss dem Ordnerpfad `<module>/<id>/<version>/` entsprechen. |
| `runtimeTemplate` | ja | Abbildung auf den Runtime-Executor, z. B. `{"id": "cover", "version": 2}`. Von einem Template desselben Moduls kopieren. |
| `status` | ja | `published` zum Veröffentlichen; `draft` während der Arbeit. |
| `title`, `description` | ja | `zh-CN` und `en-US` sind erforderlich. Weitere Sprachen optional. |
| `cover` | ja | Relativer Pfad zum Picker-Thumbnail. |
| `preview` / `previewVideo` | modulabhängig | `preview` für Bild- und Cover-Module, `previewVideo` für Video. |
| `defaults` | ja | Die Basiseinstellungen, mit denen Nutzer starten (Prompt, Verhältnis, Dauer, Qualität …). |
| `defaultsByLocale` | dringend empfohlen | Lokalisierte Prompt- und Stil-Overrides pro Sprache. Hier steckt die eigentliche Abstimmung — siehe unten. |
| `tags` | empfohlen | Durchsuchbare Labels; sachlich halten. |
| `author` | falls zutreffend | `name`, `url`, `avatar` für genannte externe Quellen. |
| `featured`, `sortOrder` | nein | `featured: false` lassen; Maintainer entscheiden über Featuring. |

## Der Prompt ist das Produkt

Reviewer verbringen die meiste Zeit mit `defaults` und `defaultsByLocale`:

- **Beide Sprachen müssen echte Prompts sein**, keine Übersetzungen, die die Abstimmung verloren haben. Die `zh-CN`- und `en-US`-Prompts sollen mit ihren jeweiligen sprachlichen Stärken gleichwertige Ergebnisse erzeugen.
- **Parametrisiere, was sich ändern soll.** Wenn Überschrift oder Motiv vom Nutzer editierbar sind, sage das explizit im Prompt (bestehende Templates nutzen Marker wie "Customizable text: …").
- **Formuliere Einschränkungen.** "Kein Wasserzeichen, kein zusätzlicher Text, keine zusätzlichen Personen" — negative Constraints sind für reproduzierbare Ergebnisse genauso wichtig wie die Beschreibung.
- **Passe zur Defaults-Struktur des Moduls.** Bild-Templates tragen ratio/candidateCount/quality; Video-Templates size/duration; Cover-Templates Headline, Textsprache und Stilfelder. Kopiere die Struktur von einem bestehenden Template deines Moduls.

## Assets

- Erzeuge `cover.jpg` und die Vorschau **mit dem Template selbst** — ein Stock-Foto oder fremdes Artwork wird abgelehnt.
- Halte Dateigrößen moderat; diese Dateien werden mit der App ausgeliefert und im Picker geladen.
- Die Vorschau sollte ein *typisches* Ergebnis zeigen, nicht das beste aus fünfzig Versuchen.

## Namensnennung und Rechte

Wenn dein Template einen veröffentlichten Prompt oder Stil anderer adaptiert:

- Du musst das Recht zur Weiterverbreitung haben.
- Fülle das `author`-Feld mit `name` und `url` aus (und `author-avatar.jpg`, falls verfügbar), wie es bestehende Templates tun.
- Im Zweifel: öffne ein Issue und frag, bevor du die Arbeit investierst.

## Merge-Kriterien

- [ ] Ordnerpfad stimmt mit `id`/`version`/`module` überein; ID ist im Modul eindeutig.
- [ ] `pnpm templates:validate` besteht.
- [ ] `title` und `description` in `zh-CN` und `en-US` vorhanden.
- [ ] `defaultsByLocale` enthält abgestimmte Prompts für beide Sprachen.
- [ ] Cover- und Vorschau-Assets wurden mit dem Template selbst erzeugt.
- [ ] `author`-Nennung enthalten, wenn externe Arbeit adaptiert wurde.
- [ ] `featured: false`, `status: "published"` (oder `draft` mit Hinweis im PR).

## Häufige Ablehnungsgründe

- **Generischer Prompt** — das Template bietet keinen Mehrwert gegenüber einem leeren Prompt.
- **Fehlende Sprache** — nur eine Sprache abgestimmt, oder eine maschinelle Übersetzung, die die Stil-Constraints verloren hat.
- **Unpassende Assets** — das Cover entspricht nicht dem, was der Prompt tatsächlich erzeugt.
- **Unklare Rechte** — von fremder Arbeit adaptiert ohne Nennung oder Erlaubnis.
- **Alte Version überschrieben** — statt `<id>/1/` zu verändern, einen neuen Versionsordner anlegen.

---

Fragen? [Öffne ein Issue](https://github.com/krillinai/OpenCreator/issues/new) mit deiner Template-Idee und einem Beispiel-Ergebnis — wir helfen beim Abgrenzen.
