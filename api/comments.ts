import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "./_lib/db";
import { methodNotAllowed, parsePositiveInt } from "./_lib/http";

type CommentListRow = {
  id: number;
  videoId: number;
  youtubeCommentId: string;
  textOriginal: string;
  likeCount: number;
  publishedAt: string;
  updatedAt: string;
  isReply: boolean;
  parentCommentId: string | null;
  youtubeVideoId: string;
  videoTitle: string | null;
  channelId: number;
  youtubeChannelId: string;
  channelTitle: string | null;
  evaluationCount: number;
  hasEvaluation: boolean;
  latestEvaluatedAt: string | null;
};

function parseBoolean(value: string | undefined): boolean | null {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return null;
}

function isValidDateString(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (methodNotAllowed(req, res, ["GET"])) {
    return;
  }

  try {
    const channelId =
      parsePositiveInt(
        typeof req.query.channelId === "string" ? req.query.channelId : undefined
      ) ?? null;
    const videoId =
      parsePositiveInt(
        typeof req.query.videoId === "string" ? req.query.videoId : undefined
      ) ?? null;
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const from = typeof req.query.from === "string" ? req.query.from : null;
    const to = typeof req.query.to === "string" ? req.query.to : null;
    const hasEvaluation = parseBoolean(
      typeof req.query.hasEvaluation === "string" ? req.query.hasEvaluation : undefined
    );
    const limit =
      parsePositiveInt(
        typeof req.query.limit === "string" ? req.query.limit : undefined
      ) ?? 100;
    const cappedLimit = Math.min(limit, 300);

    if (from && !isValidDateString(from)) {
      res.status(400).json({
        error: "invalid_request",
        message: "from must be a valid date string"
      });
      return;
    }

    if (to && !isValidDateString(to)) {
      res.status(400).json({
        error: "invalid_request",
        message: "to must be a valid date string"
      });
      return;
    }

    const params: Array<number | string | boolean> = [];
    const where: string[] = [];

    if (channelId) {
      params.push(channelId);
      where.push(`c.id = $${params.length}`);
    }

    if (videoId) {
      params.push(videoId);
      where.push(`v.id = $${params.length}`);
    }

    if (q) {
      params.push(`%${q}%`);
      where.push(`cm.text_original ILIKE $${params.length}`);
    }

    if (from) {
      params.push(from);
      where.push(`cm.published_at >= $${params.length}::timestamptz`);
    }

    if (to) {
      params.push(to);
      where.push(`cm.published_at <= $${params.length}::timestamptz`);
    }

    if (hasEvaluation !== null) {
      params.push(hasEvaluation);
      where.push(`(COALESCE(ev.eval_count, 0) > 0) = $${params.length}`);
    }

    params.push(cappedLimit);

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const comments = (await sql(
      `
      SELECT
        cm.id,
        cm.video_id AS "videoId",
        cm.youtube_comment_id AS "youtubeCommentId",
        cm.text_original AS "textOriginal",
        cm.like_count AS "likeCount",
        cm.published_at AS "publishedAt",
        cm.updated_at AS "updatedAt",
        cm.is_reply AS "isReply",
        cm.parent_comment_id AS "parentCommentId",
        v.youtube_video_id AS "youtubeVideoId",
        v.title AS "videoTitle",
        c.id AS "channelId",
        c.youtube_channel_id AS "youtubeChannelId",
        c.title AS "channelTitle",
        COALESCE(ev.eval_count, 0)::int AS "evaluationCount",
        (COALESCE(ev.eval_count, 0) > 0) AS "hasEvaluation",
        ev.latest_evaluated_at AS "latestEvaluatedAt"
      FROM comments cm
      JOIN videos v ON v.id = cm.video_id
      JOIN channels c ON c.id = v.channel_id
      LEFT JOIN (
        SELECT
          comment_id,
          COUNT(*) AS eval_count,
          MAX(evaluated_at) AS latest_evaluated_at
        FROM comment_evaluations
        GROUP BY comment_id
      ) ev ON ev.comment_id = cm.id
      ${whereSql}
      ORDER BY cm.published_at DESC
      LIMIT $${params.length}
      `,
      params
    )) as CommentListRow[];

    res.status(200).json({ comments });
  } catch (error) {
    res.status(500).json({
      error: "internal_error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
