import sampleOutput from "../../contracts/sample-output.json";
import { stableJsonClone, stableStringify } from "../../model-package";
import type { CmipReportEnvelope } from "../../contracts";
import type { CmipOpenAiProvider, CmipOpenAiProviderExecutionRequest, CmipOpenAiProviderExecutionResponse } from "../types";
import responseIncomplete from "../fixtures/response-incomplete.json";
import responseRefusal from "../fixtures/response-refusal.json";
import responseSchemaInvalid from "../fixtures/response-schema-invalid.json";

export type CmipFakeProviderFixture = "valid" | "abstain" | "refusal" | "incomplete" | "schema_invalid" | "network_error" | "rate_limit";
type Mutable<T> = { -readonly [K in keyof T]: T[K] extends readonly (infer U)[] ? Mutable<U>[] : T[K] extends object ? Mutable<T[K]> : T[K] };

export interface CmipFakeProviderOptions {
  readonly fixtures: readonly CmipFakeProviderFixture[];
}

export class FakeCmipOpenAiProvider implements CmipOpenAiProvider {
  readonly providerName = "cmip_fake_openai_provider";
  private callIndex = 0;

  constructor(private readonly options: CmipFakeProviderOptions = { fixtures: ["valid"] }) {}

  async execute(request: CmipOpenAiProviderExecutionRequest): Promise<CmipOpenAiProviderExecutionResponse> {
    const fixture = this.options.fixtures[Math.min(this.callIndex, this.options.fixtures.length - 1)] ?? "valid";
    this.callIndex += 1;

    if (fixture === "network_error") {
      const error = new Error("Fake transport failure");
      Object.assign(error, { name: "APIConnectionError" });
      throw error;
    }
    if (fixture === "rate_limit") {
      const error = new Error("Fake rate limit");
      Object.assign(error, { name: "RateLimitError", status: 429 });
      throw error;
    }

    const base = {
      responseId: `resp_cmip_fake_${fixture}_${request.attemptIndex}`,
      model: request.body.model,
      serviceTier: request.body.service_tier ?? null,
      usage: {
        inputTokens: 1000,
        cachedInputTokens: 0,
        outputTokens: 400,
        reasoningTokens: 40,
        totalTokens: 1400,
      },
      toolCalls: request.body.tools?.length ? 1 : 0,
      toolSources: request.body.tools?.length ? [{ url: "https://example.com/cmip-fake-web-source", title: "Fixture web source" }] : [],
    } as const;

    if (fixture === "refusal") {
      return {
        ...base,
        status: "completed",
        outputText: null,
        refusal: responseRefusal.refusal,
        incompleteDetails: null,
        error: null,
      };
    }
    if (fixture === "incomplete") {
      return {
        ...base,
        status: "incomplete",
        outputText: null,
        refusal: null,
        incompleteDetails: responseIncomplete.incompleteDetails,
        error: null,
      };
    }
    if (fixture === "schema_invalid") {
      return {
        ...base,
        status: "completed",
        outputText: stableStringify(responseSchemaInvalid.output),
        refusal: null,
        incompleteDetails: null,
        error: null,
      };
    }

    const report = fixture === "abstain" ? buildAbstainOutput() : (stableJsonClone(sampleOutput) as unknown as CmipReportEnvelope);
    return {
      ...base,
      status: "completed",
      outputText: stableStringify(report),
      refusal: null,
      incompleteDetails: null,
      error: null,
    };
  }
}

export function buildAbstainOutput(): CmipReportEnvelope {
  const report = stableJsonClone(sampleOutput) as unknown as Mutable<CmipReportEnvelope>;
  report.cmip_report.decision = {
    ...report.cmip_report.decision,
    posture: "abstain",
    score: null,
    plain_language: "مدل به‌دلیل نبود شواهد کافی، موضع جهت‌دار منتشر نمی‌کند.",
    model_action: "abstain",
    abstention: {
      reason_codes: ["insufficient_data"],
      plain_language_reason: "داده‌های حیاتی برای تصمیم جهت‌دار کافی نیستند.",
      blocking_conditions: ["پوشش داده برای تصمیم جهت‌دار کافی نیست."],
      required_evidence_to_resume: ["داده معتبر از منابع اصلی برای بازار و دارایی‌ها"],
      previous_valid_report_policy: "keep_visible_with_stale_warning",
    },
  };
  report.cmip_report.triggers = report.cmip_report.triggers.map((trigger) => ({ ...trigger, new_posture: "abstain" }));
  report.cmip_report.coins = report.cmip_report.coins.map((coin) => ({ ...coin, posture: "abstain", score: null }));
  return report as CmipReportEnvelope;
}
