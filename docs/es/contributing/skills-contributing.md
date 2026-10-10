# Contribuir un Skill (Español)

> [English](../../contributing/skills-contributing.md) | [简体中文](../../zh/contributing/skills-contributing.md) | [日本語](../../ja/contributing/skills-contributing.md) | [한국어](../../ko/contributing/skills-contributing.md) | [Bahasa Indonesia](../../id/contributing/skills-contributing.md) | **Español** | [Français](../../fr/contributing/skills-contributing.md) | [Deutsch](../../de/contributing/skills-contributing.md) | [Português](../../pt/contributing/skills-contributing.md) | [Русский](../../ru/contributing/skills-contributing.md) | [العربية](../../ar/contributing/skills-contributing.md)

Un Skill es una carpeta dentro de [`skills/`](../../../skills/) con un `SKILL.md` en su raíz, que sigue la [convención `SKILL.md`](https://agentskills.io). Empaqueta un flujo de trabajo reutilizable para el agente: cuándo usarlo, qué comandos o herramientas invocar y cómo interpretar las salidas. Esta guía explica cómo añadir uno.

---

## Qué ES / NO ES un Skill

**Un Skill ES:**
- Un flujo de trabajo repetible que el agente puede seguir, descrito en lenguaje natural más comandos.
- Conocimiento de dominio que no pertenece al código central: cómo invocar una etapa de CLI, cómo estructurar un prompt para un proveedor de medios, cómo validar un plan.
- Pequeño. Una carpeta, un `SKILL.md`, y `references/` opcional para material más extenso que el agente lee bajo demanda.

**Un Skill NO ES:**
- Una funcionalidad de producto. Los cambios de UI, nuevos endpoints del Runtime y nuevos comportamientos del workspace son contribuciones de código (`apps/web/`, `apps/daemon/`).
- Una copia de un Skill existente con redacción ligeramente modificada. Si tu cambio mejora un flujo existente, edita ese Skill directamente.
- Un envoltorio de credenciales o rutas locales de un usuario específico. Los Skills deben funcionar desde un checkout limpio.

## Inicio rápido

```bash
git clone https://github.com/krillinai/OpenCreator.git
cd OpenCreator
corepack enable && pnpm install
cp -r skills/krillinai-tts skills/<tu-skill>   # empieza desde el Skill existente más cercano
# edita skills/<tu-skill>/SKILL.md
pnpm web:dev                                   # verifica que el agente lo detecta en una conversación
```

El camino más rápido es copiar el Skill más cercano a tu idea y reescribirlo: los Skills `krillinai-*` existentes muestran la estructura y el tono esperados.

## Anatomía de un Skill

```
skills/<tu-skill>/
├── SKILL.md            # obligatorio: frontmatter + instrucciones
└── references/         # opcional: docs extensos a los que apunta SKILL.md
    └── cli-contract.md
```

`SKILL.md` comienza con frontmatter YAML:

```yaml
---
name: tu-skill
description: Use when <condición de activación>, including <capacidades principales>.
---
```

Dos reglas que los revisores aplican:

- **`name` debe coincidir con el nombre de la carpeta.** Minúsculas con guiones.
- **`description` es la superficie de descubrimiento.** Es lo que el agente lee para decidir si este Skill aplica. Escríbela como "Use when …", nombra el disparador y el resultado, y limítala a una o dos frases. Las descripciones vagas ("ayuda con video") se rechazan.

El cuerpo debe cubrir, en orden:

1. **Cuándo usarlo** — un párrafo.
2. **Comandos** — bloques de código con la invocación exacta, incluyendo variables de entorno o directorios de trabajo requeridos.
3. **Entradas y flags** — una tabla para lo no evidente; marca requerido vs. opcional.
4. **Salidas** — dónde quedan los resultados y cómo leerlos (por ejemplo, "leer rutas del manifest").
5. **Modos de fallo** — errores conocidos y qué hacer ante ellos.

Mantén `SKILL.md` escaneable. Traslada contratos largos, listas completas de flags o material de contexto a `references/` y enlázalos con rutas relativas: el agente solo lee las referencias cuando las necesita.

## Pruebas locales

Tras `pnpm web:dev`, inicia una conversación y describe una tarea que debería activar tu Skill. Verifica:

- El agente selecciona el Skill para las peticiones correctas — y no lo selecciona para peticiones ajenas.
- Los comandos del Skill se ejecutan desde un checkout limpio sin arreglos manuales.
- Las rutas de salida y el manejo de errores coinciden con lo documentado.

## Criterios de fusión

Un revisor comprobará cada punto: pégalo en tu PR y márcalos:

- [ ] El nombre de la carpeta y el frontmatter `name` coinciden; minúsculas con guiones.
- [ ] `description` nombra la condición de activación y el resultado ("Use when …").
- [ ] Los comandos funcionan desde un checkout limpio; sin rutas locales absolutas ni credenciales.
- [ ] Entradas, salidas y modos de fallo documentados.
- [ ] El material de referencia extenso vive en `references/`, no en línea.
- [ ] Verificado en una conversación real: el Skill se activa cuando debe y solo entonces.
- [ ] Si el Skill se solapa con uno existente, el PR explica por qué se justifica uno separado.

## Patrones frecuentes de rechazo

- **Duplicado de un Skill existente** con solo cambios cosméticos de redacción: mejora el existente en su lugar.
- **Una funcionalidad disfrazada** — el Skill solo funciona con cambios de código en el Runtime o la UI; envía el cambio de código como PR propio.
- **Comandos sin probar** — flags que no existen o salidas que no coinciden con las rutas documentadas.
- **Prerrequisitos no documentados** — el Skill asume silenciosamente una configuración de proveedor, un binario o un servicio de red.

---

¿Preguntas? [Abre un issue](https://github.com/krillinai/OpenCreator/issues/new) con el tema `skill` y te ayudaremos a delimitarlo.
