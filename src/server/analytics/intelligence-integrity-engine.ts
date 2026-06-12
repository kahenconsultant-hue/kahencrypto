import type { AlertLevel, NormalizedSignal, SmartAlert, TraderAlertPriority } from "@/lib/types";
import { getFreshnessReportSync } from "@/health/freshness-engine";
import { resolveSignalFreshness } from "@/health/freshnessResolver";
import { getAssetImpactProfiles } from "@/server/analytics/asset-impact-engine";
import { getDynamicCorrelationReport } from "@/server/analytics/correlation-engine";
import { getLiquidityIntelligenceStack } from "@/server/analytics/liquidity-intelligence-stack";
import { getLiquidityReport } from "@/server/analytics/liquidity-engine";
import { getMarketRegimeReport } from "@/server/analytics/market-regime-engine";
import { getRiskReport } from "@/server/analytics/risk-engine";
import { getSentimentReport } from "@/server/analytics/sentiment-engine";
import { getSignalSnapshot } from "@/server/analytics/market-signals";
import { clampPercent } from "@/server/analytics/scoring-engine";
import { calculateAlertQualityScore, classifyAlertQuality } from "@/server/alerts/alert-suppression-engine";

export type IntegrityIssueSeverity = "info" | "warning" | "critical";
export type IntegrityIssueCategory =
  | "consistency"
  | "narrative"
  | "confidence"
  | "freshness"
  | "correlation"
  | "alert"
  | "sentiment"
  | "etf";

export interface IntegrityIssue {
  id: string;
  category: IntegrityIssueCategory;
  severity: IntegrityIssueSeverity;
  scope: "regime" | "liquidity" | "risk" | "sentiment" | "asset_impact" | "alerts" | "correlations" | "data";
  titleFa: string;
  detailFa: string;
  correctionFa: string;
  blockedOutput: boolean;
  relatedKeys: string[];
}

export interface IntegrityDashboardReport {
  generatedAt: string;
  status: "clean" | "corrected" | "violations";
  consistencyViolations: IntegrityIssue[];
  confidenceViolations: IntegrityIssue[];
  freshnessViolations: IntegrityIssue[];
  missingInputs: string[];
  narrativeCorrections: IntegrityIssue[];
  rejectedSignals: IntegrityIssue[];
  correctionsApplied: number;
  narrativesRejected: number;
  signalsDowngraded: number;
  confidenceAdjustments: number;
  remainingIntegrityRisks: string[];
  summaryFa: string;
}

const priorityOrder: TraderAlertPriority[] = ["low", "medium", "high", "critical"];

function priorityToLevel(priority: TraderAlertPriority): AlertLevel {
  if (priority === "critical") return "Critical";
  if (priority === "high") return "Important";
  if (priority === "medium") return "Watch";
  return "Info";
}

function capPriority(priority: TraderAlertPriority, maxPriority: TraderAlertPriority) {
  return priorityOrder.indexOf(priority) > priorityOrder.indexOf(maxPriority) ? maxPriority : priority;
}

function alertAvailableCount(alert: SmartAlert) {
  return (alert.dataUsed ?? []).filter((item) => item.status === "available").length;
}

function alertCoverage(alert: SmartAlert) {
  if (typeof alert.dataCoveragePercent === "number") return alert.dataCoveragePercent;
  const dataUsed = alert.dataUsed ?? [];
  if (!dataUsed.length) return 0;
  return clampPercent((alertAvailableCount(alert) / dataUsed.length) * 100);
}

function alertIndependentSources(alert: SmartAlert) {
  return new Set((alert.dataUsed ?? []).filter((item) => item.status === "available").map((item) => item.source)).size;
}

function appendReason(current: string | null | undefined, reason: string) {
  if (!current) return reason;
  return current.includes(reason) ? current : `${current} ${reason}`;
}

export function signalFreshnessState(signal: Pick<NormalizedSignal, "key" | "timestamp" | "quality"> | undefined) {
  if (!signal || signal.quality === "unavailable") return "missing" as const;
  const resolved = resolveSignalFreshness({
    key: signal.key,
    timestamp: signal.timestamp,
    quality: signal.quality,
    group: "price",
    source: "",
  });
  if (resolved.state === "obsolete") return "unknown" as const;
  return resolved.state === "stale" ? "stale" as const : "fresh" as const;
}

