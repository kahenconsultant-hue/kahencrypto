import type { DataSourceStatus } from "@/lib/types";
export type { DataSourceStatus } from "@/lib/types";

export const moduleDataSourceStatus = {
  marketRegime: "partial_live",
  topAlerts: "partial_live",
  macroSummary: "partial_live",
  btcIntelligence: "partial_live",
  ethIntelligence: "partial_live",
  solIntelligence: "partial_live",
  usdtRisk: "partial_live",
  dxyIntelligence: "delayed",
  goldIntelligence: "delayed",
  nasdaqIntelligence: "delayed",
  us10yIntelligence: "delayed",
  etfFlows: "delayed",
  liquidity: "partial_live",
  correlations: "partial_live",
  sentiment: "partial_live",
  geopoliticalRisk: "delayed",
  latestNews: "delayed",
  ingestionHealth: "partial_live",
  adminConsole: "partial_live",
  apiFirst: "partial_live",
  widgetEmbed: "partial_live",
  watchlistPlans: "partial_live",
  dataQuality: "partial_live",
  derivedSignals: "partial_live",
  causality: "partial_live",
} as const satisfies Record<string, DataSourceStatus>;

export type ModuleStatusKey = keyof typeof moduleDataSourceStatus;

export const dataSourceStatusLabels: Record<DataSourceStatus, string> = {
  live: "زنده",
  partial_live: "نیمه‌زنده",
  delayed: "با تأخیر",
  proxy: "پروکسی",
  estimated: "برآوردی با توضیح",
  unavailable: "ناموجود",
};

export const dataSourceStatusDescriptions: Record<DataSourceStatus, string> = {
  live: "این ماژول در runtime فعلی از اتصال زنده استفاده می‌کند.",
  partial_live: "بخشی از مسیر داده به منبع واقعی یا عمومی وصل است و بخش‌های باقی‌مانده با تأخیر، cache یا وضعیت ناموجود نمایش داده می‌شوند.",
  delayed: "داده با تاخیر یا از snapshotهای قابل ردیابی نمایش داده می‌شود.",
  proxy: "این مقدار از داده عمومی یا مشتق‌شده ساخته شده و جایگزین داده مستقیم نهادی نیست.",
  estimated: "این مقدار فقط وقتی نمایش داده می‌شود که fallback توسعه به‌صورت آگاهانه فعال شده باشد.",
  unavailable: "منبع داده در دسترس نیست و سیستم برای آن عدد یا اطمینان ساختگی نمی‌سازد.",
};

export function assetStatusKey(assetKey: string): ModuleStatusKey {
  switch (assetKey) {
    case "btc":
      return "btcIntelligence";
    case "eth":
      return "ethIntelligence";
    case "sol":
      return "solIntelligence";
    case "dxy":
      return "dxyIntelligence";
    case "gold":
      return "goldIntelligence";
    case "nasdaq":
      return "nasdaqIntelligence";
    case "us10y":
      return "us10yIntelligence";
    default:
      return "usdtRisk";
  }
}
