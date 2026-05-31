import type { AlertLevel, AssetSymbol, DirectionalBias, IntelligenceTimeframe, SmartAlert, TraderAlertPriority } from "@/lib/types";
import { getDynamicCorrelationReport } from "@/server/analytics/correlation-engine";
import { getDerivedSignalReport } from "@/server/analytics/derived-signal-engine";
import { getLiquidityReport } from "@/server/analytics/liquidity-engine";
import { getMarketRegimeReport } from "@/server/analytics/market-regime-engine";
import { getSignalSnapshot } from "@/server/analytics/market-signals";
import { clampPercent } from "@/server/analytics/scoring-engine";
import { getIntelligenceReliabilityReportSync } from "@/server/intelligence/reliability-engine";

const levelWeight: Record<AlertLevel, number> = {
  Critical: 4,
  Important: 3,
  Watch: 2,
  Info: 1,
};

function levelFromPriority(priority: TraderAlertPriority): AlertLevel {
  if (priority === "critical") return "Critical";
  if (priority === "high") return "Important";
  if (priority === "medium") return "Watch";
  return "Info";
}

function value(key: string) {
  const signal = getSignalSnapshot().byKey[key];
  if (!signal || signal.value === null || signal.quality === "unavailable" || signal.quality === "estimated") return null;
  return signal.value;
}

const alertIndicatorLabels: Record<string, string> = {
  dxy_trend_24h: "DXY",
  us10y_trend_24h: "US10Y",
  nasdaq_trend_24h: "Nasdaq",
  btc_trend_24h: "BTC 24h",
  eth_trend_24h: "ETH 24h",
  sol_trend_24h: "SOL 24h",
  stablecoin_market_cap_7d: "ارزش بازار استیبل‌کوین ۷ روزه",
  stablecoin_market_cap_30d: "ارزش بازار استیبل‌کوین ۳۰ روزه",
  total_stablecoin_market_cap_usd: "ارزش کل بازار استیبل‌کوین",
  stablecoin_dominance: "دامیننس استیبل‌کوین",
  usdt_supply_7d: "عرضه USDT ۷ روزه",
  usdc_supply_7d: "عرضه USDC ۷ روزه",
  btc_etf_flow_24h: "جریان ETF بیت‌کوین",
  eth_etf_flow_24h: "جریان ETF اتریوم",
  exchange_inflows: "ورودی صرافی‌ها",
  exchange_outflows: "خروجی صرافی‌ها",
  funding_btc: "Funding Rate BTC",
  open_interest_btc_24h: "Open Interest BTC",
  spot_volume_btc_24h: "حجم اسپات BTC",
  futures_volume_btc_24h: "حجم فیوچرز BTC",
  vix_trend_24h: "VIX",
  cpi_latest: "CPI",
  fed_funds_rate: "Fed Funds Rate",
  unemployment_rate: "Employment Data",
};

function alertDataFromKeys(keys: string[]): NonNullable<SmartAlert["dataUsed"]> {
  const snapshot = getSignalSnapshot();
  const uniqueKeys = Array.from(new Set(keys.filter((key) => snapshot.byKey[key])));
  return uniqueKeys.map((key) => {
    const signal = snapshot.byKey[key];
    const ageMinutes = signal.timestamp ? Math.max(0, Math.round((Date.now() - Date.parse(signal.timestamp)) / 60_000)) : null;
    const status =
      signal.quality === "estimated"
        ? "estimated"
        : signal.value === null || signal.quality === "unavailable"
          ? "missing"
          : ageMinutes !== null && ageMinutes > 90
            ? "stale"
            : "available";
    return {
      label: alertIndicatorLabels[key] ?? key,
      key,
      source: signal.source,
      status,
      value: signal.value,
    };
  });
}

function capPriority(priority: TraderAlertPriority, maxPriority: TraderAlertPriority) {
  const order: TraderAlertPriority[] = ["low", "medium", "high", "critical"];
  return order.indexOf(priority) > order.indexOf(maxPriority) ? maxPriority : priority;
}

function humanCapReason(reason: string | null, cap: number | null) {
  return reason && cap !== null ? `${reason} سقف اطمینان: ${cap}٪.` : reason;
}

function applyAlertQualityRules(params: {
  type: SmartAlert["type"];
  priority: TraderAlertPriority;
  confidence: number;
  dataUsed: NonNullable<SmartAlert["dataUsed"]>;
}) {
  let confidence = params.confidence;
  let priority = params.priority;
  let cap: number | null = null;
  const reasons: string[] = [];
  const availableCount = params.dataUsed.filter((item) => item.status === "available" || item.status === "stale").length;
  const missing = new Set(params.dataUsed.filter((item) => item.status === "missing").map((item) => item.key));
  const isProxyAlert = params.type.toString().includes("_proxy_") || params.type === "premium_data_missing_notice";
  const isLiquidityAlert = params.type === "Liquidity Alert" || params.type === "liquidity_proxy_alert" || params.type === "stablecoin_pressure_alert";
  const isMacroAlert = params.type === "Macro Alert" || params.type === "Dollar Pressure Alert" || params.type === "Rates Shock Alert" || params.type === "Fed Alert" || params.type === "macro_pressure_proxy_alert";

  if (availableCount < 3) {
    cap = Math.min(cap ?? 100, 50);
    priority = capPriority(priority, "medium");
    reasons.push("این هشدار کمتر از سه شاخص واقعی در اختیار دارد؛ بنابراین شدت High یا Critical مجاز نیست.");
  }

  if (isProxyAlert) {
    priority = capPriority(priority, "medium");
    reasons.push("این هشدار بر پایه پروکسی/Derived Signal است و نباید به‌عنوان داده مستقیم نهادی نمایش داده شود.");
  }

  if (isLiquidityAlert) {
    const etfMissing = missing.has("btc_etf_flow_24h") || missing.has("eth_etf_flow_24h");
    const exchangeMissing = missing.has("exchange_inflows") || missing.has("exchange_outflows");
    if (etfMissing && exchangeMissing) {
      cap = Math.min(cap ?? 100, 55);
      priority = capPriority(priority, "medium");
      reasons.push("ETF Flow و Exchange Flow در دسترس نیستند؛ سیگنال نقدینگی با سقف اطمینان محدود می‌شود.");
    } else if (exchangeMissing) {
      cap = Math.min(cap ?? 100, 65);
      reasons.push("Exchange Inflows/Outflows ناموجود است و کیفیت سیگنال نقدینگی کاهش یافته است.");
    } else if (etfMissing) {
      cap = Math.min(cap ?? 100, 70);
      reasons.push("ETF Flow ناموجود است و بخشی از تأیید نهادی نقدینگی دیده نمی‌شود.");
    }
  }

  if (isMacroAlert) {
    const fredMissing = missing.has("cpi_latest") || missing.has("fed_funds_rate") || missing.has("unemployment_rate");
    if (fredMissing) {
      cap = Math.min(cap ?? 100, 45);
      priority = capPriority(priority, "medium");
      reasons.push("داده‌های اصلی FRED برای CPI، نرخ فدرال فاندز یا اشتغال کامل نیست؛ هشدار کلان نباید confidence بالا بگیرد.");
    }
  }

  if (cap !== null) confidence = Math.min(confidence, cap);
  if (confidence < 68) priority = capPriority(priority, "medium");

  return {
    priority,
    confidence: clampPercent(confidence),
    confidenceCapReason: humanCapReason(reasons.join(" "), cap),
  };
}