function issue(params: Omit<IntegrityIssue, "id">): IntegrityIssue {
  return {
    id: `${params.category}-${params.scope}-${params.relatedKeys.join("-") || params.titleFa}`.replace(/\s+/g, "-").slice(0, 160),
    ...params,
  };
}

function hasOptimisticLiquidityNarrative(text: string) {
  const normalized = text
    .split(/[.؟!؛]/)
    .filter((sentence) => !/(نباید|کافی نیست|نمی‌تواند|نمی‌کند|ناموجود|ضعیف|فشار)/i.test(sentence))
    .join(" ");
  return /حمایتی|گسترش|expansion|supportive|expanding/i.test(normalized);
}

function validateLiquidity(): IntegrityIssue[] {
  const output = getLiquidityReport();
  const stack = getLiquidityIntelligenceStack();
  const issues: IntegrityIssue[] = [];
  const stackScore = stack.finalLiquidityScore;
  const legacyScore = output.liquidityHealthScore ?? null;
  const checkedScore = typeof stackScore === "number" ? stackScore : legacyScore;
  const classificationText = `${stack.finalLiquidityLabelFa ?? ""} ${output.strictLiquidityLabelFa ?? ""} ${output.condition ?? ""} ${output.explanation ?? ""}`;
  const optimistic = hasOptimisticLiquidityNarrative(classificationText);

  if (typeof stackScore === "number" && typeof legacyScore === "number" && Math.abs(stackScore - legacyScore) > 0) {
    issues.push(issue({
      category: "consistency",
      severity: "critical",
      scope: "liquidity",
      titleFa: "چند منبع متناقض برای نقدینگی",
      detailFa: `Liquidity Stack عدد ${stackScore}/100 و LiquidityHealthScore عدد ${legacyScore}/100 را نشان می‌دهد.`,
      correctionFa: "همه پنل‌های نقدینگی باید از LiquidityHealthScore به‌عنوان منبع واحد استفاده کنند.",
      blockedOutput: true,
      relatedKeys: ["LiquidityHealthScore", "liquidity_fusion"],
    }));
  }

  if (stack.finalLiquidityClass && output.strictLiquidityClass && stack.finalLiquidityClass !== output.strictLiquidityClass) {
    issues.push(issue({
      category: "consistency",
      severity: "critical",
      scope: "liquidity",
      titleFa: "ناسازگاری کلاس نقدینگی بین پنل‌ها",
      detailFa: `Liquidity Stack کلاس ${stack.finalLiquidityClass} و موتور اصلی کلاس ${output.strictLiquidityClass} را نشان می‌دهد.`,
      correctionFa: "classification همه پنل‌ها باید از همان LiquidityHealthScore مشتق شود.",
      blockedOutput: true,
      relatedKeys: ["strictLiquidityClass", "finalLiquidityClass"],
    }));
  }

  if (checkedScore !== null && checkedScore < 45 && optimistic) {
    issues.push(issue({
      category: "consistency",
      severity: "critical",
      scope: "liquidity",
      titleFa: "ناسازگاری طبقه‌بندی نقدینگی",
      detailFa: `امتیاز نقدینگی ${checkedScore}/100 است، اما خروجی یا روایت حالت حمایتی/گسترشی دارد.`,
      correctionFa: "طبقه‌بندی باید به «فشار نقدینگی» یا «نقدینگی ضعیف» محدود شود و روایت خوش‌بینانه رد شود.",
      blockedOutput: true,
      relatedKeys: ["liquidity_score"],
    }));
  }

  if (stack.finalLiquidityScore === null && stack.confirmingEngines.length) {
    issues.push(issue({
      category: "narrative",
      severity: "warning",
      scope: "liquidity",
      titleFa: "تأیید نقدینگی بدون امتیاز ساختاری",
      detailFa: "Fusion Score ناموجود است اما بخشی از متن ممکن است موتورهای تأییدکننده را نمایش دهد.",
      correctionFa: "وقتی Fusion Score ناموجود است، متن فقط باید محدودیت داده ساختاری را توضیح دهد.",
      blockedOutput: true,
      relatedKeys: ["liquidity_fusion"],
    }));
  }

  return issues;
}

