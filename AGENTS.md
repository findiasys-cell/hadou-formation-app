# 公開更新時の必須作業

- 機能修正・DB更新・公開設定変更を行ったら、同じ更新で `release.js` の `updatedOn`（日本時間の日付）と `history.html` の変更内容を更新する。
- アプリ内の更新日と履歴ページ上部の日付は `release.js` を共通で使用する。DB件数は配信データから自動集計し、固定値を書かない。
- 公開後は固定URL https://hadou-formation-app.vercel.app/ で更新表示・履歴・変更箇所を確認する。
