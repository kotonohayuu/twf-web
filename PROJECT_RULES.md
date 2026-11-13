# TWF-Web プロジェクトルール

## 正本（マスター）の定義

- **GitHubリポジトリ（`twf-web`）を正本とする。**
- `note.md` の最新版は常にGitHub上のものが正とする。
- 他の場所にコピーや下書きが存在する場合でも、GitHub版が優先される。

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