function validateRisk(): IntegrityIssue[] {
  const risk = getRiskReport();
  const liquidity = getLiquidityReport();
  const issues: IntegrityIssue[] = [];
  if (risk.riskScore !== null && risk.riskScore > 70 && ["low", "moderate"].includes(risk.riskLevel)) {
    issues.push(issue({
      category: "consistency",
      severity: "critical",
      scope: "risk",
      titleFa: "ناسازگاری سطح ریسک",
      detailFa: `Risk Score برابر ${risk.riskScore}/100 است اما سطح ریسک ${risk.riskLevel} نمایش داده شده.`,
      correctionFa: "برای امتیاز بالای ۷۰، سطح ریسک باید High یا Critical باشد.",
      blockedOutput: true,
      relatedKeys: ["risk_score"],
    }));
  }
  if ((liquidity.liquidityHealthScore ?? liquidity.liquidityScore ?? null) !== null && (liquidity.liquidityHealthScore ?? liquidity.liquidityScore ?? 100) < 25 && risk.riskScore !== null && risk.riskScore < 40) {
    issues.push(issue({
      category: "consistency",
      severity: "critical",
      scope: "risk",
      titleFa: "کف ریسک با فشار نقدینگی رعایت نشده است",
      detailFa: `Liquidity Score زیر ۲۵ است اما Risk Score فقط ${risk.riskScore}/100 است.`,
      correctionFa: "وقتی نقدینگی در محدوده Stress است، Risk Score نمی‌تواند زیر ۴۰ نمایش داده شود.",
      blockedOutput: true,
      relatedKeys: ["risk_score", "liquidity_score"],
    }));
  }
  if ((liquidity.liquidityHealthScore ?? liquidity.liquidityScore ?? null) !== null && (liquidity.liquidityHealthScore ?? liquidity.liquidityScore ?? 100) < 25 && risk.riskLevel === "low") {
    issues.push(issue({
      category: "consistency",
      severity: "critical",
      scope: "risk",
      titleFa: "Liquidity Stress با Low Risk ناسازگار است",
      detailFa: `Liquidity Score ${liquidity.liquidityHealthScore ?? liquidity.liquidityScore}/100 است اما سطح ریسک Low نمایش داده شده.`,
      correctionFa: "Risk باید حداقل Moderate یا Elevated باشد مگر توضیح ساختاری معتبر وجود داشته باشد.",
      blockedOutput: true,
      relatedKeys: ["risk_level", "liquidity_score"],
    }));
  }
  return issues;
}

function validateRegime(): IntegrityIssue[] {
  const regime = getMarketRegimeReport();
  const liquidity = getLiquidityReport();
  const snapshot = getSignalSnapshot();
  const dxy = snapshot.byKey.dxy_trend_24h?.value;
  const us10y = snapshot.byKey.us10y_trend_24h?.value;
  const macroNegative = (typeof dxy === "number" && dxy > 0.15) || (typeof us10y === "number" && us10y > 0.03);
  const liquidityWeak = liquidity.dataQuality !== "unavailable" && ((liquidity.liquidityHealthScore ?? 50) < 45 || liquidity.liquidityScoreSigned < 0);
  const leverageElevated = liquidity.dataQuality !== "unavailable" && liquidity.leverageStress >= 70;
  const regimeText = `${regime.regimeLabel ?? ""} ${regime.active ?? ""} ${regime.interpretationFa ?? ""}`;
  const expansionLike = /risk-on expansion|expansion|liquidity expansion|گسترش|ریسک‌پذیری قوی/i.test(regimeText);

  if (macroNegative && liquidityWeak && leverageElevated && expansionLike) {
    return [issue({
      category: "consistency",
      severity: "critical",
      scope: "regime",
      titleFa: "رژیم با ساختار کلان/نقدینگی ناسازگار است",
      detailFa: "ماکرو منفی، نقدینگی ضعیف و اهرم بالا هم‌زمان فعال‌اند؛ خروجی expansion یا risk-on کامل مجاز نیست.",
      correctionFa: "رژیم باید به Neutral/Transition، Fragile Risk-On یا Liquidity-Constrained Risk-On کاهش یابد.",
      blockedOutput: true,
      relatedKeys: ["dxy_trend_24h", "us10y_trend_24h", "liquidity", "leverage"],
    })];
  }

  return [];
}

