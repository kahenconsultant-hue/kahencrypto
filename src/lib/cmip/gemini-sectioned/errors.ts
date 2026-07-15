import type { CmipProviderIssue } from "../providers";
import type { CmipGeminiSectionIssue, CmipGeminiSectionIssueCode } from "./types";

export class CmipGeminiSectionedAssemblyError extends Error {
  constructor(readonly issues: readonly CmipGeminiSectionIssue[]) {
    super(issues[0]?.message ?? "Gemini section assembly failed.");
  }
}

export function cmipGeminiSectionIssue(params: {
  readonly code: CmipGeminiSectionIssueCode | string;
  readonly path: string;
  readonly message: string;
  readonly severity: CmipGeminiSectionIssue["severity"];
  readonly retryable?: boolean;
  readonly sourceRefs?: readonly string[];
}): CmipGeminiSectionIssue {
  return {
    code: params.code,
    path: params.path,
    message: params.message,
    domain: "gemini",
    severity: params.severity,
    retryable: params.retryable ?? false,
    sourceRefs: params.sourceRefs ?? [],
  };
}

export function toProviderIssue(issue: CmipGeminiSectionIssue): CmipProviderIssue {
  return { ...issue, domain: "gemini" };
}

export function dedupeGeminiSectionIssues<T extends CmipGeminiSectionIssue>(issues: readonly T[]): readonly T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const issue of issues) {
    const key = JSON.stringify({ code: issue.code, path: issue.path, message: issue.message, sourceRefs: [...issue.sourceRefs].sort() });
    if (!seen.has(key)) {
      seen.add(key);
      result.push(issue);
    }
  }
  return result;
}
