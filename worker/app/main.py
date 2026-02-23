from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
from psycopg.types.json import Jsonb

from .config import (
    COMMENT_SCAN_VIDEO_LIMIT_PER_CHANNEL,
    LLM_MODEL,
    LLM_PROVIDER,
    WORKER_SHARED_SECRET,
    YOUTUBE_MAX_COMMENT_PAGES,
    YOUTUBE_MAX_VIDEOS_PER_SCAN,
)
from .db import get_conn
from .evaluator import evaluate_comment
from .youtube_client import fetch_comments, fetch_recent_videos

app = FastAPI(title="youtube-comment-worker")


class CommentScanRequest(BaseModel):
    runId: int


class EvaluationRequest(BaseModel):
    jobId: int


def _verify_auth(authorization: str | None) -> None:
    if not WORKER_SHARED_SECRET:
        return
    expected = f"Bearer {WORKER_SHARED_SECRET}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="unauthorized")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/run/comment-scan")
def run_comment_scan(payload: CommentScanRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _verify_auth(authorization)
    run_id = payload.runId
    fetched_count = 0
    inserted_count = 0
    updated_count = 0

    with get_conn() as conn:
        cur = conn.cursor()
        try:
            cur.execute(
                """
                SELECT
                  r.id,
                  r.status,
                  r.target_channel_id,
                  r.target_video_id,
                  c.youtube_channel_id,
                  c.last_video_scan_at
                FROM comment_ingest_runs r
                LEFT JOIN channels c ON c.id = r.target_channel_id
                WHERE r.id = %s
                """,
                (run_id,),
            )
            run = cur.fetchone()
            if not run:
                raise HTTPException(status_code=404, detail="run not found")

            cur.execute(
                """
                UPDATE comment_ingest_runs
                SET status = 'running', started_at = NOW(), error_message = NULL
                WHERE id = %s
                """,
                (run_id,),
            )
            conn.commit()

            target_videos: list[dict[str, Any]] = []
            if run["target_video_id"]:
                cur.execute(
                    "SELECT id, youtube_video_id FROM videos WHERE id = %s",
                    (run["target_video_id"],),
                )
                row = cur.fetchone()
                if row:
                    target_videos.append(row)
            elif run["target_channel_id"]:
                channel_id = run["target_channel_id"]
                youtube_channel_id = run["youtube_channel_id"]
                if not youtube_channel_id:
                    raise RuntimeError("target channel is missing youtube_channel_id")

                new_videos = fetch_recent_videos(
                    youtube_channel_id=youtube_channel_id,
                    max_results=YOUTUBE_MAX_VIDEOS_PER_SCAN,
                    published_after=run["last_video_scan_at"],
                )
                for video in new_videos:
                    cur.execute(
                        """
                        INSERT INTO videos (
                          channel_id,
                          youtube_video_id,
                          title,
                          published_at
                        )
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT (youtube_video_id)
                        DO UPDATE SET
                          title = COALESCE(EXCLUDED.title, videos.title),
                          updated_at = NOW()
                        RETURNING id, youtube_video_id
                        """,
                        (
                            channel_id,
                            video["youtube_video_id"],
                            video["title"],
                            video["published_at"],
                        ),
                    )
                    returned = cur.fetchone()
                    if returned:
                        target_videos.append(returned)

                cur.execute(
                    "UPDATE channels SET last_video_scan_at = NOW(), updated_at = NOW() WHERE id = %s",
                    (channel_id,),
                )
                conn.commit()

                cur.execute(
                    """
                    SELECT id, youtube_video_id
                    FROM videos
                    WHERE channel_id = %s
                    ORDER BY published_at DESC
                    LIMIT %s
                    """,
                    (channel_id, COMMENT_SCAN_VIDEO_LIMIT_PER_CHANNEL),
                )
                for row in cur.fetchall():
                    if not any(existing["id"] == row["id"] for existing in target_videos):
                        target_videos.append(row)
            else:
                raise RuntimeError("run target is not specified")

            for video in target_videos:
                comments = fetch_comments(video["youtube_video_id"], max_pages=YOUTUBE_MAX_COMMENT_PAGES)
                fetched_count += len(comments)

                for comment in comments:
                    cur.execute(
                        """
                        INSERT INTO comments (
                          video_id,
                          youtube_comment_id,
                          author_channel_id,
                          text_original,
                          like_count,
                          published_at,
                          updated_at,
                          is_reply,
                          parent_comment_id
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (youtube_comment_id)
                        DO UPDATE SET
                          text_original = EXCLUDED.text_original,
                          like_count = EXCLUDED.like_count,
                          updated_at = EXCLUDED.updated_at,
                          author_channel_id = EXCLUDED.author_channel_id,
                          parent_comment_id = EXCLUDED.parent_comment_id
                        RETURNING (xmax = 0) AS inserted
                        """,
                        (
                            video["id"],
                            comment["youtube_comment_id"],
                            comment["author_channel_id"],
                            comment["text_original"],
                            comment["like_count"],
                            comment["published_at"],
                            comment["updated_at"],
                            comment["is_reply"],
                            comment["parent_comment_id"],
                        ),
                    )
                    result = cur.fetchone()
                    if result and result["inserted"]:
                        inserted_count += 1
                    else:
                        updated_count += 1

                cur.execute(
                    "UPDATE videos SET last_comment_scan_at = NOW(), updated_at = NOW() WHERE id = %s",
                    (video["id"],),
                )
                conn.commit()

            cur.execute(
                """
                UPDATE comment_ingest_runs
                SET
                  status = 'success',
                  fetched_count = %s,
                  inserted_count = %s,
                  updated_count = %s,
                  finished_at = NOW()
                WHERE id = %s
                """,
                (fetched_count, inserted_count, updated_count, run_id),
            )
            conn.commit()
            return {
                "status": "success",
                "runId": run_id,
                "fetchedCount": fetched_count,
                "insertedCount": inserted_count,
                "updatedCount": updated_count,
                "targetVideos": len(target_videos),
            }
        except Exception as exc:
            conn.rollback()
            cur.execute(
                """
                UPDATE comment_ingest_runs
                SET
                  status = 'failed',
                  error_message = %s,
                  finished_at = NOW()
                WHERE id = %s
                """,
                (str(exc)[:2000], run_id),
            )
            conn.commit()
            raise


@app.post("/run/evaluation")
def run_evaluation(payload: EvaluationRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _verify_auth(authorization)
    job_id = payload.jobId

    with get_conn() as conn:
        cur = conn.cursor()
        try:
            cur.execute(
                """
                SELECT
                  id,
                  status,
                  filter_json,
                  model_provider,
                  model_name,
                  prompt_version
                FROM evaluation_jobs
                WHERE id = %s
                """,
                (job_id,),
            )
            job = cur.fetchone()
            if not job:
                raise HTTPException(status_code=404, detail="job not found")

            cur.execute(
                """
                UPDATE evaluation_jobs
                SET status = 'running', started_at = NOW()
                WHERE id = %s
                """,
                (job_id,),
            )
            conn.commit()

            filter_json = job["filter_json"] or {}
            provider = job["model_provider"] or LLM_PROVIDER
            model_name = job["model_name"] or LLM_MODEL
            prompt_version = job["prompt_version"] or "v1"
            limit = int(filter_json.get("limit", 200))
            limit = max(1, min(limit, 1000))
            video_id = filter_json.get("videoId")
            channel_id = filter_json.get("channelId")

            where_clauses = [
                """
                NOT EXISTS (
                  SELECT 1
                  FROM comment_evaluations ce
                  WHERE ce.comment_id = c.id
                    AND ce.model_provider = %s
                    AND ce.model_name = %s
                    AND ce.prompt_version = %s
                )
                """
            ]
            params: list[Any] = [provider, model_name, prompt_version]

            if video_id is not None:
                where_clauses.append("c.video_id = %s")
                params.append(video_id)
            if channel_id is not None:
                where_clauses.append("v.channel_id = %s")
                params.append(channel_id)

            params.append(limit)
            query = f"""
                SELECT c.id, c.text_original
                FROM comments c
                JOIN videos v ON v.id = c.video_id
                WHERE {" AND ".join(where_clauses)}
                ORDER BY c.published_at DESC
                LIMIT %s
            """
            cur.execute(query, params)
            targets = cur.fetchall()

            evaluated = 0
            for target in targets:
                result = evaluate_comment(
                    text=target["text_original"],
                    provider=provider,
                    model_name=model_name,
                    prompt_version=prompt_version,
                )

                label_json = result.get("label", {})
                score_json = result.get("score", {})
                rationale = result.get("rationale")

                cur.execute(
                    """
                    INSERT INTO comment_evaluations (
                      comment_id,
                      evaluation_job_id,
                      model_provider,
                      model_name,
                      prompt_version,
                      label_json,
                      score_json,
                      rationale
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        target["id"],
                        job_id,
                        provider,
                        model_name,
                        prompt_version,
                        Jsonb(label_json),
                        Jsonb(score_json),
                        rationale,
                    ),
                )
                evaluated += 1

            cur.execute(
                """
                UPDATE evaluation_jobs
                SET status = 'success', finished_at = NOW()
                WHERE id = %s
                """,
                (job_id,),
            )
            conn.commit()
            return {"status": "success", "jobId": job_id, "evaluatedCount": evaluated}
        except Exception as exc:
            conn.rollback()
            cur.execute(
                """
                UPDATE evaluation_jobs
                SET status = 'failed', finished_at = NOW()
                WHERE id = %s
                """,
                (job_id,),
            )
            conn.commit()
            raise HTTPException(status_code=500, detail=str(exc)[:2000]) from exc