function validateSentiment(): IntegrityIssue[] {
  const sentiment = getSentimentReport();
  const issues: IntegrityIssue[] = [];
  const contaminated = sentiment.highImpactHeadlines.filter(
    (headline) =>
      headline.marketRelevanceScore < 40 ||
      headline.relevanceLabel === "ignored" ||
      headline.impactScore < 45 ||
      headline.sourceCredibility < 45,
  );
  if (contaminated.length) {
    issues.push(issue({
      category: "sentiment",
      severity: "critical",
      scope: "sentiment",
      titleFa: "خبر کم‌اهمیت وارد سنتیمنت شده است",
      detailFa: `${contaminated.length} headline با relevance زیر ۴۰ در خروجی اثرگذار دیده شد.`,
      correctionFa: "headlineهای relevance زیر ۴۰ نباید sentiment، regime یا alert را تغییر دهند.",
      blockedOutput: true,
      relatedKeys: contaminated.map((headline) => headline.id).slice(0, 6),
    }));
  }
  const geopoliticalNoise = sentiment.highImpactHeadlines.filter(
    (headline) => headline.category === "geopolitics" && (headline.marketRelevanceScore < 70 || headline.impactScore < 70),
  );
  if (geopoliticalNoise.length) {
    issues.push(issue({
      category: "sentiment",
      severity: "critical",
      scope: "sentiment",
      titleFa: "خبر ژئوپلیتیک کم‌اثر وارد سنتیمنت شده است",
      detailFa: `${geopoliticalNoise.length} headline ژئوپلیتیک بدون relevance/impact کافی در خروجی اثرگذار دیده شد.`,
      correctionFa: "ژئوپلیتیک فقط وقتی وارد sentiment می‌شود که directness و impact کافی داشته باشد.",
      blockedOutput: true,
      relatedKeys: geopoliticalNoise.map((headline) => headline.id).slice(0, 6),
    }));
  }
  if (Math.abs(sentiment.sentimentScore) > 10) {
    const confirmation = sentiment.directionalConfirmation;
    const hasConfirmation = sentiment.sentimentScore > 0 ? confirmation?.positiveConfirmed : confirmation?.negativeConfirmed;
    if (!hasConfirmation) {
      issues.push(issue({
        category: "sentiment",
        severity: "critical",
        scope: "sentiment",
        titleFa: "شوک سنتیمنت بدون دو منبع مستقل",
        detailFa: "Sentiment directional است، اما دو منبع high-impact مستقل همان جهت را تأیید نکرده‌اند.",
        correctionFa: "سنتیمنت باید به neutral نزدیک بماند مگر دست‌کم دو منبع معتبر جهت فشار را تأیید کنند.",
        blockedOutput: true,
        relatedKeys: ["sentiment_directional_confirmation"],
      }));
    }
  }
  if (sentiment.categoryConcentration?.bucket === "geopolitical" && Math.abs(sentiment.sentimentScore) > 10) {
    issues.push(issue({
      category: "sentiment",
      severity: "warning",
      scope: "sentiment",
      titleFa: "تمرکز ژئوپلیتیک در سنتیمنت",
      detailFa: sentiment.categoryConcentration.disclosureFa,
      correctionFa: "سنتیمنت نهایی باید با وزن ۱۰٪ برای ژئوپلیتیک محدود و تمرکز دسته‌ای آشکار شود.",
      blockedOutput: false,
      relatedKeys: ["sentiment_category_concentration"],
    }));
  }
  return issues;
}

