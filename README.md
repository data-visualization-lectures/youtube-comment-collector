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
- `GET /api/jobs?type=comment-scan|evaluation`
- `POST /api/jobs/comment-scan/run`
- `POST /api/jobs/evaluation/run`
- `GET /api/cron/daily`（Vercel Cron向け。`x-vercel-cron` または `x-cron-secret` が必要）

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

## 既知の注意点
- Vercel HobbyのCronは1日1回かつ時刻精度が時間単位です。厳密な時刻運用はPro以上を推奨。
- 評価は `heuristic`（ローカル簡易評価）または `openai_compatible`（OpenAI互換API）を選択可能です。
- 現実装では `POST /api/jobs/comment-scan/run` がワーカー実行完了まで待つため、対象が多いとレスポンスが遅くなる場合があります。
- YouTube API呼び出しはネットワーク要因で一時失敗する場合があります（再実行で回復するケースあり）。
