import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  CMIP_DECISION_POSTURES,
  CMIP_EVIDENCE_VERDICTS,
  CMIP_REQUIRED_ASSET_SYMBOLS,
} from "../src/lib/cmip/contracts/constants";
import { CMIP_RUNTIME_HORIZONS } from "../src/lib/cmip/runtime-input/constants";
import * as intelligenceSpec from "../src/lib/cmip/intelligence-spec";

const docFiles = [
  "README.md",
  "decision-philosophy.md",
  "principles.md",
  "reasoning-pipeline.md",
  "evidence-model.md",
  "evidence-quality-model.md",
  "conflict-resolution-model.md",
  "hypothesis-engine.md",
  "historical-evidence-model.md",
  "analogy-model.md",
  "decision-memory-model.md",
  "decision-model.md",
  "scenario-model.md",
  "invalidation-model.md",
  "confidence-model.md",
  "audit-model.md",
  "explanation-model.md",
  "user-experience-model.md",
  "failure-and-abstention-model.md",
  "governance-and-versioning.md",
  "glossary.md",
] as const;

const specDir = join(process.cwd(), "src/lib/cmip/intelligence-spec");

test("specification version is exported", () => {
  assert.equal(intelligenceSpec.CMIP_INTELLIGENCE_SPEC_VERSION, "CMIP-INTELLIGENCE-SPEC-1.0");
});

test("decision posture values are compatible with Task 001", () => {
  for (const posture of CMIP_DECISION_POSTURES) {
    assert.ok(intelligenceSpec.CMIP_INTELLIGENCE_DECISION_POSTURES.includes(posture));
  }
  assert.deepEqual(intelligenceSpec.CMIP_INTELLIGENCE_OUTPUT_POSTURES, CMIP_DECISION_POSTURES);
  assert.deepEqual(intelligenceSpec.CMIP_INTELLIGENCE_DECISION_POSTURES, CMIP_DECISION_POSTURES);
  assert.equal(intelligenceSpec.CMIP_INTELLIGENCE_DECISION_POSTURES.includes("abstain"), true);
});

test("historical verdict values are compatible with Task 001", () => {
  assert.deepEqual(intelligenceSpec.CMIP_INTELLIGENCE_HISTORICAL_VERDICTS, CMIP_EVIDENCE_VERDICTS);
});

test("scenario horizons are compatible with Task 002", () => {
  for (const horizon of intelligenceSpec.CMIP_INTELLIGENCE_SCENARIO_HORIZONS) {
    assert.ok(CMIP_RUNTIME_HORIZONS.includes(horizon));
  }
});

test("evidence domains contain all required domains", () => {
  const requiredDomains = [
    "macro",
    "liquidity",
    "institutional_flow",
    "market_structure",
    "momentum",
    "derivatives",
    "options",
    "cross_asset",
    "breadth",
    "news_geopolitical",
    "historical_evidence",
    "previous_decision",
    "data_quality",
  ] as const;
  for (const domain of requiredDomains) {
    assert.ok(intelligenceSpec.CMIP_EVIDENCE_DOMAINS.includes(domain));
  }
});

test("no duplicate hypothesis IDs exist", () => {
  assert.equal(new Set(intelligenceSpec.CMIP_HYPOTHESIS_IDS).size, intelligenceSpec.CMIP_HYPOTHESIS_IDS.length);
});

test("no duplicate failure-state IDs exist", () => {
  assert.equal(new Set(intelligenceSpec.CMIP_FAILURE_STATES).size, intelligenceSpec.CMIP_FAILURE_STATES.length);
});

test("canonical ten-asset universe remains unchanged", () => {
  assert.deepEqual(intelligenceSpec.CMIP_INTELLIGENCE_REQUIRED_ASSET_SYMBOLS, CMIP_REQUIRED_ASSET_SYMBOLS);
});

test("intelligence spec exports no executable runtime function", () => {
  for (const [name, value] of Object.entries(intelligenceSpec)) {
    assert.notEqual(typeof value, "function", `${name} must not be an executable runtime function export.`);
  }
});

test("all documentation files exist", () => {
  for (const file of docFiles) {
    assert.ok(existsSync(join(specDir, file)), `${file} should exist in intelligence-spec.`);
  }
});
