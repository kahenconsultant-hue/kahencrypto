import type { RawEventInput, NormalizedEventInput } from "@/types/ingestion";
import type { NewsCategory } from "@/lib/types";

type EventLike = Pick<RawEventInput, "title" | "content" | "sourceName" | "timestamp" | "quality"> & {
  eventType?: string;
  affectedAssets?: string[];
  entities?: string[];
};

const financialPhraseMap: Array<[RegExp, string]> = [
  [/\bFederal Reserve\b/gi, "فدرال رزرو"],
  [/\bFOMC\b/gi, "کمیته بازار آزاد فدرال رزرو (FOMC)"],
  [/\bUS Treasury\b/gi, "خزانه‌داری آمریکا"],
  [/\bTreasury\b/gi, "خزانه‌داری آمریکا"],
  [/\bSecurities and Exchange Commission\b/gi, "کمیسیون بورس و اوراق بهادار آمریکا"],
  [/\bSEC\b/g, "کمیسیون بورس و اوراق بهادار آمریکا (SEC)"],
  [/\bEuropean Central Bank\b/gi, "بانک مرکزی اروپا"],
  [/\bECB\b/g, "بانک مرکزی اروپا (ECB)"],
  [/\bETF inflows?\b/gi, "ورود سرمایه به صندوق‌های قابل معامله (ETF)"],
  [/\bETF outflows?\b/gi, "خروج سرمایه از صندوق‌های قابل معامله (ETF)"],
  [/\bETF flows?\b/gi, "جریان صندوق‌های قابل معامله (ETF)"],
  [/\bETF\b/g, "صندوق قابل معامله (ETF)"],
  [/\bstablecoin supply\b/gi, "عرضه استیبل‌کوین"],
  [/\bstablecoins?\b/gi, "استیبل‌کوین"],
  [/\bTether\b/gi, "تتر"],
  [/\bUSDT\b/g, "تتر (USDT)"],
  [/\bUSDC\b/g, "یو‌اس‌دی‌کوین (USDC)"],
  [/\bBitcoin\b/gi, "بیت‌کوین"],
  [/\bBTC\b/g, "بیت‌کوین (BTC)"],
  [/\bEthereum\b/gi, "اتریوم"],
  [/\bETH\b/g, "اتریوم (ETH)"],
  [/\bSolana\b/gi, "سولانا"],
  [/\bSOL\b/g, "سولانا (SOL)"],
  [/\bDXY\b/g, "شاخص دلار (DXY)"],
  [/\bdollar index\b/gi, "شاخص دلار"],
  [/\bUS dollar\b/gi, "دلار آمریکا"],
  [/\bNasdaq\b/gi, "نزدک"],
  [/\bGold\b/g, "طلا"],
  [/\byields?\b/gi, "بازده اوراق"],
  [/\bUS10Y\b/g, "بازده اوراق ۱۰ ساله آمریکا (US10Y)"],
  [/\b10-year Treasury\b/gi, "اوراق ۱۰ ساله خزانه‌داری آمریکا"],
  [/\bfunding rates?\b/gi, "نرخ فاندینگ"],
  [/\bopen interest\b/gi, "موقعیت‌های باز"],
  [/\bliquidations?\b/gi, "لیکوییدیشن"],
  [/\bleverage\b/gi, "اهرم معاملاتی"],
  [/\bvolatility\b/gi, "نوسان"],
  [/\brisk[- ]on\b/gi, "ریسک‌پذیری"],
  [/\brisk[- ]off\b/gi, "ریسک‌گریزی"],
  [/\binflows?\b/gi, "ورود سرمایه"],
  [/\boutflows?\b/gi, "خروج سرمایه"],
  [/\bmarket cap\b/gi, "ارزش بازار"],
  [/\bvolume\b/gi, "حجم معاملات"],
  [/\bexchange reserves?\b/gi, "ذخایر صرافی‌ها"],
  [/\bwhales?\b/gi, "نهنگ‌های بازار"],
  [/\bsanctions?\b/gi, "تحریم"],
  [/\bregulation\b/gi, "رگولاتوری"],
  [/\bhack\b/gi, "حمله سایبری"],
  [/\bexploit\b/gi, "آسیب‌پذیری امنیتی"],
  [/\bheadline risk\b/gi, "ریسک تیتر خبری"],
  [/\bsentiment\b/gi, "سنتیمنت بازار"],
  [/\bcorrelation\b/gi, "همبستگی"],
  [/\bliquidity\b/gi, "نقدینگی"],
  [/\bdriver(s)?\b/gi, "محرک"],
  [/\bconfidence\b/gi, "سطح اطمینان"],
];

