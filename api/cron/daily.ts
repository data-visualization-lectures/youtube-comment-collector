import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../_lib/db";
import { methodNotAllowed } from "../_lib/http";
import { optionalEnv } from "../_lib/env";
import { dispatchWorker } from "../_lib/worker";

type DailyRunRow = {
  runId: number;
  channelId: number | null;
};

function isAuthorized(req: VercelRequest): boolean {
  if (process.env.NODE_ENV === "development") {
    return true;
  }
  const vercelCronHeader = req.headers["x-vercel-cron"];
  if (vercelCronHeader) {
    return true;
  }
  const shared = optionalEnv("CRON_SHARED_SECRET");
  if (!shared) {
    return false;
  }
  return req.headers["x-cron-secret"] === shared;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (methodNotAllowed(req, res, ["GET", "POST"])) {
    return;
  }
  if (!isAuthorized(req)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  try {
    const runs = (await sql`
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
      RETURNING id AS "runId", target_channel_id AS "channelId"
    `) as DailyRunRow[];

    const dispatchResults = await Promise.all(
      runs.map(async (run) => {
        const dispatch = await dispatchWorker("/run/comment-scan", { runId: run.runId });
        if (!dispatch.ok) {
          await sql`
            UPDATE comment_ingest_runs
            SET status = 'failed',
                error_message = ${`Worker dispatch failed: ${dispatch.status}`},
                finished_at = NOW()
            WHERE id = ${run.runId}
          `;
          return { runId: run.runId, ok: false, status: dispatch.status };
        }
        return { runId: run.runId, ok: true, status: dispatch.status };
      })
    );

    res.status(200).json({
      createdRuns: runs.length,
      dispatched: dispatchResults.filter((x) => x.ok).length,
      failed: dispatchResults.filter((x) => !x.ok).length,
      dispatchResults
    });
  } catch (error) {
    res.status(500).json({
      error: "internal_error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
