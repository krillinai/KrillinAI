# 作成テンプレートを貢献する（日本語）

> [English](../../contributing/templates-contributing.md) | [简体中文](../../zh/contributing/templates-contributing.md) | **日本語** | [한국어](../../ko/contributing/templates-contributing.md) | [Bahasa Indonesia](../../id/contributing/templates-contributing.md) | [Español](../../es/contributing/templates-contributing.md) | [Français](../../fr/contributing/templates-contributing.md) | [Deutsch](../../de/contributing/templates-contributing.md) | [Português](../../pt/contributing/templates-contributing.md) | [Русский](../../ru/contributing/templates-contributing.md) | [العربية](../../ar/contributing/templates-contributing.md)

作成テンプレートとは、[`template/<module>/<id>/<version>/`](../../../template/) 配下のフォルダで、`template.json` とローカルアセットを含むものです。テンプレートは画像生成・動画生成・カバー生成のビジュアルピッカーを支え、ユーザーは空白のプロンプトではなくあなたのプリセットから作成を始められます。このガイドでは追加方法を説明します。

---

## 作成テンプレートであるもの / でないもの

**テンプレートであるもの：**
- 調整済みのプリセット：プロンプトのデフォルト、スタイルのヒント、アスペクト比/長さ/品質の設定、結果を示すカバーとプレビュー。
- 自己完結型。ピッカーに表示されるすべてがテンプレートフォルダ内にあります。

**テンプレートでないもの：**
- 新しいテンプレート*種別*。現在のモジュールは `image-generation`、`video-generation`、`cover-generator` です。新しいモジュールが必要な場合は、まず Issue で議論してください。それはプロダクト変更であり、テンプレートではありません。
- プロンプトの寄せ集め。プロンプトが空または汎用的で、ローカライズされたデフォルトのないテンプレートは差し戻されます。価値は調整にあります。
- 権利のない他人の作品。[帰属と権利](#帰属と権利)を参照してください。

## クイックスタート

```bash
corepack enable && pnpm install
cp -r template/cover-generator/images-go-hard-thumbnail template/<module>/<your-template-id>
# template.json を編集し、カバー/プレビューアセットを差し替える
pnpm templates:validate     # PR 前に必須
```

テンプレート ID は小文字ハイフン区切りで、モジュール内で一意です。バージョンは `1` から始めます。1 バージョン 1 フォルダなので、更新時は `<id>/1/` を編集せず `<id>/2/` を作成します。

## フォルダ構造

```
template/<module>/<id>/1/
├── template.json        # 必須：メタデータ、デフォルト、ローカライズ済みコンテンツ
├── cover.jpg            # 必須：テンプレートピッカーに表示
├── preview.jpg          # 画像/カバーモジュール：大きめの結果プレビュー
├── previewVideo         # 動画モジュール：サンプルクリップ（例：example.mp4）
└── author-avatar.jpg    # 任意：クレジットする作者のアバター
```

## template.json フィールド説明

| フィールド | 必須 | 備考 |
|---|---|---|
| `schemaVersion` | はい | 現在は `1`。 |
| `id`、`version`、`module` | はい | フォルダパス `<module>/<id>/<version>/` と一致させる。 |
| `runtimeTemplate` | はい | Runtime 実行エンジンへの対応（例：`{"id": "cover", "version": 2}`）。同モジュールのテンプレートからコピー。 |
| `status` | はい | 公開は `published`、作業中は `draft`。 |
| `title`、`description` | はい | `zh-CN` と `en-US` は必須。他言語は任意。 |
| `cover` | はい | ピッカーのサムネイルへの相対パス。 |
| `preview` / `previewVideo` | モジュールによる | 画像とカバーは `preview`、動画は `previewVideo`。 |
| `defaults` | はい | ユーザーが開始する基準設定（プロンプト、比率、長さ、品質など）。 |
| `defaultsByLocale` | 強く推奨 | ロケールごとのプロンプトとスタイルの上書き。本当の調整はここにあります。下記参照。 |
| `tags` | 推奨 | 検索可能なラベル。事実ベースで。 |
| `author` | 該当する場合 | 外部ソースをクレジットする `name`、`url`、`avatar`。 |
| `featured`、`sortOrder` | いいえ | `featured: false` のまま。フィーチャーするかはメンテナーが決定。 |

## プロンプトこそがプロダクト

レビュアーはほとんどの時間を `defaults` と `defaultsByLocale` に費やします：

- **両言語とも本物のプロンプトであること。** 調整が失われた翻訳は不可。`zh-CN` と `en-US` のプロンプトは、それぞれの言語の強みを活かしつつ同等の結果を生成すべきです。
- **変更されるべき部分をパラメータ化する。** 見出しテキストや被写体がユーザー編集可能なら、プロンプト内で明示してください（既存テンプレートは "Customizable text: …" のようなマーカーを使用）。
- **制約を明記する。** 「透かしなし、余分なテキストなし、余分な人物なし」——再現可能な出力には、否定的制約が記述と同じくらい重要です。
- **モジュールの defaults 構造に合わせる。** 画像テンプレートは ratio/candidateCount/quality、動画は size/duration、カバーは見出し・テキスト言語・スタイルフィールドを持ちます。同モジュールの既存テンプレートから構造をコピーしてください。

## アセット

- `cover.jpg` とプレビューは**テンプレート自身で生成**してください。ストック画像や無関係なアートワークは却下されます。
- ファイルサイズは適切に。これらのファイルはアプリに同梱され、ピッカーで読み込まれます。
- プレビューは 50 回中の最高の 1 枚ではなく、*典型的な*結果を表してください。

## 帰属と権利

テンプレートが他人の公開済みプロンプトやスタイルを改変したものである場合：

- 再配布する権利が必要です。
- 既存テンプレートと同様に、`author` フィールドに `name` と `url`（あれば `author-avatar.jpg`）を記入してください。
- 不明な場合は、作業に着手する前に Issue で質問してください。

## マージ基準

- [ ] フォルダパスが `id`/`version`/`module` と一致。ID はモジュール内で一意。
- [ ] `pnpm templates:validate` がパスする。
- [ ] `title` と `description` が `zh-CN` と `en-US` の両方で提供されている。
- [ ] `defaultsByLocale` に両言語で調整済みのプロンプトが含まれている。
- [ ] カバーとプレビューのアセットがテンプレート自身で生成されている。
- [ ] 外部作品を改変した場合に `author` の帰属がある。
- [ ] `featured: false`、`status: "published"`（または `draft` で PR に注記）。

## 主な却下パターン

- **汎用的なプロンプト** —— 空白のプロンプトと比べて付加価値がない。ピッカーに不要です。
- **言語の欠落** —— 片方の言語しか調整されていない、または機械翻訳でスタイル制約が失われている。
- **アセットの不一致** —— カバーがプロンプトの実際の生成結果と合っていない。
- **権利が不明確** —— 帰属や許可なく他人の作品を改変している。
- **旧バージョンの上書き** —— `<id>/1/` の履歴を書き換えるのではなく、新しいバージョンフォルダを作成してください。

---

質問がありますか？ テンプレートのアイデアとサンプル出力を添えて [Issue を作成](https://github.com/krillinai/OpenCreator/issues/new)してください。範囲の調整をお手伝いします。
