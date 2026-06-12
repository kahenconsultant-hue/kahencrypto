import assert from "node:assert/strict";
import { test } from "node:test";
import {
  aggregateEtfDailyRows,
  buildEtfRawMetrics,
  parseEtfFlowNumber,
  parseFarsideEtfHtml,
  parseTheBlockEtfJson,
} from "../src/server/data/farside-etf";

test("ETF parser converts parentheses to negative USD million values", () => {
  assert.equal(parseEtfFlowNumber("(105.4)"), -105.4);
});

test("ETF parser converts dash to null", () => {
  assert.equal(parseEtfFlowNumber("-"), null);
  assert.equal(parseEtfFlowNumber("—"), null);
});

test("Farside BTC total row is parsed correctly", () => {
  const html = `
    <table>
      <tr><th>Date</th><th>IBIT</th><th>FBTC</th><th>BITB</th><th>ARKB</th><th>BTCO</th><th>EZBC</th><th>BRRR</th><th>HODL</th><th>BTCW</th><th>GBTC</th><th>BTC</th><th>Total</th></tr>
      <tr><td>29 May 2026</td><td>100.0</td><td>(10.0)</td><td>-</td><td>5.0</td><td>1.0</td><td>2.0</td><td>3.0</td><td>4.0</td><td>5.0</td><td>(20.0)</td><td>7.0</td><td>97.0</td></tr>
    </table>`;
  const rows = parseFarsideEtfHtml({ html, asset: "BTC", sourceUrl: "https://farside.test/btc", fetchedAt: "2026-06-01T00:00:00.000Z" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].providerFlowsUsdMillion.IBIT, 100);
  assert.equal(rows[0].providerFlowsUsdMillion.FBTC, -10);
  assert.equal(rows[0].providerFlowsUsdMillion.BITB, null);
  assert.equal(rows[0].totalUsdMillion, 97);
});

test("BTC ETF 24h metric is available when public source rows exist", () => {
  const rows = parseTheBlockEtfJson({
    asset: "BTC",
    sourceUrl: "https://data.tbstat.test/btc.json",
    fetchedAt: "2026-06-01T00:00:00.000Z",
    json: {
      Series: {
        IBIT: { Data: [{ Timestamp: 1780012800, Result: 100_000_000 }] },
        FBTC: { Data: [{ Timestamp: 1780012800, Result: -25_000_000 }] },
      },
    },
  });
  const aggregation = aggregateEtfDailyRows(rows, "BTC");
  const metrics = buildEtfRawMetrics({ sourceId: "test", sourceName: "test", sourceType: "scraper", asset: "BTC", aggregation });
  assert.equal(metrics.find((metric) => metric.metric === "btc_etf_flow_24h")?.value, 75_000_000);
});

test("ETH ETF 24h metric is available when public source rows exist", () => {
  const rows = parseTheBlockEtfJson({
    asset: "ETH",
    sourceUrl: "https://data.tbstat.test/eth.json",
    fetchedAt: "2026-06-01T00:00:00.000Z",
    json: {
      Series: {
        ETHA: { Data: [{ Timestamp: 1780012800, Result: 30_000_000 }] },
        ETHE: { Data: [{ Timestamp: 1780012800, Result: -10_000_000 }] },
      },
    },
  });
  const aggregation = aggregateEtfDailyRows(rows, "ETH");
  const metrics = buildEtfRawMetrics({ sourceId: "test", sourceName: "test", sourceType: "scraper", asset: "ETH", aggregation });
  assert.equal(metrics.find((metric) => metric.metric === "eth_etf_flow_24h")?.value, 20_000_000);
});
