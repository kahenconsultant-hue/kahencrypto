export interface CmipGeminiSectionProviderErrorDetails {
  readonly sectionId: string;
  readonly httpStatus: number | null;
  readonly providerErrorCode: string | null;
  readonly providerErrorStatus: string | null;
  readonly fieldViolationPaths: readonly string[];
  readonly badRequestDetailTypes: readonly string[];
  readonly requestStage: "provider_execute";
  readonly providerSchemaHash: string;
  readonly requestShapeHash: string;
  readonly safeMessage: string;
}

export function extractCmipGeminiSectionProviderErrorDetails(params: {
  readonly error: unknown;
  readonly sectionId: string;
  readonly providerSchemaHash: string;
  readonly requestShapeHash: string;
}): CmipGeminiSectionProviderErrorDetails {
  const record = isRecord(params.error) ? params.error : {};
  const cause = isRecord(record.cause) ? record.cause : {};
  const httpStatus = firstNumber(record, cause, ["status", "statusCode", "code"]);
  const providerErrorCode = firstString(record, cause, ["code", "errorCode"]);
  const providerErrorStatus = firstString(record, cause, ["status", "errorStatus"]);
  const fieldViolationPaths = collectFieldViolations(params.error);
  const badRequestDetailTypes = collectBadRequestDetailTypes(params.error);
  const rawMessage = params.error instanceof Error ? params.error.message : firstString(record, cause, ["message"]) ?? "Gemini section provider failed.";
  const safeBase = redactSecretLikeText(rawMessage);
  return {
    sectionId: params.sectionId,
    httpStatus,
    providerErrorCode,
    providerErrorStatus,
    fieldViolationPaths,
    badRequestDetailTypes,
    requestStage: "provider_execute",
    providerSchemaHash: params.providerSchemaHash,
    requestShapeHash: params.requestShapeHash,
    safeMessage: [
      safeBase,
      `http_status=${httpStatus ?? "unavailable"}`,
      `provider_code=${providerErrorCode ?? "unavailable"}`,
      `provider_status=${providerErrorStatus ?? "unavailable"}`,
      `field_violations=${fieldViolationPaths.length ? fieldViolationPaths.join(",") : "none"}`,
      `bad_request_detail_types=${badRequestDetailTypes.length ? badRequestDetailTypes.join(",") : "none"}`,
      `provider_schema_hash=${params.providerSchemaHash}`,
      `request_shape_hash=${params.requestShapeHash}`,
    ].join(" | "),
  };
}

export function redactSecretLikeText(value: string): string {
  return value
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[REDACTED:GEMINI_API_KEY]")
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, "[REDACTED:OPENAI_API_KEY]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED:TOKEN]")
    .replace(/Authorization:\s*[^\s]+/gi, "Authorization: [REDACTED]");
}

function collectFieldViolations(value: unknown): readonly string[] {
  const paths = new Set<string>();
  visit(value, (item) => {
    if (!isRecord(item)) return;
    const field = typeof item.field === "string" ? item.field : typeof item.fieldPath === "string" ? item.fieldPath : null;
    if (field) paths.add(field);
    const fieldViolations = item.fieldViolations;
    if (Array.isArray(fieldViolations)) {
      fieldViolations.forEach((violation) => {
        if (isRecord(violation) && typeof violation.field === "string") paths.add(violation.field);
      });
    }
  });
  return [...paths].sort();
}

function collectBadRequestDetailTypes(value: unknown): readonly string[] {
  const types = new Set<string>();
  visit(value, (item) => {
    if (!isRecord(item)) return;
    const type = item["@type"];
    if (typeof type === "string" && /badrequest/i.test(type)) types.add(type);
  });
  return [...types].sort();
}

function firstNumber(a: Record<string, unknown>, b: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    if (typeof a[key] === "number") return a[key];
    if (typeof b[key] === "number") return b[key];
  }
  return null;
}

function firstString(a: Record<string, unknown>, b: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    if (typeof a[key] === "string") return a[key];
    if (typeof b[key] === "string") return b[key];
  }
  return null;
}

function visit(value: unknown, fn: (value: unknown) => void, seen = new WeakSet<object>()): void {
  fn(value);
  if (typeof value !== "object" || value === null) return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) => visit(item, fn, seen));
    return;
  }
  Object.values(value).forEach((child) => visit(child, fn, seen));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
