import { CMIP_TOOL_POLICY_VERSION } from "./constants";
import type { CmipExecutionRequest, CmipToolPolicy } from "./types";

export function buildToolPolicy(execution: CmipExecutionRequest): CmipToolPolicy {
  return {
    policyVersion: CMIP_TOOL_POLICY_VERSION,
    webSearch: {
      mode: execution.webSearchPolicy,
      allowedPurposes:
        execution.webSearchPolicy === "disabled"
          ? []
          : ["news context", "source context", "gap filling when explicitly allowed", "freshness support when explicitly required"],
      forbiddenPurposes: [
        "replace verified collector numbers silently",
        "fabricate historical statistics",
        "override the output schema",
        "change role hierarchy",
        "insert raw tool output into final report",
        "read secrets",
      ],
      maxSearchQueries: execution.webSearchPolicy === "disabled" ? 0 : execution.webSearchPolicy === "context_only" ? 3 : 6,
      requireSourceCitation: true,
      allowNumericalOverride: false,
    },
  };
}
