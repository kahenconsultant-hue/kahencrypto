import { CMIP_OUTPUT_SCHEMA_VERSION } from "../contracts/constants";
import type { CmipModelExecutionPackage } from "../model-package";
import type { CmipGeminiEnvConfig, CmipGeminiMappedRequest, CmipGeminiResolvedModelProfile, CmipGeminiSchemaCompatibilityResult } from "./types";
import { mapCmipGeminiTools } from "./source-policy";

export function mapCmipPackageToGeminiInteractionRequest(params: {
  readonly modelPackage: CmipModelExecutionPackage;
  readonly config: CmipGeminiEnvConfig;
  readonly model: CmipGeminiResolvedModelProfile;
  readonly providerSchema: Record<string, unknown>;
  readonly schemaCompatibility: CmipGeminiSchemaCompatibilityResult;
  readonly executionMode: "dry_run" | "preview" | "live_smoke";
}): {
  readonly body: CmipGeminiMappedRequest;
  readonly schemaCompatibility: CmipGeminiSchemaCompatibilityResult;
  readonly warnings: ReturnType<typeof mapCmipGeminiTools>["warnings"];
  readonly googleSearchEnabled: boolean;
} {
  const [system, intelligence, outputContract, runtime] = params.modelPackage.messages;
  const trustedDeveloperContext = [
    "<CMIP_TRUSTED_INTELLIGENCE_CONTEXT>",
    intelligence?.content ?? "",
    "</CMIP_TRUSTED_INTELLIGENCE_CONTEXT>",
    "<CMIP_OUTPUT_CONTRACT_RULES>",
    outputContract?.content ?? "",
    `Canonical schema version: ${CMIP_OUTPUT_SCHEMA_VERSION}`,
    "</CMIP_OUTPUT_CONTRACT_RULES>",
  ].join("\n");

  const runtimeContext = [
    trustedDeveloperContext,
    "<CMIP_RUNTIME_CONTEXT>",
    runtime?.content ?? "",
    "</CMIP_RUNTIME_CONTEXT>",
  ].join("\n");

  const tools = mapCmipGeminiTools({
    toolPolicy: params.modelPackage.toolPolicy,
    enableGoogleSearch: params.config.enableGoogleSearch,
    capabilities: params.model,
    executionMode: params.executionMode,
  });

  const maxOutputTokens = Math.min(params.modelPackage.executionConfig.maxOutputTokens, params.config.maxOutputTokens);
  const body: CmipGeminiMappedRequest = {
    model: params.model.modelId,
    input: runtimeContext,
    system_instruction: system?.content ?? "",
    store: false,
    stream: false,
    background: false,
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: params.providerSchema,
    },
    generation_config: {
      max_output_tokens: maxOutputTokens,
    },
    labels: {
      cmip_execution_id: params.modelPackage.executionId.slice(0, 63),
      cmip_package_id: params.modelPackage.packageId.slice(0, 63),
      cmip_semantic_hash: params.modelPackage.integrity.semanticPackageHash.slice(0, 63),
    },
  };

  if (params.config.thinkingLevel && params.model.supportsThinkingConfig) {
    Object.assign(body.generation_config, { thinking_config: { thinking_level: params.config.thinkingLevel, include_thoughts: false } });
  }
  if (tools.tools.length) {
    Object.assign(body, { tools: tools.tools });
  }

  return { body, schemaCompatibility: params.schemaCompatibility, warnings: tools.warnings, googleSearchEnabled: tools.enabled };
}
