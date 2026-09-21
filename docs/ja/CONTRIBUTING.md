# コントリビューションガイド（日本語）

> [English](../../CONTRIBUTING.md) | [简体中文](../zh/CONTRIBUTING.md) | **日本語** | [한국어](../ko/CONTRIBUTING.md) | [Bahasa Indonesia](../id/CONTRIBUTING.md) | [Español](../es/CONTRIBUTING.md) | [Français](../fr/CONTRIBUTING.md) | [Deutsch](../de/CONTRIBUTING.md) | [Português](../pt/CONTRIBUTING.md) | [Русский](../ru/CONTRIBUTING.md) | [العربية](../ar/CONTRIBUTING.md)

OpenCreator への貢献を検討していただきありがとうございます。OpenCreator は Codex エージェントループを基盤としたローカルファーストのクリエイターワークスペースであり、その価値の多くは小さく焦点の絞られた追加——1 つの Skill フォルダ、1 つの作成テンプレート、1 つの範囲の明確な修正——から生まれます。このガイドでは、各種類の貢献をどこに置くべきか、そして PR がマージまでに満たすべき基準を説明します。

---

## コントリビューションマップ

| したいこと | 実際に追加するもの | 場所 | 成果物の規模 |
|---|---|---|---|
| バグ修正やワークフロー改善 | コード | `apps/web/`、`apps/daemon/` | テスト付きの焦点を絞った PR 1 件 |
| 再利用可能なエージェントワークフローの追加 | **Skill** | [`skills/<your-skill>/`](../../skills/) | `SKILL.md` と任意の references を含む 1 フォルダ → [ガイド](./contributing/skills-contributing.md) |
| 再利用可能な画像・動画・カバープリセットの追加 | **作成テンプレート** | [`template/<module>/<id>/<version>/`](../../template/) | `template.json` とアセットを含む 1 フォルダ → [ガイド](./contributing/templates-contributing.md) |
| イラスト、アイコン、UI デザインの提供 | デザインアセット | 合意したアセット配置場所 | プレビュー、ソースファイル、ライセンスを含む PR 1 件 |
| AI またはメディアサービスの接続 | **サービス連携** | 該当する Web または Daemon モジュール | エラーハンドリング、認証情報の安全性、テストを含む PR 1 件 |
| ドキュメントや翻訳の改善 | ドキュメント | `README.md`、`docs/`、`docs/<locale>/README.md` | PR 1 件 |

## 質問先とレビュー担当

アイデアの相談や担当領域が不明な場合は [Issue](https://github.com/krillinai/OpenCreator/issues/new) を作成してください。PR 提出時にはコードとバグ修正、制作テンプレート、デザインと素材、Skills と文書に応じて[チーム](../../README.md#the-crew)の担当者に知らせてください。チームは貢献基準、レビュー、コミュニティの質問に対応します。マージはリポジトリの権限と必須チェックに従います。

---

## ローカルセットアップ

完全なセットアップは [README のクイックスタート](../../README.md#quick-start) にあります。コントリビューター向けの要約：

```bash
git clone https://github.com/krillinai/OpenCreator.git
cd OpenCreator
corepack enable          # packageManager で固定された pnpm を選択
pnpm install
pnpm web:dev             # Web + 必要時にローカル daemon を起動
pnpm typecheck           # リポジトリ全体の TypeScript チェック
pnpm test                # ワークスペースのユニット・統合テスト
```

Node.js 22 以上と Codex CLI 実行ファイルが必要です。`pnpm web:dev` の後に `http://127.0.0.1:19861/` を開いてください。初回起動時に Runtime がデフォルトプロジェクトを自動準備し、接続完了後すぐに入力できるようになります。

---

## 貢献の手順

1. [Issue](https://github.com/krillinai/OpenCreator/issues) で問題、ユースケース、期待される動作を説明する。
2. 最新の開発ブランチから、焦点を絞った機能・修正ブランチを作成する。
3. 既存のアーキテクチャに従う：汎用的なプロダクト機能は Web と Daemon で**一度だけ**実装し、Desktop ネイティブの差異は明示的な capability（例：`canSelectDirectory`）で隔離する。
4. 動作変更には適切なユニット・統合・E2E テストを追加し、PR には実行した検証とスキップした検証の両方を記載する。
5. `.runtime/`、ローカルの認証情報、Codex セッション、ビルドキャッシュ、その他のユーザーデータをコミットしない。

## レビュアーが確認すること

- **共有動作の実装は 1 つだけ。** 同じ機能を Browser Bridge と Desktop Bridge で個別に実装してはいけません。
- **サイレントなスタブではなく capability ゲーティング。** capability が利用できない場合、プラットフォーム固有の入口は非表示にする必要があります。何もしないボタンを表示してはいけません。
- **テストは変更リスクに見合ったものを。** 文言やスタイルの微調整は対象を絞ったチェックのみで構いません。共有状態、永続化、Runtime コントラクトの変更には、最低限モジュールテストと typecheck が必要です。
- **ドキュメントは動作と一緒に更新。** 変更がユーザーに見えるワークフローを変える場合、同じ PR で README または `docs/` の関連ドキュメントを更新してください。

## PR が差し戻される主な理由

- 同じロジックが共有サービス層ではなく Web と Desktop の両パスに個別に追加されている。
- プラットフォームがサポートしていないボタンが表示されているが、ハンドラがサイレントに return する。
- 動作が変更されているのにテストや検証の記載がない。
- PR に無関係なリファクタリングや修正が混ざっている。
- 生成物、`.runtime/` データ、認証情報がコミットされている。

---

OpenCreator · Create locally, work continuously.
