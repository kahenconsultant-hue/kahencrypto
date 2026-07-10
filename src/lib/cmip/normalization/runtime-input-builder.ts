import { CMIP_RUNTIME_INPUT_SPEC_VERSION, type CmipRuntimeInputEnvelope, type CmipRuntimeSource } from "../runtime-input";
import { validateCmipRuntimeInput } from "../runtime-input/validate-input";
import { CMIP_NORMALIZATION_VERSION } from "./constants";
import { cmipNormalizationIssue, type CmipNormalizationError, type CmipNormalizationWarning } from "./errors";
import { assembleDataQuality } from "./quality";
import { normalizationFail, normalizationOk, type CmipNormalizationResult } from "./result";
import { normalizeSources } from "./source-normalizer";
import { normalizeTimestamp } from "./timestamp-normalizer";
import type { CmipNormalizationRequest } from "./types";
import { normalizeAssetsDomain } from "./domains/assets";
import { normalizeBreadthDomain } from "./domains/breadth";
import { normalizeCrossAssetDomain } from "./domains/cross-asset";
import { normalizeDecisionMemoryDomain } from "./domains/decision-memory";
import { normalizeDerivativesDomain } from "./domains/derivatives";
import { normalizeEtfDomain } from "./domains/etf";
import { normalizeHistoricalEvidenceDomain } from "./domains/historical-evidence";
import { normalizeMacroDomain } from "./domains/macro";
import { normalizeMarketDomain } from "./domains/market";
import { normalizeNewsDomain } from "./domains/news";
import { normalizeOptionsDomain } from "./domains/options";
import { normalizeStablecoinsDomain } from "./domains/stablecoins";

export function normalizeCmipRuntimeInput(input: unknown): CmipNormalizationResult<CmipRuntimeInputEnvelope> {
  const request = parseNormalizationRequest(input);
  if (!request.ok) return request;
  return buildCmipRuntimeInput(request.data);
}

