import type { CmipModelExecutionPackage } from "./types";
import { stableStringify } from "./stable-json";

export function serializeCmipModelExecutionPackage(modelPackage: CmipModelExecutionPackage): string {
  return stableStringify(modelPackage);
}
