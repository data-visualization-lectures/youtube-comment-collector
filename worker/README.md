# Worker (Cloud Run)

## ローカル起動
```bash
cd worker
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080
```

## Cloud Runデプロイ（CLI）
1. イメージをビルドしてpush
```bash
gcloud builds submit --tag gcr.io/$GOOGLE_CLOUD_PROJECT/youtube-comment-collector ./worker
```

2. Cloud Runへデプロイ
```bash
gcloud run deploy youtube-comment-collector \
  --image gcr.io/$GOOGLE_CLOUD_PROJECT/youtube-comment-collector \
  --region=asia-northeast1 \
  --allow-unauthenticated
```

3. 環境変数を反映（必須）
```bash
gcloud run services update youtube-comment-collector \
  --region asia-northeast1 \
  --env-vars-file .env
```

4. 起動確認
```bash
curl -sS https://youtube-comment-collector-<PROJECT_NUMBER>.asia-northeast1.run.app/health
# {"status":"ok"}
```

## 必須環境変数（Worker）
- `DATABASE_URL`
- `WORKER_SHARED_SECRET`
- `YOUTUBE_API_KEY`

## 認証方式
- 現実装は `Authorization: Bearer <WORKER_SHARED_SECRET>` を要求
- `WORKER_SHARED_SECRET` を未設定にすると認証なしで受け付けるため、未設定運用は非推奨
- Vercel側 `WORKER_SHARED_SECRET` と同一値にすること

## Continuous Deploymentを使う場合
- Cloud Runプレースホルダー画面が出る場合、最新ビルド失敗中です
- Cloud Buildで失敗した場合、Cloud Runは `gcr.io/cloudrun/placeholder` のままになります
- まずビルド履歴とログを確認してください

## ビルドエラー時の確認
```bash
# Cloud Build履歴
gcloud builds list --limit=5

# 直近ビルドの詳細ログ
gcloud builds describe BUILD_ID

# Cloud Buildログ（Cloud Logging）
gcloud logging read \
  'logName="projects/<PROJECT_ID>/logs/cloudbuild" AND resource.labels.build_id="BUILD_ID"' \
  --limit=200
```

よくある原因:
- エントリポイント未設定（`Procfile` / `GOOGLE_ENTRYPOINT`）
- `DATABASE_URL` 未設定で起動失敗
- ネットワーク一時障害によるYouTube API呼び出し失敗