function validateCorrelations(): IntegrityIssue[] {
  const report = getDynamicCorrelationReport();
  const signalIssues = report.signals.flatMap((signal) => {
    const selected = signal.correlation7D ?? signal.correlation30D ?? signal.correlation24H;
    const maxSample = Math.max(...Object.values(signal.sampleSizes ?? { "24h": 0, "7d": 0, "30d": 0, "90d": 0 }));
    const issues: IntegrityIssue[] = [];
    if (signal.status !== "available" && signal.narrativeAllowed) {
      issues.push(issue({
        category: "correlation",
        severity: "critical",
        scope: "correlations",
        titleFa: "روایت همبستگی با نمونه ناکافی",
        detailFa: `${signal.assetPair} داده کافی ندارد اما narrativeAllowed فعال است.`,
        correctionFa: "وقتی sample کافی نیست، فقط «داده ناکافی» مجاز است.",
        blockedOutput: true,
        relatedKeys: [signal.assetPair],
      }));
    }
    if (typeof selected === "number" && Math.abs(selected) < 0.2 && /فشار|risk|bullish|bearish|صعود|نزول/i.test(signal.interpretation)) {
      issues.push(issue({
        category: "correlation",
        severity: "warning",
        scope: "correlations",
        titleFa: "روایت جهت‌دار با همبستگی ضعیف",
        detailFa: `${signal.assetPair} همبستگی زیر ۰٫۲۰ دارد اما متن ممکن است جهت‌دار باشد.`,
        correctionFa: "برای |correlation| < 0.2 فقط ضعف رابطه یا decoupling نمایش داده شود.",
        blockedOutput: true,
        relatedKeys: [signal.assetPair],
      }));
    }
    if (signal.confidence !== null && maxSample < 12 && signal.confidence > 40) {
      issues.push(issue({
        category: "confidence",
        severity: "warning",
        scope: "correlations",
        titleFa: "Confidence همبستگی با نمونه کم بیش از حد است",
        detailFa: `${signal.assetPair} فقط ${maxSample} observation دارد اما confidence ${signal.confidence}% است.`,
        correctionFa: "Confidence همبستگی باید با sample size، stability و persistence محدود شود.",
        blockedOutput: false,
        relatedKeys: [signal.assetPair],
      }));
    }
    if (signal.confidence !== null && typeof signal.coveragePercent === "number" && signal.confidence > signal.coveragePercent) {
      issues.push(issue({
        category: "confidence",
        severity: "critical",
        scope: "correlations",
        titleFa: "Confidence همبستگی بالاتر از پوشش داده است",
        detailFa: `${signal.assetPair}: coverage=${signal.coveragePercent}% اما confidence=${signal.confidence}%.`,
        correctionFa: "Confidence همبستگی باید با coverage همان pair سقف‌گذاری شود.",
        blockedOutput: true,
        relatedKeys: [signal.assetPair],
      }));
    }
    if (signal.confidence !== null) {
      const values = [signal.correlation24H, signal.correlation7D, signal.correlation30D, signal.correlation90D].filter((value): value is number => typeof value === "number");
      const maxAbs = values.length ? Math.max(...values.map((value) => Math.abs(value))) : null;
      const strengthCap = maxAbs === null ? null : maxAbs < 0.1 ? 45 : maxAbs < 0.2 ? 60 : maxAbs < 0.3 ? 70 : null;
      if (strengthCap !== null && signal.confidence > strengthCap) {
        issues.push(issue({
          category: "confidence",
          severity: "critical",
          scope: "correlations",
          titleFa: "Confidence همبستگی با شدت رابطه سازگار نیست",
          detailFa: `${signal.assetPair}: max |corr|=${maxAbs?.toFixed(2)} اما confidence=${signal.confidence}%.`,
          correctionFa: "Confidence باید با correlation strength سقف‌گذاری شود؛ رابطه ضعیف نمی‌تواند confidence بسیار بالا بگیرد.",
          blockedOutput: true,
          relatedKeys: [signal.assetPair],
        }));
      }
    }
    return issues;
  });
  const engineIssues: IntegrityIssue[] = [];
  if (report.engineConfidence !== null && typeof report.correlationCoverage === "number" && report.engineConfidence > report.correlationCoverage) {
    engineIssues.push(issue({
      category: "confidence",
      severity: "critical",
      scope: "correlations",
      titleFa: "Confidence موتور همبستگی از coverage بالاتر است",
      detailFa: `Correlation coverage=${report.correlationCoverage}% اما engine confidence=${report.engineConfidence}%.`,
      correctionFa: "Engine confidence باید با correlationCoverage محدود شود.",
      blockedOutput: true,
      relatedKeys: ["correlation_coverage"],
    }));
  }
  return [...signalIssues, ...engineIssues];
}