export const eventTypeLabelsFa: Record<string, string> = {
  central_bank_policy: "سیاست پولی بانک مرکزی",
  treasury_yield_move: "تغییر بازده اوراق خزانه",
  dxy_move: "حرکت شاخص دلار",
  inflation_data: "داده تورمی",
  employment_data: "داده بازار کار",
  etf_flow: "جریان صندوق‌های قابل معامله",
  stablecoin_liquidity: "نقدینگی استیبل‌کوین",
  exchange_risk: "ریسک صرافی",
  regulation: "رگولاتوری",
  security_risk: "ریسک امنیتی",
  liquidation_leverage: "اهرم و لیکوییدیشن",
  geopolitical_risk: "ریسک ژئوپلیتیک",
  institutional_adoption: "پذیرش نهادی",
  crypto_market_structure: "ساختار بازار کریپتو",
  macro_news: "خبر کلان",
  financial_market_news: "خبر بازار مالی",
};

export const publicAnalysisModeLabels: Record<string, string> = {
  free_data_plus_proxies: "داده رایگان + سیگنال‌های پروکسی",
  direct_data: "داده مستقیم",
  degraded: "کیفیت محدود",
  unavailable: "ناموجود",
};

const publicSlugLabels: Record<string, string> = {
  macro_pressure: "فشار ماکرو",
  crypto_liquidity_proxy: "پروکسی نقدینگی کریپتو",
  liquidity_proxy: "پروکسی نقدینگی",
  regime_proxy: "پروکسی رژیم بازار",
  volatility_proxy: "پروکسی نوسان",
  leverage_stress_proxy: "پروکسی فشار اهرمی",
  stablecoin_liquidity_proxy: "پروکسی نقدینگی استیبل‌کوین",
  institutional_risk_appetite_proxy: "پروکسی ریسک‌پذیری نهادی",
  deep_onchain: "آن‌چین عمیق",
  institutional_options_flow: "جریان اختیار معامله نهادی",
  derivatives_stress_analysis: "تحلیل فشار مشتقات",
  etf_flow_analysis: "تحلیل جریان صندوق قابل معامله",
};

const publicNewsCategories = new Set<NewsCategory>([
  "central_banks",
  "economic_data",
  "financial_media",
  "crypto_media",
  "onchain",
  "derivatives",
  "stablecoins",
  "etf",
  "sentiment",
  "geopolitics",
  "alternative_data",
  "exchange_health",
  "volatility_regime",
]);

const eventTypeCategoryMap: Record<string, NewsCategory> = {
  central_bank_policy: "central_banks",
  treasury_yield_move: "economic_data",
  dxy_move: "economic_data",
  inflation_data: "economic_data",
  employment_data: "economic_data",
  etf_flow: "etf",
  stablecoin_liquidity: "stablecoins",
  exchange_risk: "exchange_health",
  regulation: "financial_media",
  security_risk: "exchange_health",
  liquidation_leverage: "derivatives",
  geopolitical_risk: "geopolitics",
  institutional_adoption: "crypto_media",
  crypto_market_structure: "crypto_media",
  macro_news: "financial_media",
  financial_market_news: "financial_media",
  market_sentiment: "sentiment",
};

export function resolvePublicNewsCategory(event: {
  category?: string | null;
  eventType?: string | null;
  sourceName?: string | null;
  title?: string | null;
  content?: string | null;
}): NewsCategory {
  if (event.category && publicNewsCategories.has(event.category as NewsCategory)) {
    return event.category as NewsCategory;
  }

  if (event.eventType && eventTypeCategoryMap[event.eventType]) {
    return eventTypeCategoryMap[event.eventType];
  }

  const text = `${event.sourceName ?? ""} ${event.title ?? ""} ${event.content ?? ""}`.toLowerCase();
  if (/\betf|ibit|fbtc|gbtc|spot bitcoin|spot ethereum/.test(text)) return "etf";
  if (/\bstablecoin|usdt|usdc|tether|circle/.test(text)) return "stablecoins";
  if (/\bfunding|open interest|liquidation|futures|derivatives/.test(text)) return "derivatives";
  if (/\bfed|fomc|ecb|treasury|rate|yield|cpi|ppi|inflation|employment|unemployment/.test(text)) return "central_banks";
  if (/\bbtc|bitcoin|eth|ethereum|sol|solana|crypto|defi|blockchain/.test(text)) return "crypto_media";
  if (/\bwar|sanction|geopolitical|opec|nato|conflict/.test(text)) return "geopolitics";
  return "financial_media";
}

