import assert from "node:assert/strict";
import { test } from "node:test";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import outputSchema from "../src/lib/cmip/contracts/output-schema.json";
import sampleOutput from "../src/lib/cmip/contracts/sample-output.json";
import { validateCmipReport } from "../src/lib/cmip/contracts/validate-report";
import type {
  CmipAbstentionReasonCode,
  CmipAssetSymbol,
  CmipChartType,
  CmipDecisionPosture,
  CmipEvidenceVerdict,
  CmipIdentityStatus,
  CmipReportEnvelope,
  CmipScenarioCalibrationStatus,
} from "../src/lib/cmip/contracts";

type DeepMutable<T> = T extends readonly (infer Item)[]
  ? DeepMutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
    : T;

type MutableReportEnvelope = DeepMutable<CmipReportEnvelope>;

function mutableSample(): MutableReportEnvelope {
  return structuredClone(sampleOutput) as MutableReportEnvelope;
}

function expectValid(input: unknown): void {
  const result = validateCmipReport(input);
  assert.equal(result.valid, true, result.valid ? undefined : formatErrors(result.errors));
}

function expectInvalid(input: unknown, expectedPath: string, expectedText: RegExp): void {
  const result = validateCmipReport(input);
  assert.equal(result.valid, false, "Expected CMIP validation to fail.");
  const formatted = formatErrors(result.errors);
  assert.match(formatted, expectedText);
  assert.ok(
    result.errors.some((error) => error.path.includes(expectedPath)),
    `Expected error path to include ${expectedPath}; received:\n${formatted}`,
  );
}

function formatErrors(errors: readonly { path: string; message: string; keyword?: string }[]): string {
  return errors.map((error) => `${error.path}: ${error.message}${error.keyword ? ` [${error.keyword}]` : ""}`).join("\n");
}

function findCoin(report: MutableReportEnvelope, symbol: CmipAssetSymbol) {
  const coin = report.cmip_report.coins.find((item) => item.symbol === symbol);
  assert.ok(coin, `Expected ${symbol} in sample coin universe.`);
  return coin;
}

function validAbstentionReport(reasonCodes: CmipAbstentionReasonCode[] = ["insufficient_data"], score: number | null = null): MutableReportEnvelope {
  const report = mutableSample();
  report.cmip_report.decision.posture = "abstain";
  report.cmip_report.decision.score = score;
  report.cmip_report.decision.confidence = 73;
  report.cmip_report.decision.plain_language = "The model abstains because a directional posture is not sufficiently supported.";
  report.cmip_report.decision.model_action = "Withhold a directional posture until the listed evidence is available.";
  report.cmip_report.decision.abstention = {
    reason_codes: reasonCodes,
    plain_language_reason: "Directional evidence is not strong enough to support a market posture today.",
    blocking_conditions: ["Critical input evidence is missing or conflicted."],
    required_evidence_to_resume: ["Restore verified source coverage for the blocking input domain."],
    previous_valid_report_policy: "keep_visible_with_stale_warning",
  };
  return report;
}

function createStrictAjv2020() {
  const ajv = new Ajv2020({
    allErrors: true,
    allowUnionTypes: true,
    coerceTypes: false,
    removeAdditional: false,
    strict: true,
    strictSchema: true,
    useDefaults: false,
    validateFormats: true,
  });
  addFormats(ajv);
  return ajv;
}

