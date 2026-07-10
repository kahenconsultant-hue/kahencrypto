import type { CmipRuntimeDecisionMemory } from "../../runtime-input";
import { cmipNormalizationIssue, type CmipNormalizationWarning } from "../errors";
import { normalizationOk, type CmipNormalizationResult } from "../result";
import { normalizeTimestamp } from "../timestamp-normalizer";
import type { CmipRawDecisionMemoryPayload } from "../types";

export function normalizeDecisionMemoryDomain(raw: CmipRawDecisionMemoryPayload | undefined, dataCutoff: string): CmipNormalizationResult<CmipRuntimeDecisionMemory> {
  const warnings: CmipNormalizationWarning[] = [];
  if (!raw) {
    warnings.push(cmipNormalizationIssue({ code: "DOMAIN_PARTIAL", path: "$.domains.decision_memory", domain: "decision_memory", message: "Decision memory unavailable.", severity: "warning" }));
    return normalizationOk(unavailableMemory(), warnings);
  }
  const previousPublished = raw.previous_report
    ? normalizeTimestamp(raw.previous_report.published_at, { path: "$.domains.decision_memory.previous_report.published_at", domain: "decision_memory", referenceTimestamp: dataCutoff, futureToleranceSeconds: 300 })
    : null;
  if (previousPublished && !previousPublished.ok) warnings.push(...previousPublished.errors.map((issue) => ({ ...issue, severity: "warning" as const })));
  return normalizationOk(
    {
      status: raw.status ?? "unavailable",
      previous_report:
        raw.previous_report && previousPublished?.ok
          ? {
              report_id: raw.previous_report.report_id,
              published_at: previousPublished.data,
              posture: raw.previous_report.posture,
            }
          : null,
      previous_engine_scores: [],
      previous_coin_postures: [],
      registered_decisions: [],
      weekly_evaluation: {
        accuracy: null,
        sample_size: null,
        status: raw.status === "available" ? "not_calculated_task_003" : "unavailable",
      },
    },
    warnings,
  );
}

function unavailableMemory(): CmipRuntimeDecisionMemory {
  return {
    status: "unavailable",
    previous_report: null,
    previous_engine_scores: [],
    previous_coin_postures: [],
    registered_decisions: [],
    weekly_evaluation: { accuracy: null, sample_size: null, status: "unavailable" },
  };
}
