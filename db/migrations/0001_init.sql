CREATE TABLE IF NOT EXISTS channels (
  id BIGSERIAL PRIMARY KEY,
  youtube_channel_id TEXT NOT NULL UNIQUE,
  title TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_video_scan_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS videos (
  id BIGSERIAL PRIMARY KEY,
  channel_id BIGINT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  youtube_video_id TEXT NOT NULL UNIQUE,
  title TEXT,
  published_at TIMESTAMPTZ NOT NULL,
  last_comment_scan_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comments (
  id BIGSERIAL PRIMARY KEY,
  video_id BIGINT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  youtube_comment_id TEXT NOT NULL UNIQUE,
  author_channel_id TEXT,
  text_original TEXT NOT NULL,
  like_count INTEGER NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  is_reply BOOLEAN NOT NULL DEFAULT FALSE,
  parent_comment_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comment_ingest_runs (
  id BIGSERIAL PRIMARY KEY,
  run_type TEXT NOT NULL DEFAULT 'comment_scan',
  target_channel_id BIGINT REFERENCES channels(id) ON DELETE SET NULL,
  target_video_id BIGINT REFERENCES videos(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'success', 'failed', 'partial')),
  fetched_count INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evaluation_jobs (
  id BIGSERIAL PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'success', 'failed')),
  filter_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  model_provider TEXT NOT NULL,
  model_name TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comment_evaluations (
  id BIGSERIAL PRIMARY KEY,
  comment_id BIGINT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  evaluation_job_id BIGINT NOT NULL REFERENCES evaluation_jobs(id) ON DELETE CASCADE,
  model_provider TEXT NOT NULL,
  model_name TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  label_json JSONB NOT NULL,
  score_json JSONB NOT NULL,
  rationale TEXT,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_videos_channel_published
  ON videos(channel_id, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_comments_video_published
  ON comments(video_id, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_comment_runs_status_created
  ON comment_ingest_runs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_eval_jobs_status_created
  ON evaluation_jobs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comment_evaluations_comment_job
  ON comment_evaluations(comment_id, evaluation_job_id);

