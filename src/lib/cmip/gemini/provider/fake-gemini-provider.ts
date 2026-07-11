import sampleOutput from "../../contracts/sample-output.json";
import { stableJsonClone, stableStringify } from "../../model-package";
import type { CmipReportEnvelope } from "../../contracts";
import { buildAbstainOutput } from "../../openai/provider/fake-provider";
import type { CmipGeminiProvider, CmipGeminiProviderExecutionRequest, CmipGeminiProviderExecutionResponse } from "../types";
import interactionIncomplete from "../fixtures/interaction-incomplete.json";
import interactionBlocked from "../fixtures/interaction-blocked.json";
import interactionSchemaInvalid from "../fixtures/interaction-schema-invalid.json";

export type CmipFakeGeminiFixture = "valid" | "abstain" | "blocked" | "incomplete" | "schema_invalid" | "invalid_json" | "missing_output" | "failed" | "cancelled" | "queued" | "in_progress" | "network_error" | "rate_limit";

export interface CmipFakeGeminiProviderOptions {
  readonly fixtures: readonly CmipFakeGeminiFixture[];
}

export class FakeCmipGeminiProvider implements CmipGeminiProvider {
  readonly providerName = "cmip_fake_gemini_provider";
  private callIndex = 0;

  constructor(private readonly options: CmipFakeGeminiProviderOptions = { fixtures: ["valid"] }) {}

  async execute(request: CmipGeminiProviderExecutionRequest): Promise<CmipGeminiProviderExecutionResponse> {
    const fixture = this.options.fixtures[Math.min(this.callIndex, this.options.fixtures.length - 1)] ?? "valid";
    this.callIndex += 1;
    if (fixture === "network_error") {
      const error = new Error("Fake Gemini transport failure");
      Object.assign(error, { name: "GeminiTransportError" });
      throw error;
    }
    if (fixture === "rate_limit") {
      const error = new Error("Fake Gemini rate limit");
      Object.assign(error, { status: 429 });
      throw error;
    }

    const base = {
      responseId: `gemini_fake_${fixture}_${request.attemptIndex}`,
      model: request.body.model,
      serviceTier: null,
      usage: {
        inputTokens: 1000,
        cachedInputTokens: null,
        outputTokens: 420,
        reasoningTokens: 44,
        totalTokens: 1420,
      },
      toolCalls: request.body.tools?.length ? 1 : 0,
      toolSources: request.body.tools?.length ? [{ url: "https://example.com/cmip-gemini-source", title: "Fixture Gemini source" }] : [],
      refusal: null,
      incompleteDetails: null,
      error: null,
    } as const;

    if (fixture === "blocked") {
      return { ...base, status: "blocked", outputText: null, refusal: interactionBlocked.refusal };
    }
    if (fixture === "incomplete") {
      return { ...base, status: "incomplete", outputText: null, incompleteDetails: interactionIncomplete.incompleteDetails };
    }
    if (fixture === "failed" || fixture === "cancelled" || fixture === "queued" || fixture === "in_progress") {
      return { ...base, status: fixture, outputText: null, error: { code: `fake_${fixture}`, message: `Fake Gemini ${fixture}.`, status: null } };
    }
    if (fixture === "invalid_json") {
      return { ...base, status: "completed", outputText: "{not-json" };
    }
    if (fixture === "missing_output") {
      return { ...base, status: "completed", outputText: null };
    }
    if (fixture === "schema_invalid") {
      return { ...base, status: "completed", outputText: stableStringify(interactionSchemaInvalid.output) };
    }

    const report = fixture === "abstain" ? buildAbstainOutput() : (stableJsonClone(sampleOutput) as unknown as CmipReportEnvelope);
    return { ...base, status: "completed", outputText: stableStringify(report) };
  }
}
