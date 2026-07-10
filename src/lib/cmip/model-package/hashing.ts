import { createHash } from "node:crypto";
import { stableStringify } from "./stable-json";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function hashCanonicalJson(input: unknown): string {
  return sha256Hex(stableStringify(input));
}

export function isSha256Hex(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}
