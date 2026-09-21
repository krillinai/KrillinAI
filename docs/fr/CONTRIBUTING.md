# Guide de contribution (Français)

> [English](../../CONTRIBUTING.md) | [简体中文](../zh/CONTRIBUTING.md) | [日本語](../ja/CONTRIBUTING.md) | [한국어](../ko/CONTRIBUTING.md) | [Bahasa Indonesia](../id/CONTRIBUTING.md) | [Español](../es/CONTRIBUTING.md) | **Français** | [Deutsch](../de/CONTRIBUTING.md) | [Português](../pt/CONTRIBUTING.md) | [Русский](../ru/CONTRIBUTING.md) | [العربية](../ar/CONTRIBUTING.md)

Merci de vouloir contribuer à OpenCreator. OpenCreator est un espace de travail local-first pour les créateurs, construit sur la boucle d'agent Codex, et l'essentiel de sa valeur tient à des ajouts ciblés : un dossier de Skill, un modèle de création, un correctif bien délimité. Ce guide indique où placer chaque type de contribution et quels critères une PR doit remplir avant d'être fusionnée.

---

## Carte des contributions

| Si vous voulez… | Vous ajoutez en fait | Où cela vit | Taille de livraison |
|---|---|---|---|
| Corriger un bug ou améliorer un flux de travail | du code | `apps/web/`, `apps/daemon/` | une PR ciblée avec des tests |
| Ajouter un flux de travail réutilisable pour l'agent | un **Skill** | [`skills/<votre-skill>/`](../../skills/) | un dossier avec `SKILL.md` et des références optionnelles → [guide](./contributing/skills-contributing.md) |
| Ajouter un préréglage réutilisable d'image, vidéo ou couverture | un **modèle de création** | [`template/<module>/<id>/<version>/`](../../template/) | un dossier avec `template.json` et ses ressources → [guide](./contributing/templates-contributing.md) |
| Contribuer des illustrations, icônes ou designs d'UI | des ressources de design | emplacement convenu | une PR avec aperçus, fichiers sources et licence |
| Intégrer un service d'IA ou de médias | une **intégration de service** | module Web ou Daemon concerné | une PR avec gestion d'erreurs, sécurité des identifiants et tests |
| Améliorer la documentation ou les traductions | des docs | `README.md`, `docs/`, `docs/<locale>/README.md` | une PR |

Si vous ne savez pas dans quelle catégorie votre idée se range, [ouvrez d'abord une issue](https://github.com/krillinai/OpenCreator/issues/new) et nous vous indiquerons le bon endroit.

---

## Installation locale

L'installation complète se trouve dans le [démarrage rapide du README](../../README.md#quick-start). Version courte pour les contributeurs :

```bash
git clone https://github.com/krillinai/OpenCreator.git
cd OpenCreator
corepack enable          # sélectionne le pnpm épinglé dans packageManager
pnpm install
pnpm web:dev             # web + daemon local à la demande
pnpm typecheck           # vérifications TypeScript sur tout le dépôt
pnpm test                # tests unitaires et d'intégration du workspace
```

Node.js 22+ et un exécutable Codex CLI sont requis. Ouvrez `http://127.0.0.1:19861/` après `pnpm web:dev` ; le Runtime prépare un projet par défaut au premier lancement et l'éditeur est prêt dès que la connexion est établie.

---

## Comment contribuer

1. Décrivez le problème, le cas d'usage et le comportement attendu dans une [issue](https://github.com/krillinai/OpenCreator/issues).
2. Créez une branche ciblée de fonctionnalité ou de correctif depuis la dernière branche de développement.
3. Suivez l'architecture existante : les capacités générales du produit sont implémentées **une seule fois** dans Web et Daemon ; les différences natives de Desktop sont isolées derrière des capabilities explicites (par exemple `canSelectDirectory`).
4. Ajoutez une couverture de tests unitaires, d'intégration ou E2E adaptée aux changements de comportement, et listez dans la PR les vérifications effectuées comme celles ignorées.
5. Ne commitez jamais `.runtime/`, des identifiants locaux, des sessions Codex, des caches de build ou d'autres données utilisateur.

## Ce que vérifient les relecteurs

- **Une seule implémentation pour le comportement partagé.** La même fonctionnalité ne doit pas être implémentée séparément pour Browser Bridge et Desktop Bridge.
- **Contrôle par capabilities, pas de stubs silencieux.** Une entrée spécifique à une plateforme doit être masquée quand la capability n'est pas disponible — jamais un bouton affiché qui ne fait silencieusement rien.
- **Les tests correspondent au risque du changement.** De petits ajustements de texte ou de style n'exigent que des vérifications ciblées ; les changements d'état partagé, de persistance ou de contrats Runtime exigent au minimum des tests de module et un typecheck.
- **La documentation suit le comportement.** Si votre changement modifie un flux visible par l'utilisateur, mettez à jour le README ou le document concerné dans `docs/` dans la même PR.

## Raisons fréquentes de retour des PRs

- La même logique a été ajoutée séparément dans les chemins Web et Desktop au lieu de la couche de service partagée.
- Un bouton non pris en charge par la plateforme est visible mais son gestionnaire retourne silencieusement.
- Comportement modifié sans test ni note de vérification.
- La PR mélange un refactoring ou un correctif sans rapport avec le changement principal.
- Des fichiers générés, des données `.runtime/` ou des identifiants ont été commités.

---

OpenCreator · Create locally, work continuously.
