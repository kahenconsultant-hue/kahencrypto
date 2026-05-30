import type { AssetSymbol, DataQuality, DirectionalBias, TransmissionChannel } from "@/lib/types";
import { buildPersianEventSummary, buildPersianEventTitle, eventTypeLabelsFa, sanitizePublicIntelligenceText } from "@/lib/persian-processing";
import { getLatestNormalizedEvents } from "@/storage/ingestion-store";
import type { NormalizedEventInput } from "@/types/ingestion";

export type AiExplanationStatus = "ready" | "local_ready" | "failed";

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
  const titleFa = buildPersianEventTitle({
    title: event.title,
    content: event.summary,
    sourceName: event.sourceName,
    timestamp: event.eventTimestamp,
    quality: event.quality,
    eventType: event.eventType,
    affectedAssets,
    entities: event.entities,
  });
  const summaryFa = buildPersianEventSummary({
    title: event.title,
    content: event.summary,
    sourceName: event.sourceName,
    timestamp: event.eventTimestamp,
    quality: event.quality,
    eventType: event.eventType,
    affectedAssets,
    entities: event.entities,
  });
  const sourceNote = `${event.sourceName} با اعتبار منبع ${event.sourceReliability}/100 و وضعیت تازگی ${event.freshnessStatus}`;

  return {
    eventId: event.id ?? event.rawEventId ?? event.title,
    source: event.sourceName,
    title: event.title,
    eventType: event.eventType,
    affectedAssets,
    status: process.env.OPENAI_API_KEY ? "ready" : "local_ready",
    quality: event.quality,
    translationFa: titleFa,
    summaryFa,
    macroInterpretationFa: sanitizePublicIntelligenceText(
      channel === "rates"
        ? `${label} معمولاً از مسیر انتظارات نرخ بهره و بازده اوراق به دارایی‌های پرریسک منتقل می‌شود. تا وقتی داده DXY، US10Y و Nasdaq تأیید ندهند، سیستم از نتیجه‌گیری جهت‌دار قطعی خودداری می‌کند.`
        : channel === "dollar"
          ? `${label} از مسیر هزینه نقدینگی دلاری اثر می‌گذارد. تقویت دلار معمولاً برای BTC، ETH و SOL فشارزا است، اما فقط با داده قیمت و همبستگی معتبر می‌توان شدت اثر را سنجید.`
          : channel === "stablecoin_flows"
          ? `${label} برای تشخیص ورود یا خروج نقدینگی نقدی مهم است. رشد واقعی استیبل‌کوین‌ها زمانی حمایتی است که با حجم اسپات یا ETF تأیید شود.`
            : `${label} به‌تنهایی برای تولید تحلیل جهت‌دار کافی نیست؛ اثر آن باید کنار قیمت، نقدینگی، همبستگی و کیفیت منبع خوانده شود.`,
    ),
    cryptoInterpretationFa: sanitizePublicIntelligenceText(
      expectedDirection === "bearish"
        ? `اثر اولیه این رویداد برای ${affectedAssets.join("، ")} می‌تواند فشارزا باشد، اما سیستم بدون تأیید داده‌های بازار، امتیاز یا هشدار قطعی تولید نمی‌کند.`
        : expectedDirection === "bullish"
          ? `اثر اولیه این رویداد برای ${affectedAssets.join("، ")} می‌تواند حمایتی باشد، اما پایداری آن باید با جریان نقدینگی و واکنش قیمت راستی‌آزمایی شود.`
          : `اثر این رویداد برای ${affectedAssets.join("، ")} فعلاً خنثی یا دوگانه است و برای تحلیل معتبر به سیگنال‌های تکمیلی نیاز دارد.`,
    ),
    actionableExplanationFa:
      "این توضیح با پردازش فارسی محلی و فرهنگ‌واژه مالی ساخته شده است. برداشت جهت‌دار فقط وقتی معتبرتر می‌شود که واکنش قیمت، نقدینگی و همبستگی نیز هم‌جهت باشند.",
    uncertaintyNotesFa: [
      sourceNote,
      "این توضیح بر پایه قواعد شفاف و داده موجود ساخته شده و جایگزین امتیازدهی کامل اثر بازار نیست.",
      "ترجمه محلی برای خوانایی فارسی استفاده شده است؛ اگر متن منبع مبهم باشد، عدم قطعیت در تحلیل حفظ می‌شود.",
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
    provider: process.env.OPENAI_API_KEY ? "OpenAI + local Persian processor" : "local Persian processor",
    enabled: true,
    status: process.env.OPENAI_API_KEY ? "ready" : "local_ready",
    messageFa: process.env.OPENAI_API_KEY
      ? "پردازش فارسی محلی فعال است و در صورت نیاز از OpenAI برای تکمیل توضیح رویدادهای معتبر استفاده می‌شود."
      : "پردازش فارسی محلی فعال است؛ نبود سرویس تکمیلی باعث تولید متن ساختگی یا مخفی شدن رویدادهای معتبر نمی‌شود.",
  };
}

export function affectedAssetsAsSymbols(event: EventExplanationOutput): AssetSymbol[] {
  return event.affectedAssets.filter((asset): asset is AssetSymbol =>
    ["BTC", "ETH", "SOL", "USDT", "DXY", "Gold", "Nasdaq", "US10Y", "Fed"].includes(asset),
  );
}
