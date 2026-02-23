from __future__ import annotations

import os


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required env var: {name}")
    return value


DATABASE_URL = require_env("DATABASE_URL")
WORKER_SHARED_SECRET = os.getenv("WORKER_SHARED_SECRET", "")

YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY", "")
YOUTUBE_API_BASE_URL = os.getenv("YOUTUBE_API_BASE_URL", "https://www.googleapis.com/youtube/v3")
YOUTUBE_MAX_COMMENT_PAGES = int(os.getenv("YOUTUBE_MAX_COMMENT_PAGES", "10"))
YOUTUBE_MAX_VIDEOS_PER_SCAN = int(os.getenv("YOUTUBE_MAX_VIDEOS_PER_SCAN", "25"))
COMMENT_SCAN_VIDEO_LIMIT_PER_CHANNEL = int(os.getenv("COMMENT_SCAN_VIDEO_LIMIT_PER_CHANNEL", "30"))

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "heuristic")
LLM_API_BASE_URL = os.getenv("LLM_API_BASE_URL", "https://api.openai.com/v1")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")

