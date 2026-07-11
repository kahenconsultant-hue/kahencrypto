export async function runGeminiWithTimeout<T>(params: {
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