function sourceReliability(keys: string[]) {
  const signals = keys.map((key) => getSignalSnapshot().byKey[key]).filter(Boolean);
  if (!signals.length) return 0;
  return signals.reduce((sum, signal) => sum + signal.reliability, 0) / signals.length;
}

function availableKeys(keys: string[]) {
  return keys.filter((key) => value(key) !== null);
}

function confidenceFor(keys: string[], alignment: number, cap: number) {
  const available = availableKeys(keys);
  if (available.length < Math.min(3, keys.length)) return null;
  const availability = (available.length / keys.length) * 100;
  return clampPercent(Math.min(cap, availability * 0.35 + sourceReliability(available) * 0.35 + alignment * 0.3));
}

function alertBase(params: {
  id: string;
  type: SmartAlert["type"];
  priority: TraderAlertPriority;
  direction: DirectionalBias;
  timeframe: IntelligenceTimeframe;
  affectedAssets: AssetSymbol[];
  titleFa: string;
  reasoningFa: string;
  triggerCondition: string;
  evidence: string[];
  causalChain: string;
  confidence: number;
  importance: number;
  invalidationCondition: string;
  suggestedTraderAction: string;
  whyItMattersFa: string;
  monitoringFa: string[];
  dataQuality: SmartAlert["dataQuality"];
  dataUsed?: SmartAlert["dataUsed"];
  missingCriticalInputs?: string[];
  confidenceCapReason?: string | null;
  createdAt?: string;
}): SmartAlert {
  const dataUsed = params.dataUsed ?? alertDataFromKeys(params.monitoringFa);
  const missingCriticalInputs = params.missingCriticalInputs ?? dataUsed.filter((item) => item.status === "missing").map((item) => item.label);
  const quality = applyAlertQualityRules({
    type: params.type,
    priority: params.priority,
    confidence: params.confidence,
    dataUsed,
  });
  return {
    id: params.id,
    type: params.type,
    level: levelFromPriority(quality.priority),
    priority: quality.priority,
    urgency: quality.priority,
    direction: params.direction,
    timeframe: params.timeframe,
    triggerCondition: params.triggerCondition,
    evidence: params.evidence,
    causalChain: params.causalChain,
    invalidationCondition: params.invalidationCondition,
    suggestedTraderAction: params.suggestedTraderAction,
    titleFa: params.titleFa,
    reasoningFa: params.reasoningFa,
    affectedAssets: params.affectedAssets,
    confidence: quality.confidence,
    importance: params.importance,
    whyItMattersFa: params.whyItMattersFa,
    monitoringFa: params.monitoringFa,
    dataUsed,
    missingCriticalInputs,
    confidenceCapReason: params.confidenceCapReason ?? quality.confidenceCapReason,
    dataQuality: params.dataQuality,
    createdAt: params.createdAt ?? new Date().toISOString(),
    scenarioFa: params.reasoningFa,
  };
}

function dataQualityAlert(): SmartAlert | null {
  const reliability = getIntelligenceReliabilityReportSync();
  if (reliability.coreReliability >= 0.55 && !reliability.missingCriticalSources.length) return null;
  const priority: TraderAlertPriority = reliability.coreReliability < 0.35 || reliability.missingCriticalSources.length ? "high" : "medium";
  const evidence = [
    `critical online ${reliability.criticalSourcesOnline}/${reliability.criticalSourcesTotal}`,
    `overall reliability ${Math.round(reliability.overallReliability * 100)}%`,
    ...reliability.warningsFa.slice(0, 4),
  ];

  return alertBase({
    id: "core-data-quality-intelligence-degraded",
    type: "data_degradation_alert",
    priority,
    direction: "mixed",
    timeframe: "24h",
    affectedAssets: ["BTC", "ETH", "SOL", "USDT", "DXY", "Gold", "Nasdaq", "US10Y"],
    titleFa: "کیفیت داده برای هوش بازار کامل نیست",
    reasoningFa: "بخشی از منابع حیاتی یا لایه‌های تحلیلی در وضعیت degraded هستند؛ موتور تا بازیابی پوشش داده، هشدارهای جهت‌دار را با confidence محدود یا اصلاً تولید نمی‌کند.",
    triggerCondition: `coreReliability=${reliability.coreReliability}; degradedModules=${reliability.degradedModules.join(", ")}`,
    evidence,
    causalChain: "افت پوشش منبع → کاهش قابلیت اتکا → سقف‌گذاری confidence و کاهش شدت هشدارها.",
    confidence: 0,
    importance: reliability.overallStatus === "critical" ? 86 : 68,
    invalidationCondition: "منابع tier 1 دوباره online شوند، raw metrics تازه ثبت شود و coverage هر لایه بالای ۰٫۷۲ برگردد.",
    suggestedTraderAction: "این هشدار عملیاتی است. تا رفع آن، تحلیل‌های جهت‌دار را فقط به‌عنوان سناریو بخوانید و نبود داده را با سیگنال بازار اشتباه نگیرید.",
    whyItMattersFa: "بدون داده تازه و چندمنبعی، تولید هشدار بازار می‌تواند گمراه‌کننده باشد.",
    monitoringFa: ["source_health", "raw_metrics freshness", "reliability score", "missing API keys"],
    dataQuality: reliability.coreReliability < 0.35 ? "unavailable" : "partial_live",
    createdAt: reliability.generatedAt,
  });
}

