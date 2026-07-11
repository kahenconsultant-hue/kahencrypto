import { GoogleGenAI } from "@google/genai";
import type { CmipGeminiEnvConfig } from "./types";

export interface CmipGeminiClient {
  readonly interactions: {
    create(body: unknown, options?: { readonly signal?: AbortSignal; readonly timeout_ms?: number }): Promise<unknown>;
  };
}

let cachedClient: CmipGeminiClient | null = null;
let cachedKeyFingerprint: string | null = null;

export function createCmipGeminiClient(config: CmipGeminiEnvConfig): CmipGeminiClient {
  const fingerprint = `${config.apiKey.length}:${config.apiKey.slice(-4)}`;
  if (cachedClient && cachedKeyFingerprint === fingerprint) return cachedClient;
  cachedClient = new GoogleGenAI({ apiKey: config.apiKey }) as unknown as CmipGeminiClient;
  cachedKeyFingerprint = fingerprint;
  return cachedClient;
}
