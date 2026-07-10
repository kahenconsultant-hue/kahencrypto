import type { Responses } from "openai/resources/responses/responses";
import type { CmipOpenAiProvider, CmipOpenAiProviderExecutionRequest, CmipOpenAiProviderExecutionResponse, CmipOpenAiToolSource } from "../types";
import { normalizeCmipOpenAiUsage } from "../usage";

export class OpenAiResponsesProvider implements CmipOpenAiProvider {
  readonly providerName = "openai_responses_api";

  constructor(private readonly client: { responses: { create: (body: Responses.ResponseCreateParamsNonStreaming, options?: { signal?: AbortSignal }) => Promise<Responses.Response> } }) {}

  async execute(request: CmipOpenAiProviderExecutionRequest): Promise<CmipOpenAiProviderExecutionResponse> {
    const response = await this.client.responses.create(request.body as unknown as Responses.ResponseCreateParamsNonStreaming, {
      signal: request.abortSignal,
    });
    return mapOpenAiResponse(response);
  }
}

export function mapOpenAiResponse(response: Responses.Response): CmipOpenAiProviderExecutionResponse {
  const record = response as unknown as Record<string, unknown>;
  return {
    responseId: typeof record.id === "string" ? record.id : null,
    status: providerStatus(record.status),
    model: typeof record.model === "string" ? record.model : null,
    serviceTier: typeof record.service_tier === "string" ? record.service_tier : null,
    outputText: typeof record.output_text === "string" ? record.output_text : extractOutputText(record.output),
    refusal: extractRefusal(record.output),
    incompleteDetails: extractIncomplete(record.incomplete_details),
    error: extractResponseError(record.error),
    usage: normalizeCmipOpenAiUsage(record.usage),
    toolCalls: countToolCalls(record.output),
    toolSources: extractToolSources(record.output),
  };
}

function providerStatus(value: unknown): CmipOpenAiProviderExecutionResponse["status"] {
  return value === "completed" || value === "incomplete" || value === "failed" || value === "cancelled" || value === "in_progress" || value === "queued"
    ? value
    : "failed";
}

function extractOutputText(output: unknown): string | null {
  const parts = collectContentParts(output);
  const text = parts
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
  return text || null;
}

function extractRefusal(output: unknown): CmipOpenAiProviderExecutionResponse["refusal"] {
  const part = collectContentParts(output).find((content) => content.type === "refusal" && typeof content.refusal === "string");
  return part ? { message: String(part.refusal), category: typeof part.category === "string" ? part.category : null } : null;
}

function collectContentParts(output: unknown): readonly Record<string, unknown>[] {
  if (!Array.isArray(output)) return [];
  const parts: Record<string, unknown>[] = [];
  for (const item of output) {
    if (!isRecord(item)) continue;
    const content = item.content;
    if (Array.isArray(content)) {
      for (const part of content) {
        if (isRecord(part)) parts.push(part);
      }
    }
  }
  return parts;
}

function extractIncomplete(value: unknown): string | null {
  if (!isRecord(value)) return null;
  if (typeof value.reason === "string") return value.reason;
  return JSON.stringify(value);
}

function extractResponseError(value: unknown): CmipOpenAiProviderExecutionResponse["error"] {
  if (!isRecord(value)) return null;
  return {
    code: typeof value.code === "string" ? value.code : "openai_response_error",
    message: typeof value.message === "string" ? value.message : "OpenAI response reported an error.",
    status: typeof value.status === "number" ? value.status : null,
  };
}

function countToolCalls(output: unknown): number {
  if (!Array.isArray(output)) return 0;
  return output.filter((item) => isRecord(item) && typeof item.type === "string" && item.type.includes("_call")).length;
}

function extractToolSources(output: unknown): readonly CmipOpenAiToolSource[] {
  if (!Array.isArray(output)) return [];
  const sources: CmipOpenAiToolSource[] = [];
  for (const item of output) {
    if (!isRecord(item)) continue;
    const action = item.action;
    if (isRecord(action) && Array.isArray(action.sources)) {
      for (const source of action.sources) {
        if (isRecord(source) && typeof source.url === "string") {
          sources.push({ url: source.url, title: typeof source.title === "string" ? source.title : null });
        }
      }
    }
  }
  return sources;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
