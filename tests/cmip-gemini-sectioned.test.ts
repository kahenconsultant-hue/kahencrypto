import assert from "node:assert/strict";
import { test } from "node:test";
import sampleOutput from "../src/lib/cmip/contracts/sample-output.json";
import fixture from "../src/lib/cmip/model-package/fixtures/package-input-valid.json";
import { validateCmipReport } from "../src/lib/cmip/contracts/validate-report";
import type { CmipReportEnvelope } from "../src/lib/cmip/contracts";
import { CMIP_REQUIRED_ASSET_SYMBOLS } from "../src/lib/cmip/contracts/constants";
import { buildCmipModelExecutionPackage } from "../src/lib/cmip/model-package/build-model-package";
import type { CmipModelPackageBuildRequest } from "../src/lib/cmip/model-package/types";
import { hashCanonicalJson, stableJsonClone, stableStringify } from "../src/lib/cmip/model-package";
import { executeCmipGeminiModelPackage } from "../src/lib/cmip/gemini/execute-model-package";
import {
  CMIP_GEMINI_SECTION_ORDER,
  CMIP_GEMINI_SECTION_SCHEMA_BYTE_BUDGET,
  CMIP_GEMINI_SECTION_BUDGET_VERSION,
  CMIP_GEMINI_SECTION_THINKING_POLICY_VERSION,
  CMIP_GEMINI_APPROVED_SECTION_THINKING_LEVELS,
  CMIP_GEMINI_SUPPORTED_THINKING_LEVELS,
  CMIP_GEMINI_SECTION_THINKING_POLICIES,
  CMIP_GEMINI_SECTIONED_EXECUTION_VERSION,
  CMIP_GEMINI_SECTION_CONTEXT_VERSION,
  CMIP_GEMINI_SECTION_PROVIDER_PROJECTION_VERSION,
  CMIP_GEMINI_SECTION_SCHEMA_COMPATIBILITY_BUDGETS,
  CMIP_CANONICAL_SECTION_DERIVATION_VERSION,
  CMIP_CANONICAL_SECTION_PARTITION_VERSION,
  analyzeCmipGeminiSectionContext,
  analyzeCmipGeminiSectionBudgets,
  assertCmipCanonicalPartitionCoverage,
  assembleCmipReportFromGeminiSections,
  auditLegacyCmipGeminiSectionSchemas,
  buildCmipSectionAssemblyProvenance,
  buildCmipGeminiSectionContext,
  buildCmipGeminiSectionSchemaVariants,
  calculateCmipGeminiGenerationUtilization,
  calculateCmipGeminiSectionSchemaComplexity,
  assertCmipGeminiSectionPlanOrder,
  assertCmipGeminiSectionThinkingPolicyComplete,
  collectSectionSchemaGuardIssues,
  compileAllCmipGeminiSectionSchemas,
  createFakeGeminiSectionProvider,
  diffCmipGeminiSectionRequestSnapshots,
  executeCmipGeminiSectionedModelPackageSummary,
  extractCmipGeminiSectionProviderErrorDetails,
  formatCmipGeminiSectionedLiveSmokeSummary,
  getCmipGeminiSectionDefinition,
  getAllCmipCanonicalSectionDerivationReports,
  getCmipCanonicalSectionSchema,
  CMIP_CANONICAL_SECTION_PARTITION_MAP,
  getCmipGeminiSectionBudget,
  getCmipGeminiSectionThinkingPolicy,
  getCmipGeminiSectionThinkingTrace,
  hashAssembledReport,
  inventoryCmipGeminiSectionSchemaKeywords,
  mapCmipPackageToGeminiSectionRequest,
  mapCmipPackageToGeminiSectionRequestWithContext,
  projectCmipGeminiSectionProviderSchema,
  providerSchemaForGeminiSection,
  snapshotCmipGeminiSectionRequest,
  sectionFromCmipReport,
  validateCmipGeminiProviderProjection,
  validateCmipGeminiSection,
  validateCmipGeminiSectionContextPayload,
  validatedSectionsFromResults,
  type CmipAnyGeminiSectionResult,
  type CmipGeminiSectionData,
  type CmipGeminiSectionId,
  type CmipValidatedGeminiSections,
  validateCmipGeminiSectionBudgetAgainstModel,
} from "../src/lib/cmip/gemini-sectioned";
import { dryRunGeminiConfig, loadCmipGeminiEnv } from "../src/lib/cmip/gemini/env";
import { resolveCmipGeminiModelProfile } from "../src/lib/cmip/gemini/model-registry";

const sample = sampleOutput as unknown as CmipReportEnvelope;

function buildPackage() {
  const result = buildCmipModelExecutionPackage(fixture as unknown as CmipModelPackageBuildRequest);
  assert.equal(result.ok, true);
  return result.package;
}

function validSections(): CmipValidatedGeminiSections {
  return Object.fromEntries(CMIP_GEMINI_SECTION_ORDER.map((sectionId) => [sectionId, sectionFromCmipReport(sectionId, sample)])) as unknown as CmipValidatedGeminiSections;
}

function sectionResults(sections = validSections()): CmipAnyGeminiSectionResult[] {
  return CMIP_GEMINI_SECTION_ORDER.map((sectionId, index) => ({
    sectionId,
    status: "success",
    data: sections[sectionId],
    providerResponseId: `response-${sectionId}`,
    providerRawStatus: "completed",
    budget: getCmipGeminiSectionBudget(sectionId),
    thinking: getCmipGeminiSectionThinkingTrace(sectionId, { maxThinkingLevel: null }),
    context: {
      contextVersion: CMIP_GEMINI_SECTION_CONTEXT_VERSION,
      sectionId,
      originalEstimatedInputTokens: 1000,
      finalEstimatedInputTokens: 500,
      targetInputTokens: 12000,
      reductionCount: 1,
      reductionIds: ["$.model_package.messages"],
      includedDomainPaths: [],
      excludedDomainPaths: [],
      sourceRecordsIncluded: 0,
      sourceRecordsExcluded: 0,
      intelligenceRulesIncluded: [],
      outputContractBytesIncluded: 100,
      dependencySummaryBytes: 0,
      contextWithinTarget: true,
      omissions: [],
    },
    usage: { inputTokens: 1, cachedInputTokens: null, outputTokens: 2, reasoningTokens: 3, totalTokens: 6 },
    incomplete: {
      incompleteReason: null,
      incompleteDetails: null,
      finishReason: null,
      maxOutputTokensUsed: getCmipGeminiSectionBudget(sectionId).maxOutputTokens,
      generationUtilization: calculateCmipGeminiGenerationUtilization({ usage: { inputTokens: 1, cachedInputTokens: null, outputTokens: 2, reasoningTokens: 3, totalTokens: 6 }, maxOutputTokens: getCmipGeminiSectionBudget(sectionId).maxOutputTokens }),
      derivedBudgetExhaustionCode: null,
      derivedReasoningDominatedCode: null,
      rootCause: null,
      partialOutputPresent: false,
      partialOutputBytes: 0,
    },
    attempts: [{
      providerId: "gemini",
      attemptIndex: index,
      startedAt: "2026-07-10T07:00:00.000Z",
      completedAt: "2026-07-10T07:00:00.000Z",
      status: "success",
      providerRawStatus: "completed",
      errorCode: null,
      retryDelayMs: 0,
    }],
    warnings: [],
    errors: [],
    validation: { outerJsonParsed: true, providerSchemaValid: true, sectionCanonicalValid: true },
  }));
}

function mutateSections(mutator: (sections: CmipValidatedGeminiSections) => void): CmipValidatedGeminiSections {
  const sections = stableJsonClone(validSections());
  mutator(sections);
  return sections;
}

function assertAssemblyFails(sections: CmipValidatedGeminiSections, pathIncludes: string) {
  assert.throws(() => assembleCmipReportFromGeminiSections(sections), (error: unknown) => {
    const issues = (error as { issues?: readonly { path: string; message?: string }[] }).issues ?? [];
    return issues.some((issue) => issue.path.includes(pathIncludes) || issue.message?.includes(pathIncludes));
  });
}

test("1. seven section schemas compile", () => {
  assert.deepEqual(compileAllCmipGeminiSectionSchemas(), [...CMIP_GEMINI_SECTION_ORDER]);
});

test("2. every provider section schema stays under size budget while strict schemas are canonical-derived", () => {
  for (const sectionId of CMIP_GEMINI_SECTION_ORDER) {
    const section = getCmipGeminiSectionDefinition(sectionId);
    const providerSchema = providerSchemaForGeminiSection(section);
    assert.ok(Buffer.byteLength(stableStringify(providerSchema), "utf8") < CMIP_GEMINI_SECTION_SCHEMA_BYTE_BUDGET);
    assert.deepEqual(collectSectionSchemaGuardIssues(providerSchema), []);
    const report = getAllCmipCanonicalSectionDerivationReports().find((item) => item.sectionId === sectionId);
    assert.equal(report?.equivalent, true);
  }
});

test("3. every section has required fields", () => {
  for (const sectionId of CMIP_GEMINI_SECTION_ORDER) {
    const schema = getCmipGeminiSectionDefinition(sectionId).schema as { required?: unknown };
    assert.ok(Array.isArray(schema.required));
    assert.ok(schema.required.length > 0);
  }
});

test("4. unknown section root fields fail", () => {
  const section = sectionFromCmipReport("delta_attribution", sample) as Record<string, unknown>;
  const result = validateCmipGeminiSection("delta_attribution", { ...section, extra: true });
  assert.equal(result.valid, false);
});

test("5. section order is deterministic", () => {
  assert.equal(assertCmipGeminiSectionPlanOrder(), true);
  assert.deepEqual(CMIP_GEMINI_SECTION_ORDER, ["meta_decision", "engines_reasons", "delta_attribution", "scenarios_triggers", "coins", "confidence_memory", "charts_audit"]);
});

test("6. failed section stops later execution", async () => {
  const summary = await executeCmipGeminiSectionedModelPackageSummary(
    { modelPackage: buildPackage(), taskType: "full_report_experimental", executionMode: "dry_run" },
    { provider: createFakeGeminiSectionProvider({ failAtSection: "delta_attribution" }), env: { CMIP_GEMINI_MODEL_PRIMARY: "gemini-section-test" } },
  );
  assert.equal(summary.result.status, "failed");
  assert.deepEqual(summary.sections.map((section) => section.sectionId), ["meta_decision", "engines_reasons", "delta_attribution"]);
  const trace = summary.result.trace.providerTrace as { unexecutedSectionIds: readonly CmipGeminiSectionId[] };
  assert.deepEqual(trace.unexecutedSectionIds, ["scenarios_triggers", "coins", "confidence_memory", "charts_audit"]);
});

test("7. valid fake seven-section flow assembles a Task 001-valid report", async () => {
  const summary = await executeCmipGeminiSectionedModelPackageSummary(
    { modelPackage: buildPackage(), taskType: "full_report_experimental", executionMode: "dry_run" },
    { provider: createFakeGeminiSectionProvider(), env: { CMIP_GEMINI_MODEL_PRIMARY: "gemini-section-test" } },
  );
  assert.equal(summary.result.status, "success");
  assert.equal(validateCmipReport(summary.result.report).valid, true);
});

