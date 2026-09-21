# Leitfaden für Beiträge (Deutsch)

> [English](../../CONTRIBUTING.md) | [简体中文](../zh/CONTRIBUTING.md) | [日本語](../ja/CONTRIBUTING.md) | [한국어](../ko/CONTRIBUTING.md) | [Bahasa Indonesia](../id/CONTRIBUTING.md) | [Español](../es/CONTRIBUTING.md) | [Français](../fr/CONTRIBUTING.md) | **Deutsch** | [Português](../pt/CONTRIBUTING.md) | [Русский](../ru/CONTRIBUTING.md) | [العربية](../ar/CONTRIBUTING.md)

Danke, dass du zu OpenCreator beitragen möchtest. OpenCreator ist ein Local-First-Workspace für Kreative auf Basis des Codex-Agent-Loops, und der größte Mehrwert entsteht durch fokussierte Ergänzungen: ein Skill-Ordner, ein Creation-Template, ein klar abgegrenzter Fix. Dieser Leitfaden zeigt, wo jede Art von Beitrag hingehört und welche Anforderungen ein PR vor dem Merge erfüllen muss.

---

## Beitrags-Übersicht

| Wenn du … | Dann fügst du hinzu | Ort | Umfang |
|---|---|---|---|
| einen Bug beheben oder einen Workflow verbessern möchtest | Code | `apps/web/`, `apps/daemon/` | ein fokussierter PR mit Tests |
| einen wiederverwendbaren Agent-Workflow hinzufügen möchtest | einen **Skill** | [`skills/<dein-skill>/`](../../skills/) | ein Ordner mit `SKILL.md` und optionalen Referenzen → [Anleitung](./contributing/skills-contributing.md) |
| ein wiederverwendbares Bild-, Video- oder Cover-Preset hinzufügen möchtest | ein **Creation-Template** | [`template/<module>/<id>/<version>/`](../../template/) | ein Ordner mit `template.json` und Assets → [Anleitung](./contributing/templates-contributing.md) |
| Illustrationen, Icons oder UI-Designs beisteuern möchtest | Design-Assets | vereinbarter Asset-Ort | ein PR mit Vorschauen, Quelldateien und Lizenz |
| einen KI- oder Mediendienst anbinden möchtest | eine **Service-Integration** | relevantes Web- oder Daemon-Modul | ein PR mit Fehlerbehandlung, Credential-Sicherheit und Tests |
| Dokumentation oder Übersetzungen verbessern möchtest | Docs | `README.md`, `docs/`, `docs/<locale>/README.md` | ein PR |

Wenn du nicht sicher bist, in welche Kategorie deine Idee fällt, [öffne zuerst ein Issue](https://github.com/krillinai/OpenCreator/issues/new) — wir zeigen dir die richtige Anlaufstelle.

---

## Lokale Einrichtung

Die vollständige Einrichtung steht im [README-Quickstart](../../README.md#quick-start). Kurzfassung für Contributors:

```bash
git clone https://github.com/krillinai/OpenCreator.git
cd OpenCreator
corepack enable          # wählt die gepinnte pnpm-Version aus packageManager
pnpm install
pnpm web:dev             # Web + lokaler Daemon bei Bedarf
pnpm typecheck           # TypeScript-Prüfungen im gesamten Repository
pnpm test                # Unit- und Integrationstests des Workspaces
```

Node.js 22+ und eine Codex-CLI sind erforderlich. Nach `pnpm web:dev` `http://127.0.0.1:19861/` öffnen; die Runtime erstellt beim ersten Start automatisch ein Standardprojekt, und der Composer ist bereit, sobald die Verbindung steht.

---

## So trägst du bei

1. Beschreibe das Problem, den Anwendungsfall und das erwartete Verhalten in einem [Issue](https://github.com/krillinai/OpenCreator/issues).
2. Erstelle einen fokussierten Feature- oder Fix-Branch vom aktuellen Entwicklungsbranch.
3. Folge der bestehenden Architektur: Allgemeine Produktfunktionen werden **einmal** in Web und Daemon implementiert; Desktop-native Unterschiede werden über explizite Capabilities isoliert (z. B. `canSelectDirectory`).
4. Füge für Verhaltensänderungen passende Unit-, Integrations- oder E2E-Tests hinzu und liste im PR sowohl durchgeführte als auch übersprungene Verifizierungen auf.
5. Committe niemals `.runtime/`, lokale Zugangsdaten, Codex-Sessions, Build-Caches oder andere Nutzerdaten.

## Was Reviewer prüfen

- **Eine einzige Implementierung für geteiltes Verhalten.** Dieselbe Funktion darf nicht getrennt für Browser Bridge und Desktop Bridge implementiert werden.
- **Capability-Gating statt stiller Stubs.** Ein plattformspezifischer Einstieg muss ausgeblendet werden, wenn die Capability nicht verfügbar ist — niemals einen Button zeigen, der still nichts tut.
- **Tests passend zum Änderungsrisiko.** Kleine Text- oder Style-Anpassungen brauchen nur gezielte Prüfungen; Änderungen an geteiltem State, Persistenz oder Runtime-Verträgen erfordern mindestens Modultests und Typecheck.
- **Dokumentation wird mit dem Verhalten aktualisiert.** Wenn deine Änderung einen nutzersichtbaren Workflow verändert, aktualisiere im selben PR die README oder die relevante Datei in `docs/`.

## Häufige Gründe für zurückgewiesene PRs

- Dieselbe Logik wurde getrennt in Web- und Desktop-Pfaden hinzugefügt statt im geteilten Service-Layer.
- Ein von der Plattform nicht unterstützter Button ist sichtbar, aber der Handler kehrt still zurück.
- Verhalten geändert ohne Tests oder Verifizierungshinweis.
- Der PR mischt ein unrelated Refactoring oder einen fremden Fix in eine Feature-Änderung.
- Generierte Dateien, `.runtime/`-Daten oder Zugangsdaten wurden committet.

---

OpenCreator · Create locally, work continuously.
