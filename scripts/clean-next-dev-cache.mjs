import { rm } from "node:fs/promises";
import { existsSync } from "node:fs";

const nextDir = ".next";

if (process.env.CMIP_SKIP_NEXT_CLEAN === "1") {
  process.exit(0);
}

if (existsSync(nextDir)) {
  await rm(nextDir, { force: true, recursive: true });
}