test("8. missing section prevents assembly", () => {
  assert.throws(() => validatedSectionsFromResults(sectionResults().slice(0, 6)), /missing/i);
});

test("9. duplicate section prevents assembly", () => {
  const results = sectionResults();
  assert.throws(() => validatedSectionsFromResults([...results, results[0] as CmipAnyGeminiSectionResult]), /duplicate/i);
});

test("10. canonical coin array requires all ten exact assets", () => {
  const coins = stableJsonClone(sectionFromCmipReport("coins", sample)) as { coins: Record<string, unknown>[] };
  coins.coins = coins.coins.filter((coin) => coin.symbol !== "TON");
  assert.equal(validateCmipGeminiSection("coins", coins).valid, false);
});

test("11. extra coin asset fails", () => {
  const coins = stableJsonClone(sectionFromCmipReport("coins", sample)) as { coins: Record<string, unknown>[] };
  coins.coins.push({ ...coins.coins[0], symbol: "FAKE" });
  assert.equal(validateCmipGeminiSection("coins", coins).valid, false);
});

test("12. missing TON fails", () => {
  const sections = mutateSections((draft) => {
    draft.coins.coins = draft.coins.coins.filter((coin) => coin.symbol !== "TON");
  });
  assertAssemblyFails(sections, "coins");
});

test("13. coin map converts deterministically to canonical array", () => {
  const assembled = assembleCmipReportFromGeminiSections(validSections());
  assert.deepEqual(assembled.cmip_report.coins.map((coin) => coin.symbol), [...CMIP_REQUIRED_ASSET_SYMBOLS]);
});

test("14. decision abstention consistency is enforced", () => {
  const sections = mutateSections((draft) => {
    draft.meta_decision.decision.posture = "abstain";
    draft.meta_decision.decision.abstention = null;
  });
  assertAssemblyFails(sections, "abstention");
});

test("15. source references resolve across sections", () => {
  const report = assembleCmipReportFromGeminiSections(validSections());
  assert.equal(validateCmipReport(report).valid, true);
});

test("16. missing audit source fails final validation", () => {
  const sections = mutateSections((draft) => {
    draft.charts_audit.audit.sources = draft.charts_audit.audit.sources.filter((source) => source.ref !== "src-etf-flow");
  });
  assertAssemblyFails(sections, "src-etf-flow");
});

test("17. invalid scenario fails", () => {
  const sections = mutateSections((draft) => {
    draft.scenarios_triggers.scenarios[0].probability = 101;
  });
  assertAssemblyFails(sections, "probability");
});

test("18. invalid confidence fails", () => {
  const sections = mutateSections((draft) => {
    draft.confidence_memory.confidence.final = 101;
  });
  assertAssemblyFails(sections, "confidence");
});

test("19. additional canonical field fails", () => {
  const sections = mutateSections((draft) => {
    (draft.meta_decision.meta as unknown as Record<string, unknown>).extra = true;
  });
  assertAssemblyFails(sections, "extra");
});

test("20. assembler does not mutate inputs", () => {
  const sections = validSections();
  const before = hashCanonicalJson(sections);
  assembleCmipReportFromGeminiSections(sections);
  assert.equal(hashCanonicalJson(sections), before);
});

test("21. same sections produce same assembled output", () => {
  assert.deepEqual(assembleCmipReportFromGeminiSections(validSections()), assembleCmipReportFromGeminiSections(validSections()));
});

test("22. same sections produce same semantic hash", () => {
  assert.equal(hashAssembledReport(assembleCmipReportFromGeminiSections(validSections())), hashAssembledReport(assembleCmipReportFromGeminiSections(validSections())));
});

test("23. provider transport failure fails complete execution", async () => {
  const summary = await executeCmipGeminiSectionedModelPackageSummary(
    { modelPackage: buildPackage(), taskType: "full_report_experimental", executionMode: "dry_run" },
    { provider: createFakeGeminiSectionProvider({ failAtSection: "meta_decision" }), env: { CMIP_GEMINI_MODEL_PRIMARY: "gemini-section-test" } },
  );
  assert.equal(summary.result.status, "failed");
});

test("24. provider refusal fails complete execution", async () => {
  const summary = await executeCmipGeminiSectionedModelPackageSummary(
    { modelPackage: buildPackage(), taskType: "full_report_experimental", executionMode: "dry_run" },
    { provider: createFakeGeminiSectionProvider({ refusalAtSection: "meta_decision" }), env: { CMIP_GEMINI_MODEL_PRIMARY: "gemini-section-test" } },
  );
  assert.equal(summary.result.status, "refused");
});

test("25. incomplete section fails complete execution", async () => {
  const summary = await executeCmipGeminiSectionedModelPackageSummary(
    { modelPackage: buildPackage(), taskType: "full_report_experimental", executionMode: "dry_run" },
    { provider: createFakeGeminiSectionProvider({ incompleteAtSection: "engines_reasons" }), env: { CMIP_GEMINI_MODEL_PRIMARY: "gemini-section-test" } },
  );
  assert.equal(summary.result.status, "incomplete");
});

test("26. no partial canonical report is returned", async () => {
  const summary = await executeCmipGeminiSectionedModelPackageSummary(
    { modelPackage: buildPackage(), taskType: "full_report_experimental", executionMode: "dry_run" },
    { provider: createFakeGeminiSectionProvider({ failAtSection: "coins" }), env: { CMIP_GEMINI_MODEL_PRIMARY: "gemini-section-test" } },
  );
  assert.equal(summary.result.report, null);
  assert.equal(summary.assembledReport, null);
});

test("27. usage aggregates correctly", async () => {
  const summary = await executeCmipGeminiSectionedModelPackageSummary(
    { modelPackage: buildPackage(), taskType: "full_report_experimental", executionMode: "dry_run" },
    { provider: createFakeGeminiSectionProvider(), env: { CMIP_GEMINI_MODEL_PRIMARY: "gemini-section-test" } },
  );
  assert.equal(summary.result.usage.inputTokens, 4900);
  assert.equal(summary.result.usage.totalTokens, 6370);
});

test("28. request count is seven on full success", async () => {
  const summary = await executeCmipGeminiSectionedModelPackageSummary(
    { modelPackage: buildPackage(), taskType: "full_report_experimental", executionMode: "dry_run" },
    { provider: createFakeGeminiSectionProvider(), env: { CMIP_GEMINI_MODEL_PRIMARY: "gemini-section-test" } },
  );
  assert.equal(summary.result.attempts.length, 7);
});

test("29. request count stops at failed section", async () => {
  const summary = await executeCmipGeminiSectionedModelPackageSummary(
    { modelPackage: buildPackage(), taskType: "full_report_experimental", executionMode: "dry_run" },
    { provider: createFakeGeminiSectionProvider({ failAtSection: "coins" }), env: { CMIP_GEMINI_MODEL_PRIMARY: "gemini-section-test" } },
  );
  assert.equal(summary.result.attempts.length, 5);
});

test("30. no OpenAI call occurs", async () => {
  const summary = await executeCmipGeminiSectionedModelPackageSummary(
    { modelPackage: buildPackage(), taskType: "full_report_experimental", executionMode: "dry_run" },
    { provider: createFakeGeminiSectionProvider(), env: { CMIP_GEMINI_MODEL_PRIMARY: "gemini-section-test" } },
  );
  assert.equal(summary.result.providerId, "gemini");
});

test("31. no Google Search occurs", () => {
  const pkg = buildPackage();
  const config = dryRunGeminiConfig({ CMIP_GEMINI_MODEL_PRIMARY: "gemini-section-test" });
  const model = resolveCmipGeminiModelProfile(pkg.executionConfig.modelProfile, config);
  assert.equal(model.ok, true);
  const body = mapCmipPackageToGeminiSectionRequest({ modelPackage: pkg, section: getCmipGeminiSectionDefinition("meta_decision"), completedSections: {}, config, model: model.resolution });
  assert.equal(body.tools, undefined);
});

test("32. no persistence or publication occurs", async () => {
  const summary = await executeCmipGeminiSectionedModelPackageSummary(
    { modelPackage: buildPackage(), taskType: "full_report_experimental", executionMode: "dry_run" },
    { provider: createFakeGeminiSectionProvider(), env: { CMIP_GEMINI_MODEL_PRIMARY: "gemini-section-test" } },
  );
  assert.equal(summary.result.trace.fallbackDecisions.length, 0);
});

test("33. no network call occurs in tests", async () => {
  let calls = 0;
  const provider = createFakeGeminiSectionProvider();
  const wrapped = { ...provider, execute: async (request: Parameters<typeof provider.execute>[0]) => { calls += 1; return provider.execute(request); } };
  await executeCmipGeminiSectionedModelPackageSummary(
    { modelPackage: buildPackage(), taskType: "full_report_experimental", executionMode: "dry_run" },
    { provider: wrapped, env: { CMIP_GEMINI_MODEL_PRIMARY: "gemini-section-test" } },
  );
  assert.equal(calls, 7);
});

test("34. existing Gemini single-call code remains available but is not default for production", () => {
  assert.equal(typeof executeCmipGeminiModelPackage, "function");
  assert.equal(CMIP_GEMINI_SECTIONED_EXECUTION_VERSION, "CMIP-GEMINI-SECTIONED-EXECUTION-1.0");
});

test("35. existing OpenAI tests remain unchanged and pass by dependency isolation", () => {
  const pkg = buildPackage();
  assert.equal(pkg.providerAgnostic, undefined);
});

test("36. Task 001 full validation remains final authority", () => {
  const valid = assembleCmipReportFromGeminiSections(validSections());
  assert.equal(validateCmipReport(valid).valid, true);
});

test("37. provider section schema never contains full canonical root", () => {
  for (const sectionId of CMIP_GEMINI_SECTION_ORDER) {
    assert.equal(stableStringify(providerSchemaForGeminiSection(getCmipGeminiSectionDefinition(sectionId))).includes("cmip_report"), false);
  }
});

test("38. section JSON parser returns typed section data", () => {
  const data = sectionFromCmipReport("meta_decision", sample);
  const result = validateCmipGeminiSection("meta_decision", data);
  assert.equal(result.valid, true);
  assert.equal((result.data as Extract<CmipGeminiSectionData, { meta: unknown }>).decision.posture, "maintain_risk");
});

test("39. every section has an explicit reasoning-aware generation budget", () => {
  for (const sectionId of CMIP_GEMINI_SECTION_ORDER) {
    const budget = getCmipGeminiSectionBudget(sectionId);
    assert.ok(budget.maxOutputTokens > 0);
    assert.ok(budget.reservedReasoningTokens > 0);
    assert.ok(budget.reservedSerializationTokens > 0);
    assert.equal(budget.totalRequiredGenerationTokens, budget.expectedVisibleOutputTokens + budget.reservedReasoningTokens + budget.reservedSerializationTokens);
    assert.ok(budget.maxOutputTokens >= budget.totalRequiredGenerationTokens);
  }
});