export function normalizePersianText(value?: string | null) {
  return String(value ?? "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\s+/g, " ")
    .replace(/\s+([،؛:.!?؟])/g, "$1")
    .replace(/([،؛:.!?؟])(?=\S)/g, "$1 ")
    .trim();
}

export function localizeFinancialTerms(value?: string | null) {
  let output = normalizePersianText(value);
  for (const [pattern, replacement] of financialPhraseMap) {
    output = output.replace(pattern, replacement);
  }
  return normalizePersianText(output);
}

export function sanitizePublicIntelligenceText(value?: string | null) {
  const normalized = normalizePersianText(value);
  if (publicSlugLabels[normalized]) return publicSlugLabels[normalized];

  return localizeFinancialTerms(normalized.replace(/_/g, " "))
    .replace(/\bAI pending\b/gi, "در حال آماده‌سازی توضیح فارسی")
    .replace(/\bfuture phase\b/gi, "مرحله بعدی")
    .replace(/\bprocessing later\b/gi, "پردازش بعدی")
    .replace(/\braw event\b/gi, "رویداد اولیه")
    .replace(/\bpipeline\b/gi, "فرآیند پردازش")
    .replace(/\bengine\b/gi, "لایه تحلیل")
    .replace(/\bCore\b/g, "هسته داده")
    .replace(/\bPremium\b/g, "پوشش تکمیلی")
    .replace(/\bTier 1\b/g, "منابع حیاتی")
    .replace(/\bTrap risk\b/gi, "ریسک دام قیمتی")
    .replace(/\bNet Flow\b/gi, "جریان خالص")
    .replace(/\bnuance\b/gi, "جزئیات وضعیت")
    .replace(/\bestimated\b/gi, "برآوردی با محدودیت")
    .replace(/\bunavailable\b/gi, "ناموجود");
}

function compactExcerpt(value?: string | null, fallback?: string) {
  const text = localizeFinancialTerms(value || fallback || "");
  if (!text) return "";
  return text.length > 260 ? `${text.slice(0, 260).trim()}…` : text;
}

function assetListFa(assets?: string[]) {
  if (!assets?.length) return "دارایی‌های اصلی بازار";
  return assets.join("، ");
}

export function buildPersianEventTitle(event: EventLike) {
  const title = localizeFinancialTerms(event.title);
  if (/[\u0600-\u06FF]/.test(title)) return title;
  const label = eventTypeLabelsFa[event.eventType ?? ""] ?? "رویداد بازار";
  return normalizePersianText(`${label}: ${title || event.sourceName}`);
}

export function buildPersianEventSummary(event: EventLike) {
  const label = eventTypeLabelsFa[event.eventType ?? ""] ?? "رویداد بازار";
  const excerpt = compactExcerpt(event.content, event.title);
  const assets = assetListFa(event.affectedAssets);
  const source = event.sourceName || "منبع ثبت‌شده";

  if (!excerpt) {
    return normalizePersianText(
      `از ${source} یک ${label} مرتبط با ${assets} ثبت شده است. برای برداشت جهت‌دار، واکنش قیمت، نقدینگی و همبستگی باید جداگانه تأیید شود.`,
    );
  }

  return normalizePersianText(
    `از ${source} یک ${label} مرتبط با ${assets} ثبت شده است. مضمون اصلی: ${excerpt}. این رویداد برای رصد بازار مهم است، اما به‌تنهایی سیگنال خرید/فروش یا نتیجه جهت‌دار قطعی نمی‌سازد.`,
  );
}

export function toPublicRawEvent(event: RawEventInput) {
  const projected = {
    ...event,
    category: resolvePublicNewsCategory(event),
    titleFa: buildPersianEventTitle(event),
    summaryFa: buildPersianEventSummary(event),
    contentFa: buildPersianEventSummary(event),
    sourceLabelFa: event.sourceName,
  };

  return {
    ...projected,
    title: projected.titleFa,
    content: projected.contentFa,
  };
}

export function toPublicNormalizedEvent(event: NormalizedEventInput) {
  const title = buildPersianEventTitle({
    title: event.title,
    content: event.summary,
    sourceName: event.sourceName,
    timestamp: event.eventTimestamp,
    quality: event.quality,
    eventType: event.eventType,
    affectedAssets: event.affectedAssets,
    entities: event.entities,
  });
  const summary = buildPersianEventSummary({
    title: event.title,
    content: event.summary,
    sourceName: event.sourceName,
    timestamp: event.eventTimestamp,
    quality: event.quality,
    eventType: event.eventType,
    affectedAssets: event.affectedAssets,
    entities: event.entities,
  });
  return {
    ...event,
    category: resolvePublicNewsCategory(event),
    timestamp: event.eventTimestamp,
    dedupHash: event.rawEventId ?? event.id ?? `${event.sourceId}:${event.eventTimestamp}:${event.title}`,
    title,
    summary,
    content: summary,
    sourceLabelFa: event.sourceName,
  };
}
