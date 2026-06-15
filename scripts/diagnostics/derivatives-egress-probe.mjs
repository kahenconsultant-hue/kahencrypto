#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

const TIMEOUT_MS = 12_000;
const BODY_PREVIEW_CHARS = 300;

const probes = [
  {
    provider: "Binance",
    endpointType: "funding_rate",
    symbol: "BTCUSDT",
    url: "https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1",
    expect: "binanceFunding",
  },
  {
    provider: "Binance",
    endpointType: "funding_rate",
    symbol: "ETHUSDT",
    url: "https://fapi.binance.com/fapi/v1/fundingRate?symbol=ETHUSDT&limit=1",
    expect: "binanceFunding",
  },
  {
    provider: "Binance",
    endpointType: "funding_rate",
    symbol: "SOLUSDT",
    url: "https://fapi.binance.com/fapi/v1/fundingRate?symbol=SOLUSDT&limit=1",
    expect: "binanceFunding",
  },
  {
    provider: "Binance",
    endpointType: "open_interest",
    symbol: "BTCUSDT",
    url: "https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT",
    expect: "binanceOpenInterest",
  },
  {
    provider: "Binance",
    endpointType: "open_interest",
    symbol: "ETHUSDT",
    url: "https://fapi.binance.com/fapi/v1/openInterest?symbol=ETHUSDT",
    expect: "binanceOpenInterest",
  },
  {
    provider: "Binance",
    endpointType: "open_interest",
    symbol: "SOLUSDT",
    url: "https://fapi.binance.com/fapi/v1/openInterest?symbol=SOLUSDT",
    expect: "binanceOpenInterest",
  },
  {
    provider: "Bybit",
    endpointType: "ticker",
    symbol: "BTCUSDT",
    url: "https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT",
    expect: "bybitTicker",
  },
  {
    provider: "Bybit",
    endpointType: "ticker",
    symbol: "ETHUSDT",
    url: "https://api.bybit.com/v5/market/tickers?category=linear&symbol=ETHUSDT",
    expect: "bybitTicker",
  },
  {
    provider: "Bybit",
    endpointType: "ticker",
    symbol: "SOLUSDT",
    url: "https://api.bybit.com/v5/market/tickers?category=linear&symbol=SOLUSDT",
    expect: "bybitTicker",
  },
  {
    provider: "Bybit",
    endpointType: "funding_rate",
    symbol: "BTCUSDT",
    url: "https://api.bybit.com/v5/market/funding/history?category=linear&symbol=BTCUSDT&limit=1",
    expect: "bybitFunding",
  },
  {
    provider: "Bybit",
    endpointType: "funding_rate",
    symbol: "ETHUSDT",
    url: "https://api.bybit.com/v5/market/funding/history?category=linear&symbol=ETHUSDT&limit=1",
    expect: "bybitFunding",
  },
  {
    provider: "Bybit",
    endpointType: "funding_rate",
    symbol: "SOLUSDT",
    url: "https://api.bybit.com/v5/market/funding/history?category=linear&symbol=SOLUSDT&limit=1",
    expect: "bybitFunding",
  },
  {
    provider: "Bybit",
    endpointType: "open_interest",
    symbol: "BTCUSDT",
    url: "https://api.bybit.com/v5/market/open-interest?category=linear&symbol=BTCUSDT&intervalTime=5min",
    expect: "bybitOpenInterest",
  },
  {
    provider: "Bybit",
    endpointType: "open_interest",
    symbol: "ETHUSDT",
    url: "https://api.bybit.com/v5/market/open-interest?category=linear&symbol=ETHUSDT&intervalTime=5min",
    expect: "bybitOpenInterest",
  },
  {
    provider: "Bybit",
    endpointType: "open_interest",
    symbol: "SOLUSDT",
    url: "https://api.bybit.com/v5/market/open-interest?category=linear&symbol=SOLUSDT&intervalTime=5min",
    expect: "bybitOpenInterest",
  },
];

function sanitizeBodyPreview(body) {
  return body.replace(/\s+/g, " ").trim().slice(0, BODY_PREVIEW_CHARS);
}

function summarizeHeaders(headers) {
  const interesting = [
    "content-type",
    "server",
    "x-cache",
    "cf-cache-status",
    "cf-ray",
    "via",
    "retry-after",
  ];

  return Object.fromEntries(
    interesting
      .map((name) => [name, headers.get(name)])
      .filter(([, value]) => Boolean(value)),
  );
}