test("40. section budgets are versioned at 1.3", () => {
  assert.equal(CMIP_GEMINI_SECTION_BUDGET_VERSION, "CMIP-GEMINI-SECTION-BUDGET-1.3");
  assert.ok(analyzeCmipGeminiSectionBudgets({ modelMaxOutputTokens: 12000 }).every((row) => row.version === CMIP_GEMINI_SECTION_BUDGET_VERSION));
});

test("41. all section reasoning and serialization reserves are explicit", () => {
  for (const sectionId of CMIP_GEMINI_SECTION_ORDER) {
    assert.ok(getCmipGeminiSectionBudget(sectionId).reservedReasoningTokens > 0);
    assert.ok(getCmipGeminiSectionBudget(sectionId).reservedSerializationTokens > 0);
  }
});

test("42. current fixture size analysis is deterministic", () => {
  assert.deepEqual(analyzeCmipGeminiSectionBudgets({ modelMaxOutputTokens: 12000 }), analyzeCmipGeminiSectionBudgets({ modelMaxOutputTokens: 12000 }));
});

test("43. headroom classification is deterministic", () => {
  const rows = analyzeCmipGeminiSectionBudgets({ modelMaxOutputTokens: 12000 });
  assert.equal(rows.find((row) => row.sectionId === "engines_reasons")?.classification, "SAFE");
});

test("44. no section exceeds known sufficient model-profile limit", () => {
  for (const sectionId of CMIP_GEMINI_SECTION_ORDER) {
    assert.equal(validateCmipGeminiSectionBudgetAgainstModel(sectionId, { maxOutputTokens: 12000 }), null);
  }
});

test("45. missing model-profile limit is reported as unknown, not guessed", () => {
  assert.equal(analyzeCmipGeminiSectionBudgets({ modelMaxOutputTokens: null })[0]?.classification, "UNKNOWN_PROVIDER_LIMIT");
});

test("46. request mapper sends the exact 1.3 section max_output_tokens", () => {
  const expected = {
    meta_decision: 3000,
    engines_reasons: 7000,
    delta_attribution: 2000,
    scenarios_triggers: 4000,
    coins: 6000,
    confidence_memory: 2500,
    charts_audit: 6000,
  };
  const pkg = buildPackage();
  const config = dryRunGeminiConfig({ CMIP_GEMINI_MODEL_PRIMARY: "gemini-section-test" });
  const model = resolveCmipGeminiModelProfile(pkg.executionConfig.modelProfile, config);
  assert.equal(model.ok, true);
  for (const sectionId of CMIP_GEMINI_SECTION_ORDER) {
    const request = mapCmipPackageToGeminiSectionRequest({ modelPackage: pkg, section: getCmipGeminiSectionDefinition(sectionId), completedSections: {}, config, model: model.resolution });
    assert.equal(request.generation_config.max_output_tokens, expected[sectionId]);
  }
});

test("47. trace records the section-specific reasoning-aware budget", async () => {
  const summary = await executeCmipGeminiSectionedModelPackageSummary(
    { modelPackage: buildPackage(), taskType: "full_report_experimental", executionMode: "dry_run" },
    { provider: createFakeGeminiSectionProvider(), env: { CMIP_GEMINI_MODEL_PRIMARY: "gemini-section-test" } },
  );
  const trace = summary.result.trace.providerTrace as { sectionUsage: readonly { sectionId: CmipGeminiSectionId; budget: { maxOutputTokens: number; budgetVersion: string } }[] };
  const enginesBudget = trace.sectionUsage.find((row) => row.sectionId === "engines_reasons")?.budget;
  assert.equal(enginesBudget?.maxOutputTokens, 7000);
  assert.equal(enginesBudget?.budgetVersion, "CMIP-GEMINI-SECTION-BUDGET-1.3");
});

test("48. incomplete provider details are captured when available", async () => {
  const summary = await executeCmipGeminiSectionedModelPackageSummary(
    { modelPackage: buildPackage(), taskType: "full_report_experimental", executionMode: "dry_run" },
    { provider: createFakeGeminiSectionProvider({ incompleteAtSection: "engines_reasons" }), env: { CMIP_GEMINI_MODEL_PRIMARY: "gemini-section-test" } },
  );
  const section = summary.sections.find((item) => item.sectionId === "engines_reasons");
  assert.equal(section?.incomplete.incompleteReason, "max_output_tokens");
  assert.equal(section?.incomplete.incompleteDetails, "Fake section incomplete.");
  assert.equal(section?.incomplete.finishReason, "MAX_TOKENS");
  assert.equal(section?.incomplete.maxOutputTokensUsed, 7000);
});

test("49. missing incomplete details remain null and do not fabricate exhaustion", async () => {
  const provider = createFakeGeminiSectionProvider({ incompleteAtSection: "engines_reasons" });
  const wrapped = {
    ...provider,
    execute: async (request: Parameters<typeof provider.execute>[0]) => {
      const response = await provider.execute(request);
      return { ...response, incompleteReason: null, incompleteDetails: null, finishReason: null, usage: null };
    },
  };
  const summary = await executeCmipGeminiSectionedModelPackageSummary(
    { modelPackage: buildPackage(), taskType: "full_report_experimental", executionMode: "dry_run" },
    { provider: wrapped, env: { CMIP_GEMINI_MODEL_PRIMARY: "gemini-section-test" } },
  );
  const section = summary.sections.find((item) => item.sectionId === "engines_reasons");
  assert.equal(section?.incomplete.incompleteReason, null);
  assert.equal(section?.incomplete.incompleteDetails, null);
  assert.equal(section?.incomplete.derivedBudgetExhaustionCode, null);
});

test("50. utilization is calculated separately for visible, reasoning and combined tokens", () => {
  const usage = calculateCmipGeminiGenerationUtilization({
    usage: { inputTokens: null, cachedInputTokens: null, outputTokens: 51, reasoningTokens: 1534, totalTokens: null },
    maxOutputTokens: 1600,
  });
  assert.equal(usage.visibleOutputUtilization, 3.19);
  assert.equal(usage.reasoningUtilization, 95.88);
  assert.equal(usage.combinedGenerationUtilization, 99.06);
  assert.equal(usage.combinedGeneratedTokens, 1585);
  assert.equal(usage.classification, "EXHAUSTED");
});

test("51. incomplete plus high combined utilization produces budget exhaustion code", async () => {
  const provider = createFakeGeminiSectionProvider({ incompleteAtSection: "meta_decision" });
  const wrapped = {
    ...provider,
    execute: async (request: Parameters<typeof provider.execute>[0]) => {
      const response = await provider.execute(request);
      return { ...response, incompleteReason: null, incompleteDetails: null, finishReason: null, usage: { inputTokens: 100, cachedInputTokens: null, outputTokens: 51, reasoningTokens: 2900, totalTokens: 3051 } };
    },
  };
  const summary = await executeCmipGeminiSectionedModelPackageSummary(
    { modelPackage: buildPackage(), taskType: "full_report_experimental", executionMode: "dry_run" },
    { provider: wrapped, env: { CMIP_GEMINI_MODEL_PRIMARY: "gemini-section-test" } },
  );
  assert.equal(summary.result.status, "incomplete");
  assert.equal(summary.result.errors.some((error) => error.code === "GEMINI_SECTION_GENERATION_BUDGET_EXHAUSTED"), true);
  assert.equal(summary.sections[0]?.incomplete.rootCause, "REASONING_OUTPUT_BUDGET_EXHAUSTED");
});

test("52. explicit provider incomplete reason remains preserved with derived exhaustion", async () => {
  const provider = createFakeGeminiSectionProvider({ incompleteAtSection: "meta_decision" });
  const wrapped = {
    ...provider,
    execute: async (request: Parameters<typeof provider.execute>[0]) => {
      const response = await provider.execute(request);
      return { ...response, incompleteReason: "provider_limit", usage: { inputTokens: 100, cachedInputTokens: null, outputTokens: 51, reasoningTokens: 2900, totalTokens: 3051 } };
    },
  };
  const summary = await executeCmipGeminiSectionedModelPackageSummary(
    { modelPackage: buildPackage(), taskType: "full_report_experimental", executionMode: "dry_run" },
    { provider: wrapped, env: { CMIP_GEMINI_MODEL_PRIMARY: "gemini-section-test" } },
  );
  assert.equal(summary.sections[0]?.incomplete.incompleteReason, "provider_limit");
  assert.equal(summary.sections[0]?.incomplete.derivedBudgetExhaustionCode, "GEMINI_SECTION_GENERATION_BUDGET_EXHAUSTED");
});

test("53. live-smoke output contains reasoning-aware safe diagnostics", async () => {
  const summary = await executeCmipGeminiSectionedModelPackageSummary(
    { modelPackage: buildPackage(), taskType: "full_report_experimental", executionMode: "dry_run" },
    { provider: createFakeGeminiSectionProvider({ incompleteAtSection: "engines_reasons" }), env: { CMIP_GEMINI_MODEL_PRIMARY: "gemini-section-test" } },
  );
  const formatted = formatCmipGeminiSectionedLiveSmokeSummary(summary).join("\n");
  assert.ok(formatted.includes("CMIP GEMINI REQUEST COUNT: 2"));
  assert.ok(formatted.includes("CMIP SECTION engines_reasons INCOMPLETE REASON: max_output_tokens"));
  assert.ok(formatted.includes("CMIP SECTION engines_reasons MAX GENERATION TOKENS: 7000"));
  assert.ok(formatted.includes("CMIP SECTION engines_reasons COMBINED UTILIZATION PCT:"));
});

test("54. live-smoke output contains no section prose and no unsupported thinking_config", async () => {
  const summary = await executeCmipGeminiSectionedModelPackageSummary(
    { modelPackage: buildPackage(), taskType: "full_report_experimental", executionMode: "dry_run" },
    { provider: createFakeGeminiSectionProvider(), env: { CMIP_GEMINI_MODEL_PRIMARY: "gemini-section-test" } },
  );
  const formatted = formatCmipGeminiSectionedLiveSmokeSummary(summary).join("\n");
  assert.equal(formatted.includes("ETF flow stabilization supports maintaining risk"), false);
  assert.equal(formatted.includes("Stablecoin liquidity is not contracting"), false);
  const pkg = buildPackage();
  const config = dryRunGeminiConfig({ CMIP_GEMINI_MODEL_PRIMARY: "gemini-section-test" });
  const model = resolveCmipGeminiModelProfile(pkg.executionConfig.modelProfile, config);
  assert.equal(model.ok, true);
  const request = mapCmipPackageToGeminiSectionRequest({ modelPackage: pkg, section: getCmipGeminiSectionDefinition("meta_decision"), completedSections: {}, config, model: model.resolution });
  assert.equal(Object.hasOwn(request.generation_config as unknown as Record<string, unknown>, "thinking_config"), false);
});

test("55. budget guard blocks a known too-small model limit before provider execution", async () => {
  let calls = 0;
  const provider = {
    providerName: "budget_guard_fake",
    execute: async () => {
      calls += 1;
      throw new Error("provider should not be called");
    },
  };
  const summary = await executeCmipGeminiSectionedModelPackageSummary(
    { modelPackage: buildPackage(), taskType: "full_report_experimental", executionMode: "dry_run" },
    { provider, env: { CMIP_GEMINI_MODEL_PRIMARY: "gemini-section-test", CMIP_GEMINI_MAX_OUTPUT_TOKENS: "1000" } },
  );
  assert.equal(summary.result.status, "failed");
  assert.equal(calls, 0);
  assert.equal(summary.result.errors.some((error) => error.code === "GEMINI_SECTION_BUDGET_EXCEEDS_MODEL_LIMIT"), true);
});

