# Guia de contribuição (Português)

> [English](../../CONTRIBUTING.md) | [简体中文](../zh/CONTRIBUTING.md) | [日本語](../ja/CONTRIBUTING.md) | [한국어](../ko/CONTRIBUTING.md) | [Bahasa Indonesia](../id/CONTRIBUTING.md) | [Español](../es/CONTRIBUTING.md) | [Français](../fr/CONTRIBUTING.md) | [Deutsch](../de/CONTRIBUTING.md) | **Português** | [Русский](../ru/CONTRIBUTING.md) | [العربية](../ar/CONTRIBUTING.md)

Obrigado por pensar em contribuir. O OpenCreator é um workspace local-first para criadores construído sobre o loop do agente Codex, e a maior parte do seu valor vem de adições pequenas e focadas: uma pasta de Skill, um template de criação, uma correção bem delimitada. Este guia indica onde cada tipo de contribuição deve ficar e quais critérios um PR precisa cumprir antes de ser mesclado.

---

## Mapa de contribuições

| Se você quer… | Você está na verdade adicionando | Onde fica | Tamanho da entrega |
|---|---|---|---|
| Corrigir um bug ou melhorar um fluxo de trabalho | código | `apps/web/`, `apps/daemon/` | um PR focado com testes |
| Adicionar um fluxo de trabalho reutilizável para o agente | um **Skill** | [`skills/<seu-skill>/`](../../skills/) | uma pasta com `SKILL.md` e referências opcionais → [guia](./contributing/skills-contributing.md) |
| Adicionar um preset reutilizável de imagem, vídeo ou capa | um **template de criação** | [`template/<módulo>/<id>/<versão>/`](../../template/) | uma pasta com `template.json` e seus recursos → [guia](./contributing/templates-contributing.md) |
| Contribuir ilustrações, ícones ou designs de UI | recursos de design | local de recursos combinado | um PR com prévias, arquivos-fonte e licença |
| Integrar um serviço de IA ou mídia | uma **integração de serviço** | módulo Web ou Daemon relevante | um PR com tratamento de erros, segurança de credenciais e testes |
| Melhorar documentação ou traduções | docs | `README.md`, `docs/`, `docs/<locale>/README.md` | um PR |

## Onde perguntar e quem revisa

Abra uma [issue](https://github.com/krillinai/OpenCreator/issues/new) para discutir uma ideia ou saber a que área pertence. Ao enviar um PR, mencione o integrante relevante da [equipe](../../README.md#the-crew) para código e bugs, modelos, design e recursos ou Skills e documentação. A equipe ajuda nos padrões, revisões e dúvidas da comunidade; a integração segue as permissões e verificações obrigatórias do repositório.

---

## Configuração local

A configuração completa está no [início rápido do README](../../README.md#quick-start). Resumo para contribuidores:

```bash
git clone https://github.com/krillinai/OpenCreator.git
cd OpenCreator
corepack enable          # seleciona o pnpm fixado em packageManager
pnpm install
pnpm web:dev             # web + daemon local sob demanda
pnpm typecheck           # verificações de TypeScript em todo o repositório
pnpm test                # testes unitários e de integração do workspace
```

Node.js 22+ e um executável do Codex CLI são necessários. Abra `http://127.0.0.1:19861/` após `pnpm web:dev`; o Runtime prepara um projeto padrão na primeira execução e o editor fica pronto assim que a conexão é concluída.

---

## Como contribuir

1. Descreva o problema, o caso de uso e o comportamento esperado em uma [issue](https://github.com/krillinai/OpenCreator/issues).
2. Crie uma branch focada de funcionalidade ou correção a partir da branch de desenvolvimento mais recente.
3. Siga a arquitetura existente: capacidades gerais do produto são implementadas **uma única vez** em Web e Daemon, e as diferenças nativas do Desktop são isoladas atrás de capabilities explícitas (por exemplo `canSelectDirectory`).
4. Adicione cobertura de testes unitários, de integração ou E2E apropriada para mudanças de comportamento, e liste no PR tanto as verificações realizadas quanto as omitidas.
5. Nunca faça commit de `.runtime/`, credenciais locais, sessões do Codex, caches de build ou outros dados de usuário.

## O que os revisores verificam

- **Uma única implementação para comportamento compartilhado.** A mesma funcionalidade não deve ser implementada separadamente para Browser Bridge e Desktop Bridge.
- **Controle por capabilities, não stubs silenciosos.** Uma entrada específica de plataforma deve ser ocultada quando a capability não está disponível — nunca exibir um botão que silenciosamente não faz nada.
- **Testes proporcionais ao risco da mudança.** Pequenos ajustes de texto ou estilo precisam apenas de verificações direcionadas; mudanças em estado compartilhado, persistência ou contratos do Runtime exigem no mínimo testes de módulo e typecheck.
- **Documentação atualizada junto com o comportamento.** Se sua mudança altera um fluxo visível ao usuário, atualize o README ou o documento relevante em `docs/` no mesmo PR.

## Motivos comuns de devolução de PRs

- A mesma lógica foi adicionada separadamente nos caminhos Web e Desktop em vez da camada de serviço compartilhada.
- Um botão não suportado pela plataforma está visível, mas seu handler retorna silenciosamente.
- Comportamento alterado sem testes ou nota de verificação.
- O PR mistura uma refatoração ou correção não relacionada à mudança principal.
- Arquivos gerados, dados de `.runtime/` ou credenciais foram commitados.

---

OpenCreator · Create locally, work continuously.
