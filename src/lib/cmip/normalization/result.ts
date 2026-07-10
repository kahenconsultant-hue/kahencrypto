import type { CmipNormalizationError, CmipNormalizationWarning } from "./errors";

export type CmipNormalizationResult<T> =
  | {
      readonly ok: true;
      readonly data: T;
      readonly warnings: readonly CmipNormalizationWarning[];
      readonly errors: [];
    }
  | {
      readonly ok: false;
      readonly data?: undefined;
      readonly warnings: readonly CmipNormalizationWarning[];
      readonly errors: readonly CmipNormalizationError[];
    };

export function normalizationOk<T>(data: T, warnings: readonly CmipNormalizationWarning[] = []): CmipNormalizationResult<T> {
  return { ok: true, data, warnings: dedupeNormalizationWarnings(warnings), errors: [] };
}

export function normalizationFail<T = never>(
  errors: readonly CmipNormalizationError[],
  warnings: readonly CmipNormalizationWarning[] = [],
): CmipNormalizationResult<T> {
  return { ok: false, warnings: dedupeNormalizationWarnings(warnings), errors };
}

export function splitIssues(issues: readonly (CmipNormalizationError | CmipNormalizationWarning)[]) {
  const errors = issues.filter((issue): issue is CmipNormalizationError => issue.severity === "error" || issue.severity === "critical");
  const warnings = dedupeNormalizationWarnings(issues.filter((issue): issue is CmipNormalizationWarning => issue.severity === "info" || issue.severity === "warning"));
  return { errors, warnings };
}

export function dedupeNormalizationWarnings(warnings: readonly CmipNormalizationWarning[]): readonly CmipNormalizationWarning[] {
  const groups = new Map<string, { warning: CmipNormalizationWarning; affectedPaths: string[] }>();
  for (const warning of warnings) {
    const canonicalPath = canonicalizeWarningPath(warning.path);
    const sourceRefs = [...warning.sourceRefs].sort();
    const key = JSON.stringify({
      code: warning.code,
      canonicalPath,
      domain: warning.domain,
      sourceRefs,
      rootCause: warning.message,
    });
    const existing = groups.get(key);
    if (existing) {
      if (!existing.affectedPaths.includes(warning.path)) existing.affectedPaths.push(warning.path);
      continue;
    }
    groups.set(key, { warning: { ...warning, path: canonicalPath, sourceRefs }, affectedPaths: [warning.path] });
  }

  return Array.from(groups.values()).map(({ warning, affectedPaths }) => {
    const sortedPaths = [...affectedPaths].sort();
    if (sortedPaths.length <= 1) return warning;
    return {
      ...warning,
      occurrenceCount: sortedPaths.length,
      affectedPaths: sortedPaths,
    };
  });
}

function canonicalizeWarningPath(path: string): string {
  return path
    .replace(/\[\d+\]/g, "[]")
    .replace(/\.assets\.(BTC|ETH|USDT|BNB|SOL|XRP|TRX|TON|DOGE|ADA)(?=\.|$)/g, ".assets.{symbol}");
}
