# Skill を貢献する（日本語）

> [English](../../contributing/skills-contributing.md) | [简体中文](../../zh/contributing/skills-contributing.md) | **日本語** | [한국어](../../ko/contributing/skills-contributing.md) | [Bahasa Indonesia](../../id/contributing/skills-contributing.md) | [Español](../../es/contributing/skills-contributing.md) | [Français](../../fr/contributing/skills-contributing.md) | [Deutsch](../../de/contributing/skills-contributing.md) | [Português](../../pt/contributing/skills-contributing.md) | [Русский](../../ru/contributing/skills-contributing.md) | [العربية](../../ar/contributing/skills-contributing.md)

Skill とは、[`skills/`](../../../skills/) 配下のフォルダで、ルートに `SKILL.md` を持ち、[`SKILL.md` 規約](https://agentskills.io)に従うものです。再利用可能なエージェントワークフロー——いつ使うか、どのコマンドやツールを呼ぶか、出力をどう解釈するか——をパッケージ化します。このガイドでは追加方法を説明します。

---

## Skill であるもの / でないもの

**Skill であるもの：**
- エージェントが従える再現可能なワークフロー。自然言語とコマンドで記述します。
- コアコードに属さないドメイン知識：CLI ステージの呼び出し方、メディアプロバイダ向けプロンプトの構成、プランの検証方法。
- 小さいもの。1 フォルダ、1 つの `SKILL.md`、必要に応じてエージェントがオンデマンドで読む長めの資料用の `references/`。

**Skill でないもの：**
- プロダクト機能。UI 変更、新しい Runtime エンドポイント、ワークスペースの新しい動作はコード貢献です（`apps/web/`、`apps/daemon/`）。
- 既存 Skill の文言を変えただけのコピー。変更が既存ワークフローを改善するなら、その Skill を直接編集してください。
- 認証情報や特定ユーザーのローカルパスを包むラッパー。Skill はクリーンなチェックアウトから動作する必要があります。

## クイックスタート

```bash
git clone https://github.com/krillinai/OpenCreator.git
cd OpenCreator
corepack enable && pnpm install
cp -r skills/krillinai-tts skills/<your-skill>   # 最も近い既存 Skill から始める
# skills/<your-skill>/SKILL.md を編集
pnpm web:dev                                     # 会話でエージェントが認識するか確認
```

最速の方法は、アイデアに最も近い Skill をコピーして書き直すことです。既存の `krillinai-*` Skill が期待される構造とトーンを示しています。

## Skill の構造

```
skills/<your-skill>/
├── SKILL.md            # 必須：frontmatter + 手順
└── references/         # 任意：SKILL.md から参照する長文ドキュメント
    └── cli-contract.md
```

`SKILL.md` は YAML frontmatter で始まります：

```yaml
---
name: your-skill
description: Use when <発動条件>, including <主な機能>.
---
```

レビュアーが徹底する 2 つのルール：

- **`name` はフォルダ名と一致させる。** 小文字、ハイフン区切り。
- **`description` は発見の入口。** エージェントはこれを読んでこの Skill が適用されるか判断します。"Use when …" の形式で、トリガーと結果を明記し、1〜2 文に収めてください。曖昧な説明（「動画を手伝う」）は差し戻されます。

本文は以下の順序で構成してください：

1. **いつ使うか** —— 1 段落。
2. **コマンド** —— 必要な環境変数や作業ディレクトリを含む正確な呼び出しをコードブロックで。
3. **入力とフラグ** —— 自明でないものは表で説明し、必須/任意を明記。
4. **出力** —— 結果がどこに出力され、どう読むか（例：「manifest からパスを読む」）。
5. **失敗パターン** —— 既知のエラーと対処方法。

`SKILL.md` は流し読みできる状態に保ってください。長いコントラクト、全フラグのリスト、背景資料は `references/` に移し、相対パスでリンクしてください。エージェントは必要なときだけ references を読みます。

## ローカルでの検証

`pnpm web:dev` の後、会話を開始してその Skill が発動するはずのタスクを記述します。以下を確認：

- 正しいリクエストでエージェントがその Skill を選択し、無関係なリクエストでは選択しない。
- Skill 内のコマンドがクリーンなチェックアウトから手直しなしで実行できる。
- 出力パスとエラーハンドリングがドキュメントと一致している。

## マージ基準

レビュアーは以下の全項目を確認します。PR に貼り付けてチェックしてください：

- [ ] フォルダ名と `name` frontmatter が一致。小文字ハイフン区切り。
- [ ] `description` が発動条件と結果を明示（"Use when …"）。
- [ ] コマンドがクリーンなチェックアウトで実行可能。絶対ローカルパスや認証情報を含まない。
- [ ] 入力、出力、失敗パターンが文書化されている。
- [ ] 長い参考資料はインラインではなく `references/` にある。
- [ ] 実際の会話で検証済み：発動すべきときに発動し、それ以外では発動しない。
- [ ] 既存 Skill と重複する場合、独立した Skill が必要な理由を PR で説明している。

## 主な却下パターン

- **既存 Skill の重複**で、文言の表面的な変更のみ —— 既存の Skill を改善してください。
- **機能の偽装** —— Runtime や UI のコード変更と組み合わせないと動作しない Skill。コード変更は別の PR として提出してください。
- **未テストのコマンド** —— 存在しないフラグ、またはドキュメント記載のパスと一致しない出力。
- **文書化されていない前提条件** —— プロバイダ設定、バイナリ、ネットワークサービスを暗黙に仮定している。

---

質問がありますか？ `skill` のトピックで [Issue を作成](https://github.com/krillinai/OpenCreator/issues/new)してください。範囲の調整をお手伝いします。
