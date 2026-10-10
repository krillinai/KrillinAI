# Contribuer un modèle de création (Français)

> [English](../../contributing/templates-contributing.md) | [简体中文](../../zh/contributing/templates-contributing.md) | [日本語](../../ja/contributing/templates-contributing.md) | [한국어](../../ko/contributing/templates-contributing.md) | [Bahasa Indonesia](../../id/contributing/templates-contributing.md) | [Español](../../es/contributing/templates-contributing.md) | **Français** | [Deutsch](../../de/contributing/templates-contributing.md) | [Português](../../pt/contributing/templates-contributing.md) | [Русский](../../ru/contributing/templates-contributing.md) | [العربية](../../ar/contributing/templates-contributing.md)

Un modèle de création est un dossier sous [`template/<module>/<id>/<version>/`](../../../template/) avec un `template.json` et ses ressources locales. Les modèles alimentent les sélecteurs visuels de génération d'images, de vidéos et de couvertures — les utilisateurs partent de votre préréglage plutôt que d'un prompt vide. Ce guide explique comment en ajouter un.

---

## Ce qu'un modèle de création EST / N'EST PAS

**Un modèle EST :**
- Un préréglage affiné : prompts par défaut, indications de style, réglages de ratio/durée/qualité, plus une couverture et un aperçu montrant le résultat.
- Autonome. Tout ce que le sélecteur affiche vit dans le dossier du modèle.

**Un modèle N'EST PAS :**
- Un nouveau *type* de modèle. Les modules actuels sont `image-generation`, `video-generation` et `cover-generator`. Si vous avez besoin d'un nouveau module, ouvrez d'abord une issue — c'est un changement produit, pas un modèle.
- Un simple recueil de prompts. Les modèles avec un prompt vide ou générique et sans valeurs localisées seront renvoyés ; la valeur réside dans l'affinage.
- Le travail d'autrui sans droits. Voir [Attribution et droits](#attribution-et-droits).

## Démarrage rapide

```bash
corepack enable && pnpm install
cp -r template/cover-generator/images-go-hard-thumbnail template/<module>/<votre-id-de-modele>
# modifiez template.json, remplacez les ressources de couverture/aperçu
pnpm templates:validate     # doit passer avant d'ouvrir une PR
```

Les identifiants de modèle sont en minuscules avec tirets et uniques au sein du module. La version commence à `1` — un dossier par version : les mises à jour créent `<id>/2/` au lieu de modifier `<id>/1/`.

## Anatomie du dossier

```
template/<module>/<id>/1/
├── template.json        # obligatoire : métadonnées, défauts, contenus localisés
├── cover.jpg            # obligatoire : affiché dans le sélecteur de modèles
├── preview.jpg          # modules image/couverture : aperçu agrandi du résultat
├── previewVideo         # module vidéo : clip d'exemple, par ex. example.mp4
└── author-avatar.jpg    # optionnel : avatar de l'auteur crédité
```

## Champs de template.json

| Champ | Obligatoire | Remarques |
|---|---|---|
| `schemaVersion` | oui | Actuellement `1`. |
| `id`, `version`, `module` | oui | Doivent correspondre au chemin `<module>/<id>/<version>/`. |
| `runtimeTemplate` | oui | Correspond à l'exécuteur Runtime, par ex. `{"id": "cover", "version": 2}`. Copiez depuis un modèle du même module. |
| `status` | oui | `published` pour publier ; utilisez `draft` pendant l'itération. |
| `title`, `description` | oui | `zh-CN` et `en-US` sont obligatoires. Les autres langues sont optionnelles. |
| `cover` | oui | Chemin relatif vers la vignette du sélecteur. |
| `preview` / `previewVideo` | selon le module | `preview` pour image et couverture, `previewVideo` pour la vidéo. |
| `defaults` | oui | Les réglages de base de départ (prompt, ratio, durée, qualité…). |
| `defaultsByLocale` | fortement recommandé | Prompts et styles localisés par langue. C'est là que réside le vrai affinage — voir ci-dessous. |
| `tags` | recommandé | Étiquettes recherchables ; restez factuel. |
| `author` | si applicable | `name`, `url`, `avatar` pour les sources externes créditées. |
| `featured`, `sortOrder` | non | Laissez `featured: false` ; les mainteneurs décident de la mise en avant. |

## Le prompt est le produit

Les relecteurs passent l'essentiel de leur temps sur `defaults` et `defaultsByLocale` :

- **Les deux langues doivent être de vrais prompts**, pas des traductions ayant perdu l'affinage. Les prompts `zh-CN` et `en-US` doivent produire des résultats équivalents en tirant parti des forces de chaque langue.
- **Paramétrez ce qui doit changer.** Si le titre ou le sujet est modifiable par l'utilisateur, dites-le explicitement dans le prompt (les modèles existants utilisent des marqueurs comme « Customizable text: … »).
- **Énoncez les contraintes.** « Pas de filigrane, pas de texte supplémentaire, pas de personnes supplémentaires » — les contraintes négatives comptent autant que la description pour des résultats reproductibles.
- **Respectez la structure des `defaults` du module.** Les modèles d'image portent ratio/candidateCount/quality ; ceux de vidéo size/duration ; ceux de couverture le titre, la langue du texte et les champs de style. Copiez la structure d'un modèle existant de votre module.

## Ressources

- Générez `cover.jpg` et l'aperçu **avec le modèle lui-même** — une image de stock ou un visuel sans rapport sera rejetée.
- Gardez des tailles de fichiers raisonnables ; ces fichiers sont distribués avec l'application et chargés dans le sélecteur.
- L'aperçu doit représenter un résultat *typique*, pas le meilleur de cinquante essais.

## Attribution et droits

Si votre modèle adapte un prompt ou un style publié par quelqu'un d'autre :

- Vous devez avoir le droit de le redistribuer.
- Renseignez le champ `author` avec `name` et `url` (et `author-avatar.jpg` si disponible), comme le font les modèles existants.
- En cas de doute, ouvrez une issue et demandez avant d'investir le travail.

## Critères de fusion

- [ ] Le chemin du dossier correspond à `id`/`version`/`module` ; l'ID est unique dans le module.
- [ ] `pnpm templates:validate` passe.
- [ ] `title` et `description` fournis en `zh-CN` et `en-US`.
- [ ] `defaultsByLocale` contient des prompts affinés pour les deux langues.
- [ ] Les ressources de couverture et d'aperçu ont été générées par le modèle lui-même.
- [ ] Attribution `author` incluse lors de l'adaptation d'un travail externe.
- [ ] `featured: false`, `status: "published"` (ou `draft` avec une note dans la PR).

## Motifs fréquents de rejet

- **Prompt générique** — le modèle n'apporte rien par rapport à un prompt vide ; le sélecteur n'en a pas besoin.
- **Langue manquante** — une seule langue affinée, ou une traduction automatique ayant perdu les contraintes de style.
- **Ressources incohérentes** — la couverture ne correspond pas à ce que le prompt génère réellement.
- **Droits incertains** — adaptation du travail d'autrui sans attribution ni permission.
- **Ancienne version modifiée sur place** — créez un nouveau dossier de version au lieu de réécrire l'historique de `<id>/1/`.

---

Des questions ? [Ouvrez une issue](https://github.com/krillinai/OpenCreator/issues/new) avec votre idée de modèle et un exemple de résultat, et nous vous aiderons à cadrer.
