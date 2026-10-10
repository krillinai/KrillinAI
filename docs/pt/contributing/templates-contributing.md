# Contribuindo um template de criação (Português)

> [English](../../contributing/templates-contributing.md) | [简体中文](../../zh/contributing/templates-contributing.md) | [日本語](../../ja/contributing/templates-contributing.md) | [한국어](../../ko/contributing/templates-contributing.md) | [Bahasa Indonesia](../../id/contributing/templates-contributing.md) | [Español](../../es/contributing/templates-contributing.md) | [Français](../../fr/contributing/templates-contributing.md) | [Deutsch](../../de/contributing/templates-contributing.md) | **Português** | [Русский](../../ru/contributing/templates-contributing.md) | [العربية](../../ar/contributing/templates-contributing.md)

Um template de criação é uma pasta dentro de [`template/<módulo>/<id>/<versão>/`](../../../template/) com um `template.json` e seus recursos locais. Os templates alimentam os seletores visuais de geração de imagem, vídeo e capa — os usuários começam a partir do seu preset em vez de um prompt em branco. Este guia mostra como adicionar um.

---

## O que um template de criação É / NÃO É

**Um template É:**
- Um preset ajustado: prompts padrão, dicas de estilo, configurações de proporção/duração/qualidade, mais capa e prévia que mostram o resultado.
- Autossuficiente. Tudo o que o seletor exibe vive na pasta do template.

**Um template NÃO É:**
- Um novo *tipo* de template. Os módulos atuais são `image-generation`, `video-generation` e `cover-generator`. Se você precisa de um módulo novo, abra uma issue para discutir primeiro — isso é uma mudança de produto, não um template.
- Um amontoado de prompts. Templates com prompt vazio ou genérico e sem padrões localizados serão devolvidos; o valor está no ajuste fino.
- Trabalho de outras pessoas sem direitos. Veja [Atribuição e direitos](#atribuição-e-direitos).

## Início rápido

```bash
corepack enable && pnpm install
cp -r template/cover-generator/images-go-hard-thumbnail template/<módulo>/<seu-id-de-template>
# edite template.json, substitua os recursos de capa/prévia
pnpm templates:validate     # deve passar antes de abrir um PR
```

IDs de template usam letras minúsculas com hífens e são únicos dentro do módulo. A versão começa em `1` — uma pasta por versão, então atualizações criam `<id>/2/` em vez de editar `<id>/1/`.

## Anatomia da pasta

```
template/<módulo>/<id>/1/
├── template.json        # obrigatório: metadados, padrões, conteúdo localizado
├── cover.jpg            # obrigatório: exibido no seletor de templates
├── preview.jpg          # módulos de imagem/capa: prévia ampliada do resultado
├── previewVideo         # módulo de vídeo: clipe de exemplo, ex. example.mp4
└── author-avatar.jpg    # opcional: avatar do autor creditado
```

## Campos do template.json

| Campo | Obrigatório | Notas |
|---|---|---|
| `schemaVersion` | sim | Atualmente `1`. |
| `id`, `version`, `module` | sim | Devem corresponder ao caminho `<módulo>/<id>/<versão>/`. |
| `runtimeTemplate` | sim | Mapeia para o executor do Runtime, ex. `{"id": "cover", "version": 2}`. Copie de um template do mesmo módulo. |
| `status` | sim | `published` para publicar; use `draft` enquanto itera. |
| `title`, `description` | sim | `zh-CN` e `en-US` são obrigatórios. Outros idiomas são opcionais. |
| `cover` | sim | Caminho relativo para a miniatura do seletor. |
| `preview` / `previewVideo` | depende do módulo | `preview` para imagem e capa, `previewVideo` para vídeo. |
| `defaults` | sim | Configurações base de onde o usuário parte (prompt, proporção, duração, qualidade…). |
| `defaultsByLocale` | fortemente recomendado | Overrides localizados de prompt e estilo por idioma. É aqui que mora o ajuste fino — veja abaixo. |
| `tags` | recomendado | Rótulos pesquisáveis; mantenha-os factuais. |
| `author` | se aplicável | `name`, `url`, `avatar` para fontes externas creditadas. |
| `featured`, `sortOrder` | não | Deixe `featured: false`; os mantenedores decidem o destaque. |

## O prompt é o produto

Os revisores passam a maior parte do tempo em `defaults` e `defaultsByLocale`:

- **Ambos os idiomas devem ser prompts reais**, não traduções que perderam o ajuste. Os prompts `zh-CN` e `en-US` devem produzir resultados equivalentes aproveitando os pontos fortes de cada idioma.
- **Parametrize o que deve mudar.** Se o título ou o assunto é editável pelo usuário, diga isso explicitamente no prompt (templates existentes usam marcadores como "Customizable text: …").
- **Declare restrições.** "Sem marca d'água, sem texto extra, sem pessoas extras" — restrições negativas importam tanto quanto a descrição para resultados reproduzíveis.
- **Siga a forma de `defaults` do módulo.** Templates de imagem trazem ratio/candidateCount/quality; de vídeo trazem size/duration; de capa trazem título, idioma do texto e campos de estilo. Copie a forma de um template existente do seu módulo.

## Recursos

- Gere o `cover.jpg` e a prévia **com o próprio template** — imagem de banco ou arte não relacionada será rejeitada.
- Mantenha os tamanhos de arquivo razoáveis; esses arquivos são distribuídos com o app e carregados no seletor.
- A prévia deve representar um resultado *típico*, não o melhor de cinquenta tentativas.

## Atribuição e direitos

Se o seu template adapta um prompt ou estilo publicado por outra pessoa:

- Você precisa ter o direito de redistribuí-lo.
- Preencha o campo `author` com `name` e `url` (e `author-avatar.jpg` se disponível), como fazem os templates existentes.
- Em caso de dúvida, abra uma issue e pergunte antes de fazer o trabalho.

## Critérios de merge

- [ ] O caminho da pasta corresponde a `id`/`version`/`module`; o ID é único no módulo.
- [ ] `pnpm templates:validate` passa.
- [ ] `title` e `description` fornecidos em `zh-CN` e `en-US`.
- [ ] `defaultsByLocale` contém prompts ajustados para ambos os idiomas.
- [ ] Recursos de capa e prévia foram gerados pelo próprio template.
- [ ] Atribuição `author` incluída ao adaptar trabalho externo.
- [ ] `featured: false`, `status: "published"` (ou `draft` com nota no PR).

## Padrões comuns de rejeição

- **Prompt genérico** — o template não adiciona nada sobre um prompt em branco; o seletor não precisa dele.
- **Idioma faltando** — apenas um idioma ajustado, ou tradução automática que perdeu as restrições de estilo.
- **Recursos incompatíveis** — a capa não corresponde ao que o prompt realmente gera.
- **Direitos incertos** — adaptado do trabalho de alguém sem atribuição ou permissão.
- **Versão antiga editada no lugar** — crie uma pasta de versão nova em vez de reescrever o histórico de `<id>/1/`.

---

Dúvidas? [Abra uma issue](https://github.com/krillinai/OpenCreator/issues/new) com sua ideia de template e um exemplo de saída, e ajudaremos a delimitar o escopo.
