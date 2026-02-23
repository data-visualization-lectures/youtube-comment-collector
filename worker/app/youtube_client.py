from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import requests

from .config import YOUTUBE_API_BASE_URL, YOUTUBE_API_KEY


def _parse_rfc3339(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def _yt_get(path: str, params: dict[str, Any]) -> dict[str, Any]:
    if not YOUTUBE_API_KEY:
        raise RuntimeError("YOUTUBE_API_KEY is not configured")
    merged = {"key": YOUTUBE_API_KEY, **params}
    response = requests.get(f"{YOUTUBE_API_BASE_URL}/{path}", params=merged, timeout=30)
    response.raise_for_status()
    return response.json()


def fetch_recent_videos(
    youtube_channel_id: str,
    max_results: int,
    published_after: datetime | None = None,
) -> list[dict[str, Any]]:
    videos: list[dict[str, Any]] = []
    page_token: str | None = None
    remaining = max_results

    while remaining > 0:
        take = min(50, remaining)
        params: dict[str, Any] = {
            "part": "snippet",
            "channelId": youtube_channel_id,
            "type": "video",
            "order": "date",
            "maxResults": take,
        }
        if page_token:
            params["pageToken"] = page_token
        if published_after:
            params["publishedAfter"] = published_after.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")

        payload = _yt_get("search", params)
        for item in payload.get("items", []):
            snippet = item.get("snippet", {})
            video_id = item.get("id", {}).get("videoId")
            published_at = snippet.get("publishedAt")
            if not video_id or not published_at:
                continue
            videos.append(
                {
                    "youtube_video_id": video_id,
                    "title": snippet.get("title"),
                    "published_at": _parse_rfc3339(published_at),
                }
            )

        remaining = max_results - len(videos)
        page_token = payload.get("nextPageToken")
        if not page_token:
            break

    return videos


def fetch_comments(youtube_video_id: str, max_pages: int) -> list[dict[str, Any]]:
    comments: list[dict[str, Any]] = []
    page_token: str | None = None
    pages = 0

    while pages < max_pages:
        params: dict[str, Any] = {
            "part": "snippet,replies",
            "videoId": youtube_video_id,
            "maxResults": 100,
            "order": "time",
            "textFormat": "plainText",
        }
        if page_token:
            params["pageToken"] = page_token

        payload = _yt_get("commentThreads", params)
        pages += 1

        for item in payload.get("items", []):
            snippet = item.get("snippet", {})
            top_level = snippet.get("topLevelComment", {}).get("snippet", {})
            top_comment_id = item.get("snippet", {}).get("topLevelComment", {}).get("id")
            if top_comment_id and top_level.get("textOriginal"):
                comments.append(
                    {
                        "youtube_comment_id": top_comment_id,
                        "author_channel_id": (top_level.get("authorChannelId") or {}).get("value"),
                        "text_original": top_level.get("textOriginal"),
                        "like_count": int(top_level.get("likeCount", 0)),
                        "published_at": _parse_rfc3339(top_level["publishedAt"]),
                        "updated_at": _parse_rfc3339(top_level["updatedAt"]),
                        "is_reply": False,
                        "parent_comment_id": None,
                    }
                )

            for reply in item.get("replies", {}).get("comments", []):
                reply_snippet = reply.get("snippet", {})
                reply_id = reply.get("id")
                if reply_id and reply_snippet.get("textOriginal"):
                    comments.append(
                        {
                            "youtube_comment_id": reply_id,
                            "author_channel_id": (reply_snippet.get("authorChannelId") or {}).get("value"),
                            "text_original": reply_snippet.get("textOriginal"),
                            "like_count": int(reply_snippet.get("likeCount", 0)),
                            "published_at": _parse_rfc3339(reply_snippet["publishedAt"]),
                            "updated_at": _parse_rfc3339(reply_snippet["updatedAt"]),
                            "is_reply": True,
                            "parent_comment_id": top_comment_id,
                        }
                    )

        page_token = payload.get("nextPageToken")
        if not page_token:
            break

    return comments

