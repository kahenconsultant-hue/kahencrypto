import { cmipModelPackageIssue } from "./errors";

export class CmipStableSerializationError extends Error {
  readonly issue = cmipModelPackageIssue({
    code: "NON_CANONICAL_VALUE",
    path: "$",
    message: "Value cannot be represented in canonical CMIP JSON.",
    severity: "error",
  });
}

export function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return serialize(value, "$", seen);
}

export function stableJsonClone<T>(value: T): T {
  return JSON.parse(stableStringify(value)) as T;
}

export function stableStringifyPretty(value: unknown): string {
  return JSON.stringify(JSON.parse(stableStringify(value)), null, 2);
}

function serialize(value: unknown, path: string, seen: WeakSet<object>): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new CmipStableSerializationError(`${path}: non-finite numbers are not canonical JSON.`);
    return JSON.stringify(value);
  }
  if (typeof value === "bigint") throw new CmipStableSerializationError(`${path}: BigInt is not canonical JSON.`);
  if (typeof value === "function") throw new CmipStableSerializationError(`${path}: functions are not canonical JSON.`);
  if (typeof value === "symbol") throw new CmipStableSerializationError(`${path}: symbols are not canonical JSON.`);
  if (value === undefined) throw new CmipStableSerializationError(`${path}: undefined is not canonical JSON.`);
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new CmipStableSerializationError(`${path}: circular reference.`);
    seen.add(value);
    const serialized = `[${value.map((item, index) => serialize(item, `${path}[${index}]`, seen)).join(",")}]`;
    seen.delete(value);
    return serialized;
  }
  if (typeof value === "object") {
    if (seen.has(value)) throw new CmipStableSerializationError(`${path}: circular reference.`);
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new CmipStableSerializationError(`${path}: only plain objects are canonical JSON.`);
    }
    seen.add(value);
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${serialize(record[key], appendPath(path, key), seen)}`);
    seen.delete(value);
    return `{${entries.join(",")}}`;
  }
  throw new CmipStableSerializationError(`${path}: unsupported canonical JSON value.`);
}

function appendPath(path: string, key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}
