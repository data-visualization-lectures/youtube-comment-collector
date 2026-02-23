# youtube-comment-collector

Vercel + Neon + Cloud Run 構成で、YouTubeコメントの増分収集とLLM評価を行うサービスです。

## 構成
- `api/`: Vercel Serverless Functions（チャンネル管理、ジョブ起動、日次Cron）
- `db/migrations/`: Neon(PostgreSQL)向けDDL
- `worker/`: Cloud Run サービス向けワーカー（動画検知、コメント収集、評価）

## セットアップ（実態準拠）
1. `.env.example` を `.env` にコピーし、値を設定
2. Neonに `db/migrations/0001_init.sql` を適用
3. `worker/` をCloud Runへデプロイ（詳細は `worker/README.md`）
4. Cloud Run に環境変数を反映
   - 例: `gcloud run services update youtube-comment-collector --region asia-northeast1 --env-vars-file .env`
5. Vercelへデプロイ（`api/`が関数として動作）
6. Vercelに最低限この環境変数を設定
   - `DATABASE_URL`
   - `WORKER_BASE_URL`（Cloud RunのService URL）
   - `WORKER_SHARED_SECRET`（Cloud Runと同値）
   - 任意: `CRON_SHARED_SECRET`

## 主要エンドポイント（Vercel）
- `GET /api/channels`
- `POST /api/channels`
- `GET /api/videos`
- `GET /api/comments`
- `GET /api/comments/:id/evaluations`
- `GET /api/jobs?type=comment-scan|evaluation`
- `POST /api/jobs/comment-scan/run`
- `POST /api/jobs/evaluation/run`
- `GET /api/cron/daily`（Vercel Cron向け。`x-vercel-cron` または `x-cron-secret` が必要）

## 管理画面（MVP）
- ルート `/` に内部向けのシンプルな管理画面を実装済み
- 画面でできること:
  - チャンネル一覧と追加
  - 動画一覧の確認
  - コメント本文の一覧・絞り込み（channel/video/q/date/hasEvaluation）
  - コメント評価履歴の確認
  - 収集ジョブ・評価ジョブ履歴の確認
  - コメント収集ジョブと評価ジョブの手動起動

## 追加APIクエリ（MVP）
- `GET /api/videos?channelId=&limit=`
  - `channelId`: 任意（channels.id）
  - `limit`: 任意、default 50、max 200
- `GET /api/comments?channelId=&videoId=&q=&from=&to=&hasEvaluation=&limit=`
  - `channelId`: 任意（channels.id）
  - `videoId`: 任意（videos.id）
  - `q`: 任意（`text_original` の部分一致）
  - `from` / `to`: 任意（ISO日時）
  - `hasEvaluation`: 任意（`true` / `false`）
  - `limit`: 任意、default 100、max 300
- `GET /api/comments/:id/evaluations?limit=`
  - `id`: 必須（comments.id）
  - `limit`: 任意、default 50、max 200

## 日次収集の流れ
1. Vercel Cronが `/api/cron/daily` を起動
2. APIがチャンネルごとに `comment_ingest_runs` を作成
3. APIがCloud Runワーカー `/run/comment-scan` を呼び出し
4. ワーカーが新規動画を検知し、コメントを増分UPSERT

## 運用手順（最小）
1. 収集対象チャンネルを登録
   - `POST /api/channels`
2. 手動収集
   - `POST /api/jobs/comment-scan/run`（`channelId` 指定可）
3. 評価実行
   - `POST /api/jobs/evaluation/run`
4. 状態確認
   - `GET /api/jobs?type=comment-scan`
   - `GET /api/jobs?type=evaluation`
5. 管理画面で確認
   - `GET /` を開き、コメント・評価履歴を確認

## 既知の注意点
- Vercel HobbyのCronは1日1回かつ時刻精度が時間単位です。厳密な時刻運用はPro以上を推奨。
- 評価は `heuristic`（ローカル簡易評価）または `openai_compatible`（OpenAI互換API）を選択可能です。
- 現実装では `POST /api/jobs/comment-scan/run` がワーカー実行完了まで待つため、対象が多いとレスポンスが遅くなる場合があります。
- YouTube API呼び出しはネットワーク要因で一時失敗する場合があります（再実行で回復するケースあり）。
