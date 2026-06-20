import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeMacroSource, normalizePublicMacroText } from "../src/lib/macro/normalizeMacroSources";

test("FRED DTWEXBGS is a broad USD proxy and is never labeled DXY", () => {
  const source = normalizeMacroSource({ sourceId: "FRED_DTWEXBGS", symbol: "DTWEXBGS", sourceName: "FRED DTWEXBGS observations" });
  assert.equal(source.publicLabel, "Broad USD Index");
  assert.equal(source.publicLabelFa, "شاخص گسترده دلار آمریکا");
  assert.equal(source.isProxy, true);
  assert.equal(source.shortCode, "USD_BROAD");
  assert.doesNotMatch(source.publicLabel, /DXY/);
  assert.doesNotMatch(normalizePublicMacroText("اگر DXY افزایش یابد", source), /DXY/);
});

test("a true market DXY source retains the DXY label", () => {
  const source = normalizeMacroSource({ symbol: "DXY", sourceName: "Yahoo Finance DX-Y.NYB" });
  assert.equal(source.publicLabel, "DXY");
  assert.equal(source.isProxy, false);
  assert.equal(source.shortCode, "DXY");
});

