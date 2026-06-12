import type { ForecastValidationInput } from "@/types/ingestion";

function driverIncludes(drivers: string[], pattern: RegExp) {
  return drivers.some((driver) => pattern.test(driver));
}

export function explainForecastOutcome(validation: Omit<ForecastValidationInput, "explanationFa" | "outcomeSummaryFa">) {
  const drivers = validation.mainDrivers;
  const confidence = validation.predictedConfidence ?? 0;
  const move =
    validation.realizedChangePct === null
      ? "حرکت واقعی بازار قابل اندازه‌گیری نبود"
      : `حرکت واقعی ${validation.realizedChangePct > 0 ? "مثبت" : validation.realizedChangePct < 0 ? "منفی" : "خنثی"} و برابر ${validation.realizedChangePct.toFixed(2)}٪ بود`;

  if (validation.result === "inconclusive") {
    return {
      outcomeSummaryFa: "⚠️ Inconclusive — داده کافی یا حرکت معنادار برای قضاوت وجود نداشت.",
      explanationFa: `${move}. این forecast از آمار accuracy حذف می‌شود تا عملکرد سیستم بیش از واقعیت خوب یا بد نشان داده نشود.`,
    };
  }

  if (validation.result === "accurate") {
    const leadingDriver = drivers[0] ?? "سیگنال‌های اصلی";
    return {
      outcomeSummaryFa: "🎯 Accurate — جهت و شدت حرکت بازار با forecast هم‌خوان بود.",
      explanationFa: `${move}. محرک اصلی forecast، «${leadingDriver}»، با مسیر واقعی بازار هم‌راستا شد.`,
    };
  }

  if (validation.result === "acceptable") {
    return {
      outcomeSummaryFa: "✅ Acceptable — جهت درست بود اما شدت حرکت با forecast کاملاً هم‌خوان نبود.",
      explanationFa: `${move}. جهت forecast درست بود، اما اندازه حرکت برای برچسب دقیق کافی نبود.`,
    };
  }

  const reasons: string[] = [];
  if (confidence < 55) reasons.push("اطمینان اولیه پایین بود و forecast باید محافظه‌کارانه خوانده می‌شد");
  if (driverIncludes(drivers, /ETF|جریان/i)) reasons.push("جریان ETF نتوانست مسیر نهایی بازار را تأیید کند یا بعد از forecast تغییر کرد");
  if (driverIncludes(drivers, /نقدینگی|Liquidity/i)) reasons.push("شرایط نقدینگی بعد از forecast برخلاف سناریوی اولیه عمل کرد");
  if (driverIncludes(drivers, /ریسک|Risk|ژئوپلیتیک|geopolitical/i)) reasons.push("ریسک خبری/ژئوپلیتیک یا کیفیت داده می‌توانست مسیر بازار را از سناریوی پایه منحرف کند");
  if (!reasons.length) reasons.push("محرک‌های ثبت‌شده با outcome واقعی هم‌جهت نشدند");

  return {
    outcomeSummaryFa: "❌ Incorrect — بازار برخلاف جهت forecast حرکت کرد.",
    explanationFa: `${move}. علت احتمالی شکست: ${reasons.slice(0, 2).join("؛ ")}.`,
  };
}