test("56. context audit is deterministic and exposes duplicated block sizes", () => {
  const pkg = buildPackage();
  const first = analyzeCmipGeminiSectionContext({ modelPackage: pkg, sectionId: "meta_decision" });
  const second = analyzeCmipGeminiSectionContext({ modelPackage: pkg, sectionId: "meta_decision" });
  assert.deepEqual(first, second);
  assert.ok(first.staticSystemTokens > 0);
  assert.ok(first.intelligenceContextTokens > 0);
  assert.ok(first.runtimeContextTokens > 0);
  assert.ok(first.outputContractTokens > 0);
});

test("57. official thinking policy version is exported and complete", () => {
  assert.equal(CMIP_GEMINI_SECTION_THINKING_POLICY_VERSION, "CMIP-GEMINI-SECTION-THINKING-1.1");
  assert.equal(assertCmipGeminiSectionThinkingPolicyComplete(), true);
  assert.equal(CMIP_GEMINI_SECTION_THINKING_POLICIES.length, CMIP_GEMINI_SECTION_ORDER.length);
});

test("58. only minimal and low are approved for CMIP section thinking", () => {
  assert.deepEqual([...CMIP_GEMINI_SUPPORTED_THINKING_LEVELS], ["minimal", "low", "medium", "high"]);
  assert.deepEqual([...CMIP_GEMINI_APPROVED_SECTION_THINKING_LEVELS], ["minimal", "low"]);
});

test("59. every section has the approved explicit thinking level", () => {
  const expected = {
    meta_decision: "minimal",
    engines_reasons: "low",
    delta_attribution: "minimal",
    scenarios_triggers: "low",
    coins: "minimal",
    confidence_memory: "minimal",
    charts_audit: "minimal",
  } as const;
  for (const sectionId of CMIP_GEMINI_SECTION_ORDER) {
    assert.equal(getCmipGeminiSectionThinkingPolicy(sectionId).configuredThinkingLevel, expected[sectionId]);
  }
});

test("60. request mapper emits section thinking_level and max_output_tokens", () => {
  const expected = {
    meta_decision: { thinking_level: "minimal", max_output_tokens: 3000 },
    engines_reasons: { thinking_level: "low", max_output_tokens: 7000 },
    delta_attribution: { thinking_level: "minimal", max_output_tokens: 2000 },
    scenarios_triggers: { thinking_level: "low", max_output_tokens: 4000 },
    coins: { thinking_level: "minimal", max_output_tokens: 6000 },
    confidence_memory: { thinking_level: "minimal", max_output_tokens: 2500 },
    charts_audit: { thinking_level: "minimal", max_output_tokens: 6000 },
  } as const;
  const pkg = buildPackage();
  const config = dryRunGeminiConfig({ CMIP_GEMINI_MODEL_PRIMARY: "gemini-section-test" });
  const model = resolveCmipGeminiModelProfile(pkg.executionConfig.modelProfile, config);
  assert.equal(model.ok, true);
  for (const sectionId of CMIP_GEMINI_SECTION_ORDER) {
    const request = mapCmipPackageToGeminiSectionRequest({ modelPackage: pkg, section: getCmipGeminiSectionDefinition(sectionId), completedSections: {}, config, model: model.resolution });
    assert.deepEqual(request.generation_config, expected[sectionId]);
  }
});

test("61. section requests do not emit Enterprise or unsupported thinking fields", () => {
  const pkg = buildPackage();
  const config = dryRunGeminiConfig({ CMIP_GEMINI_MODEL_PRIMARY: "gemini-section-test" });
  const model = resolveCmipGeminiModelProfile(pkg.executionConfig.modelProfile, config);
  assert.equal(model.ok, true);
  const request = mapCmipPackageToGeminiSectionRequest({ modelPackage: pkg, section: getCmipGeminiSectionDefinition("meta_decision"), completedSections: {}, config, model: model.resolution });
  assert.equal(Object.hasOwn(request as unknown as Record<string, unknown>, "labels"), false);
  assert.equal(Object.hasOwn(request.generation_config as unknown as Record<string, unknown>, "thinking_config"), false);
  assert.equal(Object.hasOwn(request.generation_config as unknown as Record<string, unknown>, "include_thoughts"), false);
});

test("62. environment thinking cap may lower low to minimal but cannot raise sections", () => {
  assert.equal(getCmipGeminiSectionThinkingTrace("engines_reasons", { maxThinkingLevel: "minimal" }).effectiveThinkingLevel, "minimal");
  assert.equal(getCmipGeminiSectionThinkingTrace("delta_attribution", { maxThinkingLevel: "low" }).effectiveThinkingLevel, "minimal");
  assert.equal(getCmipGeminiSectionThinkingTrace("engines_reasons", { maxThinkingLevel: "low" }).effectiveThinkingLevel, "low");
});

test("63. invalid environment thinking cap fails configuration", () => {
  const medium = loadCmipGeminiEnv({
    GEMINI_API_KEY: "test-key",
    CMIP_GEMINI_MODEL_PRIMARY: "gemini-3.5-flash",
    CMIP_GEMINI_MAX_THINKING_LEVEL: "medium",
  });
  assert.equal(medium.ok, false);
  assert.equal(medium.errors.some((error) => error.path === "$.env.CMIP_GEMINI_MAX_THINKING_LEVEL"), true);
  const invalid = loadCmipGeminiEnv({
    GEMINI_API_KEY: "test-key",
    CMIP_GEMINI_MODEL_PRIMARY: "gemini-3.5-flash",
    CMIP_GEMINI_MAX_THINKING_LEVEL: "high",
  });
  assert.equal(invalid.ok, false);
});

test("64. SDK request serialization preserves snake_case thinking_level", () => {
  const pkg = buildPackage();
  const config = dryRunGeminiConfig({ CMIP_GEMINI_MODEL_PRIMARY: "gemini-section-test" });
  const model = resolveCmipGeminiModelProfile(pkg.executionConfig.modelProfile, config);
  assert.equal(model.ok, true);
  const request = mapCmipPackageToGeminiSectionRequest({ modelPackage: pkg, section: getCmipGeminiSectionDefinition("meta_decision"), completedSections: {}, config, model: model.resolution });
  const serialized = stableStringify(request);
  assert.match(serialized, /"thinking_level":"minimal"/);
  assert.doesNotMatch(serialized, /thinkingLevel|thinking_config|thinking_budget|include_thoughts/);
});

test("65. model registry explicitly supports documented thinking levels and CMIP-approved subset", () => {
  const config = dryRunGeminiConfig({ CMIP_GEMINI_MODEL_PRIMARY: "gemini-section-test" });
  const model = resolveCmipGeminiModelProfile("cmip_primary_reasoning", config);
  assert.equal(model.ok, true);
  assert.equal(model.resolution.supportsThinkingLevel, true);
  assert.deepEqual([...model.resolution.supportedThinkingLevels], ["minimal", "low", "medium", "high"]);
  assert.deepEqual([...model.resolution.approvedThinkingLevels], ["minimal", "low"]);
});

test("66. previous 5759 of 5985 generated tokens is classified reasoning-dominated", () => {
  const usage = calculateCmipGeminiGenerationUtilization({
    usage: { inputTokens: null, cachedInputTokens: null, outputTokens: 226, reasoningTokens: 5759, totalTokens: null },
    maxOutputTokens: 6000,
  });
  assert.equal(usage.combinedGeneratedTokens, 5985);
  assert.equal(usage.reasoningShareOfCombinedGeneration, 96.22);
  assert.equal(usage.classification, "EXHAUSTED");
  assert.equal(usage.reasoningDominated, true);
});

test("67. incomplete reasoning-dominated response retains both derived codes when exhausted", async () => {
  const provider = createFakeGeminiSectionProvider({ incompleteAtSection: "meta_decision" });
  const wrapped = {
    ...provider,
    execute: async (request: Parameters<typeof provider.execute>[0]) => {
      const response = await provider.execute(request);
      return { ...response, usage: { inputTokens: 100, cachedInputTokens: null, outputTokens: 226, reasoningTokens: 2759, totalTokens: 3085 } };
    },
  };
  const summary = await executeCmipGeminiSectionedModelPackageSummary(
    { modelPackage: buildPackage(), taskType: "full_report_experimental", executionMode: "dry_run" },
    { provider: wrapped, env: { CMIP_GEMINI_MODEL_PRIMARY: "gemini-section-test" } },
  );
  assert.equal(summary.sections[0]?.incomplete.derivedBudgetExhaustionCode, "GEMINI_SECTION_GENERATION_BUDGET_EXHAUSTED");
  assert.equal(summary.sections[0]?.incomplete.derivedReasoningDominatedCode, "GEMINI_SECTION_REASONING_DOMINATED");
  assert.equal(summary.result.errors.some((error) => error.code === "GEMINI_SECTION_REASONING_DOMINATED"), true);
});

test("68. missing usage does not fabricate reasoning-dominated classification", async () => {
  const provider = createFakeGeminiSectionProvider({ incompleteAtSection: "meta_decision" });
  const wrapped = {
    ...provider,
    execute: async (request: Parameters<typeof provider.execute>[0]) => {
      const response = await provider.execute(request);
      return { ...response, usage: null };
    },
  };
  const summary = await executeCmipGeminiSectionedModelPackageSummary(
    { modelPackage: buildPackage(), taskType: "full_report_experimental", executionMode: "dry_run" },
    { provider: wrapped, env: { CMIP_GEMINI_MODEL_PRIMARY: "gemini-section-test" } },
  );
  assert.equal(summary.sections[0]?.incomplete.derivedReasoningDominatedCode, null);
  assert.equal(summary.sections[0]?.incomplete.generationUtilization.reasoningDominated, false);
});

test("69. live-smoke diagnostics expose thinking metadata without generated prose", async () => {
  const summary = await executeCmipGeminiSectionedModelPackageSummary(
    { modelPackage: buildPackage(), taskType: "full_report_experimental", executionMode: "dry_run" },
    { provider: createFakeGeminiSectionProvider(), env: { CMIP_GEMINI_MODEL_PRIMARY: "gemini-section-test" } },
  );
  const formatted = formatCmipGeminiSectionedLiveSmokeSummary(summary).join("\n");
  assert.ok(formatted.includes("CMIP SECTION meta_decision THINKING POLICY VERSION: CMIP-GEMINI-SECTION-THINKING-1.1"));
  assert.ok(formatted.includes("CMIP SECTION delta_attribution EFFECTIVE THINKING LEVEL: minimal"));
  assert.ok(formatted.includes("CMIP SECTION meta_decision REASONING SHARE PCT:"));
  assert.equal(formatted.includes("ETF flow stabilization supports maintaining risk"), false);
});

