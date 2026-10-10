# Contribuer un Skill (Français)

> [English](../../contributing/skills-contributing.md) | [简体中文](../../zh/contributing/skills-contributing.md) | [日本語](../../ja/contributing/skills-contributing.md) | [한국어](../../ko/contributing/skills-contributing.md) | [Bahasa Indonesia](../../id/contributing/skills-contributing.md) | [Español](../../es/contributing/skills-contributing.md) | **Français** | [Deutsch](../../de/contributing/skills-contributing.md) | [Português](../../pt/contributing/skills-contributing.md) | [Русский](../../ru/contributing/skills-contributing.md) | [العربية](../../ar/contributing/skills-contributing.md)

Un Skill est un dossier sous [`skills/`](../../../skills/) avec un `SKILL.md` à sa racine, suivant la [convention `SKILL.md`](https://agentskills.io). Il empaquette un flux de travail réutilisable pour l'agent : quand l'utiliser, quelles commandes ou quels outils appeler, et comment interpréter les sorties. Ce guide explique comment en ajouter un.

---

## Ce qu'un Skill EST / N'EST PAS

**Un Skill EST :**
- Un flux de travail répétable que l'agent peut suivre, décrit en langage naturel plus des commandes.
- De la connaissance métier qui n'a pas sa place dans le code cœur : comment invoquer une étape CLI, comment structurer un prompt pour un fournisseur de médias, comment valider un plan.
- Petit. Un dossier, un `SKILL.md`, des `references/` optionnelles pour les contenus longs que l'agent lit à la demande.

**Un Skill N'EST PAS :**
- Une fonctionnalité produit. Les changements d'UI, les nouveaux endpoints Runtime et les nouveaux comportements du workspace sont des contributions de code (`apps/web/`, `apps/daemon/`).
- Une copie d'un Skill existant avec une formulation légèrement modifiée. Si votre changement améliore un flux existant, modifiez ce Skill directement.
- Une enveloppe autour d'identifiants ou de chemins locaux propres à un utilisateur. Les Skills doivent fonctionner depuis un checkout propre.

## Démarrage rapide

```bash
git clone https://github.com/krillinai/OpenCreator.git
cd OpenCreator
corepack enable && pnpm install
cp -r skills/krillinai-tts skills/<votre-skill>   # partez du Skill existant le plus proche
# modifiez skills/<votre-skill>/SKILL.md
pnpm web:dev                                      # vérifiez que l'agent le détecte en conversation
```

Le chemin le plus rapide consiste à copier le Skill le plus proche de votre idée puis à le réécrire — les Skills `krillinai-*` existants montrent la structure et le ton attendus.

## Anatomie d'un Skill

```
skills/<votre-skill>/
├── SKILL.md            # obligatoire : frontmatter + instructions
└── references/         # optionnel : docs longues pointées par SKILL.md
    └── cli-contract.md
```

`SKILL.md` commence par un frontmatter YAML :

```yaml
---
name: votre-skill
description: Use when <condition de déclenchement>, including <capacités principales>.
---
```

Deux règles appliquées par les relecteurs :

- **`name` doit correspondre au nom du dossier.** Minuscules avec tirets.
- **`description` est la surface de découverte.** C'est ce que l'agent lit pour décider si ce Skill s'applique. Rédigez-la en « Use when … », nommez le déclencheur et le résultat, et limitez-vous à une ou deux phrases. Les descriptions vagues (« aide avec la vidéo ») sont renvoyées.

Le corps doit couvrir, dans l'ordre :

1. **Quand l'utiliser** — un paragraphe.
2. **Commandes** — blocs de code avec l'invocation exacte, y compris les variables d'environnement ou répertoires de travail requis.
3. **Entrées et options** — un tableau pour tout ce qui n'est pas évident ; marquez obligatoire vs. optionnel.
4. **Sorties** — où aboutissent les résultats et comment les lire (par ex. « lire les chemins depuis le manifest »).
5. **Modes d'échec** — erreurs connues et conduite à tenir.

Gardez `SKILL.md` scannable. Déplacez les contrats longs, listes complètes d'options ou contextes dans `references/` et liez-les par chemins relatifs — l'agent ne lit les références qu'en cas de besoin.

## Tests locaux

Après `pnpm web:dev`, démarrez une conversation et décrivez une tâche qui devrait déclencher votre Skill. Vérifiez :

- L'agent sélectionne le Skill pour les bonnes requêtes — et pas pour des requêtes sans rapport.
- Les commandes du Skill s'exécutent depuis un checkout propre sans corrections manuelles.
- Les chemins de sortie et la gestion d'erreurs correspondent à la documentation.

## Critères de fusion

Un relecteur vérifiera chaque élément — collez cette liste dans votre PR et cochez-la :

- [ ] Le nom du dossier et le frontmatter `name` correspondent ; minuscules avec tirets.
- [ ] `description` nomme la condition de déclenchement et le résultat (« Use when … »).
- [ ] Les commandes fonctionnent depuis un checkout propre ; aucun chemin local absolu ni identifiant.
- [ ] Entrées, sorties et modes d'échec documentés.
- [ ] Les contenus de référence longs vivent dans `references/`, pas en ligne.
- [ ] Vérifié dans une conversation réelle : le Skill se déclenche quand il doit — et seulement alors.
- [ ] Si le Skill chevauche un existant, la PR explique pourquoi un Skill séparé est justifié.

## Motifs fréquents de rejet

- **Doublon d'un Skill existant** avec seulement des changements cosmétiques de formulation — améliorez plutôt l'existant.
- **Une fonctionnalité déguisée** — le Skill ne fonctionne qu'avec des changements de code dans le Runtime ou l'UI ; soumettez le changement de code dans sa propre PR.
- **Commandes non testées** — options inexistantes ou sorties ne correspondant pas aux chemins documentés.
- **Prérequis non documentés** — le Skill suppose tacitement une configuration de fournisseur, un binaire ou un service réseau.

---

Des questions ? [Ouvrez une issue](https://github.com/krillinai/OpenCreator/issues/new) avec le sujet `skill` et nous vous aiderons à cadrer.
