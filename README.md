# youtube-comment-collector

Vercel + Neon + Cloud Run Jobs構成で、YouTubeコメントの増分収集とLLM評価を行うサービスの初期実装です。

## 構成
- `api/`: Vercel Serverless Functions（チャンネル管理、ジョブ起動、日次Cron）
- `db/migrations/`: Neon(PostgreSQL)向けDDL
- `worker/`: Cloud Run向けワーカー（動画検知、コメント収集、評価）

## セットアップ
1. `.env.example` を `.env` にコピーし、値を設定
2. Neonに `db/migrations/0001_init.sql` を適用
3. Vercelへデプロイ（`api/`が関数として動作）
4. `worker/` をCloud Runへデプロイ
5. Vercelの `WORKER_BASE_URL` にCloud Run URLを設定

## 主要エンドポイント（Vercel）
- `GET /api/channels`
- `POST /api/channels`
- `GET /api/jobs?type=comment-scan|evaluation`
- `POST /api/jobs/comment-scan/run`
- `POST /api/jobs/evaluation/run`
- `GET /api/cron/daily`（Vercel Cron向け）

## 日次収集の流れ
1. Vercel Cronが `/api/cron/daily` を起動
2. APIがチャンネルごとに `comment_ingest_runs` を作成
3. APIがCloud Runワーカー `/run/comment-scan` を呼び出し
4. ワーカーが新規動画を検知し、コメントを増分UPSERT

## 注意
- Vercel HobbyのCronは1日1回かつ時刻精度が時間単位です。厳密な時刻運用はPro以上を推奨。
- 評価は `heuristic`（ローカル簡易評価）または `openai_compatible`（OpenAI互換API）を選択可能です。

