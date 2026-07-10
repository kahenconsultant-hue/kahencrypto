import type { CmipRedactionTrace } from "./types";

interface RedactionPattern {
  readonly type: string;
  readonly placeholder: string;
  readonly pattern: RegExp;
}

const REDACTION_PATTERNS: readonly RedactionPattern[] = [
  { type: "openai_api_key", placeholder: "[REDACTED:OPENAI_API_KEY]", pattern: /\bsk-(?:proj|live|test)?-[A-Za-z0-9_-]{20,}\b/g },
  { type: "bearer_token", placeholder: "[REDACTED:BEARER_TOKEN]", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/gi },
  { type: "authorization_header", placeholder: "[REDACTED:AUTHORIZATION_HEADER]", pattern: /\bAuthorization\s*:\s*[^\n\r,}]+/gi },
  { type: "cookie_header", placeholder: "[REDACTED:COOKIE_HEADER]", pattern: /\bCookie\s*:\s*[^\n\r,}]+/gi },
  { type: "generic_api_key", placeholder: "[REDACTED:API_KEY]", pattern: /\b(?:api[_-]?key|x-api-key)\s*[:=]\s*[A-Za-z0-9._~+/=-]{16,}/gi },
  { type: "private_key", placeholder: "[REDACTED:PRIVATE_KEY]", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { type: "database_connection_string", placeholder: "[REDACTED:DATABASE_URL]", pattern: /\b(?:postgres|postgresql|mysql):\/\/[^\s"'<>]+/gi },
  { type: "supabase_service_role_jwt", placeholder: "[REDACTED:SUPABASE_SERVICE_ROLE_JWT]", pattern: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g },
];

export function redactSecrets<T>(input: T): { readonly data: T; readonly redactions: readonly CmipRedactionTrace[] } {
  const redactions: CmipRedactionTrace[] = [];
  const data = redactValue(input, "$", redactions) as T;
  return { data, redactions };
}

function redactValue(value: unknown, path: string, redactions: CmipRedactionTrace[]): unknown {
  if (typeof value === "string") {
    let redacted = value;
    for (const pattern of REDACTION_PATTERNS) {
      if (pattern.pattern.test(redacted)) {
        pattern.pattern.lastIndex = 0;
        redacted = redacted.replace(pattern.pattern, pattern.placeholder);
        redactions.push({ path, redactionType: pattern.type, placeholder: pattern.placeholder });
      }
      pattern.pattern.lastIndex = 0;
    }
    return redacted;
  }
  if (Array.isArray(value)) return value.map((item, index) => redactValue(item, `${path}[${index}]`, redactions));
  if (isRecord(value)) {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey === "authorization" || lowerKey === "cookie" || lowerKey === "set-cookie") {
        output[key] = lowerKey === "cookie" || lowerKey === "set-cookie" ? "[REDACTED:COOKIE_HEADER]" : "[REDACTED:AUTHORIZATION_HEADER]";
        redactions.push({ path: appendPath(path, key), redactionType: lowerKey, placeholder: output[key] as string });
      } else {
        output[key] = redactValue(item, appendPath(path, key), redactions);
      }
    }
    return output;
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function appendPath(path: string, key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}
