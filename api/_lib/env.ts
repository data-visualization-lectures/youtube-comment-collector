export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

export function optionalEnv(key: string, fallback = ""): string {
  const value = process.env[key];
  return value ?? fallback;
}