test("canonical Draft 2020-12 CMIP schema compiles", () => {
  const validate = createStrictAjv2020().compile(outputSchema);
  assert.equal(typeof validate, "function");
  assert.equal(outputSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
});

test("output Schema Draft 2020-12 still compiles with abstention amendment", () => {
  const validate = createStrictAjv2020().compile(outputSchema);
  assert.equal(typeof validate, "function");
  assert.equal(outputSchema.definitions.posture.enum.includes("abstain"), true);
});

test("strict Draft 2020-12 validator rejects unsupported schema keywords", () => {
  assert.throws(
    () =>
      createStrictAjv2020().compile({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        cmip_unknown_keyword: true,
      }),
    /unknown keyword/,
  );
});

test("date-time formats used by CMIP are validated", () => {
  const report = mutableSample();
  report.cmip_report.meta.generated_at = "2026-99-99";
  expectInvalid(report, "$.cmip_report.meta.generated_at", /date-time|format/i);
});

test("URI formats used by audit sources are validated", () => {
  const report = mutableSample();
  report.cmip_report.audit.sources[0].url = "not a uri";
  expectInvalid(report, "$.cmip_report.audit.sources[0].url", /uri|format/i);
});

test("unknown format handling does not silently weaken validation", () => {
  assert.throws(
    () =>
      createStrictAjv2020().compile({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "string",
        format: "cmip-unknown-format",
      }),
    /unknown format/,
  );
});

test("canonical CMIP sample passes", () => {
  expectValid(mutableSample());
});

test("existing directional sample still passes with abstention null", () => {
  const report = mutableSample();
  assert.equal(report.cmip_report.decision.abstention, null);
  expectValid(report);
});

test("valid abstain with null score passes", () => {
  expectValid(validAbstentionReport(["insufficient_data"], null));
});

test("valid abstain with numeric score and explicit separate conflict passes", () => {
  const report = validAbstentionReport(["unresolved_primary_source_conflict"], 61);
  report.cmip_report.decision.abstention!.plain_language_reason =
    "A directional score was calculable, but unresolved primary-source conflict blocks publication of a directional posture.";
  report.cmip_report.decision.abstention!.blocking_conditions = ["Primary liquidity sources conflict on the same cutoff window."];
  expectValid(report);
});

test("abstain without abstention object fails", () => {
  const report = validAbstentionReport(["insufficient_data"], null);
  report.cmip_report.decision.abstention = null;
  expectInvalid(report, "$.cmip_report.decision.abstention", /posture=abstain requires/);
});

test("directional posture with abstention object fails", () => {
  const report = validAbstentionReport(["insufficient_data"], null);
  report.cmip_report.decision.posture = "maintain_risk";
  report.cmip_report.decision.score = 61;
  expectInvalid(report, "$.cmip_report.decision.abstention", /Non-abstain decisions require abstention=null/);
});

test("directional posture with null score fails", () => {
  const report = mutableSample();
  report.cmip_report.decision.score = null;
  expectInvalid(report, "$.cmip_report.decision.score", /Non-abstain decisions require a numeric score/);
});

test("abstain with empty reason codes fails", () => {
  const report = validAbstentionReport(["insufficient_data"], null);
  report.cmip_report.decision.abstention!.reason_codes = [];
  expectInvalid(report, "$.cmip_report.decision.abstention.reason_codes", /fewer than|must not be empty/i);
});

test("abstain with unsupported reason code fails", () => {
  const report = validAbstentionReport(["insufficient_data"], null);
  report.cmip_report.decision.abstention!.reason_codes = ["unsupported_reason" as CmipAbstentionReasonCode];
  expectInvalid(report, "$.cmip_report.decision.abstention.reason_codes[0]", /supported CMIP contract enum|enum/i);
});

test("abstain using schema_invalid fails", () => {
  const report = validAbstentionReport(["insufficient_data"], null);
  report.cmip_report.decision.abstention!.reason_codes = ["schema_invalid" as CmipAbstentionReasonCode];
  expectInvalid(report, "$.cmip_report.decision.abstention.reason_codes[0]", /supported CMIP contract enum|enum/i);
});

test("abstain with empty required evidence fails", () => {
  const report = validAbstentionReport(["insufficient_data"], null);
  report.cmip_report.decision.abstention!.required_evidence_to_resume = [];
  expectInvalid(report, "$.cmip_report.decision.abstention.required_evidence_to_resume", /fewer than|must not be empty/i);
});

test("abstain with numeric score and no separate blocking conflict fails", () => {
  const report = validAbstentionReport(["insufficient_data"], 61);
  expectInvalid(report, "$.cmip_report.decision.abstention.reason_codes", /numeric score must explain a separate material blocking condition/);
});

test("coin array order does not affect validity", () => {
  const report = mutableSample();
  report.cmip_report.coins.reverse();
  expectValid(report);
});

test("valid null price for a conflicted asset passes when score is also null", () => {
  const report = mutableSample();
  const btc = findCoin(report, "BTC");
  btc.identity_status = "conflict";
  btc.price = null;
  btc.score = null;
  expectValid(report);
});

test("scenario with null probability and insufficient_data passes", () => {
  const report = mutableSample();
  report.cmip_report.scenarios[0].probability = null;
  report.cmip_report.scenarios[0].calibration_status = "insufficient_data";
  expectValid(report);
});

test("missing decision fails", () => {
  const report = mutableSample();
  delete (report.cmip_report as Partial<typeof report.cmip_report>).decision;
  expectInvalid(report, "$.cmip_report.decision", /Missing required property: decision/);
});

test("missing audit fails", () => {
  const report = mutableSample();
  delete (report.cmip_report as Partial<typeof report.cmip_report>).audit;
  expectInvalid(report, "$.cmip_report.audit", /Missing required property: audit/);
});

test("unknown root-level property fails", () => {
  const report = mutableSample() as MutableReportEnvelope & { unexpected_root?: boolean };
  report.unexpected_root = true;
  expectInvalid(report, "$.unexpected_root", /Unknown property is not allowed: unexpected_root/);
});

test("fewer than ten coin records fails", () => {
  const report = mutableSample();
  report.cmip_report.coins.pop();
  expectInvalid(report, "$.cmip_report.coins", /fewer than|should NOT have fewer|Expected exactly 10/i);
});

test("more than ten coin records fails", () => {
  const report = mutableSample();
  report.cmip_report.coins.push(structuredClone(report.cmip_report.coins[0]));
  expectInvalid(report, "$.cmip_report.coins", /more than|should NOT have more|Expected exactly 10/i);
});

test("missing TON fails", () => {
  const report = mutableSample();
  findCoin(report, "TON").symbol = "BTC";
  expectInvalid(report, "$.cmip_report.coins", /Missing required CMIP asset symbol: TON/);
});

test("duplicate BTC fails", () => {
  const report = mutableSample();
  findCoin(report, "ETH").symbol = "BTC";
  expectInvalid(report, "$.cmip_report.coins", /Duplicate CMIP asset symbol BTC/);
});

test("unsupported symbol fails", () => {
  const report = mutableSample();
  report.cmip_report.coins[0].symbol = "NOT" as CmipAssetSymbol;
  expectInvalid(report, "$.cmip_report.coins[0].symbol", /supported CMIP contract enum|enum/i);
});

test("score above 100 fails", () => {
  const report = mutableSample();
  report.cmip_report.coins[0].score = 101;
  expectInvalid(report, "$.cmip_report.coins[0].score", /100|maximum/);
});

test("negative price fails", () => {
  const report = mutableSample();
  report.cmip_report.coins[0].price = -1;
  expectInvalid(report, "$.cmip_report.coins[0].price", /0|minimum/);
});

test("confidence above 100 fails", () => {
  const report = mutableSample();
  report.cmip_report.confidence.final = 101;
  expectInvalid(report, "$.cmip_report.confidence.final", /100|maximum/);
});

test("invalid decision posture fails", () => {
  const report = mutableSample();
  report.cmip_report.decision.posture = "buy" as CmipDecisionPosture;
  expectInvalid(report, "$.cmip_report.decision.posture", /supported CMIP contract enum|enum/i);
});

test("invalid evidence verdict fails", () => {
  const report = mutableSample();
  report.cmip_report.reasons[0].evidence_verdict = "validated" as CmipEvidenceVerdict;
  expectInvalid(report, "$.cmip_report.reasons[0].evidence_verdict", /supported CMIP contract enum|enum/i);
});

test("unsupported chart type fails", () => {
  const report = mutableSample();
  report.cmip_report.charts[0].type = "pie" as CmipChartType;
  expectInvalid(report, "$.cmip_report.charts[0].type", /supported CMIP contract enum|enum/i);
});

test("missing chart source reference fails", () => {
  const report = mutableSample();
  report.cmip_report.charts[0].source_refs = [];
  expectInvalid(report, "$.cmip_report.charts[0].source_refs", /fewer than|should NOT have fewer/i);
});

test("source reference not found in audit fails", () => {
  const report = mutableSample();
  report.cmip_report.charts[0].source_refs = ["src-does-not-exist"];
  expectInvalid(report, "$.cmip_report.charts[0].source_refs[0]", /does not exist in audit\.sources/);
});

test("duplicate audit source reference ID fails", () => {
  const report = mutableSample();
  report.cmip_report.audit.sources[1].ref = report.cmip_report.audit.sources[0].ref;
  expectInvalid(report, "$.cmip_report.audit.sources", /Duplicate audit source ref/);
});

test("conflicted asset with non-null price fails", () => {
  const report = mutableSample();
  const ton = findCoin(report, "TON");
  ton.price = 5;
  expectInvalid(report, "$.cmip_report.coins[7].price", /identity_status=conflict, so price must be null/);
});

test("conflicted asset with non-null score fails when no verified fallback contract exists", () => {
  const report = mutableSample();
  const ton = findCoin(report, "TON");
  ton.score = 25;
  expectInvalid(report, "$.cmip_report.coins[7].score", /no verified fallback-source contract exists/);
});

test("unavailable asset with non-null price fails", () => {
  const report = mutableSample();
  const btc = findCoin(report, "BTC");
  btc.identity_status = "unavailable" as CmipIdentityStatus;
  btc.score = null;
  btc.price = 1;
  expectInvalid(report, "$.cmip_report.coins[0].price", /identity_status=unavailable, so price must be null/);
});

test("prototype scenario with incompatible calibration status fails", () => {
  const report = mutableSample();
  report.cmip_report.scenarios[0].probability = null;
  report.cmip_report.scenarios[0].calibration_status = "prototype" as CmipScenarioCalibrationStatus;
  expectInvalid(report, "$.cmip_report.scenarios[0].calibration_status", /probability=null must use calibration_status=insufficient_data/);
});

test("statistical historical claim with null sample size fails", () => {
  const report = mutableSample();
  report.cmip_report.reasons[0].historical_evidence.sample_size = null;
  expectInvalid(report, "$.cmip_report.reasons[0].historical_evidence.result.success_rate", /success_rate must be null when sample_size is null/);
});

test("NaN numerical values fail closed", () => {
  const report = mutableSample();
  report.cmip_report.decision.score = Number.NaN;
  expectInvalid(report, "$.cmip_report.decision.score", /Non-finite numbers/);
});

test("Infinity numerical values fail closed", () => {
  const report = mutableSample();
  report.cmip_report.coins[0].price = Number.POSITIVE_INFINITY;
  expectInvalid(report, "$.cmip_report.coins[0].price", /Non-finite numbers/);
});

test("numeric strings where numbers are required fail", () => {
  const report = mutableSample();
  report.cmip_report.decision.score = "61" as unknown as number;
  expectInvalid(report, "$.cmip_report.decision.score", /number/);
});
