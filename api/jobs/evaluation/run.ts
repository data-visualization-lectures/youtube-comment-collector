import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../../_lib/db";
import { methodNotAllowed, parseJsonBody } from "../../_lib/http";
import { dispatchWorker } from "../../_lib/worker";

type RunEvaluationBody = {
  filterJson?: Record<string, unknown>;
  modelProvider?: string;
  modelName?: string;
  promptVersion?: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (methodNotAllowed(req, res, ["POST"])) {
    return;
  }

  try {
    const body = parseJsonBody<RunEvaluationBody>(req);
    const modelProvider = body.modelProvider?.trim() || "heuristic";
    const modelName = body.modelName?.trim() || "default";
    const promptVersion = body.promptVersion?.trim() || "v1";
    const filterJson = body.filterJson ?? {};

    const rows = await sql<{
      id: number;
    }[]>`
      INSERT INTO evaluation_jobs (
        status,
        filter_json,
        model_provider,
        model_name,
        prompt_version
      )
      VALUES (
        'queued',
        ${JSON.stringify(filterJson)}::jsonb,
        ${modelProvider},
        ${modelName},
        ${promptVersion}
      )
      RETURNING id
    `;

    const jobId = rows[0]?.id;
    if (!jobId) {
      throw new Error("Failed to create evaluation job");
    }

    const dispatch = await dispatchWorker("/run/evaluation", { jobId });
    if (!dispatch.ok) {
      await sql`
        UPDATE evaluation_jobs
        SET status = 'failed',
            finished_at = NOW()
        WHERE id = ${jobId}
      `;

      res.status(502).json({
        error: "worker_dispatch_failed",
        jobId,
        workerStatus: dispatch.status,
        workerBody: dispatch.body
      });
      return;
    }

    res.status(202).json({
      status: "queued",
      jobId,
      workerStatus: dispatch.status
    });
  } catch (error) {
    res.status(500).json({
      error: "internal_error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

