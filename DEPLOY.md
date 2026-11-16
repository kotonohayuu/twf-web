# Cloudflare Pages 公開・更新手順

## 初回セットアップ（GitHub連携・推奨）

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) にログイン
2. 左メニュー **Compute (Workers & Pages)** → **Create** → **Pages** タブ → **Connect to Git** を選択
3. GitHubアカウントを連携し、リポジトリ `kotonohayuu/twf-web` を選択
4. ビルド設定を以下のように指定：
   - **Project name**: `twf-web`（任意の名前）
   - **Production branch**: `main`（または使用中のデフォルトブランチ）
   - **Framework preset**: `None`
   - **Build command**: （空欄）
   - **Build output directory**: `/`（空欄または `/`）
5. **Save and Deploy** をクリックして初回デプロイ完了

> **補足**: もし親フォルダ（保管庫ルート）ごと1つのリポジトリにしている場合は、**Root directory (advanced)** に `twf-web` を指定してください。このリポジトリ単体（ルート直下に `index.html` がある構成）の場合は空欄のままで問題ありません。

## 日常の更新フロー

1. `note.md`（またはローカル保管庫利用時は `sync-note.ps1` で同期）を更新
2. 変更をコミットして GitHub へ Push（`git add . && git commit -m "..." && git push`）
3. Cloudflare Pages が自動で検知し、数十秒で本番環境に反映されます

## ローカルから手動デプロイする場合（任意）

GitHub Push を使わずローカルPCから直接デプロイしたい場合は、`npx wrangler pages deploy` を利用できます（`publish.ps1` 参照）。

## 設定ファイル一覧

- `_headers`: セキュリティヘッダー（CSP等）および `note.md` のキャッシュ制御（Cloudflare Web Analytics 有効化にも対応済み）
- `.assetsignore`: 運用ドキュメント（`DEPLOY.md`, `PROJECT_RULES.md`）や `.ps1` スクリプト等を公開アセットから除外する設定
- `index.html`: 親ページ（クイックガイド・主要年表・章の一覧）
- `file1.html` などの章ページ: 各章の本文を表示する子ページ（URLは `.html` を省いた形）
- `app.js` / `styles.css`: 目次・検索・年表UI本体（章ページの本文は `note.md` から章ごとに取り出して表示）
- `note.md`: サイト本文データ
