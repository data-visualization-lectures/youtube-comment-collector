import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "./_lib/db";
import { methodNotAllowed, parseJsonBody } from "./_lib/http";

type CreateChannelBody = {
  youtubeChannelId?: string;
  title?: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (methodNotAllowed(req, res, ["GET", "POST"])) {
    return;
  }

  if (req.method === "GET") {
    const channels = await sql<{
      id: number;
      youtube_channel_id: string;
      title: string | null;
      is_active: boolean;
      last_video_scan_at: string | null;
      created_at: string;
      updated_at: string;
    }[]>`
      SELECT
        id,
        youtube_channel_id,
        title,
        is_active,
        last_video_scan_at,
        created_at,
        updated_at
      FROM channels
      ORDER BY created_at DESC
    `;

    res.status(200).json({ channels });
    return;
  }

  try {
    const body = parseJsonBody<CreateChannelBody>(req);
    const youtubeChannelId = body.youtubeChannelId?.trim();
    const title = body.title?.trim() || null;

    if (!youtubeChannelId) {
      res.status(400).json({
        error: "invalid_request",
        message: "youtubeChannelId is required"
      });
      return;
    }

    const rows = await sql<{
      id: number;
      youtube_channel_id: string;
      title: string | null;
      is_active: boolean;
      last_video_scan_at: string | null;
      created_at: string;
      updated_at: string;
    }[]>`
      INSERT INTO channels (youtube_channel_id, title, is_active)
      VALUES (${youtubeChannelId}, ${title}, true)
      ON CONFLICT (youtube_channel_id)
      DO UPDATE SET
        title = COALESCE(EXCLUDED.title, channels.title),
        is_active = true,
        updated_at = NOW()
      RETURNING
        id,
        youtube_channel_id,
        title,
        is_active,
        last_video_scan_at,
        created_at,
        updated_at
    `;

    res.status(201).json({ channel: rows[0] });
  } catch (error) {
    res.status(500).json({
      error: "internal_error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

