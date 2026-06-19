import { getSignalSnapshot } from "@/server/analytics/market-signals";
import { clampPercent } from "@/server/analytics/scoring-engine";
import { isFreshUsableSignal } from "@/server/analytics/intelligence-quality";
import { getLatestNormalizedEventsSync } from "@/storage/ingestion-store";

function signalValue(key: string) {
  const signal = getSignalSnapshot().byKey[key];
  return isFreshUsableSignal(signal) ? signal.value : null;
}

function relevantEvents() {
  return getLatestNormalizedEventsSync(120).filter((event) => {
    const text = `${event.title} ${event.summary}`.toLowerCase();
    return (
      event.affectedAssets.includes("USDT") ||
      /tether|usdt|stablecoin|treasury|sanction|ofac|freeze|enforcement|issuer|reserve|depeg/i.test(text)
    );
  });
}

function eventRiskScore(patterns: RegExp[]) {
  const events = relevantEvents();
  if (!events.length) return 0;
  const hits = events.filter((event) => patterns.some((pattern) => pattern.test(`${event.title} ${event.summary}`))).length;
  return clampPercent(hits * 18);
}

export function getUsdtRiskCenter() {
  const snapshot = getSignalSnapshot();
  const usdtSupply7d = signalValue("usdt_supply_7d");
  const usdcSupply7d = signalValue("usdc_supply_7d");
  const stablecoinMarket7d = signalValue("stablecoin_market_cap_7d");
  const stablecoinDominance = signalValue("stablecoin_dominance");
  const availableKeys = ["usdt_supply_7d", "usdc_supply_7d", "stablecoin_market_cap_7d", "stablecoin_dominance"].filter((key) => isFreshUsableSignal(snapshot.byKey[key]));
  const missingInputs = ["tron_concentration", "erc20_concentration", "issuer_reserve_transparency", "exchange_inflows", "exchange_outflows"].filter(Boolean);
  const dataCoveragePercent = clampPercent((availableKeys.length / 9) * 100);

  const supplyContractionRisk =
    usdtSupply7d === null
      ? 18
      : usdtSupply7d < -1
        ? 42
        : usdtSupply7d < 0
          ? 24
          : usdtSupply7d > 2
            ? 10
            : 14;
  const stablecoinSystemRisk =
    stablecoinMarket7d === null
      ? 18
      : stablecoinMarket7d < -0.5
        ? 38
        : stablecoinMarket7d < 0.2
          ? 22
          : 12;
  const dominanceRisk =
    stablecoinDominance === null
      ? 16
      : stablecoinDominance > 9
        ? 28
        : stablecoinDominance < 5
          ? 14
          : 18;
  const regulatoryRisk = eventRiskScore([/regulat|lawsuit|reserve|issuer|tether/i]);
  const freezeRisk = eventRiskScore([/sanction|ofac|freeze|treasury enforcement|blocked/i]);
  const networkDistributionScore: number | null = null;
  const freezeRiskScore = clampPercent(18 + freezeRisk + regulatoryRisk * 0.35);
  const usdtRiskScore = clampPercent(supplyContractionRisk * 0.26 + stablecoinSystemRisk * 0.2 + dominanceRisk * 0.12 + regulatoryRisk * 0.22 + freezeRiskScore * 0.2);
  const usdtStabilityScore = clampPercent(100 - usdtRiskScore - (usdtSupply7d !== null && usdtSupply7d < 0 ? 8 : 0));

  return {
    usdtRiskScore,
    usdtStabilityScore,
    networkDistributionScore,
    freezeRiskScore,
    dataCoveragePercent,
    missingInputs,
    summaryFa:
      dataCoveragePercent < 50
        ? "ریسک USDT با داده ناقص ارزیابی می‌شود: عرضه USDT و روند کل استیبل‌کوین‌ها موجود است، اما تمرکز TRON/ERC20، ذخایر ناشر و جریان صرافی‌ها منبع مستقیم ندارند؛ بنابراین score محافظه‌کارانه و با confidence محدود نمایش داده می‌شود."
        : "ریسک USDT از تغییر عرضه، وضعیت بازار استیبل‌کوین، dominance و رویدادهای مقرراتی/تحریمی استخراج شده است.",
    components: [
      { label: "ریسک عرضه USDT", value: supplyContractionRisk, status: usdtSupply7d === null ? "missing" : "available" },
      { label: "ریسک بازار استیبل‌کوین", value: stablecoinSystemRisk, status: stablecoinMarket7d === null ? "missing" : "available" },
      { label: "ریسک سهم/دامیننس استیبل‌کوین", value: dominanceRisk, status: stablecoinDominance === null ? "missing" : "available" },
      { label: "ریسک مقرراتی/ناشر", value: regulatoryRisk, status: relevantEvents().length ? "available" : "missing" },
      { label: "ریسک مسدودسازی/تحریم", value: freezeRiskScore, status: freezeRisk ? "available" : "missing" },
      { label: "توزیع شبکه TRON/ERC20", value: networkDistributionScore, status: "missing" },
    ],
    tron: {
      title: "TRON",
      strengths: usdtSupply7d !== null && usdtSupply7d >= 0 ? ["روند عرضه USDT در داده فعلی منقبض نیست."] : [],
      risks: ["داده مستقیم تمرکز شبکه TRON در این runtime موجود نیست؛ سیستم آن را برآورد نمی‌کند.", "ریسک freeze یا blacklist فقط با رویدادهای معتبر و داده مستقیم باید تقویت شود."],
    },
    erc20: {
      title: "ERC20",
      strengths: stablecoinMarket7d !== null && stablecoinMarket7d > 0 ? ["روند کل بازار استیبل‌کوین‌ها در داده فعلی مثبت است."] : [],
      risks: ["داده مستقیم تمرکز ERC20 و جریان صرافی‌ها موجود نیست؛ score شبکه‌ای ناموجود باقی می‌ماند.", "هزینه شبکه و جابه‌جایی بین زنجیره‌ها بدون داده مستقیم قابل امتیازدهی دقیق نیست."],
    },
    faqs: [
      {
        q: "آیا USDT امن است؟",
        a: "این پنل امنیت قطعی اعلام نمی‌کند. فقط ریسک زیرساخت نقدینگی را از عرضه، dominance، رویدادهای مقرراتی/تحریمی و داده‌های موجود می‌سنجد.",
      },
      {
        q: "چرا Network Distribution Score ناموجود است؟",
        a: "چون منبع مستقیم برای تمرکز TRON/ERC20 یا جریان شبکه در این runtime وصل نیست. سیستم به جای ساخت عدد جعلی، این بخش را ناموجود نگه می‌دارد.",
      },
    ],
    lastUpdatedAt: snapshot.generatedAt,
  };
}
