# Contribuindo um Skill (Português)

> [English](../../contributing/skills-contributing.md) | [简体中文](../../zh/contributing/skills-contributing.md) | [日本語](../../ja/contributing/skills-contributing.md) | [한국어](../../ko/contributing/skills-contributing.md) | [Bahasa Indonesia](../../id/contributing/skills-contributing.md) | [Español](../../es/contributing/skills-contributing.md) | [Français](../../fr/contributing/skills-contributing.md) | [Deutsch](../../de/contributing/skills-contributing.md) | **Português** | [Русский](../../ru/contributing/skills-contributing.md) | [العربية](../../ar/contributing/skills-contributing.md)

Um Skill é uma pasta dentro de [`skills/`](../../../skills/) com um `SKILL.md` na raiz, seguindo a [convenção `SKILL.md`](https://agentskills.io). Ele empacota um fluxo de trabalho reutilizável para o agente: quando usá-lo, quais comandos ou ferramentas chamar e como interpretar as saídas. Este guia mostra como adicionar um.

---

## O que um Skill É / NÃO É

**Um Skill É:**
- Um fluxo de trabalho repetível que o agente pode seguir, descrito em linguagem natural mais comandos.
- Conhecimento de domínio que não pertence ao código central: como invocar uma etapa de CLI, como estruturar um prompt para um provedor de mídia, como validar um plano.
- Pequeno. Uma pasta, um `SKILL.md`, `references/` opcional para material mais longo que o agente lê sob demanda.

**Um Skill NÃO É:**
- Uma funcionalidade de produto. Mudanças de UI, novos endpoints do Runtime e novos comportamentos do workspace são contribuições de código (`apps/web/`, `apps/daemon/`).
- Uma cópia de um Skill existente com redação levemente alterada. Se sua mudança melhora um fluxo existente, edite esse Skill diretamente.
- Um invólucro em torno de credenciais ou caminhos locais de um usuário específico. Skills devem funcionar a partir de um checkout limpo.

## Início rápido

```bash
git clone https://github.com/krillinai/OpenCreator.git
cd OpenCreator
corepack enable && pnpm install
cp -r skills/krillinai-tts skills/<seu-skill>   # comece pelo Skill existente mais próximo
# edite skills/<seu-skill>/SKILL.md
pnpm web:dev                                    # verifique se o agente o reconhece em uma conversa
```

O caminho mais rápido é copiar o Skill mais próximo da sua ideia e reescrevê-lo — os Skills `krillinai-*` existentes mostram a estrutura e o tom esperados.

## Anatomia de um Skill

```
skills/<seu-skill>/
├── SKILL.md            # obrigatório: frontmatter + instruções
└── references/         # opcional: docs longos apontados pelo SKILL.md
    └── cli-contract.md
```

O `SKILL.md` começa com frontmatter YAML:

```yaml
---
name: seu-skill
description: Use when <condição de ativação>, including <capacidades principais>.
---
```

Duas regras que os revisores aplicam:

- **`name` deve corresponder ao nome da pasta.** Minúsculas, com hífens.
- **`description` é a superfície de descoberta.** É o que o agente lê para decidir se este Skill se aplica. Escreva como "Use when …", nomeie o gatilho e o resultado, e mantenha em uma ou duas frases. Descrições vagas ("ajuda com vídeo") são devolvidas.

O corpo deve cobrir, nesta ordem:

1. **Quando usar** — um parágrafo.
2. **Comandos** — blocos de código com a invocação exata, incluindo variáveis de ambiente ou diretórios de trabalho necessários.
3. **Entradas e flags** — uma tabela para o que não é óbvio; marque obrigatório vs. opcional.
4. **Saídas** — onde os resultados ficam e como lê-los (por exemplo, "leia os caminhos do manifest").
5. **Modos de falha** — erros conhecidos e o que fazer sobre eles.

Mantenha o `SKILL.md` escaneável. Mova contratos longos, listas completas de flags ou material de contexto para `references/` e vincule com caminhos relativos — o agente lê as referências apenas quando necessário.

## Testes locais

Após `pnpm web:dev`, inicie uma conversa e descreva uma tarefa que deveria acionar seu Skill. Verifique:

- O agente seleciona o Skill para as solicitações certas — e não o seleciona para solicitações não relacionadas.
- Os comandos do Skill rodam a partir de um checkout limpo sem correções manuais.
- Os caminhos de saída e o tratamento de erros correspondem ao documentado.

## Critérios de merge

Um revisor verificará cada item abaixo — cole no seu PR e marque:

- [ ] O nome da pasta e o frontmatter `name` correspondem; minúsculas com hífens.
- [ ] `description` nomeia a condição de ativação e o resultado ("Use when …").
- [ ] Os comandos rodam a partir de um checkout limpo; sem caminhos locais absolutos ou credenciais.
- [ ] Entradas, saídas e modos de falha documentados.
- [ ] Material de referência longo está em `references/`, não inline.
- [ ] Verificado em uma conversa real: o Skill dispara quando deve — e somente então.
- [ ] Se o Skill se sobrepõe a um existente, o PR explica por que um Skill separado é justificado.

## Padrões comuns de rejeição

- **Duplicata de um Skill existente** com apenas mudanças cosméticas de redação — melhore o existente em vez disso.
- **Uma funcionalidade disfarçada** — o Skill só funciona se acompanhado de mudanças de código no Runtime ou na UI; envie a mudança de código como PR próprio.
- **Comandos não testados** — flags que não existem, ou saídas que não correspondem aos caminhos documentados.
- **Pré-requisitos não documentados** — o Skill assume silenciosamente uma configuração de provedor, um binário ou um serviço de rede.

---

Dúvidas? [Abra uma issue](https://github.com/krillinai/OpenCreator/issues/new) com o tópico `skill` e ajudaremos a delimitar o escopo.
