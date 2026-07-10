export async function runWithTimeout<T>(params: {
  readonly timeoutMs: number;
  readonly run: (signal: AbortSignal) => Promise<T>;
}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs);
  try {
    return await params.run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export function isAbortLikeError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  return record.name === "AbortError" || record.name === "APIConnectionTimeoutError" || record.code === "ETIMEDOUT";
}