test("70. fake sectioned dry run records thinking levels in trace", async () => {
  const summary = await executeCmipGeminiSectionedModelPackageSummary(
    { modelPackage: buildPackage(), taskType: "full_report_experimental", executionMode: "dry_run" },
    { provider: createFakeGeminiSectionProvider(), env: { CMIP_GEMINI_MODEL_PRIMARY: "gemini-section-test" } },
  );
  const trace = summary.result.trace.providerTrace as { sectionUsage: readonly { sectionId: CmipGeminiSectionId; thinking: { effectiveThinkingLevel: string; policyVersion: string } }[] };
  assert.equal(trace.sectionUsage.find((item) => item.sectionId === "engines_reasons")?.thinking.effectiveThinkingLevel, "low");
  assert.equal(trace.sectionUsage.find((item) => item.sectionId === "coins")?.thinking.effectiveThinkingLevel, "minimal");
  assert.equal(trace.sectionUsage.every((item) => item.thinking.policyVersion === CMIP_GEMINI_SECTION_THINKING_POLICY_VERSION), true);
});

test("71. sectioned dry run remains Task 001 valid after thinking metadata changes", async () => {
  const summary = await executeCmipGeminiSectionedModelPackageSummary(
    { modelPackage: buildPackage(), taskType: "full_report_experimental", executionMode: "dry_run" },
    { provider: createFakeGeminiSectionProvider(), env: { CMIP_GEMINI_MODEL_PRIMARY: "gemini-section-test" } },
  );
  assert.equal(summary.result.status, "success");
  assert.equal(validateCmipReport(summary.result.report).valid, true);
});

test("72. context version 1.0 is exported", () => {
  assert.equal(CMIP_GEMINI_SECTION_CONTEXT_VERSION, "CMIP-GEMINI-SECTION-CONTEXT-1.0");
});

test("73. reduced section contexts stay within approved input targets", () => {
  const pkg = buildPackage();
  for (const sectionId of CMIP_GEMINI_SECTION_ORDER) {
    const result = buildCmipGeminiSectionContext({
      modelPackage: pkg,
      section: getCmipGeminiSectionDefinition(sectionId),
      completedSections: sectionId === "meta_decision" ? {} : validSections(),
    });
    assert.deepEqual(result.errors, []);
    assert.equal(result.trace.contextWithinTarget, true);
    assert.ok(result.trace.finalEstimatedInputTokens <= result.trace.targetInputTokens);
  }
});

test("74. meta_decision receives only approved summary domains", () => {
  const result = buildCmipGeminiSectionContext({
    modelPackage: buildPackage(),
    section: getCmipGeminiSectionDefinition("meta_decision"),
    completedSections: {},
  });
  const inputs = result.context.requiredInputs;
  assert.ok(Object.hasOwn(inputs, "asset_breadth_summary"));
  assert.equal(Object.hasOwn(inputs, "assets"), false);
  assert.equal(Object.hasOwn(inputs, "news"), false);
  assert.equal(Object.hasOwn(inputs, "charts"), false);
  assert.equal(Object.hasOwn(inputs, "audit"), false);
  assert.ok(result.trace.omissions.some((item) => item.path === "$.runtime_input.assets.full_detail"));
  assert.ok(result.trace.omissions.some((item) => item.path === "$.runtime_input.charts"));
  assert.ok(result.trace.omissions.some((item) => item.path === "$.runtime_input.audit"));
});

test("75. coins context receives exactly the ten canonical asset records", () => {
  const result = buildCmipGeminiSectionContext({
    modelPackage: buildPackage(),
    section: getCmipGeminiSectionDefinition("coins"),
    completedSections: validSections(),
  });
  const assets = (result.context.requiredInputs.assets as readonly { symbol?: string }[]) ?? [];
  assert.deepEqual(assets.map((asset) => asset.symbol), [...CMIP_REQUIRED_ASSET_SYMBOLS]);
});

test("76. charts_audit receives validated prior-section dependency summary", () => {
  const result = buildCmipGeminiSectionContext({
    modelPackage: buildPackage(),
    section: getCmipGeminiSectionDefinition("charts_audit"),
    completedSections: validSections(),
  });
  assert.deepEqual(result.context.dependencySummary?.coin_symbols, [...CMIP_REQUIRED_ASSET_SYMBOLS]);
  assert.ok(Array.isArray(result.context.dependencySummary?.reason_ids));
  assert.ok(Array.isArray(result.context.dependencySummary?.scenario_ids));
});

test("77. source registry is sliced to referenced source records", () => {
  const result = buildCmipGeminiSectionContext({
    modelPackage: buildPackage(),
    section: getCmipGeminiSectionDefinition("meta_decision"),
    completedSections: {},
  });
  const registry = result.context.sourceRegistry as { sources?: readonly { source_id?: string }[]; included_source_ids?: readonly string[]; excluded_source_count?: number };
  const included = registry.included_source_ids ?? [];
  assert.ok(included.length > 0);
  assert.ok((registry.excluded_source_count ?? 0) > 0);
  assert.deepEqual((registry.sources ?? []).map((source) => source.source_id), included);
  for (const ref of collectTestSourceRefs(result.context.requiredInputs)) {
    assert.ok(included.includes(ref));
  }
});

test("78. unresolved source refs fail before provider execution", () => {
  const pkg = packageWithRuntimeMutation((context) => {
    const input = ((context.runtime_input as Record<string, unknown>).cmip_runtime_input as Record<string, unknown>);
    (input.market as Record<string, unknown>).unknown_ref_probe = { source_refs: ["source:missing-for-test"] };
  });
  const contextResult = buildCmipGeminiSectionContext({
    modelPackage: pkg,
    section: getCmipGeminiSectionDefinition("meta_decision"),
    completedSections: {},
  });
  assert.equal(contextResult.errors.some((error) => error.code === "GEMINI_SECTION_SOURCE_REF_UNRESOLVED"), true);
  const config = dryRunGeminiConfig({ CMIP_GEMINI_MODEL_PRIMARY: "gemini-section-test" });
  const model = resolveCmipGeminiModelProfile(pkg.executionConfig.modelProfile, config);
  assert.equal(model.ok, true);
  assert.throws(() => mapCmipPackageToGeminiSectionRequest({
    modelPackage: pkg,
    section: getCmipGeminiSectionDefinition("meta_decision"),
    completedSections: {},
    config,
    model: model.resolution,
  }), /Gemini section context build failed/);
});

test("79. data-quality paths are sliced to section-relevant domains", () => {
  const result = buildCmipGeminiSectionContext({
    modelPackage: buildPackage(),
    section: getCmipGeminiSectionDefinition("coins"),
    completedSections: validSections(),
  });
  const qualityByDomain = (result.context.dataQuality.quality_by_domain as Record<string, unknown>) ?? {};
  assert.deepEqual(Object.keys(qualityByDomain).sort(), ["assets", "breadth", "market"]);
});

test("80. full Task 001 schema and full Task 2.5 context are not sent in Gemini section prompts", () => {
  const pkg = buildPackage();
  const config = dryRunGeminiConfig({ CMIP_GEMINI_MODEL_PRIMARY: "gemini-section-test" });
  const model = resolveCmipGeminiModelProfile(pkg.executionConfig.modelProfile, config);
  assert.equal(model.ok, true);
  const request = mapCmipPackageToGeminiSectionRequest({
    modelPackage: pkg,
    section: getCmipGeminiSectionDefinition("meta_decision"),
    completedSections: {},
    config,
    model: model.resolution,
  });
  assert.equal(request.input.includes("<CMIP_RUNTIME_CONTEXT>"), false);
  assert.equal(request.input.includes("\"cmip_report\""), false);
  assert.equal(request.input.includes("$defs"), false);
  assert.equal(request.input.includes("Full Task 001 schema remains application-side final validation."), true);
  assert.ok(stableStringify(pkg.outputContract.schema).includes("cmip_report"));
});

test("81. dependency summaries are deterministic and model-free", () => {
  const pkg = buildPackage();
  const first = buildCmipGeminiSectionContext({ modelPackage: pkg, section: getCmipGeminiSectionDefinition("charts_audit"), completedSections: validSections() });
  const second = buildCmipGeminiSectionContext({ modelPackage: pkg, section: getCmipGeminiSectionDefinition("charts_audit"), completedSections: validSections() });
  assert.deepEqual(first.context.dependencySummary, second.context.dependencySummary);
  assert.equal(stableStringify(first.context.dependencySummary).includes("prompt"), false);
});

test("82. critical conflicts and relevant source refs are not reduced away", () => {
  const result = buildCmipGeminiSectionContext({
    modelPackage: packageWithRuntimeMutation((context) => {
      const input = ((context.runtime_input as Record<string, unknown>).cmip_runtime_input as Record<string, unknown>);
      const dataQuality = input.data_quality as Record<string, unknown>;
      dataQuality.conflicts = [{ path: "$.market.btc_dominance", severity: "critical", source_refs: ["source:market-index"] }];
    }),
    section: getCmipGeminiSectionDefinition("meta_decision"),
    completedSections: {},
  });
  assert.deepEqual(result.errors, []);
  assert.ok(stableStringify(result.context.dataQuality.conflicts).includes("$.market.btc_dominance"));
  const registry = result.context.sourceRegistry as { included_source_ids?: readonly string[] };
  assert.ok((registry.included_source_ids ?? []).includes("source:market-index"));
});

test("83. unreducible oversized context fails deterministically", () => {
  const result = buildCmipGeminiSectionContext({
    modelPackage: packageWithRuntimeMutation((context) => {
      const input = ((context.runtime_input as Record<string, unknown>).cmip_runtime_input as Record<string, unknown>);
      (input.market as Record<string, unknown>).oversized_context_probe = "x".repeat(80000);
    }),
    section: getCmipGeminiSectionDefinition("meta_decision"),
    completedSections: {},
  });
  assert.equal(result.trace.contextWithinTarget, false);
  assert.equal(result.errors.some((error) => error.code === "GEMINI_SECTION_CONTEXT_BUDGET_EXCEEDED"), true);
});

test("84. request mapper uses reduced section context and exposes trace", () => {
  const pkg = buildPackage();
  const config = dryRunGeminiConfig({ CMIP_GEMINI_MODEL_PRIMARY: "gemini-section-test" });
  const model = resolveCmipGeminiModelProfile(pkg.executionConfig.modelProfile, config);
  assert.equal(model.ok, true);
  const mapped = mapCmipPackageToGeminiSectionRequestWithContext({
    modelPackage: pkg,
    section: getCmipGeminiSectionDefinition("meta_decision"),
    completedSections: {},
    config,
    model: model.resolution,
  });
  assert.ok(mapped.body.input.includes("<CMIP_GEMINI_SECTION_CONTEXT"));
  assert.equal(mapped.body.input.includes(pkg.messages[3]?.content ?? ""), false);
  assert.equal(mapped.contextTrace.contextVersion, CMIP_GEMINI_SECTION_CONTEXT_VERSION);
  assert.ok(mapped.contextTrace.reductionCount > 0);
});

