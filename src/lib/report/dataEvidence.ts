export type StablecoinInterpretation = "supportive" | "mixed" | "pressure" | "unavailable";
export type EtfInterpretation = "supportive" | "pressure" | "neutral" | "unavailable";

export function interpretStablecoinLiquidity(change7d: number | null, change30d: number | null): StablecoinInterpretation {
  if (change7d === null || change30d === null) return "unavailable";
  if (change7d > 0 && change30d > 0) return "supportive";
  if (change7d < 0 && change30d < 0) return "pressure";
  return "mixed";
}

export function interpretEtfFlow(dailyFlowUsd: number | null, sevenDayFlowUsd: number | null): EtfInterpretation {
  const values = [dailyFlowUsd, sevenDayFlowUsd].filter((value): value is number => value !== null && Number.isFinite(value));
  if (!values.length) return "unavailable";
  if (values.every((value) => value > 0)) return "supportive";
  if (values.every((value) => value < 0)) return "pressure";
  return "neutral";
}

export function buildEtfEvidenceClaim(input: {
  asset: "BTC" | "ETH";
  dailyFlowUsd: number | null;
  sevenDayFlowUsd: number | null;
  sourceName: string | null;
  latestDate: string | null;
}) {
  const interpretation = interpretEtfFlow(input.dailyFlowUsd, input.sevenDayFlowUsd);
  if (interpretation === "unavailable" || !input.sourceName || !input.latestDate) return null;
  const formatMillions = (value: number | null) =>
    value === null
      ? "ناموجود"
      : `${new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 }).format(value / 1_000_000)} میلیون دلار`;
  return `${input.asset}: روزانه ${formatMillions(input.dailyFlowUsd)}، ۷روزه ${formatMillions(input.sevenDayFlowUsd)}؛ منبع ${input.sourceName}؛ تاریخ ${input.latestDate}`;
}

export function priceActionStatus(change24hPct: number | null) {
  if (change24hPct === null) return { status: "unavailable" as const, labelFa: "داده قیمت ناموجود" };
  if (change24hPct > 0.15) return { status: "positive" as const, labelFa: "مثبت" };
  if (change24hPct < -0.15) return { status: "negative" as const, labelFa: "منفی" };
  return { status: "neutral" as const, labelFa: "خنثی" };
}

export function explainPriceRegimeDivergence(change24hPct: number | null, regimeScore: number | null) {
  if (change24hPct === null || regimeScore === null) return null;
  if (change24hPct > 0 && regimeScore <= -10) {
    return "قیمت امروز مثبت است، اما رژیم ۷/۳۰ روزه هنوز حمایت کافی از نقدینگی، جریان نهادی یا ریسک بازار نشان نمی‌دهد.";
  }
  if (change24hPct < 0 && regimeScore >= 10) {
    return "قیمت امروز منفی است، اما رژیم ۷/۳۰ روزه هنوز به‌طور کامل خراب نشده و باید با داده‌های نقدینگی و حجم تأیید شود.";
  }
  return null;
}
