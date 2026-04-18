# Vercel公開手順（高頻度更新向け）

## 重要な注意

この保管庫には他のノートが大量に存在します。  
**必ず Vercel の Root Directory を `twf-web` に設定**してください。  
保管庫ルートを公開すると、意図しないファイルが外部公開される可能性があります。

## 初回セットアップ

1. `twf-web` フォルダで `sync-note.ps1` を実行して `note.md` を作成
2. Vercelでプロジェクト作成
3. Root Directory を `twf-web` に設定
4. Build Command は空欄、Output Directory も空欄（静的配信）
5. デプロイ

## 更新フロー

1. 元ノート `The Walten Files 考察ノート.md` を更新
2. `twf-web/sync-note.ps1` を実行（`note.md` を同期）
3. `twf-web` 配下をコミット/Push
4. Vercel自動再デプロイ完了を待つ

## 補足

- サイト本文は `note.md` を読み込みます
- 目次・検索・年表UIは `index.html`, `app.js`, `styles.css` で管理します
