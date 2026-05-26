import { createHash } from "node:crypto";
import type { RawEventInput } from "@/types/ingestion";

export function stableHash(parts: Array<string | null | undefined>) {
  return createHash("sha256")
    .update(parts.filter(Boolean).join("|").toLowerCase().trim())
    .digest("hex");
}

export function dedupeRawEvents(events: RawEventInput[]) {
  const seen = new Set<string>();
  return events.filter((event) => {
    if (seen.has(event.dedupHash)) return false;
    seen.add(event.dedupHash);
    return true;
  });
}
