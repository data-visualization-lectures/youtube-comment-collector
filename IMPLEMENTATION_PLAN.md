# YouTubeコメント収集・評価サービス 実装計画

## 1. 目的
- 指定チャンネルの**新規投稿動画**を自動検知する
- 各動画のコメントを**日次で増分収集**する（既収集分は除外）
- 収集処理と独立したタイミングでコメントを**LLM評価**する
- まずは自分用に運用し、将来的に第三者提供可能なWebサービスへ拡張する

## 2. 要件整理（確定）
- 事前に対象チャンネルを登録できること
- 新規投稿動画のみを収集対象にすること
- コメント収集は日次実行で、重複を排除すること
- コメント評価は収集処理と切り離して実行できること
- 評価は可能ならオープンウェイトLLM、難しければ商用LLMを利用すること
- 将来のマルチユーザー提供を見据えた構成であること

## 3. 全体アーキテクチャ（推奨）
- Backend: `FastAPI`（Python）
- DB: `PostgreSQL`
- Queue: `Redis + Celery`（またはRQ）
- Scheduler: `Celery beat`（日次ジョブ）
- Frontend: `Next.js`
- External API: `YouTube Data API v3`
- Deploy: まずはDocker Compose、将来Kubernetes/マネージドサービスへ移行可能な構成

### 3.1 処理の分離方針
- パイプラインA: 収集（動画検知 + コメント増分取得）
- パイプラインB: 評価（未評価コメントに対するLLM推論）
- 収集と評価を完全分離し、障害時の影響範囲を限定する

## 4. データモデル（MVP）

### `channels`
- `id` (PK)
- `youtube_channel_id` (UNIQUE)
- `title`
- `is_active`
- `last_video_scan_at`
- `created_at`, `updated_at`

### `videos`
- `id` (PK)
- `youtube_video_id` (UNIQUE)
- `channel_id` (FK -> channels.id)
- `title`
- `published_at`
- `last_comment_scan_at`
- `created_at`, `updated_at`

### `comments`
- `id` (PK)
- `youtube_comment_id` (UNIQUE)
- `video_id` (FK -> videos.id)
- `author_channel_id`
- `text_original`
- `like_count`
- `published_at`
- `updated_at`（YouTube上の更新反映用）
- `is_reply`
- `parent_comment_id`（返信の場合）
- `created_at`

### `comment_ingest_runs`
- `id` (PK)
- `run_type`（video_scan / comment_scan）
- `target_channel_id`（nullable）
- `target_video_id`（nullable）
- `status`（success / failed / partial）
- `fetched_count`
- `inserted_count`
- `updated_count`
- `error_message`
- `started_at`, `finished_at`

### `evaluation_jobs`
- `id` (PK)
- `status`（queued / running / success / failed）
- `filter_json`（対象条件）
- `model_provider`
- `model_name`
- `prompt_version`
- `started_at`, `finished_at`

### `comment_evaluations`
- `id` (PK)
- `comment_id` (FK -> comments.id)
- `evaluation_job_id` (FK -> evaluation_jobs.id)
- `model_provider`
- `model_name`
- `prompt_version`
- `label_json`（分類ラベル）
- `score_json`（スコア）
- `rationale`（任意）
- `evaluated_at`

## 5. バッチ処理設計

## 5.1 日次収集ジョブ（例: 毎日 02:00）
1. アクティブなチャンネル一覧取得
2. 各チャンネルで新規動画を検索（公開日・動画IDベース）
3. `videos`に未登録動画のみUPSERT
4. 対象動画のコメントをページング取得
5. `youtube_comment_id`をキーにUPSERT（重複排除）
6. 収集結果を`comment_ingest_runs`に記録

## 5.2 評価ジョブ（手動 or 定期）
1. 未評価コメント（または条件一致コメント）を抽出
2. 評価キュー投入
3. LLMで推論（プロバイダ切替可能）
4. `comment_evaluations`へ保存
5. 失敗レコードはリトライキューへ

## 6. LLM評価レイヤ設計

## 6.1 インターフェース統一
- `Evaluator`抽象インターフェースを定義
  - `evaluate(comment_text, prompt_version, options) -> structured_result`
- 実装A: Open-weight（vLLM等の自前推論）
- 実装B: 商用API（OpenAI / Anthropic等）

## 6.2 プロンプト管理
- `prompt_version`を必須保存
- 出力はJSON Schemaで厳密化（ラベル・スコア・理由）
- 後日比較可能な再現性（同じversionで再評価）

## 7. Webアプリ機能（MVP）
- チャンネル登録・有効/無効化
- 新規動画検知の実行/履歴確認
- コメント収集ジョブの実行/履歴確認
- 評価ジョブの作成（条件指定）/進捗確認
- コメント一覧（検索・フィルタ）
- 評価結果の閲覧（動画別・期間別）

## 8. API設計（初期案）
- `POST /channels`
- `GET /channels`
- `POST /jobs/video-scan/run`
- `POST /jobs/comment-scan/run`
- `POST /jobs/evaluation/run`
- `GET /jobs/{job_id}`
- `GET /videos`
- `GET /comments`
- `GET /comments/{id}/evaluations`

## 9. フェーズ別実装計画

## Phase 0（1週間）基盤
- FastAPIプロジェクト雛形
- DBマイグレーション（Alembic）
- Redis/Celery導入
- 最低限の認証（自分用）
- ログ/監視の基礎

## Phase 1（1〜2週間）収集MVP
- チャンネル登録API
- 新規動画検知ジョブ
- コメント増分収集ジョブ
- 重複排除UPSERT
- ジョブ履歴保存

## Phase 2（1週間）評価MVP
- 評価ジョブ作成API
- Evaluatorインターフェース実装
- まずは商用LLMで安定稼働
- Open-weight版を後追い接続

## Phase 3（1週間）管理UI
- チャンネル/動画/コメント一覧
- ジョブ履歴・状態表示
- 評価結果画面

## Phase 4（2週間）外部提供準備
- マルチテナント対応（`tenant_id`導入）
- 権限分離・監査ログ
- レート制限・利用量計測
- 運用手順（障害対応/バックアップ）

## 10. 非機能要件
- 可用性: 収集失敗時の自動リトライ
- 性能: 大量コメントをバッチ処理可能
- 保守性: 収集と評価の疎結合
- 監査性: 誰が/いつ/どのモデルで評価したか追跡可能
- セキュリティ: APIキー暗号化保存、アクセス制御

## 11. リスクと対策
- YouTube API制限: 呼び出し最適化、クォータ監視、バックオフ
- LLMコスト増: 事前フィルタ、バッチ推論、上限設定
- 評価品質のばらつき: ゴールドデータで定期検証、プロンプト版管理
- 将来拡張時の破綻: 初期からテナント分離を意識したスキーマ設計

## 12. 初手タスク（着手順）
1. DBスキーマ確定とマイグレーション作成
2. YouTube収集基盤（チャンネル登録 / 新規動画検知 / コメント増分）
3. ジョブ管理と再実行制御
4. 評価インターフェース実装（商用LLM先行）
5. 管理UI最小版の実装

