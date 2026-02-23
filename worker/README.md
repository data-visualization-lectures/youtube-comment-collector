# Worker (Cloud Run)

## ローカル起動
```bash
cd worker
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080
```

## Cloud Runデプロイ例
```bash
gcloud builds submit --tag gcr.io/$GOOGLE_CLOUD_PROJECT/youtube-comment-worker ./worker
gcloud run deploy youtube-comment-worker \
  --image gcr.io/$GOOGLE_CLOUD_PROJECT/youtube-comment-worker \
  --region=asia-northeast1 \
  --allow-unauthenticated \
  --set-env-vars DATABASE_URL=...,WORKER_SHARED_SECRET=...,YOUTUBE_API_KEY=...
```

※ 本番では `--allow-unauthenticated` を避け、Vercel側IP制限や認証を組み合わせる構成を推奨。

