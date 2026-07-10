import OpenAI from "openai";
import type { CmipOpenAiEnvConfig } from "./types";

export function createCmipOpenAiClient(config: CmipOpenAiEnvConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    organization: config.organizationId ?? undefined,
    project: config.projectId ?? undefined,
  });
}
