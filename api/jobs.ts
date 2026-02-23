import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "./_lib/db";
import { methodNotAllowed, parsePositiveInt } from "./_lib/http";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (methodNotAllowed(req, res, ["GET"])) {
    return;
  }

  try {
    const type = typeof req.query.type === "string" ? req.query.type : "all";
    const limit =
      parsePositiveInt(
        typeof req.query.limit === "string" ? req.query.limit : undefined
      ) ?? 50;
    const cappedLimit = Math.min(limit, 200);

    if (type === "comment-scan") {
      const runs = await sql`
        SELECT
          id,
          run_type,
          target_channel_id,
          target_video_id,
          status,
          fetched_count,
          inserted_count,
          updated_count,
          error_message,
          started_at,
          finished_at,
          created_at
        FROM comment_ingest_runs
        ORDER BY created_at DESC
        LIMIT ${cappedLimit}
      `;
      res.status(200).json({ runs });
      return;
    }

    if (type === "evaluation") {
      const jobs = await sql`
        SELECT
          id,
          status,
          filter_json,
          model_provider,
          model_name,
          prompt_version,
          started_at,
          finished_at,
          created_at
        FROM evaluation_jobs
        ORDER BY created_at DESC
        LIMIT ${cappedLimit}
      `;
      res.status(200).json({ jobs });
      return;
    }

    const [runs, jobs] = await Promise.all([
      sql`
        SELECT
          id,
          run_type,
          target_channel_id,
          target_video_id,
          status,
          fetched_count,
          inserted_count,
          updated_count,
          error_message,
          started_at,
          finished_at,
          created_at
        FROM comment_ingest_runs
        ORDER BY created_at DESC
        LIMIT ${cappedLimit}
      `,
      sql`
        SELECT
          id,
          status,
          filter_json,
          model_provider,
          model_name,
          prompt_version,
          started_at,
          finished_at,
          created_at
        FROM evaluation_jobs
        ORDER BY created_at DESC
        LIMIT ${cappedLimit}
      `
    ]);

    res.status(200).json({ runs, jobs });
  } catch (error) {
    res.status(500).json({
      error: "internal_error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