export function buildCmipRuntimeInput(request: CmipNormalizationRequest): CmipNormalizationResult<CmipRuntimeInputEnvelope> {
  const warnings: CmipNormalizationWarning[] = [];
  const errors: CmipNormalizationError[] = [];
  const presentDomains = new Set<string>();

  const generatedAt = normalizeTimestamp(request.meta.generatedAt, { path: "$.meta.generatedAt", domain: "meta", futureToleranceSeconds: 300 });
  if (!generatedAt.ok) errors.push(...generatedAt.errors);
  warnings.push(...generatedAt.warnings);

  const dataCutoff = generatedAt.ok
    ? normalizeTimestamp(request.meta.dataCutoff, { path: "$.meta.dataCutoff", domain: "meta", referenceTimestamp: generatedAt.data, futureToleranceSeconds: 0 })
    : normalizeTimestamp(request.meta.dataCutoff, { path: "$.meta.dataCutoff", domain: "meta" });
  if (!dataCutoff.ok) errors.push(...dataCutoff.errors);
  warnings.push(...dataCutoff.warnings);

  const requestedAt = dataCutoff.ok
    ? normalizeTimestamp(request.runContext.requestedAt, { path: "$.runContext.requestedAt", domain: "run_context", referenceTimestamp: generatedAt.ok ? generatedAt.data : undefined, futureToleranceSeconds: 300 })
    : normalizeTimestamp(request.runContext.requestedAt, { path: "$.runContext.requestedAt", domain: "run_context" });
  if (!requestedAt.ok) errors.push(...requestedAt.errors);
  warnings.push(...requestedAt.warnings);

  if (!generatedAt.ok || !dataCutoff.ok || !requestedAt.ok) return normalizationFail(errors, warnings);

  const sources = normalizeSources(request.sources, dataCutoff.data);
  warnings.push(...sources.warnings);
  if (!sources.ok) return normalizationFail([...errors, ...sources.errors], warnings);
  presentDomains.add("sources");
  const sourceMap = new Map(sources.data.map((source) => [source.source_id, source]));

  const context = { dataCutoff: dataCutoff.data, sourceMap };
  const market = normalizeMarketDomain(request.domains.market, context);
  const assets = normalizeAssetsDomain(request.domains.assets, context);
  const etf = normalizeEtfDomain(request.domains.etf, context);
  const stablecoins = normalizeStablecoinsDomain(request.domains.stablecoins, context);
  const derivatives = normalizeDerivativesDomain(request.domains.derivatives, context);
  const options = normalizeOptionsDomain(request.domains.options, context);
  const macro = normalizeMacroDomain(request.domains.macro, context);
  const crossAsset = normalizeCrossAssetDomain(request.domains.cross_asset, { dataCutoff: dataCutoff.data });
  const breadth = normalizeBreadthDomain(request.domains.breadth, context);
  const news = normalizeNewsDomain(request.domains.news, dataCutoff.data, sourceMap);
  const historicalEvidence = normalizeHistoricalEvidenceDomain(request.domains.historical_evidence);
  const decisionMemory = normalizeDecisionMemoryDomain(request.domains.decision_memory, dataCutoff.data);

  const results = [
    ["market", market],
    ["assets", assets],
    ["etf", etf],
    ["stablecoins", stablecoins],
    ["derivatives", derivatives],
    ["options", options],
    ["macro", macro],
    ["cross_asset", crossAsset],
    ["breadth", breadth],
    ["news", news],
    ["historical_evidence", historicalEvidence],
    ["decision_memory", decisionMemory],
  ] as const;

  for (const [domain, result] of results) {
    warnings.push(...result.warnings);
    if (request.domains[domain] !== undefined || result.ok) presentDomains.add(domain);
    if (!result.ok) errors.push(...result.errors);
  }

  const dataQuality = assembleDataQuality({ sources: sources.data, warnings, errors, presentDomains });
  presentDomains.add("data_quality");

  if (errors.length) {
    return normalizationFail(errors, warnings);
  }

  if (!market.ok || !assets.ok || !etf.ok || !stablecoins.ok || !derivatives.ok || !options.ok || !macro.ok || !crossAsset.ok || !breadth.ok || !news.ok || !historicalEvidence.ok || !decisionMemory.ok) {
    return normalizationFail([
      cmipNormalizationIssue({
        code: "DOMAIN_FAILED",
        path: "$.domains",
        domain: "builder",
        message: "One or more domains failed normalization.",
        severity: "critical",
      }),
    ], warnings);
  }

  const envelope: CmipRuntimeInputEnvelope = {
    cmip_runtime_input: {
      meta: {
        spec_version: CMIP_RUNTIME_INPUT_SPEC_VERSION,
        input_id: request.meta.inputId,
        generated_at: generatedAt.data,
        data_cutoff: dataCutoff.data,
        timezone: request.meta.timezone,
        environment: request.meta.environment,
      },
      run_context: {
        run_type: request.runContext.runType,
        requested_horizons: request.runContext.requestedHorizons,
        previous_report_id: request.previous?.reportId ?? request.runContext.previousReportId ?? null,
        previous_input_id: request.previous?.inputId ?? request.runContext.previousInputId ?? null,
        triggered_by: request.runContext.triggeredBy,
        requested_at: requestedAt.data,
      },
      sources: sources.data,
      market: market.data,
      assets: assets.data,
      etf: etf.data,
      stablecoins: stablecoins.data,
      derivatives: derivatives.data,
      options: options.data,
      macro: macro.data,
      cross_asset: crossAsset.data,
      breadth: breadth.data,
      news: news.data,
      historical_evidence: historicalEvidence.data,
      decision_memory: decisionMemory.data,
      data_quality: dataQuality,
    },
  };

  const validation = validateCmipRuntimeInput(envelope);
  if (!validation.valid) {
    return normalizationFail(
      [
        cmipNormalizationIssue({
          code: "RUNTIME_INPUT_INVALID",
          path: "$.cmip_runtime_input",
          domain: "builder",
          message: validation.errors.map((error) => `${error.path}: ${error.message}`).join("; "),
          severity: "critical",
        }),
      ],
      warnings,
    );
  }

  return normalizationOk(validation.data, warnings);
}

function parseNormalizationRequest(input: unknown): CmipNormalizationResult<CmipNormalizationRequest> {
  if (!isRecord(input) || !isRecord(input.meta) || !isRecord(input.runContext) || !Array.isArray(input.sources) || !isRecord(input.domains)) {
    return normalizationFail([
      cmipNormalizationIssue({
        code: "INVALID_REQUEST",
        path: "$",
        domain: "builder",
        message: "Normalization request must include meta, runContext, sources and domains.",
        severity: "critical",
      }),
    ]);
  }
  return normalizationOk(input as unknown as CmipNormalizationRequest);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function sourceMapFromSources(sources: readonly CmipRuntimeSource[]): ReadonlyMap<string, CmipRuntimeSource> {
  return new Map(sources.map((source) => [source.source_id, source]));
}

export { CMIP_NORMALIZATION_VERSION };