function premiumMissingNotice(): SmartAlert | null {
  const reliability = getIntelligenceReliabilityReportSync();
  if (!reliability.disabledPremiumModules.length && reliability.premiumCoverage >= 0.35) return null;
  return alertBase({
    id: "premium-data-missing-notice",
    type: "premium_data_missing_notice",
    priority: "low",
    direction: "mixed",
    timeframe: "7d",
    affectedAssets: ["BTC", "ETH", "SOL", "USDT"],
    titleFa: "پوشش داده‌های پریمیوم محدود است",
    reasoningFa: "نبود CoinGlass، Glassnode، CryptoQuant، Whale Alert یا ETF مستقیم دیگر کل تحلیل را متوقف نمی‌کند؛ فقط ماژول‌های enrichment و confidence آن‌ها محدود می‌شود.",
    triggerCondition: `premiumCoverage=${reliability.premiumCoverage}; disabled=${reliability.disabledPremiumModules.join(", ")}`,
    evidence: reliability.disabledPremiumModules.slice(0, 6),
    causalChain: "نبود داده پریمیوم → غیرفعال شدن enrichment → ادامه تحلیل با داده رایگان و پروکسی با confidence پایین‌تر.",
    confidence: Math.round(reliability.coreReliability * 100),
    importance: 42,
    invalidationCondition: "با فعال شدن کلیدهای پریمیوم یا crawlerهای معتبر ETF/ذخایر صرافی، این notice حذف می‌شود.",
    suggestedTraderAction: "تحلیل‌های core را قابل استفاده بدانید، اما نبود داده‌های پریمیوم را به‌عنوان محدودیت کیفیت در نظر بگیرید.",
    whyItMattersFa: "سیستم نباید جای خالی داده پریمیوم را با عدد ساختگی پر کند.",
    monitoringFa: ["premiumCoverage", "disabledPremiumModules", "missingPremiumSources"],
    dataQuality: "partial_live",
    createdAt: reliability.generatedAt,
  });
}

function derivedSignalByKey(key: string) {
  return getDerivedSignalReport().signals.find((signal) => signal.signalKey === key);
}

function macroPressureProxyAlert(): SmartAlert | null {
  const signal = derivedSignalByKey("macro_pressure_proxy");
  const btc = value("btc_trend_24h");
  const dxy = value("dxy_trend_24h");
  const us10y = value("us10y_trend_24h");
  if (!signal || signal.score === null || signal.confidence === null || btc === null || dxy === null || us10y === null) return null;
  if (!(signal.score <= -30 && dxy > 0.15 && us10y > 0.02 && btc <= 0.5)) return null;
  return alertBase({
    id: "macro-pressure-proxy-alert",
    type: "macro_pressure_proxy_alert",
    priority: signal.score <= -55 ? "high" : "medium",
    direction: "bearish",
    timeframe: "24h",
    affectedAssets: ["BTC", "ETH", "SOL", "Nasdaq"],
    titleFa: "پروکسی فشار کلان روی کریپتو فعال شد",
    reasoningFa: signal.explanationFa,
    triggerCondition: "macro_pressure_proxy <= -30 + DXY rising + US10Y rising + BTC not showing independent strength",
    evidence: [`macro proxy ${signal.score}`, `DXY ${dxy.toFixed(2)}٪`, `US10Y ${us10y.toFixed(2)}`, `BTC ${btc.toFixed(2)}٪`],
    causalChain: "DXY ↑ + US10Y ↑ + نبود قدرت مستقل BTC → فشار نرخ/دلار روی ریسک‌پذیری کریپتو.",
    confidence: signal.confidence,
    importance: clampPercent(signal.confidence + Math.abs(signal.score) * 0.25),
    invalidationCondition: "اگر DXY زیر ۰٫۱۵٪ برگردد، US10Y آرام شود و BTC با حجم اسپات مثبت بماند، این پروکسی ضعیف می‌شود.",
    suggestedTraderAction: "تیترهای مثبت کریپتو را تا وقتی دلار و نرخ فشار می‌آورند با احتیاط بخوانید؛ این هشدار سیگنال معامله نیست.",
    whyItMattersFa: "کانال دلار و نرخ می‌تواند اثر خبرهای مثبت کریپتو را خنثی کند.",
    monitoringFa: [...signal.usedInputs, "cpi_latest", "fed_funds_rate", "unemployment_rate"],
    dataQuality: signal.quality,
  });
}

