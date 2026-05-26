import type { AssetIntelligence, NewsCategory, ProcessedNewsItem } from "@/lib/types";
import { getSourcesForAsset } from "@/collectors/registry";

export const categoryLabels: Record<NewsCategory, string> = {
  central_banks: "بانک‌های مرکزی",
  economic_data: "داده‌های اقتصادی",
  financial_media: "رسانه‌های مالی",
  crypto_media: "رسانه‌های کریپتو",
  onchain: "آن‌چین",
  derivatives: "مشتقات و اهرم",
  stablecoins: "استیبل‌کوین",
  etf: "ETF و جریان نهادی",
  sentiment: "سنتیمنت بازار",
  geopolitics: "ژئوپلیتیک",
  alternative_data: "داده جایگزین",
  exchange_health: "سلامت صرافی",
  volatility_regime: "نوسان و رژیم",
};

const trackedAssetInfo = {
  btc: { symbol: "BTC", titleFa: "بیت‌کوین", roleFa: "دارایی کلان نهادی و حساس به ETF، دلار و نرخ بهره" },
  eth: { symbol: "ETH", titleFa: "اتریوم", roleFa: "دارایی اکوسیستمی با حساسیت به DeFi، L2، staking و tech beta" },
  sol: { symbol: "SOL", titleFa: "سولانا", roleFa: "دارایی پرنوسان و حساس به ریسک‌پذیری خرده‌فروشی و فعالیت شبکه" },
  usdt: { symbol: "USDT", titleFa: "ریسک تتر", roleFa: "زیرساخت نقدینگی و ریسک نگه‌داری/تحریم/شبکه" },
  dxy: { symbol: "DXY", titleFa: "شاخص دلار", roleFa: "محرک فشار یا گشایش نقدینگی دلاری برای کریپتو" },
  gold: { symbol: "Gold", titleFa: "طلا", roleFa: "پناهگاه امن و شاخص تنش کلان/ژئوپلیتیک" },
  nasdaq: { symbol: "Nasdaq", titleFa: "نزدک", roleFa: "کانال انتقال اشتهای ریسک فناوری به BTC، ETH و SOL" },
  us10y: { symbol: "US10Y", titleFa: "بازده اوراق ۱۰ ساله آمریکا", roleFa: "کانال نرخ تنزیل و فشار نرخ بهره" },
} as const;

function assetShell(key: keyof typeof trackedAssetInfo): AssetIntelligence {
  const base = trackedAssetInfo[key];
  return {
    symbol: base.symbol,
    titleFa: base.titleFa,
    roleFa: base.roleFa,
    marketStructure: "",
    macroPressure: 0,
    liquidityScore: 0,
    sentimentScore: 0,
    whaleFlow: "",
    etfFlow: "",
    onchainSummary: "",
    aiInterpretation: "داده کافی برای تحلیل معتبر وجود ندارد. این صفحه تا زمان اتصال کامل ingestion و snapshotهای معتبر، خروجی سناریومحور یا امتیاز جهت‌دار تولید نمی‌کند.",
    keyRisks: [],
    regimeSensitivity: [],
    metrics: [],
    sourceMapping: getSourcesForAsset(base.symbol),
  };
}

export const assetIntelligence = {
  btc: assetShell("btc"),
  eth: assetShell("eth"),
  sol: assetShell("sol"),
  usdt: assetShell("usdt"),
  dxy: assetShell("dxy"),
  gold: assetShell("gold"),
  nasdaq: assetShell("nasdaq"),
  us10y: assetShell("us10y"),
};

export function getNewsItems(_category?: NewsCategory): ProcessedNewsItem[] {
  return [];
}

export function getNewsGroupedByCategory() {
  return (Object.entries(categoryLabels) as Array<[NewsCategory, string]>).map(([category, labelFa]) => ({
    category,
    labelFa,
    items: [] as ProcessedNewsItem[],
  }));
}

export const usdtRiskCenter = {
  tron: { title: "TRON", strengths: [] as string[], risks: [] as string[] },
  erc20: { title: "ERC20", strengths: [] as string[], risks: [] as string[] },
  faqs: [] as Array<{ q: string; a: string }>,
};

export const pricingPlans: Array<{ name: string; features: string[] }> = [];

export const sourceHealth: Array<{ source: string; category: string; status: "healthy" | "degraded"; latencyMs: number }> = [];