function validateFreshness(): IntegrityIssue[] {
  const signalIssues = getSignalSnapshot().signals.flatMap((signal) => {
    const state = signalFreshnessState(signal);
    if (state !== "stale") return [];
    const age = resolveSignalFreshness(signal).ageMinutes;
    return [issue({
      category: "freshness",
      severity: "warning",
      scope: "data",
      titleFa: "سیگنال stale نباید confidence را افزایش دهد",
      detailFa: `${signal.key} حدود ${age ?? "نامعلوم"} دقیقه قدیمی است و از آستانه مجاز خود عبور کرده.`,
      correctionFa: "این سیگنال در افزایش confidence، severity یا تقویت رژیم نباید نقش مثبت داشته باشد.",
      blockedOutput: false,
      relatedKeys: [signal.key],
    })];
  });
  const freshness = getFreshnessReportSync();
  const sourceContradiction =
    freshness.summary.healthySources === 0 &&
    freshness.sourceFreshness.some((source) => source.tier === 1 && source.healthState === "healthy");
  const contradictionIssues = sourceContradiction
    ? [issue({
        category: "freshness",
        severity: "critical",
        scope: "data",
        titleFa: "تناقض شمارش سلامت منابع",
        detailFa: "در گزارش freshness، منبع tier 1 سالم دیده می‌شود اما healthySources کلی صفر است.",
        correctionFa: "شمارش Critical Sources و Active Sources باید از یک resolver مشترک استفاده کند.",
        blockedOutput: true,
        relatedKeys: ["source_health_counts"],
      })]
    : [];
  return [...signalIssues, ...contradictionIssues];
}

function validateEtfNarratives(alerts: SmartAlert[]): IntegrityIssue[] {
  const snapshot = getSignalSnapshot();
  const btcEtfMissing = !snapshot.byKey.btc_etf_flow_24h || snapshot.byKey.btc_etf_flow_24h.value === null || snapshot.byKey.btc_etf_flow_24h.quality === "unavailable";
  const ethEtfMissing = !snapshot.byKey.eth_etf_flow_24h || snapshot.byKey.eth_etf_flow_24h.value === null || snapshot.byKey.eth_etf_flow_24h.quality === "unavailable";
  if (!btcEtfMissing && !ethEtfMissing) return [];
  const pattern = /ETF.*(بهبود|مثبت|inflow|improving)|تقاضای نهادی.*(بهبود|مثبت|افزایش)/i;
  return alerts
    .filter((alert) => pattern.test(`${alert.reasoningFa} ${alert.causalChain ?? ""} ${alert.whyItMattersFa}`))
    .map((alert) => issue({
      category: "etf",
      severity: "critical",
      scope: "alerts",
      titleFa: "روایت ETF بدون داده واقعی",
      detailFa: `${alert.titleFa} درباره بهبود ETF/تقاضای نهادی صحبت می‌کند اما ETF Flow ناموجود است.`,
      correctionFa: "وقتی ETF Flow Missing است، روایت باید «تقاضای نهادی ناموجود» بگوید.",
      blockedOutput: true,
      relatedKeys: [alert.id, "btc_etf_flow_24h", "eth_etf_flow_24h"],
    }));
}

function validateAssetImpacts(): IntegrityIssue[] {
  return getAssetImpactProfiles().flatMap((profile) => {
    if (profile.confidence.available || Math.abs(profile.impactScore) < 40) return [];
    return [issue({
      category: "confidence",
      severity: "warning",
      scope: "asset_impact",
      titleFa: "اثر دارایی بدون confidence معتبر",
      detailFa: `${profile.asset} impactScore ${profile.impactScore} دارد، اما confidence ناموجود است.`,
      correctionFa: "وقتی confidence ناموجود است، اثر دارایی باید به‌عنوان تحلیل نامعتبر/ناموجود نمایش داده شود.",
      blockedOutput: true,
      relatedKeys: [profile.asset],
    })];
  });
}