function liquidityProxyAlert(): SmartAlert | null {
  const liquidity = derivedSignalByKey("crypto_liquidity_proxy");
  const stablecoin = derivedSignalByKey("stablecoin_liquidity_signal");
  if (!liquidity || !stablecoin || liquidity.score === null || stablecoin.score === null || liquidity.confidence === null) return null;
  if (!(liquidity.score >= 25 && stablecoin.score >= 20)) return null;
  return alertBase({
    id: "liquidity-proxy-alert",
    type: "liquidity_proxy_alert",
    priority: liquidity.score >= 50 ? "medium" : "low",
    direction: "bullish",
    timeframe: "3d",
    affectedAssets: ["BTC", "ETH", "SOL", "USDT"],
    titleFa: "پروکسی نقدینگی کریپتو حمایتی شده است",
    reasoningFa: "رشد استیبل‌کوین و حجم/مومنتوم بازار از داده‌های رایگان هم‌جهت شده‌اند. چون ETF و ذخایر صرافی کامل نیستند، این هشدار proxy-based است.",
    triggerCondition: "crypto_liquidity_proxy >= +25 AND stablecoin_liquidity_signal >= +20",
    evidence: [`liquidity proxy ${liquidity.score}`, `stablecoin signal ${stablecoin.score}`, ...liquidity.usedInputs.slice(0, 3)],
    causalChain: "استیبل‌کوین ↑ + حجم/مومنتوم ↑ → حمایت نقدینگی نقدی/عمومی → بهبود کوتاه‌مدت ریسک‌پذیری.",
    confidence: Math.min(liquidity.confidence, stablecoin.confidence ?? liquidity.confidence),
    importance: clampPercent(liquidity.confidence + liquidity.score * 0.15),
    invalidationCondition: "اگر رشد استیبل‌کوین به زیر آستانه ۰٫۳۵٪ هفتگی برگردد یا حجم اسپات افت کند، هشدار تضعیف می‌شود.",
    suggestedTraderAction: "این خروجی فقط نشان می‌دهد زمینه نقدینگی بهتر شده؛ برای تصمیم معامله باید با قیمت و ریسک کلان هم‌سنجی شود.",
    whyItMattersFa: "نقدینگی واقعی شرط دوام رالی است.",
    monitoringFa: [...liquidity.usedInputs, ...stablecoin.usedInputs, "btc_etf_flow_24h", "eth_etf_flow_24h", "exchange_inflows", "exchange_outflows"],
    dataQuality: liquidity.quality,
  });
}

function stablecoinPressureAlert(): SmartAlert | null {
  const stablecoin = derivedSignalByKey("stablecoin_liquidity_signal");
  const liquidity = derivedSignalByKey("crypto_liquidity_proxy");
  if (!stablecoin || stablecoin.score === null || stablecoin.confidence === null) return null;
  if (!(stablecoin.score <= -25 && (liquidity?.score ?? 0) <= 5)) return null;
  return alertBase({
    id: "stablecoin-pressure-proxy-alert",
    type: "stablecoin_pressure_alert",
    priority: stablecoin.score <= -50 ? "high" : "medium",
    direction: "bearish",
    timeframe: "7d",
    affectedAssets: ["USDT", "BTC", "ETH", "SOL"],
    titleFa: "فشار نقدینگی استیبل‌کوین در داده‌های رایگان دیده می‌شود",
    reasoningFa: stablecoin.explanationFa,
    triggerCondition: "stablecoin_liquidity_signal <= -25 AND crypto_liquidity_proxy not supportive",
    evidence: [`stablecoin signal ${stablecoin.score}`, `liquidity proxy ${liquidity?.score ?? "unavailable"}`],
    causalChain: "عرضه/رشد استیبل‌کوین ضعیف → ظرفیت خرید نقدی کمتر → ریسک تداوم حرکت صعودی پایین‌تر.",
    confidence: stablecoin.confidence,
    importance: clampPercent(stablecoin.confidence + Math.abs(stablecoin.score) * 0.2),
    invalidationCondition: "اگر DefiLlama رشد مثبت پایدار در عرضه استیبل‌کوین‌ها نشان دهد و حجم اسپات بالا برود، هشدار ضعیف می‌شود.",
    suggestedTraderAction: "رشد قیمت را بدون تأیید استیبل‌کوین به‌عنوان expansion قطعی نخوانید.",
    whyItMattersFa: "استیبل‌کوین‌ها یکی از سوخت‌های اصلی نقدینگی در بازار کریپتو هستند.",
    monitoringFa: [...stablecoin.usedInputs, "btc_etf_flow_24h", "eth_etf_flow_24h", "exchange_inflows", "exchange_outflows"],
    dataQuality: stablecoin.quality,
  });
}

function volatilityExpansionAlert(): SmartAlert | null {
  const volatility = derivedSignalByKey("volatility_regime_proxy");
  const leverage = derivedSignalByKey("leverage_stress_proxy");
  if (!volatility || volatility.score === null || volatility.confidence === null) return null;
  if (!(volatility.score <= -38 && (leverage?.score ?? 0) <= -15)) return null;
  return alertBase({
    id: "volatility-expansion-proxy-alert",
    type: "volatility_expansion_alert",
    priority: "medium",
    direction: "mixed",
    timeframe: "24h",
    affectedAssets: ["BTC", "ETH", "SOL"],
    titleFa: "رژیم نوسان در حال گسترش است",
    reasoningFa: volatility.explanationFa,
    triggerCondition: "volatility_regime_proxy <= -38 AND leverage_stress_proxy confirms or does not oppose",
    evidence: [`volatility proxy ${volatility.score}`, `leverage proxy ${leverage?.score ?? "unavailable"}`],
    causalChain: "دامنه حرکت/حجم/نوسان ↑ → کاهش قابلیت اتکای جهت‌گیری کوتاه‌مدت → افزایش ریسک stop cascade.",
    confidence: volatility.confidence,
    importance: clampPercent(volatility.confidence + Math.abs(volatility.score) * 0.18),
    invalidationCondition: "اگر دامنه کندل‌ها و حجم به محدوده عادی برگردد، هشدار نوسان حذف می‌شود.",
    suggestedTraderAction: "در محیط نوسان بالا، confidence سناریوهای جهت‌دار را پایین‌تر بخوانید.",
    whyItMattersFa: "نوسان بالا باعث می‌شود حتی تحلیل درست نیز مسیر پرنوسان‌تری داشته باشد.",
    monitoringFa: volatility.usedInputs,
    dataQuality: volatility.quality,
  });
}

