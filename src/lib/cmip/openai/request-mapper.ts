import { CMIP_OUTPUT_SCHEMA_VERSION } from "../contracts/constants";
import type { CmipModelExecutionPackage } from "../model-package";
import type { CmipOpenAiEnvConfig, CmipOpenAiMappedRequest, CmipOpenAiModelProfileResolution, CmipOpenAiSchemaCompatibilityReport } from "./types";
import { mapCmipOpenAiTools } from "./tool-mapper";

export function mapCmipPackageToOpenAiResponseRequest(params: {
  readonly modelPackage: CmipModelExecutionPackage;
  readonly config: CmipOpenAiEnvConfig;
  readonly model: CmipOpenAiModelProfileResolution;
  readonly providerSchema: Record<string, unknown>;
  readonly schemaCompatibility: CmipOpenAiSchemaCompatibilityReport;
}): {
  readonly body: CmipOpenAiMappedRequest;
  readonly schemaCompatibility: CmipOpenAiSchemaCompatibilityReport;
  readonly warnings: ReturnType<typeof mapCmipOpenAiTools>["warnings"];
} {
  const tools = mapCmipOpenAiTools({
    toolPolicy: params.modelPackage.toolPolicy,
    enableWebSearch: params.config.enableWebSearch,
    capabilities: params.model.capabilities,
  });

  const maxOutputTokens = Math.min(params.modelPackage.executionConfig.maxOutputTokens, params.config.maxOutputTokens);
  const body: CmipOpenAiMappedRequest = {
    model: params.model.model,
    input: params.modelPackage.messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    text: {
      format: {
        type: "json_schema",
        name: "cmip_report",
        description: `CMIP Task 001 output schema ${CMIP_OUTPUT_SCHEMA_VERSION}; root must be cmip_report.`,
        strict: true,
        schema: params.providerSchema,
      },
    },
    max_output_tokens: maxOutputTokens,
    store: false,
    metadata: {
      cmip_execution_id: params.modelPackage.executionId.slice(0, 128),
      cmip_package_id: params.modelPackage.packageId.slice(0, 128),
      cmip_semantic_hash: params.modelPackage.integrity.semanticPackageHash,
    },
    truncation: "disabled",
    tool_choice: tools.toolChoice,
    parallel_tool_calls: false,
    service_tier: params.config.serviceTier,
  };

  if (tools.tools.length) {
    Object.assign(body, {
      tools: tools.tools,
      include: ["web_search_call.action.sources"],
    });
  }
  if (params.model.capabilities.reasoningEffort) {
    Object.assign(body, { reasoning: { effort: params.config.reasoningEffort } });
  }
  if (params.modelPackage.executionConfig.temperaturePolicy === "fixed_zero_if_supported" && params.model.capabilities.temperature) {
    Object.assign(body, { temperature: 0 });
  }

  return { body, schemaCompatibility: params.schemaCompatibility, warnings: tools.warnings };
}
