# AGENTS.md

## プロジェクト概要

**TWF-Web** は *The Walten Files* 向けの静的考察サイトです。`note.md` を `app.js` が読み込み、目次・検索・タイムライン UI とともにブラウザで表示します。ビルドステップやパッケージマネージャはありません。

## Cursor Cloud specific instructions

### ローカル開発サーバー

`app.js` が `fetch("./note.md")` を使うため、`file://` ではなく HTTP サーバー経由で開いてください。

```bash
cd /workspace
python3 -m http.server 8080
```

ブラウザで http://localhost:8080 を開きます。

代替として Node.js が入っている場合は `npx serve /workspace` でも可です。

### 検証の目安

- ヒーロー画像（`bon.png`）が表示される
- `#summaryStatus` に読み込み失敗メッセージが出ない（`note.md` が正常にレンダリングされる）
- 左の目次（目次）にリンクが並ぶ
- 検索（例: `フェリックス`）でハイライトとスクロールが動く

### リント・テスト・ビルド

このリポジトリには `package.json`、リンター設定、自動テストはありません。変更後の確認は上記の静的サーバーとブラウザでの手動確認が主です。

### コンテンツ同期（任意）

`sync-note.ps1` / `publish.ps1` は Windows + 親ディレクトリの元ノート向けです。Cloud Agent 環境では通常不要です。本文の正本はリポジトリ内の `note.md` です（`PROJECT_RULES.md` 参照）。

### 本番デプロイ

GitHub への push で Vercel（`twf-web.vercel.app`）に自動デプロイされます。手順の詳細は `DEPLOY.md` を参照してください。親モノレポ運用時は Vercel の Root Directory を `twf-web` に設定する必要があります（本リポジトリがルートの場合はそのままで問題ありません）。

### 既知の軽微な差異

- ローカルの `python3 -m http.server` では `vercel.json` の CSP ヘッダーは付きません。本番と挙動がわずかに異なる場合があります。
- `favicon.ico` が無いため、ブラウザコンソールに 404 が出ることがあります（機能への影響はありません）。