function riskTransitionProxyAlert(): SmartAlert | null {
  const macro = derivedSignalByKey("macro_pressure_proxy");
  const liquidity = derivedSignalByKey("crypto_liquidity_proxy");
  const appetite = derivedSignalByKey("institutional_risk_appetite_proxy");
  if (!macro || !liquidity || !appetite || macro.score === null || liquidity.score === null || appetite.score === null || appetite.confidence === null) return null;
  if (macro.score <= -20 && liquidity.score <= 5 && appetite.score <= -20) {
    return alertBase({
      id: "risk-off-transition-proxy-alert",
      type: "risk_off_transition_alert",
      priority: "medium",
      direction: "bearish",
      timeframe: "3d",
      affectedAssets: ["BTC", "ETH", "SOL", "Nasdaq"],
      titleFa: "ریسک گذار به حالت دفاعی افزایش یافته است",
      reasoningFa: "فشار کلان، نقدینگی ضعیف و اشتهای ریسک نهادی/شبه‌نهادی هم‌زمان منفی شده‌اند؛ این نتیجه proxy-based است.",
      triggerCondition: "macro_pressure_proxy <= -20 + crypto_liquidity_proxy <= +5 + institutional_risk_appetite_proxy <= -20",
      evidence: [`macro ${macro.score}`, `liquidity ${liquidity.score}`, `risk appetite ${appetite.score}`],
      causalChain: "فشار کلان + نقدینگی ضعیف + اشتهای ریسک پایین → احتمال گذار به risk-off.",
      confidence: Math.min(appetite.confidence, macro.confidence ?? appetite.confidence, liquidity.confidence ?? appetite.confidence),
      importance: clampPercent(appetite.confidence + 8),
      invalidationCondition: "اگر DXY/US10Y آرام شوند و پروکسی نقدینگی به بالای +۲۵ برسد، این گذار ضعیف می‌شود.",
      suggestedTraderAction: "تا وقتی سه لایه هم‌زمان منفی‌اند، قدرت قیمت را با احتیاط بیشتری تفسیر کنید.",
      whyItMattersFa: "گذار رژیم بازار وزن محرک‌ها و حساسیت دارایی‌ها را عوض می‌کند.",
      monitoringFa: ["macro_pressure_proxy", "crypto_liquidity_proxy", "institutional_risk_appetite_proxy"],
      dataQuality: "partial_live",
    });
  }
  if (macro.score >= -5 && liquidity.score >= 25 && appetite.score >= 20) {
    return alertBase({
      id: "risk-on-recovery-proxy-alert",
      type: "risk_on_recovery_alert",
      priority: "low",
      direction: "bullish",
      timeframe: "3d",
      affectedAssets: ["BTC", "ETH", "SOL", "Nasdaq"],
      titleFa: "نشانه‌های اولیه بازیابی ریسک‌پذیری دیده می‌شود",
      reasoningFa: "فشار کلان شدید نیست، نقدینگی proxy بهتر شده و اشتهای ریسک نهادی/شبه‌نهادی مثبت است. این خروجی هنوز مستقیم یا نهادی نیست.",
      triggerCondition: "macro_pressure_proxy >= -5 + crypto_liquidity_proxy >= +25 + institutional_risk_appetite_proxy >= +20",
      evidence: [`macro ${macro.score}`, `liquidity ${liquidity.score}`, `risk appetite ${appetite.score}`],
      causalChain: "فشار کلان کمتر + نقدینگی بهتر + اشتهای ریسک مثبت → احتمال بهبود ریسک‌پذیری.",
      confidence: Math.min(appetite.confidence, macro.confidence ?? appetite.confidence, liquidity.confidence ?? appetite.confidence),
      importance: clampPercent(appetite.confidence + 2),
      invalidationCondition: "اگر DXY و US10Y دوباره بالا بروند یا stablecoin signal منفی شود، این سناریو لغو می‌شود.",
      suggestedTraderAction: "این فقط تغییر زمینه است، نه سیگنال خرید؛ تأیید قیمت و حجم لازم است.",
      whyItMattersFa: "بازیابی ریسک‌پذیری می‌تواند حساسیت SOL و ETH را بیشتر از BTC تغییر دهد.",
      monitoringFa: ["DXY", "US10Y", "stablecoin_liquidity_signal", "spot_volume_btc_24h"],
      dataQuality: "partial_live",
    });
  }
  return null;
}

