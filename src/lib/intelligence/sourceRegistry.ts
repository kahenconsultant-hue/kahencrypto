export type PublicRenderingRule = "render_compact" | "render_when_available" | "hide_when_missing" | "audit_only";

export type SourceRegistryItem = {
  provider: string;
  purposeFa: string;
  adapterPath: string;
  freshnessSlaFa: string;
  failureBehaviorFa: string;
  publicRenderingRule: PublicRenderingRule;
  auditRenderingRuleFa: string;
};

export const PUBLIC_SOURCE_REGISTRY: SourceRegistryItem[] = [
  {
    provider: "CoinGecko",
    purposeFa: "قیمت، تغییرات، حجم و ارزش بازار دارایی‌های کریپتو",
    adapterPath: "src/server/data/adapters.ts",
    freshnessSlaFa: "عمومی و با محدودیت نرخ؛ برای گزارش عمومی به‌صورت بروز شده/با تأخیر برچسب می‌خورد.",
    failureBehaviorFa: "در صورت نبود داده، کارت دارایی فقط وضعیت داده محدود نشان می‌دهد.",
    publicRenderingRule: "render_compact",
    auditRenderingRuleFa: "جزئیات endpoint، mapping و خطا در Data Health/Audit باقی می‌ماند.",
  },
  {
    provider: "DefiLlama Stablecoins",
    purposeFa: "عرضه و روند ارزش بازار استیبل‌کوین‌ها",
    adapterPath: "src/server/data/adapters.ts",
    freshnessSlaFa: "داده روزانه؛ در گزارش عمومی به‌عنوان محرک نقدینگی استفاده می‌شود.",
    failureBehaviorFa: "سهم استیبل‌کوین حذف و اطمینان نقدینگی محدود می‌شود.",
    publicRenderingRule: "render_when_available",
    auditRenderingRuleFa: "روند ۷/۳۰ روزه و mapping کامل در Audit نمایش داده می‌شود.",
  },
  {
    provider: "FRED / Macro Proxy",
    purposeFa: "بازده اوراق، دلار و فشار کلان",
    adapterPath: "src/server/data/fred-collector.ts",
    freshnessSlaFa: "داده کلان روزانه/دوره‌ای و با تأخیر است؛ live محسوب نمی‌شود.",
    failureBehaviorFa: "اگر stale باشد، فقط برچسب با تأخیر/داده محدود نمایش داده می‌شود.",
    publicRenderingRule: "render_compact",
    auditRenderingRuleFa: "سری‌های FRED و تاریخ مشاهده در Data Health نمایش داده می‌شود.",
  },
  {
    provider: "ETF Flow",
    purposeFa: "جریان ETF فقط برای BTC و ETH",
    adapterPath: "src/server/data/etf-flow-module.ts",
    freshnessSlaFa: "داده روزانه بازار آمریکا؛ issuer table فقط Audit.",
    failureBehaviorFa: "اگر unavailable باشد، اثر ETF حذف و عدد صفر ساخته نمی‌شود.",
    publicRenderingRule: "hide_when_missing",
    auditRenderingRuleFa: "جزئیات صادرکننده، fallback و validation در Audit می‌ماند.",
  },
  {
    provider: "Binance / Bybit Public Derivatives",
    purposeFa: "funding و open interest در صورت دسترسی عمومی",
    adapterPath: "src/server/data/adapters.ts",
    freshnessSlaFa: "داده سریع اما وابسته به دسترسی endpoint عمومی.",
    failureBehaviorFa: "اگر missing باشد، در public پنهان و فقط confidence کاهش می‌یابد.",
    publicRenderingRule: "hide_when_missing",
    auditRenderingRuleFa: "HTTP diagnostics، endpoint و parser status در Audit/Data Health می‌ماند.",
  },
  {
    provider: "RSS / News",
    purposeFa: "خبرهای اثرگذار، سنتیمنت و ریسک مقرراتی/ژئوپلیتیک",
    adapterPath: "src/server/analytics/sentiment-engine.ts",
    freshnessSlaFa: "خبرهای public فقط اگر تازه و relevance >= 60 باشد نمایش داده می‌شوند.",
    failureBehaviorFa: "خبر کم‌کیفیت یا کم‌ارتباط وارد گزارش عمومی نمی‌شود.",
    publicRenderingRule: "render_when_available",
    auditRenderingRuleFa: "خوراک کامل خبر، رد شده‌ها و علت حذف در Audit باقی می‌ماند.",
  },
];