export function validateAndCorrectAlerts(alerts: SmartAlert[]): SmartAlert[] {
  const now = Date.now();
  return alerts
    .filter((alert) => !alert.expiresAt || Date.parse(alert.expiresAt) > now)
    .map((alert) => {
      const coverage = alertCoverage(alert);
      const availableCount = alertAvailableCount(alert);
      const sources = alertIndependentSources(alert);
      const confirmations = alert.crossConfirmationCount ?? sources;
      let priority = alert.priority ?? "low";
      let confidence = alert.confidence;
      let level = alert.level;
      const reasons: string[] = [];

      if (confidence > coverage && sources < 2) {
        confidence = coverage;
        reasons.push(`confidence با پوشش داده ${coverage}٪ محدود شد چون دو منبع مستقل تأییدکننده وجود ندارد.`);
      }

      if (priority === "critical" && !(coverage > 75 && confidence > 75 && availableCount >= 4 && confirmations >= 3)) {
        priority = capPriority(priority, "high");
        reasons.push("Critical severity نیازمند coverage بالای ۷۵٪، confidence بالای ۷۵٪، حداقل چهار شاخص و سه تأیید مستقل است.");
      }

      if ((priority === "high" || priority === "critical") && !(availableCount >= 3 && sources >= 2 && coverage > 60 && confidence > 60)) {
        priority = capPriority(priority, "medium");
        reasons.push("High severity نیازمند حداقل سه شاخص واقعی، دو منبع مستقل، coverage بالای ۶۰٪ و confidence بالای ۶۰٪ است.");
      }

      if (confidence < 50) {
        priority = capPriority(priority, "medium");
        reasons.push("هشدار کم‌اطمینان نمی‌تواند high-risk یا systemic نمایش داده شود.");
      }

      if (alert.type.toString().includes("_proxy_")) {
        priority = capPriority(priority, "medium");
        reasons.push("هشدار proxy-based از نظر integrity حداکثر شدت متوسط می‌گیرد.");
      }

      level = priorityToLevel(priority);
      return {
        ...alert,
        priority,
        urgency: priority,
        level,
        confidence: clampPercent(confidence),
        dataCoveragePercent: coverage,
        confidenceCapReason: reasons.length ? appendReason(alert.confidenceCapReason, reasons.join(" ")) : alert.confidenceCapReason,
        severityReasonFa: reasons.length ? `${alert.severityReasonFa} ${reasons.join(" ")}` : alert.severityReasonFa,
        alertQualityScore: calculateAlertQualityScore(alert.alertQualityBreakdown ?? {
          signalQuality: Math.min(100, availableCount * 25) * 0.55 + Math.min(100, sources * 35) * 0.45,
          dataCoverage: coverage,
          sourceReliability: coverage,
          freshness: clampPercent(100 - (alert.freshnessPenalty ?? 0)),
        }),
        alertQualityLabel: classifyAlertQuality(calculateAlertQualityScore(alert.alertQualityBreakdown ?? {
          signalQuality: Math.min(100, availableCount * 25) * 0.55 + Math.min(100, sources * 35) * 0.45,
          dataCoverage: coverage,
          sourceReliability: coverage,
          freshness: clampPercent(100 - (alert.freshnessPenalty ?? 0)),
        })),
      };
    });
}