function macroPressureAlert(): SmartAlert | null {
  const keys = ["dxy_trend_24h", "us10y_trend_24h", "nasdaq_trend_24h", "btc_trend_24h"];
  const dxy = value("dxy_trend_24h");
  const us10y = value("us10y_trend_24h");
  const nasdaq = value("nasdaq_trend_24h");
  const btc = value("btc_trend_24h");
  if (dxy === null || us10y === null || nasdaq === null || btc === null) return null;
  if (!(dxy > 0.15 && us10y > 0.03 && nasdaq < -0.5 && btc <= 0.3)) return null;
  const reliability = getIntelligenceReliabilityReportSync();
  const confidence = confidenceFor(keys, 82, reliability.confidenceCaps.alerts);
  if (confidence === null) return null;
  return alertBase({
    id: "macro-pressure-dxy-us10y-nasdaq",
    type: "Dollar Pressure Alert",
    priority: confidence >= 70 ? "high" : "medium",
    direction: "bearish",
    timeframe: "24h",
    affectedAssets: ["BTC", "ETH", "SOL", "Nasdaq"],
    titleFa: "فشار کلان کوتاه‌مدت روی دارایی‌های پرریسک",
    reasoningFa: `DXY ${dxy.toFixed(2)}٪ و US10Y ${us10y.toFixed(2)} واحد بالا رفته‌اند، در حالی که Nasdaq ${nasdaq.toFixed(2)}٪ ضعیف شده است. این ترکیب معمولاً نقدینگی کوتاه‌مدت را از دارایی‌های پرریسک دور می‌کند و تا وقتی جریان‌های کریپتویی آن را خنثی نکنند، BTC، ETH و SOL زیر فشار می‌مانند.`,
    triggerCondition: "DXY > +0.15%, US10Y > +0.03, Nasdaq < -0.5%, BTC not confirming strength",
    evidence: [`DXY ${dxy.toFixed(2)}٪`, `US10Y ${us10y.toFixed(2)}`, `Nasdaq ${nasdaq.toFixed(2)}٪`, `BTC ${btc.toFixed(2)}٪`],
    causalChain: "DXY ↑ + US10Y ↑ + Nasdaq ↓ → فشار risk-off و نرخ تنزیل → کاهش اشتهای ریسک در BTC/ETH/SOL.",
    confidence,
    importance: clampPercent(confidence + 12),
    invalidationCondition: "این سناریو ضعیف می‌شود اگر DXY زیر تغییر ۷ روزه خود برگردد، US10Y در بروزرسانی بعدی آرام شود و BTC با حجم اسپات بالاتر از میانگین ۷ روزه مثبت بماند.",
    suggestedTraderAction: "خبر خنثی کریپتو را به‌تنهایی bullish تفسیر نکنید؛ در این وضعیت کانال دلار و نرخ، محرک غالب‌تر است.",
    whyItMattersFa: "هم‌زمانی دلار قوی، نرخ بالاتر و ضعف Nasdaq معمولاً هزینه نگهداری دارایی‌های پرریسک را بالا می‌برد.",
    monitoringFa: ["dxy_trend_24h", "us10y_trend_24h", "nasdaq_trend_24h", "spot_volume_btc_24h", "cpi_latest", "fed_funds_rate", "unemployment_rate"],
    dataQuality: "partial_live",
  });
}

function liquidityPressureAlert(): SmartAlert | null {
  const liquidity = getLiquidityReport();
  const stablecoins = value("stablecoin_market_cap_7d");
  const dxy = value("dxy_trend_24h");
  const us10y = value("us10y_trend_24h");
  const realSpotLiquidity = liquidity.realSpotLiquidityScore ?? 0;
  if (stablecoins === null || dxy === null || us10y === null) return null;
  if (!(liquidity.liquidityScoreSigned <= -25 && (stablecoins <= -0.35 || realSpotLiquidity <= 0) && (dxy > 0.15 || us10y > 0.03))) return null;
  const confidence = confidenceFor(["stablecoin_market_cap_7d", "dxy_trend_24h", "us10y_trend_24h", "spot_volume_btc_24h"], 76, getIntelligenceReliabilityReportSync().confidenceCaps.liquidity);
  if (confidence === null) return null;
  return alertBase({
    id: "liquidity-pressure-spot-macro",
    type: "Liquidity Alert",
    priority: liquidity.liquidityScoreSigned <= -45 ? "high" : "medium",
    direction: "bearish",
    timeframe: "3d",
    affectedAssets: ["BTC", "ETH", "SOL", "USDT"],
    titleFa: "نقدینگی کریپتو زیر فشار ماکرو قرار گرفته است",
    reasoningFa: `امتیاز نقدینگی ${liquidity.liquidityScoreSigned}/100 است و رشد استیبل‌کوین‌ها ${stablecoins.toFixed(2)}٪ گزارش شده. وقتی نقدینگی واقعی اسپات ضعیف است و DXY یا US10Y فشار می‌آورند، رشد قیمت اگر رخ دهد بیشتر شکننده تلقی می‌شود.`,
    triggerCondition: "liquidityScore <= -25 + stablecoin/spot weakness + DXY or US10Y pressure",
    evidence: [`liquidity ${liquidity.liquidityScoreSigned}/100`, `stablecoins ${stablecoins.toFixed(2)}٪`, `real spot ${realSpotLiquidity}/100`, `sustainability ${liquidity.liquiditySustainabilityScore}/100`],
    causalChain: "نقدینگی اسپات ضعیف + فشار دلار/نرخ → کاهش پایداری حرکت → افزایش حساسیت BTC و SOL به برگشت سریع.",
    confidence,
    importance: clampPercent(confidence + Math.abs(liquidity.liquidityScoreSigned) * 0.35),
    invalidationCondition: "اگر stablecoin market cap بالای ۰٫۳۵٪ هفتگی رشد کند و DXY/US10Y هم‌زمان آرام شوند، سناریوی فشار نقدینگی ضعیف می‌شود.",
    suggestedTraderAction: "حرکت‌های مثبت کوتاه‌مدت را با پشتوانه نقدینگی بررسی کنید؛ بدون رشد استیبل‌کوین یا حجم اسپات، رالی می‌تواند کم‌عمق باشد.",
    whyItMattersFa: "کریپتو برای تداوم حرکت به نقدینگی واقعی نیاز دارد؛ اهرم به‌تنهایی پایداری نمی‌سازد.",
    monitoringFa: ["stablecoin_market_cap_7d", "spot_volume_btc_24h", "btc_etf_flow_24h", "eth_etf_flow_24h", "exchange_inflows", "exchange_outflows", "dxy_trend_24h"],
    dataQuality: liquidity.dataQuality,
  });
}

