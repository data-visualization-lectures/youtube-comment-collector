# 収集コメント閲覧UI 実装計画（MVP）

## 1. 目的
- 収集済みコメントを**Web画面で閲覧**できるようにする
- 収集ジョブ／評価ジョブの状態を画面で追えるようにする
- まずは自分用の管理画面（内部向け）として最短実装する

## 2. 現状とギャップ
## 現状
- 収集・評価処理は動作（Vercel API + Cloud Run Worker）
- `channels` / `jobs` のAPIはある
- 専用のフロント画面は未実装

## ギャップ
- コメント本文を一覧・検索・絞り込みするAPIがない
- 動画一覧と動画単位のコメント閲覧APIがない
- 評価結果（label/score）を画面で確認しづらい

## 3. 実装スコープ（MVP）
1. コメント閲覧画面（最優先）
2. 動画一覧画面（チャンネル単位）
3. ジョブ監視画面（収集/評価）
4. チャンネル管理画面（既存API利用）

## MVPではやらない
- マルチユーザー認可
- 複雑な可視化（ダッシュボード分析）
- リアルタイム更新（まずは手動リロード）

## 4. 技術方針
- Frontend: `Next.js`（Vercelデプロイ）
- Backend: 既存 `api/*.ts` を拡張
- DB: 既存Neon(PostgreSQL)を利用
- 認証: まずは簡易（Basic AuthまたはVercel保護機能）

## 5. 追加API設計

## 5.1 動画一覧
- `GET /api/videos`
- Query:
  - `channelId`（任意）
  - `limit`（default 50）
  - `cursor`（将来拡張）
- Response:
  - `videos[]`（video id, title, published_at, last_comment_scan_at, comment_count）

## 5.2 コメント一覧
- `GET /api/comments`
- Query:
  - `channelId`（任意）
  - `videoId`（任意）
  - `q`（本文検索、任意）
  - `from`, `to`（投稿日フィルタ、任意）
  - `hasEvaluation`（true/false、任意）
  - `limit`（default 100）
- Response:
  - `comments[]`（本文、動画情報、投稿日時、いいね、評価有無）

## 5.3 コメント評価履歴
- `GET /api/comments/{id}/evaluations`
- Response:
  - `evaluations[]`（provider/model/prompt_version/label_json/score_json/evaluated_at）

## 5.4 既存APIの活用
- `GET /api/channels`
- `GET /api/jobs?type=comment-scan|evaluation`
- `POST /api/jobs/comment-scan/run`
- `POST /api/jobs/evaluation/run`

## 6. 画面要件（MVP）

## 6.1 Channels
- チャンネル一覧
- 収集実行ボタン（手動）

## 6.2 Videos
- チャンネル選択
- 動画一覧（公開日順）
- 各動画へのコメント導線

## 6.3 Comments（最重要）
- テーブル表示:
  - 投稿日時
  - 動画タイトル
  - コメント本文
  - いいね
  - 評価状態
- フィルタ:
  - チャンネル
  - 動画
  - キーワード
  - 期間
- 詳細パネル:
  - 評価ラベル/スコア
  - 評価履歴

## 6.4 Jobs
- 収集ジョブ履歴
- 評価ジョブ履歴
- status/error_message の確認

## 7. DB/性能面の最小対応
- 既存Indexを活用（`videos`, `comments`, `runs`）
- 追加候補（必要になった時点）:
  - `comments(published_at DESC)`
  - `comments(text_original)` に全文検索インデックス（pg_trgm）
- APIは `limit` を必須運用（過大レスポンス防止）

## 8. 実装フェーズ

## Phase 1: API拡張（1〜2日）
- `GET /api/videos`
- `GET /api/comments`
- `GET /api/comments/{id}/evaluations`
- 最低限のバリデーション・エラーレスポンス

## Phase 2: UI実装（2〜3日）
- Next.js初期化
- `Channels / Videos / Comments / Jobs` ページ
- フィルタUIとページング（limitベース）

## Phase 3: 運用導線（1日）
- 画面から収集実行／評価実行
- ローディング・失敗時表示
- READMEに運用手順追記

## 9. 受け入れ条件（レビュー用）
1. `@lalatuune` の動画一覧が画面で見える
2. コメント本文が日時順に一覧表示される
3. キーワード検索と動画フィルタが効く
4. 収集ジョブ失敗時に `error_message` が画面で見える
5. 評価済みコメントの `label_json/score_json` を詳細で見える

## 10. リスクと対策
- YouTube API一時障害で収集失敗:
  - 画面で失敗可視化 + 手動再実行導線
- コメント件数増大で応答遅延:
  - strictな`limit`と索引追加
- 先にUIだけ作ると価値が出ない:
  - API→Comments画面を最優先で実装

## 11. 次アクション（この計画承認後）
1. API 3本（videos/comments/evaluations）を実装
2. Next.jsの管理画面雛形を追加
3. Comments画面まで先に動かし、最初のレビューを実施

