import type { CmipGeminiEnvConfig } from "../gemini/types";
import { CMIP_GEMINI_SECTION_ORDER, CMIP_GEMINI_SECTION_THINKING_POLICY_VERSION } from "./constants";
import type { CmipGeminiSectionId } from "./types";

export type CmipGeminiThinkingLevel = "minimal" | "low" | "medium" | "high";
export type CmipGeminiApprovedSectionThinkingLevel = Extract<CmipGeminiThinkingLevel, "minimal" | "low">;

export interface CmipGeminiSectionThinkingPolicy {
  readonly sectionId: CmipGeminiSectionId;
  readonly configuredThinkingLevel: CmipGeminiApprovedSectionThinkingLevel;
  readonly policyVersion: typeof CMIP_GEMINI_SECTION_THINKING_POLICY_VERSION;
}

export interface CmipGeminiSectionThinkingTrace extends CmipGeminiSectionThinkingPolicy {
  readonly effectiveThinkingLevel: CmipGeminiApprovedSectionThinkingLevel;
  readonly environmentCap: CmipGeminiApprovedSectionThinkingLevel | null;
}

export const CMIP_GEMINI_SUPPORTED_THINKING_LEVELS = ["minimal", "low", "medium", "high"] as const satisfies readonly CmipGeminiThinkingLevel[];
export const CMIP_GEMINI_APPROVED_SECTION_THINKING_LEVELS = ["minimal", "low"] as const satisfies readonly CmipGeminiApprovedSectionThinkingLevel[];

export const CMIP_GEMINI_SECTION_THINKING_POLICIES: readonly CmipGeminiSectionThinkingPolicy[] = [
  { sectionId: "meta_decision", configuredThinkingLevel: "minimal", policyVersion: CMIP_GEMINI_SECTION_THINKING_POLICY_VERSION },
  { sectionId: "engines_reasons", configuredThinkingLevel: "low", policyVersion: CMIP_GEMINI_SECTION_THINKING_POLICY_VERSION },
  { sectionId: "delta_attribution", configuredThinkingLevel: "minimal", policyVersion: CMIP_GEMINI_SECTION_THINKING_POLICY_VERSION },
  { sectionId: "scenarios_triggers", configuredThinkingLevel: "low", policyVersion: CMIP_GEMINI_SECTION_THINKING_POLICY_VERSION },
  { sectionId: "coins", configuredThinkingLevel: "minimal", policyVersion: CMIP_GEMINI_SECTION_THINKING_POLICY_VERSION },
  { sectionId: "confidence_memory", configuredThinkingLevel: "minimal", policyVersion: CMIP_GEMINI_SECTION_THINKING_POLICY_VERSION },
  { sectionId: "charts_audit", configuredThinkingLevel: "minimal", policyVersion: CMIP_GEMINI_SECTION_THINKING_POLICY_VERSION },
] as const;

export function getCmipGeminiSectionThinkingPolicy(sectionId: CmipGeminiSectionId): CmipGeminiSectionThinkingPolicy {
  const policy = CMIP_GEMINI_SECTION_THINKING_POLICIES.find((item) => item.sectionId === sectionId);
  if (!policy) throw new Error(`Unknown Gemini section thinking policy: ${sectionId}`);
  return policy;
}

export function getCmipGeminiSectionThinkingTrace(sectionId: CmipGeminiSectionId, config: Pick<CmipGeminiEnvConfig, "maxThinkingLevel">): CmipGeminiSectionThinkingTrace {
  const policy = getCmipGeminiSectionThinkingPolicy(sectionId);
  return {
    ...policy,
    effectiveThinkingLevel: effectiveThinkingLevel(policy.configuredThinkingLevel, config.maxThinkingLevel),
    environmentCap: config.maxThinkingLevel,
  };
}

export function assertCmipGeminiSectionThinkingPolicyComplete(): boolean {
  return CMIP_GEMINI_SECTION_ORDER.every((sectionId) => getCmipGeminiSectionThinkingPolicy(sectionId).sectionId === sectionId);
}

function effectiveThinkingLevel(
  configured: CmipGeminiApprovedSectionThinkingLevel,
  cap: CmipGeminiApprovedSectionThinkingLevel | null,
): CmipGeminiApprovedSectionThinkingLevel {
  if (cap === "minimal") return "minimal";
  return configured;
}