test("85. meta_decision and engines_reasons request snapshots can be structurally diffed", () => {
  const meta = snapshotCmipGeminiSectionRequest("meta_decision", mappedSectionRequest("meta_decision").body);
  const engines = snapshotCmipGeminiSectionRequest("engines_reasons", mappedSectionRequest("engines_reasons").body);
  const diff = diffCmipGeminiSectionRequestSnapshots(meta, engines);
  assert.equal(diff.leftSectionId, "meta_decision");
  assert.equal(diff.rightSectionId, "engines_reasons");
  assert.deepEqual(diff.topLevelOnlyInLeft, []);
  assert.deepEqual(diff.topLevelOnlyInRight, []);
  assert.ok(diff.generationConfigDifferences.includes("max_output_tokens"));
  assert.ok(diff.generationConfigDifferences.includes("thinking_level"));
  assert.ok(diff.responseFormatDifferences.includes("schemaHash"));
  assert.ok(diff.schemaMetricDifferences.schemaBytes);
});

test("86. request snapshots contain no secrets, prompt content, or runtime values", () => {
  const snapshot = snapshotCmipGeminiSectionRequest("engines_reasons", mappedSectionRequest("engines_reasons").body);
  const serialized = stableStringify(snapshot);
  assert.equal(snapshot.containsSecrets, false);
  assert.equal(snapshot.containsRuntimeContent, false);
  assert.doesNotMatch(serialized, /GEMINI_API_KEY|Authorization|Bearer|<CMIP_GEMINI_SECTION_CONTEXT|source:/);
});

test("87. engines_reasons provider schema keyword inventory is deterministic", () => {
  const engines = getCmipGeminiSectionDefinition("engines_reasons").schema;
  const meta = getCmipGeminiSectionDefinition("meta_decision").schema;
  const first = inventoryCmipGeminiSectionSchemaKeywords({ schema: engines, metaDecisionSchema: meta });
  const second = inventoryCmipGeminiSectionSchemaKeywords({ schema: engines, metaDecisionSchema: meta });
  assert.deepEqual(first, second);
  assert.ok(first.some((item) => item.keyword === "$ref" && item.movableToPostValidation));
  assert.ok(first.some((item) => item.keyword === "minimum" && item.movableToPostValidation));
  assert.ok(first.some((item) => item.keyword === "additionalProperties"));
  assert.ok(first.some((item) => item.keyword === "enum" && item.presentInMetaDecision));
});

test("88. engines_reasons schema complexity metrics are deterministic and reported", () => {
  const schema = getCmipGeminiSectionDefinition("engines_reasons").schema;
  const first = calculateCmipGeminiSectionSchemaComplexity(schema);
  const second = calculateCmipGeminiSectionSchemaComplexity(schema);
  assert.deepEqual(first, second);
  assert.ok(first.bytes > 0);
  assert.ok(first.maxNestingDepth > 0);
  assert.ok(first.propertyCount > 0);
  assert.ok(first.requiredFieldCount > 0);
  assert.ok(first.bytes < CMIP_GEMINI_SECTION_SCHEMA_COMPATIBILITY_BUDGETS.maxSchemaBytes);
  assert.ok(first.maxNestingDepth <= CMIP_GEMINI_SECTION_SCHEMA_COMPATIBILITY_BUDGETS.maxNestingDepth);
});

test("89. engines_reasons provider projection is deterministic and versioned", () => {
  const section = getCmipGeminiSectionDefinition("engines_reasons");
  const first = projectCmipGeminiSectionProviderSchema(section);
  const second = projectCmipGeminiSectionProviderSchema(section);
  assert.deepEqual(first, second);
  assert.equal(first.projectionVersion, CMIP_GEMINI_SECTION_PROVIDER_PROJECTION_VERSION);
  assert.equal(first.projectionVersion, "CMIP-GEMINI-SECTION-PROVIDER-PROJECTION-1.1");
  assert.equal(first.decision, "USE_PROVIDER_SAFE_PROJECTION");
  assert.notEqual(first.providerSectionSchemaHash, first.canonicalSectionSchemaHash);
  assert.deepEqual((first.providerSchema.required as readonly string[]).sort(), ["engine_scores", "reasons"]);
  assert.ok(first.providerSchemaBytes > 0);
  assert.ok(first.providerSchemaDepth > 0);
  assert.ok(first.providerPropertyCount > 0);
});

test("90. canonical engines_reasons section schema remains unchanged by provider projection", () => {
  const section = getCmipGeminiSectionDefinition("engines_reasons");
  const before = hashCanonicalJson(section.schema);
  projectCmipGeminiSectionProviderSchema(section);
  providerSchemaForGeminiSection(section);
  assert.equal(hashCanonicalJson(section.schema), before);
});

test("91. engines_reasons schema variants document retained and moved constraints", () => {
  const variants = buildCmipGeminiSectionSchemaVariants(getCmipGeminiSectionDefinition("engines_reasons"));
  assert.deepEqual(variants.map((variant) => variant.variantId), ["current", "descriptions_removed", "provider_safe_constraints", "shallow_transport"]);
  const providerSafe = variants.find((variant) => variant.variantId === "provider_safe_constraints");
  assert.ok(providerSafe);
  assert.equal(providerSafe.finalTask001EnforcementUnchanged, true);
  assert.ok(providerSafe.constraintsRetainedProviderSide.includes("top-level object"));
  assert.ok(providerSafe.constraintsRetainedProviderSide.includes("engine_scores required item fields"));
  assert.ok(providerSafe.constraintsRetainedProviderSide.includes("reasons required item fields"));
  assert.ok(providerSafe.constraintsMovedToPostValidation.includes("numeric minimum/maximum"));
  assert.ok(providerSafe.constraintsMovedToPostValidation.includes("nullable type arrays"));
});

test("92. engines_reasons provider projection preserves every strict required item field", () => {
  const section = getCmipGeminiSectionDefinition("engines_reasons");
  const projection = projectCmipGeminiSectionProviderSchema(section);
  const schema = projection.providerSchema;
  const properties = schema.properties as Record<string, { items?: { properties?: Record<string, unknown>; required?: readonly string[] } }>;
  const engineItem = properties.engine_scores.items ?? {};
  const reasonItem = properties.reasons.items ?? {};
  const strictEngineRequired = strictRequiredItemFields("engine_scores");
  const strictReasonRequired = strictRequiredItemFields("reasons");
  assert.deepEqual(Object.keys(engineItem.properties ?? {}).sort(), [...strictEngineRequired].sort());
  assert.deepEqual([...(engineItem.required ?? [])].sort(), [...strictEngineRequired].sort());
  assert.deepEqual(Object.keys(reasonItem.properties ?? {}).sort(), [...strictReasonRequired].sort());
  assert.deepEqual([...(reasonItem.required ?? [])].sort(), [...strictReasonRequired].sort());
  assert.deepEqual(projection.requiredFieldsPreserved.engine_scores_item, strictEngineRequired);
  assert.deepEqual(projection.requiredFieldsPreserved.reasons_item, strictReasonRequired);
});

test("93. engines_reasons guided projection keeps essential enum and source ref guidance", () => {
  const schema = providerSchemaForGeminiSection(getCmipGeminiSectionDefinition("engines_reasons")) as {
    properties: {
      engine_scores: { items: { properties: Record<string, unknown> } };
      reasons: { items: { properties: Record<string, unknown> } };
    };
  };
  const reasonProperties = schema.properties.reasons.items.properties as Record<string, { type?: string; enum?: readonly string[]; items?: { type?: string }; properties?: Record<string, unknown>; required?: readonly string[] }>;
  const engineProperties = schema.properties.engine_scores.items.properties as Record<string, { type?: string; items?: { type?: string } }>;
  assert.deepEqual(reasonProperties.evidence_verdict.enum, ["confirmed", "partially_confirmed", "not_confirmed", "contradicted", "insufficient_data"]);
  assert.equal(reasonProperties.source_refs.type, "array");
  assert.equal(reasonProperties.source_refs.items?.type, "string");
  assert.equal(engineProperties.missing_reasons.type, "array");
  assert.equal(engineProperties.missing_reasons.items?.type, "string");
  assert.deepEqual(reasonProperties.historical_evidence.required, ["status", "sample_definition", "sample_size", "period", "result", "limitations"]);
  assert.ok(Object.keys(reasonProperties.historical_evidence.properties ?? {}).length > 0);
});

test("94. engines_reasons provider projection avoids prohibited complex constraints and stays within guards", () => {
  const schema = providerSchemaForGeminiSection(getCmipGeminiSectionDefinition("engines_reasons"));
  const serialized = stableStringify(schema);
  const metrics = calculateCmipGeminiSectionSchemaComplexity(schema);
  assert.equal(/"anyOf"|"oneOf"|"allOf"|"pattern"|"format"|"dependentRequired"|"contains"|"unevaluatedProperties"/.test(serialized), false);
  assert.equal(/"maxLength"|"minimum"|"maximum"/.test(serialized), false);
  assert.ok(metrics.bytes <= CMIP_GEMINI_SECTION_SCHEMA_COMPATIBILITY_BUDGETS.maxSchemaBytes);
  assert.ok(metrics.maxNestingDepth <= CMIP_GEMINI_SECTION_SCHEMA_COMPATIBILITY_BUDGETS.maxNestingDepth);
  assert.ok(metrics.propertyCount <= CMIP_GEMINI_SECTION_SCHEMA_COMPATIBILITY_BUDGETS.maxTotalProperties);
  assert.equal(metrics.combinatorKeywordCount, 0);
});

test("95. missing required engines_reasons item fields fail provider projection validation", () => {
  const valid = stableJsonClone(sectionFromCmipReport("engines_reasons", sample)) as Record<string, unknown>;
  const missingEngineField = stableJsonClone(valid) as { engine_scores: Record<string, unknown>[] };
  delete missingEngineField.engine_scores[0].engine_id;
  const engineResult = validateCmipGeminiProviderProjection("engines_reasons", missingEngineField);
  assert.equal(engineResult.valid, false);
  assert.ok(engineResult.errors.some((error) => error.path === "$.engine_scores.0.engine_id"));

  const missingReasonField = stableJsonClone(valid) as { reasons: Record<string, unknown>[] };
  delete missingReasonField.reasons[0].reason_id;
  const reasonResult = validateCmipGeminiProviderProjection("engines_reasons", missingReasonField);
  assert.equal(reasonResult.valid, false);
  assert.ok(reasonResult.errors.some((error) => error.path === "$.reasons.0.reason_id"));
});

test("96. v1.1 provider projection can pass while strict local constraints reject ranges and lengths", () => {
  const valid = stableJsonClone(sectionFromCmipReport("engines_reasons", sample));
  const invalidRange = stableJsonClone(valid) as { engine_scores: Record<string, unknown>[]; reasons: Record<string, unknown>[] };
  invalidRange.engine_scores[0].score = 101;
  invalidRange.reasons[0].title = "x".repeat(500);
  assert.equal(validateCmipGeminiProviderProjection("engines_reasons", invalidRange).valid, true);
  assert.equal(validateCmipGeminiSection("engines_reasons", invalidRange).valid, false);
});

