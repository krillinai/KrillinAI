# Einen Skill beitragen (Deutsch)

> [English](../../contributing/skills-contributing.md) | [简体中文](../../zh/contributing/skills-contributing.md) | [日本語](../../ja/contributing/skills-contributing.md) | [한국어](../../ko/contributing/skills-contributing.md) | [Bahasa Indonesia](../../id/contributing/skills-contributing.md) | [Español](../../es/contributing/skills-contributing.md) | [Français](../../fr/contributing/skills-contributing.md) | **Deutsch** | [Português](../../pt/contributing/skills-contributing.md) | [Русский](../../ru/contributing/skills-contributing.md) | [العربية](../../ar/contributing/skills-contributing.md)

Ein Skill ist ein Ordner unter [`skills/`](../../../skills/) mit einer `SKILL.md` im Wurzelverzeichnis, der der [`SKILL.md`-Konvention](https://agentskills.io) folgt. Er bündelt einen wiederverwendbaren Agent-Workflow: wann er zu nutzen ist, welche Befehle oder Tools aufzurufen sind und wie die Ausgaben zu interpretieren sind. Diese Anleitung zeigt, wie du einen Skill hinzufügst.

---

## Was ein Skill IST / NICHT ist

**Ein Skill IST:**
- Ein wiederholbarer Workflow, dem der Agent folgen kann, beschrieben in natürlicher Sprache plus Befehlen.
- Domänenwissen, das nicht in den Kerncode gehört: wie eine CLI-Stufe aufgerufen wird, wie ein Prompt für einen Medienanbieter aufgebaut ist, wie ein Plan validiert wird.
- Klein. Ein Ordner, eine `SKILL.md`, optionale `references/` für längeres Material, das der Agent bei Bedarf liest.

**Ein Skill IST NICHT:**
- Ein Produkt-Feature. UI-Änderungen, neue Runtime-Endpunkte und neues Workspace-Verhalten sind Code-Beiträge (`apps/web/`, `apps/daemon/`).
- Eine Kopie eines bestehenden Skills mit leicht geänderten Formulierungen. Wenn deine Änderung einen bestehenden Workflow verbessert, bearbeite diesen Skill direkt.
- Ein Wrapper um Zugangsdaten oder benutzerspezifische lokale Pfade. Skills müssen aus einem sauberen Checkout heraus funktionieren.

## Schnellstart

```bash
git clone https://github.com/krillinai/OpenCreator.git
cd OpenCreator
corepack enable && pnpm install
cp -r skills/krillinai-tts skills/<dein-skill>   # vom ähnlichsten bestehenden Skill starten
# skills/<dein-skill>/SKILL.md bearbeiten
pnpm web:dev                                     # prüfen, ob der Agent ihn in einer Konversation erkennt
```

Der schnellste Weg ist, den Skill zu kopieren, der deiner Idee am nächsten kommt, und ihn umzuschreiben — die bestehenden `krillinai-*`-Skills zeigen die erwartete Struktur und Tonalität.

## Skill-Aufbau

```
skills/<dein-skill>/
├── SKILL.md            # erforderlich: Frontmatter + Anweisungen
└── references/         # optional: längere Docs, auf die SKILL.md verweist
    └── cli-contract.md
```

`SKILL.md` beginnt mit YAML-Frontmatter:

```yaml
---
name: dein-skill
description: Use when <Auslösebedingung>, including <Hauptfähigkeiten>.
---
```

Zwei Regeln, die Reviewer durchsetzen:

- **`name` muss dem Ordnernamen entsprechen.** Kleinbuchstaben, mit Bindestrichen.
- **`description` ist die Auffindbarkeits-Fläche.** Der Agent liest sie, um zu entscheiden, ob dieser Skill passt. Formuliere sie als "Use when …", nenne Auslöser und Ergebnis und halte sie bei ein bis zwei Sätzen. Vage Beschreibungen ("hilft bei Video") werden zurückgewiesen.

Der Inhalt sollte in dieser Reihenfolge aufgebaut sein:

1. **Wann nutzen** — ein Absatz.
2. **Befehle** — Codeblöcke mit dem exakten Aufruf, inklusive erforderlicher Umgebungsvariablen oder Arbeitsverzeichnisse.
3. **Eingaben und Flags** — eine Tabelle für alles Nicht-offensichtliche; erforderlich vs. optional kennzeichnen.
4. **Ausgaben** — wo Ergebnisse landen und wie man sie liest (z. B. "Pfade aus dem Manifest lesen").
5. **Fehlerfälle** — bekannte Fehler und was dagegen zu tun ist.

Halte `SKILL.md` überfliegbar. Lange Verträge, vollständige Flag-Listen oder Hintergrundmaterial gehören in `references/` und werden per relativem Pfad verlinkt — der Agent liest Referenzen nur bei Bedarf.

## Lokales Testen

Starte nach `pnpm web:dev` eine Konversation und beschreibe eine Aufgabe, die deinen Skill auslösen sollte. Prüfe:

- Der Agent wählt den Skill bei den richtigen Anfragen — und nicht bei unrelated Anfragen.
- Die Befehle im Skill laufen aus einem sauberen Checkout ohne manuelle Nacharbeit.
- Ausgabepfade und Fehlerbehandlung entsprechen der Dokumentation.

## Merge-Kriterien

Ein Reviewer prüft jeden der folgenden Punkte — füge sie in deinen PR ein und hake sie ab:

- [ ] Ordnername und `name`-Frontmatter stimmen überein; Kleinbuchstaben mit Bindestrichen.
- [ ] `description` nennt Auslösebedingung und Ergebnis ("Use when …").
- [ ] Befehle laufen aus einem sauberen Checkout; keine absoluten lokalen Pfade oder Zugangsdaten.
- [ ] Eingaben, Ausgaben und Fehlerfälle sind dokumentiert.
- [ ] Langes Referenzmaterial liegt in `references/`, nicht inline.
- [ ] In einer echten Konversation verifiziert: der Skill triggert, wenn er soll — und nur dann.
- [ ] Falls der Skill einen bestehenden überlappt, erklärt der PR, warum ein separater Skill gerechtfertigt ist.

## Häufige Ablehnungsgründe

- **Duplikat eines bestehenden Skills** mit nur kosmetischen Formulierungsänderungen — verbessere stattdessen den bestehenden.
- **Ein getarntes Feature** — der Skill funktioniert nur mit Code-Änderungen an Runtime oder UI; reiche die Code-Änderung als eigenen PR ein.
- **Ungetestete Befehle** — Flags, die nicht existieren, oder Ausgaben, die nicht den dokumentierten Pfaden entsprechen.
- **Nicht dokumentierte Voraussetzungen** — der Skill setzt stillschweigend eine Provider-Konfiguration, ein Binary oder einen Netzwerkdienst voraus.

---

Fragen? [Öffne ein Issue](https://github.com/krillinai/OpenCreator/issues/new) mit dem Thema `skill` — wir helfen dir beim Abgrenzen.
