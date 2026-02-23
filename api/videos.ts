import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "./_lib/db";
import { methodNotAllowed, parsePositiveInt } from "./_lib/http";

type VideoListRow = {
  id: number;
  channelId: number;
  youtubeChannelId: string;
  channelTitle: string | null;
  youtubeVideoId: string;
  title: string | null;
  publishedAt: string;
  lastCommentScanAt: string | null;
  commentCount: number;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (methodNotAllowed(req, res, ["GET"])) {
    return;
  }

  try {
    const channelId =
      parsePositiveInt(
        typeof req.query.channelId === "string" ? req.query.channelId : undefined
      ) ?? null;
    const limit =
      parsePositiveInt(
        typeof req.query.limit === "string" ? req.query.limit : undefined
      ) ?? 50;
    const cappedLimit = Math.min(limit, 200);

    const params: Array<number> = [];
    const where: string[] = [];

    if (channelId) {
      params.push(channelId);
      where.push(`v.channel_id = $${params.length}`);
    }

    params.push(cappedLimit);

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const videos = (await sql(
      `
      SELECT
        v.id,
        v.channel_id AS "channelId",
        c.youtube_channel_id AS "youtubeChannelId",
        c.title AS "channelTitle",
        v.youtube_video_id AS "youtubeVideoId",
        v.title,
        v.published_at AS "publishedAt",
        v.last_comment_scan_at AS "lastCommentScanAt",
        COUNT(cm.id)::int AS "commentCount"
      FROM videos v
      JOIN channels c ON c.id = v.channel_id
      LEFT JOIN comments cm ON cm.video_id = v.id
      ${whereSql}
      GROUP BY
        v.id,
        v.channel_id,
        c.youtube_channel_id,
        c.title,
        v.youtube_video_id,
        v.title,
        v.published_at,
        v.last_comment_scan_at
      ORDER BY v.published_at DESC
      LIMIT $${params.length}
      `,
      params
    )) as VideoListRow[];

    res.status(200).json({ videos });
  } catch (error) {
    res.status(500).json({
      error: "internal_error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
