import type { CmipRuntimeHistoricalEvidenceRecord } from "../../runtime-input";
import { cmipNormalizationIssue, type CmipNormalizationError, type CmipNormalizationWarning } from "../errors";
import { normalizationFail, normalizationOk, type CmipNormalizationResult } from "../result";
import type { CmipRawHistoricalEvidenceRecord } from "../types";

export function normalizeHistoricalEvidenceDomain(raw: readonly CmipRawHistoricalEvidenceRecord[] | undefined): CmipNormalizationResult<readonly CmipRuntimeHistoricalEvidenceRecord[]> {
  const errors: CmipNormalizationError[] = [];
  const warnings: CmipNormalizationWarning[] = [];
  if (!raw?.length) {
    warnings.push(cmipNormalizationIssue({ code: "DOMAIN_PARTIAL", path: "$.domains.historical_evidence", domain: "historical_evidence", message: "Historical evidence unavailable.", severity: "warning" }));
    return normalizationOk([], warnings);
  }
  const seen = new Set<string>();
  const records = raw.map((record, index) => {
    const path = `$.domains.historical_evidence[${index}]`;
    const evidenceId = record.evidence_id ?? `evidence-${index}`;
    if (seen.has(evidenceId)) errors.push(cmipNormalizationIssue({ code: "SOURCE_CONFLICT", path: `${path}.evidence_id`, domain: "historical_evidence", message: `Duplicate evidence_id ${evidenceId}.`, severity: "error" }));
    seen.add(evidenceId);
    if (record.status !== "unavailable" && record.results?.some((result) => result.sample_size === null || result.sample_size === undefined) && record.sample_size === null) {
      errors.push(cmipNormalizationIssue({ code: "INVALID_NUMBER", path: `${path}.results`, domain: "historical_evidence", message: "Statistical historical results require sample size.", severity: "error" }));
    }
    if (record.status === "partial" && !record.limitations?.trim()) {
      errors.push(cmipNormalizationIssue({ code: "DOMAIN_PARTIAL", path: `${path}.limitations`, domain: "historical_evidence", message: "Partial historical evidence requires limitations.", severity: "error" }));
    }
    return {
      evidence_id: evidenceId,
      hypothesis: record.hypothesis ?? "unspecified",
      event_definition: record.event_definition ?? "unspecified",
      period_start: record.period_start ?? null,
      period_end: record.period_end ?? null,
      sample_size: record.sample_size ?? null,
      forward_horizons: record.forward_horizons ?? [],
      results: record.status === "unavailable" ? [] : (record.results ?? []).map((result) => ({ horizon: result.horizon, positive_rate: result.positive_rate ?? null, median_return: result.median_return ?? null, mean_return: result.mean_return ?? null, max_drawdown: result.max_drawdown ?? null, sample_size: result.sample_size ?? record.sample_size ?? null, return_unit: result.return_unit ?? null })),
      limitations: record.limitations ?? "Unavailable evidence limitations not supplied.",
      method_version: record.method_version ?? "not-calculated-task-003",
      source_refs: [...(record.source_refs ?? record.sourceRefs ?? [])].sort(),
      status: record.status ?? "unavailable",
    };
  });
  return errors.length ? normalizationFail(errors, warnings) : normalizationOk(records, warnings);
}
