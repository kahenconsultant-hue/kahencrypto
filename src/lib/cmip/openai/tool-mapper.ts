import type { CmipToolPolicy } from "../model-package";
import { cmipOpenAiIssue } from "./errors";
import type { CmipOpenAiIssue } from "./errors";
import type { CmipOpenAiMappedTool, CmipOpenAiModelCapabilities, CmipOpenAiToolChoice } from "./types";

export function mapCmipOpenAiTools(params: {
  readonly toolPolicy: CmipToolPolicy;
  readonly enableWebSearch: boolean;
  readonly capabilities: CmipOpenAiModelCapabilities;
}): {
  readonly tools: readonly CmipOpenAiMappedTool[];
  readonly toolChoice: CmipOpenAiToolChoice;
  readonly warnings: readonly CmipOpenAiIssue[];
} {
  const warnings: CmipOpenAiIssue[] = [];
  if (params.toolPolicy.webSearch.mode === "disabled") {
    return { tools: [], toolChoice: "none", warnings };
  }
  if (!params.enableWebSearch) {
    warnings.push(cmipOpenAiIssue({
      code: "OPENAI_WEB_SEARCH_DISABLED_BY_ENV",
      path: "$.env.CMIP_OPENAI_ENABLE_WEB_SEARCH",
      message: "Web search is not enabled for this execution environment.",
      severity: "warning",
    }));
    return { tools: [], toolChoice: "none", warnings };
  }
  if (!params.capabilities.webSearch) {
    warnings.push(cmipOpenAiIssue({
      code: "OPENAI_WEB_SEARCH_UNSUPPORTED_BY_MODEL",
      path: "$.model.capabilities.webSearch",
      message: "The resolved model profile does not advertise web-search capability.",
      severity: "warning",
    }));
    return { tools: [], toolChoice: "none", warnings };
  }
  return {
    tools: [{ type: "web_search", search_context_size: "low" }],
    toolChoice: "auto",
    warnings,
  };
}
