import { cmipNormalizationIssue } from "./errors";
import { normalizationFail, normalizationOk, type CmipNormalizationResult } from "./result";
import type { CmipRawTimestamp } from "./types";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const INTRADAY_WITHOUT_ZONE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/;
const EXPLICIT_TIMEZONE_PATTERN = /(Z|[+-]\d{2}:\d{2})$/i;
const UNIX_MILLISECONDS_MINIMUM = 1_000_000_000_000;

export interface NormalizeTimestampOptions {
  readonly path: string;
  readonly domain: string;
  readonly allowDateOnly?: boolean;
  readonly referenceTimestamp?: string;
  readonly futureToleranceSeconds?: number;
}

export function normalizeTimestamp(value: CmipRawTimestamp, options: NormalizeTimestampOptions): CmipNormalizationResult<string> {
  if (value === null || value === undefined || value === "") {
    return normalizationFail([
      cmipNormalizationIssue({
        code: "INVALID_TIMESTAMP",
        path: options.path,
        domain: options.domain,
        message: "Timestamp is required.",
        severity: "error",
      }),
    ]);
  }

  let date: Date;
  if (value instanceof Date) {
    date = new Date(value.getTime());
  } else if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return normalizationFail([
        cmipNormalizationIssue({
          code: "NON_FINITE_NUMBER",
          path: options.path,
          domain: options.domain,
          message: "Unix timestamp must be finite.",
          severity: "error",
        }),
      ]);
    }
    const milliseconds = Math.abs(value) < UNIX_MILLISECONDS_MINIMUM ? value * 1000 : value;
    date = new Date(milliseconds);
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (DATE_ONLY_PATTERN.test(trimmed) && !options.allowDateOnly) {
      return normalizationFail([
        cmipNormalizationIssue({
          code: "INVALID_TIMESTAMP",
          path: options.path,
          domain: options.domain,
          message: "Date-only strings are ambiguous for intraday normalization.",
          severity: "error",
        }),
      ]);
    }
    if (INTRADAY_WITHOUT_ZONE_PATTERN.test(trimmed) || (trimmed.includes("T") && !EXPLICIT_TIMEZONE_PATTERN.test(trimmed))) {
      return normalizationFail([
        cmipNormalizationIssue({
          code: "INVALID_TIMESTAMP",
          path: options.path,
          domain: options.domain,
          message: "Intraday timestamps must include an explicit timezone.",
          severity: "error",
        }),
      ]);
    }
    date = new Date(trimmed);
  } else {
    return normalizationFail([
      cmipNormalizationIssue({
        code: "INVALID_TIMESTAMP",
        path: options.path,
        domain: options.domain,
        message: "Unsupported timestamp value.",
        severity: "error",
      }),
    ]);
  }

  const time = date.getTime();
  if (!Number.isFinite(time)) {
    return normalizationFail([
      cmipNormalizationIssue({
        code: "INVALID_TIMESTAMP",
        path: options.path,
        domain: options.domain,
        message: "Timestamp could not be parsed.",
        severity: "error",
      }),
    ]);
  }

  const iso = date.toISOString();
  if (options.referenceTimestamp) {
    const referenceTime = Date.parse(options.referenceTimestamp);
    const toleranceMs = (options.futureToleranceSeconds ?? 0) * 1000;
    if (Number.isFinite(referenceTime) && time > referenceTime + toleranceMs) {
      return normalizationFail([
        cmipNormalizationIssue({
          code: "FUTURE_TIMESTAMP",
          path: options.path,
          domain: options.domain,
          message: "Timestamp is beyond the approved future tolerance.",
          severity: "error",
        }),
      ]);
    }
  }

  return normalizationOk(iso);
}