function leverageTrapAlert(): SmartAlert | null {
  const funding = value("funding_btc");
  const oi = value("open_interest_btc_24h");
  const futures = value("futures_volume_btc_24h");
  const spot = value("spot_volume_btc_24h");
  const liquidity = getLiquidityReport();
  const realSpotLiquidity = liquidity.realSpotLiquidityScore ?? 0;
  if (funding === null || oi === null || futures === null || spot === null) return null;
  if (!(funding > 0.025 && oi >= 3 && futures > Math.max(spot + 5, 5) && realSpotLiquidity <= 15)) return null;
  const confidence = confidenceFor(["funding_btc", "open_interest_btc_24h", "futures_volume_btc_24h", "spot_volume_btc_24h"], 80, getIntelligenceReliabilityReportSync().confidenceCaps.alerts);
  if (confidence === null) return null;
  return alertBase({
    id: "leverage-trap-btc",
    type: "Leverage Trap Alert",
    priority: funding > 0.06 || liquidity.leverageStress >= 78 ? "high" : "medium",
    direction: "mixed",
    timeframe: "24h",
    affectedAssets: ["BTC", "ETH", "SOL"],
    titleFa: "حرکت بازار بیشتر اهرمی است تا نقدینگی‌محور",
    reasoningFa: `Funding Rate (نرخ فاندینگ) روی ${funding.toFixed(3)}٪، Open Interest (موقعیت‌های باز) ${oi.toFixed(2)}٪ و حجم فیوچرز ${futures.toFixed(2)}٪ تغییر کرده، اما نقدینگی اسپات واقعی فقط ${realSpotLiquidity}/100 است. این ترکیب احتمال trap risk و لیکوییدیشن سریع را بالا می‌برد.`,
    triggerCondition: "funding > 0.025%, OI >= 3%, futures volume outpacing spot volume, real spot liquidity <= 15",
    evidence: [`Funding ${funding.toFixed(3)}٪`, `OI ${oi.toFixed(2)}٪`, `Futures volume ${futures.toFixed(2)}٪`, `Spot volume ${spot.toFixed(2)}٪`],
    causalChain: "اهرم ↑ + حجم فیوچرز ↑ + اسپات ضعیف → حرکت شکننده → ریسک لیکوییدیشن و برگشت تند.",
    confidence,
    importance: clampPercent(confidence + liquidity.leverageStress * 0.18),
    invalidationCondition: "این هشدار وقتی ضعیف می‌شود که funding به محدوده عادی برگردد، OI کاهش یابد یا حجم اسپات از فیوچرز پیشی بگیرد.",
    suggestedTraderAction: "قدرت حرکت را فقط از قیمت نخوانید؛ کیفیت پشتوانه آن را با funding، OI و spot volume بررسی کنید.",
    whyItMattersFa: "حرکت اهرمی بدون نقدینگی اسپات پایدار نیست و معمولاً به stop cascade حساس‌تر است.",
    monitoringFa: ["funding_btc", "open_interest_btc_24h", "spot_volume_btc_24h", "futures_volume_btc_24h"],
    dataQuality: "partial_live",
  });
}

