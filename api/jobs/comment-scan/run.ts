import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../../_lib/db";
import { methodNotAllowed, parseJsonBody } from "../../_lib/http";
import { dispatchWorker } from "../../_lib/worker";

type RunCommentScanBody = {
  channelId?: number;
  videoId?: number;
};

type RunTarget = {
  runId: number;
  channelId: number | null;
  videoId: number | null;
};

async function queueRun(target: RunCommentScanBody): Promise<RunTarget[]> {
  if (target.videoId) {
    const rows = await sql<RunTarget[]>`
      INSERT INTO comment_ingest_runs (
        run_type,
        target_video_id,
        status
      )
      VALUES ('comment_scan', ${target.videoId}, 'queued')
      RETURNING id AS "runId", target_channel_id AS "channelId", target_video_id AS "videoId"
    `;
    return rows;
  }

  if (target.channelId) {
    const rows = await sql<RunTarget[]>`
      INSERT INTO comment_ingest_runs (
        run_type,
        target_channel_id,
        status
      )
      VALUES ('comment_scan', ${target.channelId}, 'queued')
      RETURNING id AS "runId", target_channel_id AS "channelId", target_video_id AS "videoId"
    `;
    return rows;
  }

  const rows = await sql<RunTarget[]>`
    INSERT INTO comment_ingest_runs (
      run_type,
      target_channel_id,
      status
    )
    SELECT
      'comment_scan',
      c.id,
      'queued'
    FROM channels c
    WHERE c.is_active = true
    RETURNING id AS "runId", target_channel_id AS "channelId", target_video_id AS "videoId"
  `;
  return rows;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (methodNotAllowed(req, res, ["POST"])) {
    return;
  }

  try {
    const body = parseJsonBody<RunCommentScanBody>(req);
    const targets = await queueRun(body);

    if (targets.length === 0) {
      res.status(200).json({ queued: 0, dispatched: 0, failed: 0, runs: [] });
      return;
    }

    const results = await Promise.all(
      targets.map(async (target) => {
        const dispatch = await dispatchWorker("/run/comment-scan", {
          runId: target.runId
        });

        if (!dispatch.ok) {
          await sql`
            UPDATE comment_ingest_runs
            SET status = 'failed',
                error_message = ${`Worker dispatch failed: ${dispatch.status}`},
                finished_at = NOW()
            WHERE id = ${target.runId}
          `;
          return { ...target, ok: false, status: dispatch.status, body: dispatch.body };
        }

        return { ...target, ok: true, status: dispatch.status, body: dispatch.body };
      })
    );

    const dispatched = results.filter((x) => x.ok).length;
    const failed = results.length - dispatched;
    res.status(202).json({
      queued: targets.length,
      dispatched,
      failed,
      runs: results
    });
  } catch (error) {
    res.status(500).json({
      error: "internal_error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

