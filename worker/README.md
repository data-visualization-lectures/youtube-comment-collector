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

## ビルドエラー時の確認
```bash
# Cloud Build履歴
gcloud builds list --limit=5

# 直近ビルドの詳細ログ
gcloud builds describe BUILD_ID
```

よくある原因:
- `requirements.txt` の厳しすぎるバージョン固定
- ネットワーク一時障害による依存取得失敗
- OSビルドツール不足（このDockerfileでは `build-essential` を導入済み）