function correlationBreakdownAlert(): SmartAlert | null {
  const report = getDynamicCorrelationReport();
  const breakdown = report.breakdownAlerts[0];
  const vix = value("vix_trend_24h");
  if (!breakdown || vix === null || vix <= 2) return null;
  const confidence = clampPercent(Math.min(getIntelligenceReliabilityReportSync().confidenceCaps.correlations, 58 + Math.min(30, Math.abs(breakdown.change ?? 0) * 40)));
  return alertBase({
    id: `correlation-breakdown-${breakdown.pair.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    type: "Correlation Breakdown Alert",
    priority: confidence >= 70 ? "high" : "medium",
    direction: "mixed",
    timeframe: "3d",
    affectedAssets: ["BTC", "ETH", "SOL", "Nasdaq", "DXY", "Gold", "US10Y"],
    titleFa: "رابطه همبستگی قبلی در حال تغییر است",
    reasoningFa: `${breakdown.pair} تغییر معنی‌دار بین پنجره‌های کوتاه و میان‌مدت نشان می‌دهد و VIX نیز ${vix.toFixed(2)}٪ تغییر کرده است. این یعنی تکیه روی روایت قبلی، مثل tech-beta یا hedge، باید دوباره راستی‌آزمایی شود.`,
    triggerCondition: "abs(corr_7d - corr_30d) > 0.60 or sign change + VIX change > 2%",
    evidence: [`${breakdown.pair}: ${breakdown.change}`, `VIX ${vix.toFixed(2)}٪`, breakdown.interpretation],
    causalChain: "شکست همبستگی + نوسان بالاتر → تغییر کانال انتقال ریسک → کاهش اعتبار سناریوهای قدیمی.",
    confidence,
    importance: clampPercent(confidence + 8),
    invalidationCondition: "اگر همبستگی ۷ روزه و ۳۰ روزه در بروزرسانی‌های بعدی دوباره هم‌جهت شوند، هشدار شکست رابطه لغو می‌شود.",
    suggestedTraderAction: "فرض‌های قبلی درباره اینکه BTC مثل Nasdaq یا Gold رفتار می‌کند را دوباره با عدد همبستگی بررسی کنید.",
    whyItMattersFa: "همبستگی‌ها تعیین می‌کنند فشار ماکرو از چه کانالی به کریپتو منتقل می‌شود.",
    monitoringFa: ["BTC/Nasdaq 7D", "BTC/DXY 7D", "BTC/Gold 7D", "VIX"],
    dataQuality: report.dataQuality,
  });
}

function weakRallyAlert(): SmartAlert | null {
  const btc = value("btc_trend_24h");
  const sol = value("sol_trend_24h");
  const liquidity = getLiquidityReport();
  const funding = value("funding_btc");
  const etf = value("btc_etf_flow_24h");
  if (btc === null || sol === null || funding === null) return null;
  const priceUp = btc > 0.5 || sol > 1.2;
  const etfWeak = etf === null || etf <= 0;
  if (!(priceUp && liquidity.liquidityScoreSigned < 0 && etfWeak && funding > 0.015)) return null;
  const confidence = confidenceFor(["btc_trend_24h", "sol_trend_24h", "funding_btc", "stablecoin_market_cap_7d"], 68, getIntelligenceReliabilityReportSync().confidenceCaps.alerts);
  if (confidence === null) return null;
  return alertBase({
    id: "weak-rally-liquidity-mismatch",
    type: "Weak Rally Alert",
    priority: "medium",
    direction: "mixed",
    timeframe: "24h",
    affectedAssets: ["BTC", "SOL", "ETH"],
    titleFa: "رشد قیمت با پشتوانه نقدینگی کامل تأیید نشده است",
    reasoningFa: `قیمت BTC یا SOL مثبت است، اما امتیاز نقدینگی ${liquidity.liquidityScoreSigned}/100 و جریان ETF ${etf === null ? "ناموجود" : etf.toFixed(0)} است. وقتی قیمت بالا می‌رود اما ETF/استیبل‌کوین/اسپات تأیید نمی‌کند، سناریو بیشتر شبیه weak participation rally است.`,
    triggerCondition: "price up + negative liquidity score + weak/unavailable ETF + positive funding",
    evidence: [`BTC ${btc.toFixed(2)}٪`, `SOL ${sol.toFixed(2)}٪`, `liquidity ${liquidity.liquidityScoreSigned}/100`, `funding ${funding.toFixed(3)}٪`],
    causalChain: "قیمت ↑ بدون تأیید نقدینگی نقدی → رالی کم‌عمق → افزایش احتمال برگشت اگر DXY/US10Y فشار بیاورند.",
    confidence,
    importance: clampPercent(confidence + 4),
    invalidationCondition: "این هشدار با مثبت شدن ETF inflow، رشد استیبل‌کوین بالای ۰٫۳۵٪ و بهبود حجم اسپات تضعیف می‌شود.",
    suggestedTraderAction: "رشد قیمت را با کیفیت جریان سرمایه مقایسه کنید؛ صرفاً سبز بودن قیمت، تأیید expansion نیست.",
    whyItMattersFa: "رالی بدون مشارکت نقدینگی واقعی معمولاً دوام کمتری دارد و نسبت به فشار ماکرو آسیب‌پذیرتر است.",
    monitoringFa: ["btc_etf_flow_24h", "eth_etf_flow_24h", "exchange_inflows", "exchange_outflows", "stablecoin_market_cap_7d", "spot_volume_btc_24h", "funding_btc"],
    dataQuality: liquidity.dataQuality,
  });
}

function regimeShiftAlert(): SmartAlert | null {
  const regime = getMarketRegimeReport();
  if (!regime.changedLast24h || !regime.confidenceDetail?.available || !regime.regimeLabel) return null;
  const confidence = Math.min(regime.confidenceDetail.score ?? 0, getIntelligenceReliabilityReportSync().confidenceCaps.regime);
  if (confidence < 45) return null;
  return alertBase({
    id: `regime-shift-${regime.regimeLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    type: "Regime Shift Alert",
    priority: confidence >= 68 ? "high" : "medium",
    direction: "mixed",
    timeframe: "7d",
    affectedAssets: regime.affectedAssets,
    titleFa: `تغییر رژیم بازار: ${regime.regimeLabel}`,
    reasoningFa: regime.interpretationFa,
    triggerCondition: `regime changed from ${regime.previousRegimeLabel} to ${regime.regimeLabel}`,
    evidence: regime.alertContext.slice(0, 4),
    causalChain: "تغییر هم‌زمان محرک‌های قیمت، ماکرو، نقدینگی و اهرم → تغییر رژیم بازار → تغییر حساسیت دارایی‌ها.",
    confidence,
    importance: clampPercent(confidence + 10),
    invalidationCondition: regime.invalidationFa,
    suggestedTraderAction: "نقشه اثر دارایی‌ها را بر اساس رژیم جدید بخوانید؛ این هشدار سیگنال ورود/خروج نیست.",
    whyItMattersFa: "رژیم بازار مشخص می‌کند کدام محرک فعلاً وزن بیشتری دارد.",
    monitoringFa: regime.invalidationSignals ?? ["DXY", "US10Y", "stablecoins", "funding"],
    dataQuality: regime.engine.dataQuality,
  });
}

function dedupeAlerts(alerts: SmartAlert[]) {
  const byCause = new Map<string, SmartAlert>();
  for (const alert of alerts) {
    const key = `${alert.type}:${alert.causalChain}`;
    const existing = byCause.get(key);
    if (!existing || alert.importance > existing.importance) byCause.set(key, alert);
  }
  return Array.from(byCause.values()).sort((left, right) => right.importance - left.importance);
}

export function generateSmartAlerts(): SmartAlert[] {
  const alerts = [
    dataQualityAlert(),
    premiumMissingNotice(),
    macroPressureProxyAlert(),
    liquidityProxyAlert(),
    stablecoinPressureAlert(),
    volatilityExpansionAlert(),
    riskTransitionProxyAlert(),
    macroPressureAlert(),
    liquidityPressureAlert(),
    leverageTrapAlert(),
    correlationBreakdownAlert(),
    weakRallyAlert(),
    regimeShiftAlert(),
  ].filter((alert): alert is SmartAlert => Boolean(alert));

  return dedupeAlerts(alerts);
}

export function filterAlerts(params: { asset?: AssetSymbol; minLevel?: AlertLevel } = {}) {
  return generateSmartAlerts()
    .filter((alert) => (params.asset ? alert.affectedAssets.includes(params.asset) : true))
    .filter((alert) => (params.minLevel ? levelWeight[alert.level] >= levelWeight[params.minLevel] : true));
}