function validateAlerts(alerts: SmartAlert[]): IntegrityIssue[] {
  return alerts.flatMap((alert) => {
    const coverage = alertCoverage(alert);
    const availableCount = alertAvailableCount(alert);
    const sources = alertIndependentSources(alert);
    const priority = alert.priority ?? "low";
    const issues: IntegrityIssue[] = [];

    if ((priority === "high" || priority === "critical") && !(availableCount >= 3 && sources >= 2 && coverage > 60 && alert.confidence > 60)) {
      issues.push(issue({
        category: "alert",
        severity: "critical",
        scope: "alerts",
        titleFa: "شدت هشدار با کیفیت داده سازگار نیست",
        detailFa: `${alert.titleFa}: indicators=${availableCount}, sources=${sources}, coverage=${coverage}%, confidence=${alert.confidence}%.`,
        correctionFa: "هشدار باید خودکار به Medium/Low کاهش یابد.",
        blockedOutput: true,
        relatedKeys: [alert.id],
      }));
    }

    if (alert.confidence > coverage) {
      issues.push(issue({
        category: "confidence",
        severity: "critical",
        scope: "alerts",
        titleFa: "Confidence هشدار بالاتر از پوشش داده است",
        detailFa: `${alert.titleFa}: coverage=${coverage}% اما confidence=${alert.confidence}%.`,
        correctionFa: "Final confidence باید برابر ضعیف‌ترین مؤلفه کیفیت باشد و از coverage عبور نکند.",
        blockedOutput: true,
        relatedKeys: [alert.id],
      }));
    }

    if (priority === "critical" && !(coverage > 75 && alert.confidence > 75 && availableCount >= 4 && (alert.crossConfirmationCount ?? sources) >= 3)) {
      issues.push(issue({
        category: "alert",
        severity: "critical",
        scope: "alerts",
        titleFa: "Critical severity پشتیبانی کافی ندارد",
        detailFa: `${alert.titleFa} شرایط سختگیرانه Critical را ندارد.`,
        correctionFa: "Critical باید downgrade شود مگر coverage/confidence/confirmation کافی باشد.",
        blockedOutput: true,
        relatedKeys: [alert.id],
      }));
    }

    return issues;
  });
}

export function getIntelligenceIntegrityReport(params: { alerts?: SmartAlert[] } = {}): IntegrityDashboardReport {
  const alerts = params.alerts ?? [];
  const issueGroups = [
    ...validateLiquidity(),
    ...validateRisk(),
    ...validateRegime(),
    ...validateSentiment(),
    ...validateCorrelations(),
    ...validateFreshness(),
    ...validateEtfNarratives(alerts),
    ...validateAssetImpacts(),
    ...validateAlerts(alerts),
  ];
  const consistencyViolations = issueGroups.filter((item) => item.category === "consistency");
  const confidenceViolations = issueGroups.filter((item) => item.category === "confidence");
  const freshnessViolations = issueGroups.filter((item) => item.category === "freshness");
  const narrativeCorrections = issueGroups.filter((item) => item.category === "narrative" || item.category === "etf");
  const rejectedSignals = issueGroups.filter((item) => item.blockedOutput);
  const missingInputs = Array.from(new Set([
    ...getLiquidityIntelligenceStack().engines.flatMap((engine) => engine.missingInputs),
    ...alerts.flatMap((alert) => alert.missingSignals ?? []),
  ])).slice(0, 24);
  const correctionsApplied = issueGroups.filter((item) => item.blockedOutput || item.category === "confidence" || item.category === "freshness").length;
  const status = issueGroups.some((item) => item.severity === "critical") ? "violations" : issueGroups.length ? "corrected" : "clean";

  return {
    generatedAt: new Date().toISOString(),
    status,
    consistencyViolations,
    confidenceViolations,
    freshnessViolations,
    missingInputs,
    narrativeCorrections,
    rejectedSignals,
    correctionsApplied,
    narrativesRejected: narrativeCorrections.length,
    signalsDowngraded: issueGroups.filter((item) => item.category === "alert" || item.category === "correlation" || item.category === "freshness").length,
    confidenceAdjustments: confidenceViolations.length + alerts.filter((alert) => alert.confidenceCapReason).length,
    remainingIntegrityRisks: issueGroups.slice(0, 10).map((item) => item.detailFa),
    summaryFa:
      status === "clean"
        ? "لایه integrity تناقض بحرانی پیدا نکرد؛ خروجی‌ها همچنان با محدودیت داده و confidence نمایش داده می‌شوند."
        : status === "corrected"
          ? "لایه integrity چند محدودیت داده/روایت را اصلاح یا downgrade کرد؛ خروجی‌ها محافظه‌کارانه‌تر نمایش داده می‌شوند."
          : "لایه integrity تناقض بحرانی پیدا کرده است؛ خروجی‌های مرتبط باید Unknown، Missing یا downgraded نمایش داده شوند.",
  };
}
