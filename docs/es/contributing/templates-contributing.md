# Contribuir una plantilla de creación (Español)

> [English](../../contributing/templates-contributing.md) | [简体中文](../../zh/contributing/templates-contributing.md) | [日本語](../../ja/contributing/templates-contributing.md) | [한국어](../../ko/contributing/templates-contributing.md) | [Bahasa Indonesia](../../id/contributing/templates-contributing.md) | **Español** | [Français](../../fr/contributing/templates-contributing.md) | [Deutsch](../../de/contributing/templates-contributing.md) | [Português](../../pt/contributing/templates-contributing.md) | [Русский](../../ru/contributing/templates-contributing.md) | [العربية](../../ar/contributing/templates-contributing.md)

Una plantilla de creación es una carpeta dentro de [`template/<módulo>/<id>/<versión>/`](../../../template/) con un `template.json` y sus recursos locales. Las plantillas alimentan los selectores visuales de generación de imágenes, videos y portadas: los usuarios empiezan desde tu preset en lugar de un prompt en blanco. Esta guía explica cómo añadir una.

---

## Qué ES / NO ES una plantilla de creación

**Una plantilla ES:**
- Un preset afinado: prompts por defecto, indicaciones de estilo, ajustes de proporción/duración/calidad, más una portada y vista previa que muestran el resultado.
- Autocontenida. Todo lo que muestra el selector vive en la carpeta de la plantilla.

**Una plantilla NO ES:**
- Un nuevo *tipo* de plantilla. Los módulos actuales son `image-generation`, `video-generation` y `cover-generator`. Si necesitas un módulo nuevo, abre primero un issue: es un cambio de producto, no una plantilla.
- Un volcado de prompts. Las plantillas con prompt vacío o genérico y sin defaults localizados serán rechazadas; el valor está en el ajuste.
- Trabajo ajeno sin derechos. Consulta [Atribución y derechos](#atribución-y-derechos).

## Inicio rápido

```bash
corepack enable && pnpm install
cp -r template/cover-generator/images-go-hard-thumbnail template/<módulo>/<tu-id-de-plantilla>
# edita template.json, sustituye los recursos de portada/vista previa
pnpm templates:validate     # debe pasar antes de abrir un PR
```

Los IDs de plantilla usan minúsculas con guiones y son únicos dentro del módulo. La versión empieza en `1`: una carpeta por versión, así que las actualizaciones crean `<id>/2/` en lugar de editar `<id>/1/`.

## Anatomía de la carpeta

```
template/<módulo>/<id>/1/
├── template.json        # obligatorio: metadatos, defaults, contenido localizado
├── cover.jpg            # obligatorio: se muestra en el selector de plantillas
├── preview.jpg          # módulos de imagen/portada: vista previa ampliada del resultado
├── previewVideo         # módulo de video: clip de ejemplo, p. ej. example.mp4
└── author-avatar.jpg    # opcional: avatar del autor acreditado
```

## Campos de template.json

| Campo | Obligatorio | Notas |
|---|---|---|
| `schemaVersion` | sí | Actualmente `1`. |
| `id`, `version`, `module` | sí | Deben coincidir con la ruta `<módulo>/<id>/<versión>/`. |
| `runtimeTemplate` | sí | Corresponde al ejecutor del Runtime, p. ej. `{"id": "cover", "version": 2}`. Copia de una plantilla del mismo módulo. |
| `status` | sí | `published` para publicar; usa `draft` mientras iteras. |
| `title`, `description` | sí | `zh-CN` y `en-US` son obligatorios. Otros idiomas opcionales. |
| `cover` | sí | Ruta relativa a la miniatura del selector. |
| `preview` / `previewVideo` | según módulo | `preview` para imagen y portada, `previewVideo` para video. |
| `defaults` | sí | Ajustes base desde los que parte el usuario (prompt, proporción, duración, calidad…). |
| `defaultsByLocale` | muy recomendado | Prompts y estilos localizados por idioma. Aquí reside el verdadero ajuste — ver abajo. |
| `tags` | recomendado | Etiquetas buscables; mantenlas objetivas. |
| `author` | si aplica | `name`, `url`, `avatar` para fuentes externas acreditadas. |
| `featured`, `sortOrder` | no | Deja `featured: false`; los mantenedores deciden el destacado. |

## El prompt es el producto

Los revisores dedican la mayor parte del tiempo a `defaults` y `defaultsByLocale`:

- **Ambos idiomas deben ser prompts reales**, no traducciones que perdieron el ajuste. Los prompts `zh-CN` y `en-US` deben producir resultados equivalentes aprovechando las fortalezas de cada idioma.
- **Parametriza lo que debe cambiar.** Si el titular o el sujeto son editables por el usuario, dilo explícitamente en el prompt (las plantillas existentes usan marcadores como "Customizable text: …").
- **Declara restricciones.** "Sin marca de agua, sin texto extra, sin personas extra": las restricciones negativas importan tanto como la descripción para resultados reproducibles.
- **Respeta la forma de `defaults` del módulo.** Las plantillas de imagen llevan ratio/candidateCount/quality; las de video size/duration; las de portada titular, idioma del texto y campos de estilo. Copia la forma de una plantilla existente de tu módulo.

## Recursos

- Genera `cover.jpg` y la vista previa **con la propia plantilla**: una imagen de stock o arte ajeno será rechazada.
- Mantén tamaños de archivo razonables; estos archivos se distribuyen con la app y se cargan en el selector.
- La vista previa debe representar un resultado *típico*, no el mejor de cincuenta intentos.

## Atribución y derechos

Si tu plantilla adapta un prompt o estilo publicado por otra persona:

- Debes tener derecho a redistribuirlo.
- Rellena el campo `author` con `name` y `url` (y `author-avatar.jpg` si está disponible), como hacen las plantillas existentes.
- En caso de duda, abre un issue y pregunta antes de hacer el trabajo.

## Criterios de fusión

- [ ] La ruta de la carpeta coincide con `id`/`version`/`module`; el ID es único en el módulo.
- [ ] `pnpm templates:validate` pasa.
- [ ] `title` y `description` en `zh-CN` y `en-US`.
- [ ] `defaultsByLocale` contiene prompts afinados para ambos idiomas.
- [ ] Los recursos de portada y vista previa fueron generados por la propia plantilla.
- [ ] Atribución `author` incluida al adaptar trabajo externo.
- [ ] `featured: false`, `status: "published"` (o `draft` con nota en el PR).

## Patrones frecuentes de rechazo

- **Prompt genérico** — la plantilla no aporta nada sobre un prompt en blanco; el selector no la necesita.
- **Idioma faltante** — solo un idioma afinado, o una traducción automática que perdió las restricciones de estilo.
- **Recursos incoherentes** — la portada no coincide con lo que el prompt realmente genera.
- **Derechos poco claros** — adaptado de trabajo ajeno sin atribución ni permiso.
- **Versión antigua editada en su lugar** — crea una carpeta de versión nueva en vez de reescribir el historial de `<id>/1/`.

---

¿Preguntas? [Abre un issue](https://github.com/krillinai/OpenCreator/issues/new) con tu idea de plantilla y una salida de ejemplo, y te ayudaremos a delimitarla.
