import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../../_lib/db";
import { methodNotAllowed, parsePositiveInt } from "../../_lib/http";

type EvaluationRow = {
  id: number;
  commentId: number;
  evaluationJobId: number;
  modelProvider: string;
  modelName: string;
  promptVersion: string;
  labelJson: unknown;
  scoreJson: unknown;
  rationale: string | null;
  evaluatedAt: string;
  jobStatus: string | null;
  jobCreatedAt: string | null;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (methodNotAllowed(req, res, ["GET"])) {
    return;
  }

  try {
    const commentId = parsePositiveInt(
      typeof req.query.id === "string" ? req.query.id : undefined
    );

    if (!commentId) {
      res.status(400).json({
        error: "invalid_request",
        message: "id must be a positive integer"
      });
      return;
    }

    const limit =
      parsePositiveInt(
        typeof req.query.limit === "string" ? req.query.limit : undefined
      ) ?? 50;
    const cappedLimit = Math.min(limit, 200);

    const evaluations = (await sql(
      `
      SELECT
        ce.id,
        ce.comment_id AS "commentId",
        ce.evaluation_job_id AS "evaluationJobId",
        ce.model_provider AS "modelProvider",
        ce.model_name AS "modelName",
        ce.prompt_version AS "promptVersion",
        ce.label_json AS "labelJson",
        ce.score_json AS "scoreJson",
        ce.rationale,
        ce.evaluated_at AS "evaluatedAt",
        ej.status AS "jobStatus",
        ej.created_at AS "jobCreatedAt"
      FROM comment_evaluations ce
      LEFT JOIN evaluation_jobs ej ON ej.id = ce.evaluation_job_id
      WHERE ce.comment_id = $1
      ORDER BY ce.evaluated_at DESC
      LIMIT $2
      `,
      [commentId, cappedLimit]
    )) as EvaluationRow[];

    res.status(200).json({ evaluations });
  } catch (error) {
    res.status(500).json({
      error: "internal_error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
