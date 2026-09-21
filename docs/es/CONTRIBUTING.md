# Guía de contribución (Español)

> [English](../../CONTRIBUTING.md) | [简体中文](../zh/CONTRIBUTING.md) | [日本語](../ja/CONTRIBUTING.md) | [한국어](../ko/CONTRIBUTING.md) | [Bahasa Indonesia](../id/CONTRIBUTING.md) | **Español** | [Français](../fr/CONTRIBUTING.md) | [Deutsch](../de/CONTRIBUTING.md) | [Português](../pt/CONTRIBUTING.md) | [Русский](../ru/CONTRIBUTING.md) | [العربية](../ar/CONTRIBUTING.md)

Gracias por querer contribuir a OpenCreator. OpenCreator es un espacio de trabajo local-first para creadores construido sobre el bucle del agente Codex, y la mayor parte de su valor proviene de aportes pequeños y enfocados: una carpeta de Skill, una plantilla de creación, un arreglo bien delimitado. Esta guía indica dónde va cada tipo de contribución y qué debe cumplir un PR antes de ser fusionado.

---

## Mapa de contribuciones

| Si quieres… | En realidad añades | Dónde vive | Tamaño de entrega |
|---|---|---|---|
| Corregir un bug o mejorar un flujo de trabajo | código | `apps/web/`, `apps/daemon/` | un PR enfocado con pruebas |
| Añadir un flujo de trabajo reutilizable para el agente | un **Skill** | [`skills/<tu-skill>/`](../../skills/) | una carpeta con `SKILL.md` y referencias opcionales → [guía](./contributing/skills-contributing.md) |
| Añadir un preset reutilizable de imagen, video o portada | una **plantilla de creación** | [`template/<módulo>/<id>/<versión>/`](../../template/) | una carpeta con `template.json` y recursos → [guía](./contributing/templates-contributing.md) |
| Aportar ilustraciones, iconos o diseños de UI | recursos de diseño | ubicación acordada | un PR con vistas previas, archivos fuente y licencia |
| Integrar un servicio de IA o de medios | una **integración de servicio** | módulo Web o Daemon correspondiente | un PR con manejo de errores, seguridad de credenciales y pruebas |
| Mejorar documentación o traducciones | docs | `README.md`, `docs/`, `docs/<locale>/README.md` | un PR |

Si no sabes en qué categoría encaja tu idea, [abre primero un issue](https://github.com/krillinai/OpenCreator/issues/new) y te indicaremos el lugar correcto.

---

## Configuración local

La configuración completa está en el [inicio rápido del README](../../README.md#quick-start). Resumen para contribuyentes:

```bash
git clone https://github.com/krillinai/OpenCreator.git
cd OpenCreator
corepack enable          # selecciona el pnpm fijado en packageManager
pnpm install
pnpm web:dev             # web + daemon local bajo demanda
pnpm typecheck           # comprobaciones de TypeScript en todo el repositorio
pnpm test                # pruebas unitarias e de integración del workspace
```

Se requiere Node.js 22+ y un ejecutable de Codex CLI. Abre `http://127.0.0.1:19861/` tras `pnpm web:dev`; el Runtime prepara un proyecto por defecto en el primer inicio y el editor queda listo en cuanto se completa la conexión.

---

## Cómo contribuir

1. Describe el problema, el caso de uso y el comportamiento esperado en un [issue](https://github.com/krillinai/OpenCreator/issues).
2. Crea una rama enfocada de funcionalidad o corrección desde la rama de desarrollo más reciente.
3. Sigue la arquitectura existente: las capacidades generales del producto se implementan **una sola vez** en Web y Daemon; las diferencias nativas de Desktop se aíslan detrás de capabilities explícitas (por ejemplo `canSelectDirectory`).
4. Añade cobertura de pruebas unitarias, de integración o E2E apropiada para los cambios de comportamiento, y enumera en el PR tanto las verificaciones realizadas como las omitidas.
5. Nunca confirmes `.runtime/`, credenciales locales, sesiones de Codex, cachés de compilación u otros datos de usuario.

## Qué revisan los revisores

- **Una única implementación para el comportamiento compartido.** La misma función no debe implementarse por separado para Browser Bridge y Desktop Bridge.
- **Control por capabilities, no stubs silenciosos.** Una entrada específica de plataforma debe ocultarse cuando la capability no está disponible; nunca mostrar un botón que no hace nada silenciosamente.
- **Las pruebas corresponden al riesgo del cambio.** Ajustes pequeños de texto o estilo solo necesitan comprobaciones dirigidas; cambios en estado compartido, persistencia o contratos del Runtime requieren al menos pruebas de módulo y typecheck.
- **La documentación se actualiza con el comportamiento.** Si tu cambio altera un flujo visible para el usuario, actualiza el README o el documento correspondiente en `docs/` en el mismo PR.

## Razones frecuentes de rechazo de PRs

- La misma lógica se añadió por separado en las rutas de Web y Desktop en lugar de en la capa de servicio compartida.
- Un botón no soportado por la plataforma es visible pero su manejador retorna silenciosamente.
- Comportamiento modificado sin pruebas ni nota de verificación.
- El PR mezcla una refactorización o corrección no relacionada con el cambio principal.
- Se confirmaron archivos generados, datos de `.runtime/` o credenciales.

---

OpenCreator · Create locally, work continuously.
