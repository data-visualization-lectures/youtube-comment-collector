# TODO / 実装状況

## 実装済み
- [x] Neon向けDBスキーマ作成（channels/videos/comments/runs/evaluations）
- [x] 日次コメント収集フロー（Vercel Cron -> API -> Cloud Run Worker）
- [x] チャンネル登録API（`GET/POST /api/channels`）
- [x] ジョブ起動/参照API（`/api/jobs`, `/api/jobs/comment-scan/run`, `/api/jobs/evaluation/run`）
- [x] 動画一覧API（`GET /api/videos`）
- [x] コメント一覧API（`GET /api/comments`、フィルタ対応）
- [x] コメント評価履歴API（`GET /api/comments/:id/evaluations`）
- [x] 評価処理（`heuristic` + `openai_compatible`）
- [x] 管理画面MVP（`/` でコメント/動画/ジョブ/評価履歴を閲覧）
- [x] セットアップ/運用ドキュメント更新（README）

## To Do（未実装・改善）
- [ ] 管理画面の認証強化（本番向けアクセス制御）
- [ ] コメント一覧のページング（cursor/offset）
- [ ] 検索性能強化（`pg_trgm` など全文検索インデックス）
- [ ] オープンウェイトLLMの本格対応（Ollama/vLLM等の接続）
- [ ] 評価の再実行ポリシーと失敗リトライ戦略の明確化
- [ ] 監視/アラート（ジョブ失敗率、遅延、APIエラー）
- [ ] テスト整備（API単体・Worker統合）
- [ ] CI/CD整備（lint/typecheck/testの自動実行）
- [ ] 第三者提供向けのマルチテナント設計（ユーザー/権限/課金）

## 直近優先
- [ ] 管理画面認証
- [ ] ページング
- [ ] 検索インデックス
- [ ] テスト整備
