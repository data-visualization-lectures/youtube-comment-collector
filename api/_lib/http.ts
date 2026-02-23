import type { VercelRequest, VercelResponse } from "@vercel/node";

export function methodNotAllowed(
  req: VercelRequest,
  res: VercelResponse,
  allowed: string[]
): boolean {
  const method = req.method ?? "";
  if (!allowed.includes(method)) {
    res.status(405).json({
      error: "method_not_allowed",
      message: `Allowed methods: ${allowed.join(", ")}`
    });
    return true;
  }
  return false;
}

export function parseJsonBody<T>(req: VercelRequest): T {
  if (!req.body) {
    return {} as T;
  }
  if (typeof req.body === "string") {
    return JSON.parse(req.body) as T;
  }
  return req.body as T;
}

export function parsePositiveInt(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