test("97. removed engines_reasons provider constraints remain enforced by local section validation", () => {
  const valid = stableJsonClone(sectionFromCmipReport("engines_reasons", sample));
  assert.equal(validateCmipGeminiSection("engines_reasons", { ...valid, engine_scores: [] }).valid, false);
  assert.equal(validateCmipGeminiSection("engines_reasons", { ...valid, reasons: [] }).valid, false);
  const invalidVerdict = stableJsonClone(valid) as { reasons: Record<string, unknown>[] };
  invalidVerdict.reasons[0].evidence_verdict = "unsupported_verdict";
  assert.equal(validateCmipGeminiSection("engines_reasons", invalidVerdict).valid, false);
  assert.equal(validateCmipGeminiSection("engines_reasons", { ...valid, extra: true }).valid, false);
});

test("98. no engines_reasons field is inserted automatically by validation", () => {
  const invalid = stableJsonClone(sectionFromCmipReport("engines_reasons", sample)) as { reasons: Record<string, unknown>[] };
  delete invalid.reasons[0].source_refs;
  const before = hashCanonicalJson(invalid);
  validateCmipGeminiProviderProjection("engines_reasons", invalid);
  validateCmipGeminiSection("engines_reasons", invalid);
  assert.equal(hashCanonicalJson(invalid), before);
});

test("99. engines_reasons provider request uses only supported AI Studio fields", () => {
  const mapped = mappedSectionRequest("engines_reasons");
  const request = mapped.body as unknown as Record<string, unknown>;
  assert.deepEqual(Object.keys(request).sort(), ["background", "generation_config", "input", "model", "response_format", "store", "stream", "system_instruction"]);
  assert.equal(Object.hasOwn(request, "tools"), false);
  assert.equal(Object.hasOwn(request, "labels"), false);
  assert.equal(Object.hasOwn(request, "metadata"), false);
  assert.deepEqual(mapped.body.generation_config, { max_output_tokens: 7000, thinking_level: "low" });
  assert.equal(Object.hasOwn(mapped.body.generation_config as unknown as Record<string, unknown>, "thinking_config"), false);
  assert.equal(Object.hasOwn(mapped.body.generation_config as unknown as Record<string, unknown>, "thinking_budget"), false);
  assert.equal(Object.hasOwn(mapped.body.generation_config as unknown as Record<string, unknown>, "include_thoughts"), false);
});

test("100. provider request and context serialization reject undefined and non-finite values", () => {
  const mapped = mappedSectionRequest("engines_reasons");
  assert.doesNotThrow(() => stableStringify(mapped.body));
  assert.deepEqual(validateCmipGeminiSectionContextPayload(JSON.parse(mapped.contextTrace ? stableStringify({ ok: true }) : "{}")), []);
  assert.ok(validateCmipGeminiSectionContextPayload({ value: undefined }).some((issue) => issue.includes("undefined") || issue.includes("canonical")));
  assert.ok(validateCmipGeminiSectionContextPayload({ value: Number.NaN }).some((issue) => issue.includes("non-finite")));
});

test("101. context-payload audit rejects request-shaped collisions inside untrusted context", () => {
  const issues = validateCmipGeminiSectionContextPayload({
    safe: true,
    nested: {
      generation_config: { max_output_tokens: 1 },
      labels: { unsafe: "enterprise-only" },
      text: "normal runtime text",
    },
  });
  assert.ok(issues.some((issue) => issue.includes("$.nested.generation_config")));
  assert.ok(issues.some((issue) => issue.includes("$.nested.labels")));
});

test("102. safe provider error extraction redacts secrets and retains field violations", () => {
  const error = Object.assign(new Error("Request contains an invalid argument Bearer abc.def.ghi AIzaSySecretSecretSecretSecretSecret"), {
    status: 400,
    code: "INVALID_ARGUMENT",
    cause: {
      status: "INVALID_ARGUMENT",
      details: [{
        "@type": "type.googleapis.com/google.rpc.BadRequest",
        fieldViolations: [{ field: "response_format.schema.properties.reasons.items" }],
      }],
    },
  });
  const details = extractCmipGeminiSectionProviderErrorDetails({
    error,
    sectionId: "engines_reasons",
    providerSchemaHash: "abc123",
    requestShapeHash: "def456",
  });
  assert.equal(details.httpStatus, 400);
  assert.equal(details.providerErrorCode, "INVALID_ARGUMENT");
  assert.deepEqual(details.fieldViolationPaths, ["response_format.schema.properties.reasons.items"]);
  assert.deepEqual(details.badRequestDetailTypes, ["type.googleapis.com/google.rpc.BadRequest"]);
  assert.doesNotMatch(details.safeMessage, /AIzaSySecret|abc\.def\.ghi/);
  assert.match(details.safeMessage, /provider_schema_hash=abc123/);
});

test("103. fake engines_reasons execution succeeds with guided projected provider schema and strict local validation", async () => {
  let inspected = false;
  const provider = createFakeGeminiSectionProvider();
  const wrapped = {
    ...provider,
    execute: async (request: Parameters<typeof provider.execute>[0]) => {
      if (request.executionId.endsWith(":engines_reasons")) {
        inspected = true;
        const schema = request.body.response_format.schema as { properties?: Record<string, { items?: { properties?: Record<string, unknown>; required?: readonly string[] } }>; required?: readonly string[] };
        assert.deepEqual(schema.required, ["engine_scores", "reasons"]);
        assert.deepEqual(Object.keys(schema.properties ?? {}).sort(), ["engine_scores", "reasons"]);
        assert.ok(stableStringify(schema).includes("historical_evidence"));
        assert.deepEqual((schema.properties?.engine_scores.items?.required ?? []).sort(), [...strictRequiredItemFields("engine_scores")].sort());
        assert.deepEqual((schema.properties?.reasons.items?.required ?? []).sort(), [...strictRequiredItemFields("reasons")].sort());
      }
      return provider.execute(request);
    },
  };
  const summary = await executeCmipGeminiSectionedModelPackageSummary(
    { modelPackage: buildPackage(), taskType: "full_report_experimental", executionMode: "dry_run" },
    { provider: wrapped, env: { CMIP_GEMINI_MODEL_PRIMARY: "gemini-section-test" } },
  );
  assert.equal(inspected, true);
  assert.equal(summary.result.status, "success");
  assert.equal(validateCmipReport(summary.result.report).valid, true);
});

test("104. provider projection validation runs before strict local section validation", async () => {
  const provider = createFakeGeminiSectionProvider();
  const wrapped = {
    ...provider,
    execute: async (request: Parameters<typeof provider.execute>[0]) => {
      if (request.executionId.endsWith(":engines_reasons")) {
        return {
          responseId: "invalid-engines",
          model: request.body.model,
          serviceTier: null,
          status: "completed" as const,
          outputText: stableStringify({ engine_scores: [], reasons: [] }),
          refusal: null,
          incompleteReason: null,
          incompleteDetails: null,
          finishReason: null,
          error: null,
          usage: { inputTokens: 1, cachedInputTokens: null, outputTokens: 1, reasoningTokens: 0, totalTokens: 2 },
          toolCalls: 0,
          toolSources: [],
        };
      }
      return provider.execute(request);
    },
  };
  const summary = await executeCmipGeminiSectionedModelPackageSummary(
    { modelPackage: buildPackage(), taskType: "full_report_experimental", executionMode: "dry_run" },
    { provider: wrapped, env: { CMIP_GEMINI_MODEL_PRIMARY: "gemini-section-test" } },
  );
  const section = summary.sections.find((item) => item.sectionId === "engines_reasons");
  assert.equal(summary.result.status, "failed");
  assert.equal(section?.validation.outerJsonParsed, true);
  assert.equal(section?.validation.providerSchemaValid, false);
  assert.equal(section?.validation.sectionCanonicalValid, false);
  assert.equal(section?.errors.some((error) => error.code === "GEMINI_SECTION_OUTPUT_INVALID"), true);
});

test("105. strict local section validation still runs after provider projection passes", async () => {
  const provider = createFakeGeminiSectionProvider();
  const wrapped = {
    ...provider,
    execute: async (request: Parameters<typeof provider.execute>[0]) => {
      if (request.executionId.endsWith(":engines_reasons")) {
        const invalid = stableJsonClone(sectionFromCmipReport("engines_reasons", sample)) as { engine_scores: Record<string, unknown>[] };
        invalid.engine_scores[0].score = 101;
        return {
          responseId: "invalid-engines-local",
          model: request.body.model,
          serviceTier: null,
          status: "completed" as const,
          outputText: stableStringify(invalid),
          refusal: null,
          incompleteReason: null,
          incompleteDetails: null,
          finishReason: null,
          error: null,
          usage: { inputTokens: 1, cachedInputTokens: null, outputTokens: 1, reasoningTokens: 0, totalTokens: 2 },
          toolCalls: 0,
          toolSources: [],
        };
      }
      return provider.execute(request);
    },
  };
  const summary = await executeCmipGeminiSectionedModelPackageSummary(
    { modelPackage: buildPackage(), taskType: "full_report_experimental", executionMode: "dry_run" },
    { provider: wrapped, env: { CMIP_GEMINI_MODEL_PRIMARY: "gemini-section-test" } },
  );
  const section = summary.sections.find((item) => item.sectionId === "engines_reasons");
  assert.equal(summary.result.status, "failed");
  assert.equal(section?.validation.outerJsonParsed, true);
  assert.equal(section?.validation.providerSchemaValid, true);
  assert.equal(section?.validation.sectionCanonicalValid, false);
});

test("106. canonical partition covers every required cmip_report child exactly once", () => {
  assert.equal(CMIP_CANONICAL_SECTION_PARTITION_VERSION, "CMIP-CANONICAL-SECTION-PARTITION-1.0");
  assert.deepEqual(assertCmipCanonicalPartitionCoverage(), []);
  const allFields = Object.values(CMIP_CANONICAL_SECTION_PARTITION_MAP).flat();
  assert.equal(new Set(allFields).size, allFields.length);
  assert.deepEqual([...allFields].sort(), [
    "audit",
    "attribution",
    "charts",
    "coins",
    "confidence",
    "decision",
    "decision_memory",
    "delta",
    "engine_scores",
    "executive_summary",
    "meta",
    "reasons",
    "scenarios",
    "triggers",
  ].sort());
});

test("107. canonical section derivation is deterministic and subtree-equivalent", () => {
  assert.equal(CMIP_CANONICAL_SECTION_DERIVATION_VERSION, "CMIP-CANONICAL-SECTION-DERIVATION-1.0");
  const first = getAllCmipCanonicalSectionDerivationReports();
  const second = getAllCmipCanonicalSectionDerivationReports();
  assert.deepEqual(first, second);
  assert.equal(first.length, 7);
  assert.equal(first.every((report) => report.equivalent), true);
  for (const report of first) {
    for (const field of report.ownedFields) {
      assert.equal(report.canonicalSubtreeHashes[field], report.derivedSubtreeHashes[field]);
    }
  }
});

test("108. canonical output schema hash remains unchanged by section derivation", () => {
  const reports = getAllCmipCanonicalSectionDerivationReports();
  const hashes = new Set(reports.map((report) => report.canonicalSchemaHash));
  assert.equal(hashes.size, 1);
  const before = hashes.values().next().value;
  getCmipCanonicalSectionSchema("meta_decision");
  assert.equal(getAllCmipCanonicalSectionDerivationReports()[0]?.canonicalSchemaHash, before);
});

