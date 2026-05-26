import type { AssetSymbol, DataQuality, DirectionalBias, TransmissionChannel } from "@/lib/types";
import { getLatestNormalizedEvents } from "@/storage/ingestion-store";
import type { NormalizedEventInput } from "@/types/ingestion";

export type AiExplanationStatus = "ready" | "ai_unavailable" | "failed";

export interface EventExplanationOutput {
  eventId: string;
  source: string;
  title: string;
  eventType: string;
  affectedAssets: string[];
  status: AiExplanationStatus;
  quality: DataQuality;
  translationFa: string | null;
  summaryFa: string | null;
  macroInterpretationFa: string;
  cryptoInterpretationFa: string;
  actionableExplanationFa: string;
  uncertaintyNotesFa: string[];
  transmissionChannel: TransmissionChannel;
  expectedDirection: DirectionalBias;
  lastUpdatedAt: string;
}

const eventTypeLabelsFa: Record<string, string> = {
  central_bank_policy: "سیاست پولی بانک مرکزی",
  treasury_yield_move: "تغییر بازده اوراق خزانه",
  dxy_move: "حرکت شاخص دلار",
  inflation_data: "داده تورمی",
  employment_data: "داده بازار کار",
  etf_flow: "جریان ETF",
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

const channelByEventType: Record<string, TransmissionChannel> = {
  central_bank_policy: "rates",
  treasury_yield_move: "rates",
  dxy_move: "dollar",
  inflation_data: "rates",
  employment_data: "rates",
  etf_flow: "etf_flows",
  stablecoin_liquidity: "stablecoin_flows",
  exchange_risk: "onchain_activity",
  regulation: "regulatory_risk",
  security_risk: "sentiment_news_shock",
  liquidation_leverage: "leverage",
  geopolitical_risk: "geopolitical_risk",
  institutional_adoption: "etf_flows",
  crypto_market_structure: "risk_on_risk_off",
  macro_news: "risk_on_risk_off",
  financial_market_news: "risk_on_risk_off",
};

function directionForEvent(event: NormalizedEventInput): DirectionalBias {
  const title = `${event.title} ${event.summary}`.toLowerCase();
  if (/(outflow|lawsuit|sanction|hawkish|higher|attack|hack|exploit|liquidation|selloff|depeg)/i.test(title)) return "bearish";
  if (/(inflow|approval|dovish|easing|accumulation|adoption|record|growth|surge)/i.test(title)) return "bullish";
  if (event.eventType === "stablecoin_liquidity" || event.eventType === "geopolitical_risk") return "mixed";
  return "neutral";
}

function deterministicExplanation(event: NormalizedEventInput): EventExplanationOutput {
  const label = eventTypeLabelsFa[event.eventType] ?? "رویداد بازار";
  const channel = channelByEventType[event.eventType] ?? "risk_on_risk_off";
  const affectedAssets = event.affectedAssets.length ? event.affectedAssets : ["BTC", "ETH", "SOL"];
  const expectedDirection = directionForEvent(event);
  const translationAvailable = event.language === "fa";
  const titleFa = translationAvailable ? event.title : null;
  const sourceNote = `${event.sourceName} با اعتبار منبع ${event.sourceReliability}/100 و وضعیت تازگی ${event.freshnessStatus}`;

  return {
    eventId: event.id ?? event.rawEventId ?? event.title,
    source: event.sourceName,
    title: event.title,
    eventType: event.eventType,
    affectedAssets,
    status: process.env.OPENAI_API_KEY ? "ready" : "ai_unavailable",
    quality: process.env.OPENAI_API_KEY ? event.quality : "unavailable",
    translationFa: titleFa,
    summaryFa: translationAvailable ? event.summary : null,
    macroInterpretationFa:
      channel === "rates"
        ? `${label} معمولاً از مسیر انتظارات نرخ بهره و بازده اوراق به دارایی‌های پرریسک منتقل می‌شود. تا وقتی داده DXY، US10Y و Nasdaq تأیید ندهند، سیستم از نتیجه‌گیری جهت‌دار قطعی خودداری می‌کند.`
        : channel === "dollar"
          ? `${label} از مسیر هزینه نقدینگی دلاری اثر می‌گذارد. تقویت دلار معمولاً برای BTC، ETH و SOL فشارزا است، اما فقط با داده قیمت و همبستگی معتبر می‌توان شدت اثر را سنجید.`
          : channel === "stablecoin_flows"
            ? `${label} برای تشخیص ورود یا خروج نقدینگی نقدی مهم است. رشد واقعی استیبل‌کوین‌ها زمانی حمایتی است که با حجم اسپات یا ETF تأیید شود.`
            : `${label} به‌تنهایی برای تولید تحلیل جهت‌دار کافی نیست؛ اثر آن باید کنار قیمت، نقدینگی، همبستگی و کیفیت منبع خوانده شود.`,
    cryptoInterpretationFa:
      expectedDirection === "bearish"
        ? `اثر اولیه این رویداد برای ${affectedAssets.join("، ")} می‌تواند فشارزا باشد، اما سیستم بدون تأیید داده‌های بازار، امتیاز یا هشدار قطعی تولید نمی‌کند.`
        : expectedDirection === "bullish"
          ? `اثر اولیه این رویداد برای ${affectedAssets.join("، ")} می‌تواند حمایتی باشد، اما پایداری آن باید با جریان نقدینگی و واکنش قیمت راستی‌آزمایی شود.`
          : `اثر این رویداد برای ${affectedAssets.join("، ")} فعلاً خنثی یا دوگانه است و برای تحلیل معتبر به سیگنال‌های تکمیلی نیاز دارد.`,
    actionableExplanationFa:
      process.env.OPENAI_API_KEY
        ? "این خروجی آماده پردازش AI است؛ برای جلوگیری از هزینه و تولید تکراری، اجرای batch باید از worker انجام شود."
        : "ترجمه و خلاصه AI فعال نیست، چون OPENAI_API_KEY تنظیم نشده است. رویداد ذخیره شده و آماده پردازش است، اما متن فارسی کامل ساخته نمی‌شود.",
    uncertaintyNotesFa: [
      sourceNote,
      "این توضیح deterministic است و جایگزین تحلیل AI یا امتیازدهی اثر بازار نیست.",
      !process.env.OPENAI_API_KEY ? "کلید OpenAI موجود نیست؛ بنابراین translationFa و summaryFa برای تیتر انگلیسی عمداً خالی می‌ماند." : "",
    ].filter(Boolean),
    transmissionChannel: channel,
    expectedDirection,
    lastUpdatedAt: new Date().toISOString(),
  };
}

export async function getLatestEventExplanations(limit = 8): Promise<EventExplanationOutput[]> {
  const events = await getLatestNormalizedEvents(limit);
  return events.map(deterministicExplanation);
}

export function getAiLayerStatus() {
  return {
    generatedAt: new Date().toISOString(),
    provider: "OpenAI",
    enabled: Boolean(process.env.OPENAI_API_KEY),
    status: process.env.OPENAI_API_KEY ? "ready" : "api_key_missing",
    messageFa: process.env.OPENAI_API_KEY
      ? "لایه AI آماده پردازش batch رویدادهای normalized است."
      : "OPENAI_API_KEY تنظیم نشده است؛ سیستم ترجمه یا تحلیل AI تولید نمی‌کند و داده ساختگی جایگزین نمی‌سازد.",
  };
}

export function affectedAssetsAsSymbols(event: EventExplanationOutput): AssetSymbol[] {
  return event.affectedAssets.filter((asset): asset is AssetSymbol =>
    ["BTC", "ETH", "SOL", "USDT", "DXY", "Gold", "Nasdaq", "US10Y", "Fed"].includes(asset),
  );
}
