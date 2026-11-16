# TWF-Web プロジェクトルール

## 正本（マスター）の定義

- **GitHubリポジトリ（`twf-web`）を正本とする。**
- `note.md` の最新版は常にGitHub上のものが正とする。
- 他の場所にコピーや下書きが存在する場合でも、GitHub版が優先される。

## ページの構成

- `index.html` は親ページ（トップ）。クイックガイド、主要年表、章の一覧を置く。
- 章ごとに子ページがある（`file1.html`・`file2.html`・`lucky-you.html`・`file3.html`・`guilty.html`・`souvenir.html`・`spectacle.html`・`file4.html`・`felix.html`）。公開URLは `.html` を省いた形（例：`twf-web.pages.dev/file2`）。
- 本文は `note.md` の1ファイルのまま管理する。各子ページは、`app.js` が `note.md` から該当する章（`##` 見出し）を取り出して表示する。
- 章を増やすときは、`app.js` の `CHAPTERS` に1行足し、同じ名前の子ページ（既存の子ページの複製で、`<title>` などと `data-chapter` を書き換えたもの）と、`sitemap.xml` の行を足す。

## 画像の管理

- 画像はすべて `./images/` ディレクトリに格納する。
- 画像形式は **WebP** を優先する（`.webp`）。
- `note.md` 内の画像参照は `![altテキスト](./images/ファイル名.webp)` の形式を使用する。
- altテキストにはキャラクター名と簡潔な説明を含める。

## デプロイ（Cloudflare Pages）

- GitHubへのpushにより、Cloudflare Pages（`twf-web.pages.dev`）へ自動デプロイされる。
- セキュリティヘッダーは `_headers`、公開除外ファイルは `.assetsignore` で管理する。
- 移行期間中の並行確認用に `vercel.json` も保持している（Vercel解約・削除後は削除可能）。

## 編集フロー

1. `note.md` または画像を編集
2. `git add` → `git commit` → `git push`
3. Cloudflare Pages の自動デプロイ反映を確認

## 備考

- このリポジトリはプライベート設定。
- Cloudflare Pages 上のサイトが公開閲覧用のフロントエンド。