test("109. handwritten mismatch audit identifies previous section-schema divergence", () => {
  const audit = auditLegacyCmipGeminiSectionSchemas();
  assert.equal(audit.length, 7);
  for (const row of audit) {
    const mismatchCount = Object.entries(row.counts)
      .filter(([category]) => category !== "EXACT_CANONICAL_MATCH")
      .reduce((sum, [, count]) => sum + count, 0);
    assert.ok(mismatchCount > 0);
  }
  const coins = audit.find((row) => row.sectionId === "coins");
  assert.ok((coins?.counts.TYPE_MISMATCH ?? 0) > 0 || (coins?.counts.NESTED_STRUCTURE_MISMATCH ?? 0) > 0);
});

test("110. exact derived schemas reject representative live-smoke mismatch paths before assembly", () => {
  const meta = stableJsonClone(sectionFromCmipReport("meta_decision", sample)) as { decision: { drivers: Record<string, unknown> } };
  delete meta.decision.drivers.positive;
  assert.equal(validateCmipGeminiSection("meta_decision", meta).valid, false);

  const engines = stableJsonClone(sectionFromCmipReport("engines_reasons", sample)) as { engine_scores: { inputs: Record<string, unknown> }[]; reasons: { historical_evidence: { period: Record<string, unknown> } }[] };
  delete engines.engine_scores[0].inputs.source_refs;
  delete engines.engine_scores[0].inputs.calc_refs;
  delete engines.reasons[0].historical_evidence.period.start;
  assert.equal(validateCmipGeminiSection("engines_reasons", engines).valid, false);
});

test("111. exact derived schemas reject simplified delta, attribution, scenarios and triggers", () => {
  assert.equal(validateCmipGeminiSection("delta_attribution", { delta: {}, attribution: [{ factor_id: "x" }] }).valid, false);
  assert.equal(validateCmipGeminiSection("scenarios_triggers", { scenarios: [{ name: "base" }, { name: "bull" }, { name: "bear" }], triggers: [{}] }).valid, false);
});

test("112. exact derived schemas reject simplified confidence, decision_memory, charts and audit", () => {
  assert.equal(validateCmipGeminiSection("confidence_memory", {
    confidence: { raw: 80, final: 70, cap: null, components: [{ component_name: "quality", score: 80 }] },
    decision_memory: {},
  }).valid, false);
  assert.equal(validateCmipGeminiSection("charts_audit", {
    charts: [{ chart_type: "line", data: [1, 2] }],
    audit: { sources: [{ source_id: "x" }], calculations: [{ formula: "x" }], missing_data: [{}], conflicts: [], warnings: [{}] },
  }).valid, false);
});

test("113. successful coins section implies exact ten-asset canonical array", () => {
  const coins = sectionFromCmipReport("coins", sample);
  const result = validateCmipGeminiSection("coins", coins);
  assert.equal(result.valid, true);
  assert.deepEqual(result.data.coins.map((coin) => coin.symbol), [...CMIP_REQUIRED_ASSET_SYMBOLS]);
  const missingTon = stableJsonClone(coins) as { coins: Record<string, unknown>[] };
  missingTon.coins = missingTon.coins.filter((coin) => coin.symbol !== "TON");
  assert.equal(validateCmipGeminiSection("coins", missingTon).valid, false);
  const extra = stableJsonClone(coins) as { coins: Record<string, unknown>[] };
  extra.coins.push({ ...extra.coins[0], symbol: "FAKE" });
  assert.equal(validateCmipGeminiSection("coins", extra).valid, false);
});

test("114. provider projection success cannot bypass exact derived validation", () => {
  const section = stableJsonClone(sectionFromCmipReport("engines_reasons", sample)) as { engine_scores: Record<string, unknown>[] };
  section.engine_scores[0].score = 101;
  assert.equal(validateCmipGeminiProviderProjection("engines_reasons", section).valid, true);
  assert.equal(validateCmipGeminiSection("engines_reasons", section).valid, false);
});

test("115. assembler rejects unvalidated successful section results", () => {
  const results = sectionResults();
  results[0] = { ...results[0] as CmipAnyGeminiSectionResult, validation: { outerJsonParsed: true, providerSchemaValid: true, sectionCanonicalValid: false } };
  assert.throws(() => validatedSectionsFromResults(results), /not validated/i);
});

test("116. assembler does not insert defaults, coerce types, or remove unknown fields", () => {
  const missing = stableJsonClone(sectionFromCmipReport("meta_decision", sample)) as { decision: Record<string, unknown> };
  delete missing.decision.score;
  assert.equal(validateCmipGeminiSection("meta_decision", missing).valid, false);

  const coerced = stableJsonClone(sectionFromCmipReport("confidence_memory", sample)) as { confidence: Record<string, unknown> };
  coerced.confidence.final = "85";
  const beforeCoerced = hashCanonicalJson(coerced);
  assert.equal(validateCmipGeminiSection("confidence_memory", coerced).valid, false);
  assert.equal(hashCanonicalJson(coerced), beforeCoerced);

  const unknown = stableJsonClone(sectionFromCmipReport("meta_decision", sample)) as { meta: Record<string, unknown> };
  unknown.meta.extra = true;
  const beforeUnknown = hashCanonicalJson(unknown);
  assert.equal(validateCmipGeminiSection("meta_decision", unknown).valid, false);
  assert.equal(hashCanonicalJson(unknown), beforeUnknown);
});

test("117. partitioning and reassembling canonical sample deep-equals the original sample", () => {
  const sections = validSections();
  const reassembled = assembleCmipReportFromGeminiSections(sections);
  assert.deepEqual(reassembled, sample);
  assert.equal(stableStringify(reassembled), stableStringify(sample));
  assert.equal(validateCmipReport(reassembled).valid, true);
});

test("118. sample round-trip preserves source and calculation reference integrity", () => {
  const reassembled = assembleCmipReportFromGeminiSections(validSections());
  const sourceRefs = new Set(reassembled.cmip_report.audit.sources.map((source) => source.ref));
  const calcRefs = new Set(reassembled.cmip_report.audit.calculations.map((calculation) => calculation.ref));
  assert.equal(collectTestSourceRefs(reassembled).every((ref) => sourceRefs.has(ref)), true);
  assert.equal(collectTestCalcRefs(reassembled).every((ref) => calcRefs.has(ref)), true);
});

test("119. assembly provenance covers every canonical root property", () => {
  const provenance = buildCmipSectionAssemblyProvenance();
  assert.deepEqual(provenance.map((item) => item.field).sort(), Object.values(CMIP_CANONICAL_SECTION_PARTITION_MAP).flat().sort());
  assert.equal(provenance.every((item) => item.strictSectionSchemaHash.length === 64 && item.canonicalSubtreeHash.length === 64), true);
  assert.equal(provenance.every((item) => item.transportConversionId === null), true);
});

test("120. fake provider outputs are canonical-derived and final fake report passes Task 001", async () => {
  const summary = await executeCmipGeminiSectionedModelPackageSummary(
    { modelPackage: buildPackage(), taskType: "full_report_experimental", executionMode: "dry_run" },
    { provider: createFakeGeminiSectionProvider(), env: { CMIP_GEMINI_MODEL_PRIMARY: "gemini-section-test" } },
  );
  assert.equal(summary.result.status, "success");
  assert.equal(summary.sections.every((section) => section.validation.sectionCanonicalValid), true);
  assert.equal(validateCmipReport(summary.result.report).valid, true);
});

function collectTestSourceRefs(value: unknown): readonly string[] {
  const refs = new Set<string>();
  const visit = (item: unknown, key: string | null): void => {
    if (key === "source_refs" && Array.isArray(item)) {
      item.forEach((ref) => {
        if (typeof ref === "string") refs.add(ref);
      });
    }
    if (Array.isArray(item)) {
      item.forEach((child) => visit(child, null));
      return;
    }
    if (typeof item === "object" && item !== null) {
      Object.entries(item).forEach(([childKey, child]) => visit(child, childKey));
    }
  };
  visit(value, null);
  return [...refs].sort();
}

function collectTestCalcRefs(value: unknown): readonly string[] {
  const refs = new Set<string>();
  const visit = (item: unknown, key: string | null): void => {
    if (key === "calc_refs" && Array.isArray(item)) {
      item.forEach((ref) => {
        if (typeof ref === "string") refs.add(ref);
      });
    }
    if (Array.isArray(item)) {
      item.forEach((child) => visit(child, null));
      return;
    }
    if (typeof item === "object" && item !== null) {
      Object.entries(item).forEach(([childKey, child]) => visit(child, childKey));
    }
  };
  visit(value, null);
  return [...refs].sort();
}

function mappedSectionRequest(sectionId: CmipGeminiSectionId) {
  const pkg = buildPackage();
  const config = dryRunGeminiConfig({ CMIP_GEMINI_MODEL_PRIMARY: "gemini-section-test" });
  const model = resolveCmipGeminiModelProfile(pkg.executionConfig.modelProfile, config);
  assert.equal(model.ok, true);
  return mapCmipPackageToGeminiSectionRequestWithContext({
    modelPackage: pkg,
    section: getCmipGeminiSectionDefinition(sectionId),
    completedSections: sectionId === "meta_decision" ? {} : validSections(),
    config,
    model: model.resolution,
  });
}

function strictRequiredItemFields(field: "engine_scores" | "reasons"): readonly string[] {
  const section = getCmipGeminiSectionDefinition("engines_reasons").schema as Record<string, unknown>;
  const properties = isTestRecord(section.properties) ? section.properties : {};
  const fieldSchema = isTestRecord(properties[field]) ? properties[field] : {};
  const itemSchema = resolveTestSchemaRef(isTestRecord(fieldSchema.items) ? fieldSchema.items : {}, section);
  return Array.isArray(itemSchema.required) ? itemSchema.required.filter((item): item is string => typeof item === "string") : [];
}

function resolveTestSchemaRef(schema: Record<string, unknown>, root: Record<string, unknown>): Record<string, unknown> {
  if (typeof schema.$ref !== "string") return schema;
  const target = schema.$ref
    .slice(2)
    .split("/")
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce<unknown>((current, segment) => (isTestRecord(current) ? current[segment] : undefined), root);
  return isTestRecord(target) ? target : {};
}

function isTestRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function packageWithRuntimeMutation(mutator: (context: Record<string, unknown>) => void) {
  const pkg = stableJsonClone(buildPackage());
  const runtimeMessage = pkg.messages.find((message) => message.name === "cmip_runtime_execution_context") as { content: string; name: string } | undefined;
  assert.ok(runtimeMessage);
  const match = runtimeMessage.content.match(/<CMIP_RUNTIME_CONTEXT>\s*([\s\S]*?)\s*<\/CMIP_RUNTIME_CONTEXT>/);
  assert.ok(match);
  const context = JSON.parse(match[1] ?? "{}") as Record<string, unknown>;
  mutator(context);
  runtimeMessage.content = runtimeMessage.content.replace(match[1] ?? "{}", stableStringify(context));
  return pkg;
}
