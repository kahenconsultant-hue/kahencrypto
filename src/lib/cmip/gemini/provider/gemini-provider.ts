import type { CmipGeminiClient } from "../client";
import type { CmipGeminiProvider, CmipGeminiProviderExecutionRequest, CmipGeminiProviderExecutionResponse, CmipGeminiToolSource } from "../types";
import { normalizeCmipGeminiUsage } from "../usage";

export class GeminiInteractionsProvider implements CmipGeminiProvider {
  readonly providerName = "gemini_interactions_api";

  constructor(private readonly client: CmipGeminiClient) {}

  async execute(request: CmipGeminiProviderExecutionRequest): Promise<CmipGeminiProviderExecutionResponse> {
    const interaction = await this.client.interactions.create(request.body, {
      signal: request.abortSignal,
      timeout_ms: request.timeoutMs,
    });
    return mapGeminiInteraction(interaction);
  }
}

export function mapGeminiInteraction(interaction: unknown): CmipGeminiProviderExecutionResponse {
  const record = isRecord(interaction) ? interaction : {};
  return {
    responseId: typeof record.id === "string" ? record.id : null,
    status: providerStatus(record.status),
    model: typeof record.model === "string" ? record.model : null,
    serviceTier: typeof record.service_tier === "string" ? record.service_tier : null,
    outputText: typeof record.output_text === "string" ? record.output_text : extractOutputText(record),
    refusal: extractRefusal(record),
    incompleteDetails: extractIncomplete(record),
    error: extractError(record),
    usage: normalizeCmipGeminiUsage(record.usage),
    toolCalls: countToolCalls(record.steps),
    toolSources: extractToolSources(record.steps),
  };
}

function providerStatus(value: unknown): CmipGeminiProviderExecutionResponse["status"] {
  return value === "completed" ||
    value === "incomplete" ||
    value === "failed" ||
    value === "cancelled" ||
    value === "in_progress" ||
    value === "queued" ||
    value === "blocked" ||
    value === "refused"
    ? value
    : "failed";
}

function extractOutputText(record: Record<string, unknown>): string | null {
  const steps = Array.isArray(record.steps) ? record.steps : [];
  const text = collectText(steps).join("");
  return text || null;
}

function collectText(value: unknown): string[] {
  if (typeof value === "string") return [];
  if (Array.isArray(value)) return value.flatMap((item) => collectText(item));
  if (!isRecord(value)) return [];
  const texts: string[] = [];
  if (typeof value.text === "string" && (value.type === "text" || value.type === "output_text")) texts.push(value.text);
  for (const child of Object.values(value)) texts.push(...collectText(child));
  return texts;
}

function extractRefusal(record: Record<string, unknown>): CmipGeminiProviderExecutionResponse["refusal"] {
  if (record.status === "blocked" || record.status === "refused") {
    return { message: "Gemini provider blocked or refused the request.", category: typeof record.status === "string" ? record.status : null };
  }
  const error = extractError(record);
  if (error && /refus|block|safety|policy/i.test(`${error.code} ${error.message}`)) {
    return { message: "Gemini provider returned a refusal or safety block.", category: error.code };
  }
  return null;
}

function extractIncomplete(record: Record<string, unknown>): string | null {
  if (typeof record.incomplete_details === "string") return record.incomplete_details;
  if (isRecord(record.incomplete_details)) return JSON.stringify(record.incomplete_details);
  if (record.status === "incomplete") return "Gemini interaction incomplete.";
  return null;
}

function extractError(record: Record<string, unknown>): CmipGeminiProviderExecutionResponse["error"] {
  const error = record.error;
  if (!isRecord(error)) return null;
  return {
    code: typeof error.code === "string" ? error.code : "gemini_response_error",
    message: typeof error.message === "string" ? redact(error.message) : "Gemini response reported an error.",
    status: typeof error.status === "number" ? error.status : null,
  };
}

function countToolCalls(steps: unknown): number {
  if (!Array.isArray(steps)) return 0;
  return steps.filter((step) => isRecord(step) && typeof step.type === "string" && step.type.includes("google_search")).length;
}

function extractToolSources(steps: unknown): readonly CmipGeminiToolSource[] {
  if (!Array.isArray(steps)) return [];
  const sources: CmipGeminiToolSource[] = [];
  for (const step of steps) {
    collectSources(step, sources);
  }
  return sources;
}

function collectSources(value: unknown, sources: CmipGeminiToolSource[]): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectSources(item, sources));
    return;
  }
  if (!isRecord(value)) return;
  if (typeof value.url === "string") {
    sources.push({ url: value.url, title: typeof value.title === "string" ? value.title : null });
  }
  for (const child of Object.values(value)) collectSources(child, sources);
}

function redact(value: string): string {
  return value.replace(/AIza[0-9A-Za-z_-]{20,}/g, "[REDACTED:GEMINI_API_KEY]");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