function expectedFieldsPresent(expectation, payload) {
  switch (expectation) {
    case "binanceFunding": {
      const first = Array.isArray(payload) ? payload[0] : null;
      return Boolean(first?.symbol && first?.fundingRate && first?.fundingTime);
    }
    case "binanceOpenInterest":
      return Boolean(payload?.symbol && payload?.openInterest && payload?.time);
    case "bybitTicker": {
      const first = payload?.result?.list?.[0];
      return Boolean(
        payload?.retCode === 0 &&
          first?.symbol &&
          first?.fundingRate !== undefined &&
          first?.openInterest !== undefined,
      );
    }
    case "bybitFunding": {
      const first = payload?.result?.list?.[0];
      return Boolean(payload?.retCode === 0 && first?.symbol && first?.fundingRate !== undefined);
    }
    case "bybitOpenInterest": {
      const first = payload?.result?.list?.[0];
      return Boolean(payload?.retCode === 0 && first?.symbol && first?.openInterest !== undefined);
    }
    default:
      return false;
  }
}

function classifyFailure({ status, bodyPreview, jsonParseSuccess, expectedFieldsPresent: fieldsOk, timedOut, headers }) {
  const lowerBody = bodyPreview.toLowerCase();
  const server = String(headers.server ?? "").toLowerCase();
  const contentType = String(headers["content-type"] ?? "").toLowerCase();

  if (timedOut) return "timeout";
  if (status === 429) return "rate_limited";
  if (
    status === 451 ||
    lowerBody.includes("restricted location") ||
    lowerBody.includes("restricted jurisdictions") ||
    lowerBody.includes("eligibility for account")
  ) {
    return "geo_blocked";
  }
  if (
    status === 403 &&
    (server.includes("cloudfront") ||
      lowerBody.includes("cloudfront") ||
      lowerBody.includes("block access from your country"))
  ) {
    return "cloudflare_blocked";
  }
  if (status >= 200 && status < 300 && jsonParseSuccess && !fieldsOk) return "schema_mismatch";
  if (status >= 200 && status < 300 && !jsonParseSuccess) return "parser_failure";
  if (contentType.includes("html") && !jsonParseSuccess) return "parser_failure";
  return "unknown";
}

async function runProbe(probe) {
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response = null;
  let body = "";
  let payload = null;
  let jsonParseSuccess = false;
  let timedOut = false;
  let fetchError = null;

  try {
    response = await fetch(probe.url, {
      signal: controller.signal,
      headers: {
        accept: "application/json,text/plain,*/*",
        "user-agent": "CMIP-GitHub-Actions-Derivatives-Egress-Probe/1.0",
      },
    });
    body = await response.text();
    try {
      payload = JSON.parse(body);
      jsonParseSuccess = true;
    } catch {
      jsonParseSuccess = false;
    }
  } catch (error) {
    timedOut = error?.name === "AbortError";
    fetchError = error instanceof Error ? error.message : String(error);
  } finally {
    clearTimeout(timeout);
  }

  const responseTimeMs = Math.round(performance.now() - started);
  const headers = response ? summarizeHeaders(response.headers) : {};
  const bodyPreview = sanitizeBodyPreview(body || fetchError || "");
  const fieldsOk = jsonParseSuccess ? expectedFieldsPresent(probe.expect, payload) : false;
  const classification =
    response?.ok && jsonParseSuccess && fieldsOk
      ? "success"
      : classifyFailure({
          status: response?.status ?? null,
          bodyPreview,
          jsonParseSuccess,
          expectedFieldsPresent: fieldsOk,
          timedOut,
          headers,
        });

  return {
    provider: probe.provider,
    endpointType: probe.endpointType,
    symbol: probe.symbol,
    url: probe.url,
    httpStatus: response?.status ?? null,
    responseTimeMs,
    jsonParseSuccess,
    expectedFieldsPresent: fieldsOk,
    bodyPreview,
    headers,
    rootCauseClassification: classification,
  };
}

function providerViability(results, provider) {
  const providerResults = results.filter((result) => result.provider === provider);
  const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
  const hasFunding = symbols.every((symbol) =>
    providerResults.some(
      (result) =>
        result.symbol === symbol &&
        result.endpointType === "funding_rate" &&
        result.rootCauseClassification === "success",
    ),
  );
  const hasOpenInterest = symbols.every((symbol) =>
    providerResults.some(
      (result) =>
        result.symbol === symbol &&
        result.endpointType === "open_interest" &&
        result.rootCauseClassification === "success",
    ),
  );

  if (provider === "Bybit") {
    const tickerHasBoth = symbols.every((symbol) =>
      providerResults.some(
        (result) =>
          result.symbol === symbol &&
          result.endpointType === "ticker" &&
          result.rootCauseClassification === "success",
      ),
    );
    return {
      viable: tickerHasBoth || (hasFunding && hasOpenInterest),
      hasFunding,
      hasOpenInterest,
      tickerHasFundingAndOpenInterest: tickerHasBoth,
    };
  }

  return {
    viable: hasFunding && hasOpenInterest,
    hasFunding,
    hasOpenInterest,
  };
}

