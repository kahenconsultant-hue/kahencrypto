import { NextResponse } from "next/server";
import validFixture from "@/lib/cmip/model-package/fixtures/package-input-valid.json";
import partialFixture from "@/lib/cmip/model-package/fixtures/package-input-partial.json";
import abstainFixture from "@/lib/cmip/model-package/fixtures/package-input-abstain.json";
import { buildCmipModelExecutionPackage } from "@/lib/cmip/model-package/build-model-package";
import type { CmipModelPackageBuildRequest } from "@/lib/cmip/model-package/types";
import { executeCmipModelPackage } from "@/lib/cmip/openai/execute-model-package";
import { FakeCmipOpenAiProvider } from "@/lib/cmip/openai/provider/fake-provider";
import { executeCmipGeminiModelPackage } from "@/lib/cmip/gemini/execute-model-package";
import { FakeCmipGeminiProvider } from "@/lib/cmip/gemini/provider/fake-gemini-provider";
import { requireAdminAccount } from "@/server/auth/session";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";
export const revalidate = 0;

type FixtureName = "valid" | "partial" | "abstain";
type PreviewProvider = "openai" | "gemini";
type PreviewBody = {
  readonly fixture?: FixtureName;
  readonly provider?: PreviewProvider;
};

const MAX_BODY_BYTES = 4096;
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

const fixtures: Record<FixtureName, unknown> = {
  valid: validFixture,
  partial: partialFixture,
  abstain: abstainFixture,
};

export async function POST(request: Request) {
  try {
    await requireAdminAccount();
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
      return json({ ok: false, errors: [{ code: "REQUEST_TOO_LARGE", path: "$" }] }, 413);
    }
    const body = parsePreviewBody(rawBody);
    if (!body.valid) {
      return json({ ok: false, errors: [{ code: "INVALID_PREVIEW_REQUEST", path: "$" }] }, 400);
    }
    const fixtureName = body.fixture === "partial" || body.fixture === "abstain" || body.fixture === "valid" ? body.fixture : "valid";
    const providerName = body.provider === "gemini" || body.provider === "openai" ? body.provider : "openai";
    const packageResult = buildCmipModelExecutionPackage(fixtures[fixtureName] as CmipModelPackageBuildRequest);
    if (!packageResult.ok) {
      return json({ ok: false, errors: publicIssues(packageResult.errors) }, 422);
    }
    if (providerName === "gemini") {
      const execution = await executeCmipGeminiModelPackage(
        {
          modelPackage: packageResult.package,
          executionMode: "preview",
        },
        {
          provider: new FakeCmipGeminiProvider({ fixtures: [fixtureName === "abstain" ? "abstain" : "valid"] }),
        },
      );
      if (execution.status !== "success") return json({ ok: false, warnings: publicIssues(execution.warnings), errors: publicIssues(execution.errors) }, 422);
      return json({
        ok: true,
        status: execution.status,
        provider: providerName,
        providerStatus: execution.provider.rawStatus,
        canonicalValid: execution.validation.canonicalValid,
        warnings: publicIssues(execution.warnings),
        usage: execution.usage,
        responseId: execution.provider.responseId,
      }, 200);
    }

    const execution = await executeCmipModelPackage(
      {
        modelPackage: packageResult.package,
        executionMode: "preview",
      },
      {
        provider: new FakeCmipOpenAiProvider({ fixtures: [fixtureName === "abstain" ? "abstain" : "valid"] }),
      },
    );
    if (!execution.ok) return json({ ok: false, warnings: publicIssues(execution.warnings), errors: publicIssues(execution.errors) }, 422);
    return json({
      ok: true,
      status: execution.result.status,
      provider: providerName,
      providerStatus: execution.result.trace.attempts.at(-1)?.providerStatus ?? null,
      canonicalValid: execution.result.canonicalValid,
      warnings: publicIssues(execution.warnings),
      usage: execution.result.usage,
      responseId: execution.result.responseId,
    }, 200);
  } catch {
    return json({ ok: false, errors: [{ code: "ADMIN_AUTH_REQUIRED", path: "$" }] }, 401);
  }
}

function parsePreviewBody(rawBody: string): { readonly valid: true; readonly fixture?: FixtureName; readonly provider?: PreviewProvider } | { readonly valid: false } {
  if (!rawBody.trim()) return { valid: true };
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { valid: false };
  }
  if (!isRecord(parsed)) return { valid: false };
  const keys = Object.keys(parsed);
  if (keys.some((key) => key !== "fixture" && key !== "provider")) return { valid: false };
  const fixtureValid = parsed.fixture === undefined || parsed.fixture === "valid" || parsed.fixture === "partial" || parsed.fixture === "abstain";
  const providerValid = parsed.provider === undefined || parsed.provider === "openai" || parsed.provider === "gemini";
  if (fixtureValid && providerValid) return { valid: true, fixture: parsed.fixture as FixtureName | undefined, provider: parsed.provider as PreviewProvider | undefined };
  return { valid: false };
}

function publicIssues(issues: readonly { code: string; path: string; severity?: string }[]) {
  return issues.map((issue) => ({
    code: issue.code,
    path: issue.path,
    severity: issue.severity ?? "error",
  }));
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
