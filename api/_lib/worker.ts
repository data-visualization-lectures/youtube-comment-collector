import { optionalEnv, requireEnv } from "./env";

type WorkerDispatchResult = {
  ok: boolean;
  status: number;
  body: unknown;
};

export async function dispatchWorker(
  path: string,
  payload: Record<string, unknown>
): Promise<WorkerDispatchResult> {
  const base = requireEnv("WORKER_BASE_URL").replace(/\/+$/, "");
  const token = optionalEnv("WORKER_SHARED_SECRET");
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(payload)
  });

  let body: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    body
  };
}