function buildMarkdownReport(result) {
  const rows = result.results
    .map(
      (entry) =>
        `| ${entry.provider} | ${entry.endpointType} | ${entry.symbol} | ${entry.httpStatus ?? "n/a"} | ${entry.responseTimeMs} | ${entry.jsonParseSuccess ? "yes" : "no"} | ${entry.expectedFieldsPresent ? "yes" : "no"} | ${entry.rootCauseClassification} | ${entry.bodyPreview.replaceAll("|", "\\|")} |`,
    )
    .join("\n");

  return `# GitHub Actions Derivatives Egress Probe Report

Generated at: ${result.generatedAt}

Runner:

- OS: ${result.runner.os}
- Arch: ${result.runner.arch}
- Node: ${result.runner.node}
- GitHub run id: ${result.github.runId ?? "local_or_unknown"}
- GitHub repository: ${result.github.repository ?? "local_or_unknown"}

Summary:

- Total endpoints: ${result.summary.total}
- Success: ${result.summary.success}
- Failed: ${result.summary.failed}
- Binance viable: ${result.viability.binance.viable ? "yes" : "no"}
- Bybit viable: ${result.viability.bybit.viable ? "yes" : "no"}

Classification counts:

${Object.entries(result.summary.classificationCounts)
  .map(([key, value]) => `- ${key}: ${value}`)
  .join("\n")}

## Endpoint Results

| Provider | Endpoint | Symbol | HTTP | ms | JSON | Fields | Classification | Body preview |
|---|---|---:|---:|---:|---:|---:|---|---|
${rows}

## Recommendation

${result.recommendation}
`;
}

async function main() {
  const results = [];
  for (const probe of probes) {
    const result = await runProbe(probe);
    results.push(result);
    console.log(
      JSON.stringify({
        provider: result.provider,
        endpointType: result.endpointType,
        symbol: result.symbol,
        httpStatus: result.httpStatus,
        responseTimeMs: result.responseTimeMs,
        jsonParseSuccess: result.jsonParseSuccess,
        expectedFieldsPresent: result.expectedFieldsPresent,
        rootCauseClassification: result.rootCauseClassification,
        bodyPreview: result.bodyPreview,
      }),
    );
  }

  const classificationCounts = results.reduce((acc, result) => {
    acc[result.rootCauseClassification] = (acc[result.rootCauseClassification] ?? 0) + 1;
    return acc;
  }, {});

  const viability = {
    binance: providerViability(results, "Binance"),
    bybit: providerViability(results, "Bybit"),
  };

  const recommendation =
    viability.binance.viable || viability.bybit.viable
      ? "GitHub Actions is viable for a diagnostic derivatives worker. Do not promote it to scheduled production ingestion until a Supabase-write phase is explicitly approved."
      : "GitHub Actions is not viable as the free derivatives worker based on this run. Test Cloudflare Worker next, then consider CoinGlass or an allowed-region VPS fallback.";

  const output = {
    generatedAt: new Date().toISOString(),
    runner: {
      os: process.platform,
      arch: process.arch,
      node: process.version,
    },
    github: {
      runId: process.env.GITHUB_RUN_ID ?? null,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
      repository: process.env.GITHUB_REPOSITORY ?? null,
      ref: process.env.GITHUB_REF ?? null,
      sha: process.env.GITHUB_SHA ?? null,
    },
    summary: {
      total: results.length,
      success: results.filter((result) => result.rootCauseClassification === "success").length,
      failed: results.filter((result) => result.rootCauseClassification !== "success").length,
      classificationCounts,
    },
    viability,
    recommendation,
    results,
  };

  await writeFile("github_actions_derivatives_probe_result.json", `${JSON.stringify(output, null, 2)}\n`);
  await writeFile("github_actions_derivatives_probe_report.md", buildMarkdownReport(output));

  console.log("Wrote github_actions_derivatives_probe_result.json");
  console.log("Wrote github_actions_derivatives_probe_report.md");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
