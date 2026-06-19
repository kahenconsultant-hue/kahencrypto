import { clamp } from "@/lib/intelligence/moduleGating";

export const HUMANIZER_VERSION = "cmip-humanizer-v1.0";
export const NON_ADVISORY_NOTE = "این تحلیل سیگنال خرید یا فروش نیست؛ فقط خلاصه وضعیت فعلی بازار بر اساس داده‌های موجود است.";

export type HumanizedReportBlock = {
  human_summary: string;
  user_meaning: string;
  reasoning: string;
  confidence_explanation: string;
  technical_details: Record<string, unknown>;
  audit_details: Record<string, unknown>;
  data_quality_label: string;
  risk_label: string;
  non_advisory_note: string;
};

export type HumanReportContext = {
  kind?: "market" | "asset" | "driver" | "data_layer" | "alert" | "audit" | "generic";
  titleFa?: string;
  assetSymbol?: string;
  assetNameFa?: string;
  statusFa?: string;
  biasFa?: string;
  impactScore?: number | null;
  confidence?: number | null;
  coverage?: number | null;
  riskLabelFa?: string | null;
  dataQualityLabelFa?: string | null;
  directionFa?: string | null;
  reasoningFa?: string | null;
  userMeaningFa?: string | null;
  invalidationFa?: string | null;
  driversFa?: string[];
};

const requiredHumanizedKeys: Array<keyof HumanizedReportBlock> = [
  "human_summary",
  "user_meaning",
  "reasoning",
  "confidence_explanation",
  "technical_details",
  "non_advisory_note",
];

export function impactInterpretationFa(score: number | null | undefined) {
  if (typeof score !== "number" || !Number.isFinite(score)) return "اثر عددی عمومی در دسترس نیست";
  if (score >= 30) return "فشار مثبت قابل توجه";
  if (score >= 10) return "فشار مثبت ملایم";
  if (score >= -9) return "تقریباً خنثی";
  if (score >= -29) return "فشار منفی ملایم";
  return "فشار منفی قابل توجه";
}

export function confidenceInterpretationFa(confidence: number | null | undefined) {
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) {
    return "اعتماد به کیفیت تحلیل مشخص نیست؛ داده‌ها برای نتیجه‌گیری کافی نیستند.";
  }
  if (confidence >= 80) return "اعتماد به کیفیت تحلیل: خوب، اما نه قطعی. این عدد به معنی قطعیت جهت قیمت نیست.";
  if (confidence >= 60) return "اعتماد به کیفیت تحلیل: متوسط. این عدد کیفیت داده و گزارش را نشان می‌دهد، نه پیش‌بینی قطعی قیمت.";
  return "اعتماد به کیفیت تحلیل: ضعیف؛ داده‌ها برای نتیجه‌گیری کافی نیستند.";
}

export function dataQualityLabelFa(coverage: number | null | undefined, fallback = "داده ناقص یا نیازمند تأیید") {
  if (typeof coverage !== "number" || !Number.isFinite(coverage)) return fallback;
  if (coverage >= 75) return "پوشش داده مناسب";
  if (coverage >= 50) return "پوشش داده متوسط";
  return "داده ناقص یا نیازمند تأیید";
}

export function riskLabelFromImpactFa(impactScore: number | null | undefined, fallback = "ریسک نیازمند رصد") {
  if (typeof impactScore !== "number" || !Number.isFinite(impactScore)) return fallback;
  if (impactScore <= -30) return "ریسک فشار منفی بالا";
  if (impactScore < -9) return "ریسک فشار منفی ملایم";
  if (impactScore <= 9) return "ریسک خنثی / قابل پایش";
  return "ریسک فشار مثبت / نیازمند تأیید";
}

export function validateHumanizedBlock(block: Partial<HumanizedReportBlock> | null | undefined) {
  if (!block) return false;
  return requiredHumanizedKeys.every((key) => {
    const value = block[key];
    if (key === "technical_details") return Boolean(value && typeof value === "object" && !Array.isArray(value));
    return typeof value === "string" && value.trim().length > 0;
  });
}

function coerceNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function coerceString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function humanSummaryFromContext(rawBlock: Record<string, unknown>, context: HumanReportContext) {
  const title = context.titleFa ?? context.assetNameFa ?? context.assetSymbol ?? "این بخش";
  const status = context.statusFa ?? context.biasFa ?? coerceString(rawBlock.statusFa) ?? coerceString(rawBlock.biasFa);
  const impact = context.impactScore ?? coerceNumber(rawBlock.impactScore);
  if (context.kind === "asset") {
    return `${title} فعلاً در وضعیت ${status ?? "نیازمند رصد"} قرار دارد و اثر کلی آن ${impactInterpretationFa(impact)} است.`;
  }
  if (context.kind === "driver") {
    return `${title} فعلاً به‌عنوان محرک ${context.directionFa ?? "نیازمند تأیید"} خوانده می‌شود.`;
  }
  if (context.kind === "data_layer") {
    return `${title}: ${status ?? dataQualityLabelFa(context.coverage ?? coerceNumber(rawBlock.coverage))}.`;
  }
  if (context.kind === "market") {
    return context.reasoningFa ?? coerceString(rawBlock.summaryFa) ?? "بازار در وضعیت سناریویی و نیازمند رصد چندلایه قرار دارد.";
  }
  return `${title} به زبان کاربر خلاصه شده است.`;
}

function userMeaningFromContext(rawBlock: Record<string, unknown>, context: HumanReportContext) {
  if (context.userMeaningFa) return context.userMeaningFa;
  const confidence = context.confidence ?? coerceNumber(rawBlock.confidence);
  const coverage = context.coverage ?? coerceNumber(rawBlock.coverage);
  if ((confidence !== null && confidence < 45) || (coverage !== null && coverage < 50)) {
    return "بازار هنوز جهت قطعی ندارد و این بخش بیشتر مناسب زیر نظر گرفتن است، نه تصمیم‌گیری عجولانه.";
  }
  if (context.kind === "asset") return "این دارایی را باید در کنار محرک‌های کلان، نقدینگی و کیفیت داده خواند؛ خروجی به‌تنهایی برای تصمیم‌گیری کافی نیست.";
  if (context.kind === "driver") return "این محرک می‌تواند سناریوی بازار را تقویت یا تضعیف کند، اما تا تأیید چند منبع مستقل نباید قطعی خوانده شود.";
  return "این بخش معنی عملی وضعیت فعلی را نشان می‌دهد و جایگزین تصمیم‌گیری مستقل نیست.";
}

export function humanizeReportBlock(rawBlock: unknown, context: HumanReportContext = {}): HumanizedReportBlock {
  const raw = asRecord(rawBlock);
  const confidence = context.confidence ?? coerceNumber(raw.confidence);
  const coverage = context.coverage ?? coerceNumber(raw.coverage) ?? coerceNumber(raw.dataCoverage);
  const impactScore = context.impactScore ?? coerceNumber(raw.impactScore);
  const dataLabel = context.dataQualityLabelFa ?? dataQualityLabelFa(coverage);
  const riskLabel = context.riskLabelFa ?? riskLabelFromImpactFa(impactScore);
  const drivers = context.driversFa ?? (Array.isArray(raw.driversFa) ? raw.driversFa.filter((item): item is string => typeof item === "string") : []);
  const invalidation = context.invalidationFa ?? coerceString(raw.invalidationFa);

  return {
    human_summary: humanSummaryFromContext(raw, context),
    user_meaning: userMeaningFromContext(raw, context),
    reasoning:
      context.reasoningFa ??
      (drivers.length ? drivers.slice(0, 3).join(" ") : coerceString(raw.reasoningFa) ?? coerceString(raw.explanationFa) ?? "دلیل اصلی از ترکیب داده‌های موجود و کیفیت پوشش فعلی استخراج شده است."),
    confidence_explanation: confidenceInterpretationFa(confidence),
    technical_details: {
      "پوشش داده": coverage === null ? "داده معتبر در دسترس نیست" : `${Math.round(clamp(coverage, 0, 100))}٪`,
      "اعتماد عددی موتور": confidence === null ? "داده معتبر در دسترس نیست" : `${Math.round(clamp(confidence, 0, 100))}٪`,
      "اثر کلی بازار": impactScore === null ? "داده معتبر در دسترس نیست" : `${Math.round(clamp(impactScore, -100, 100))} از ۱۰۰ — ${impactInterpretationFa(impactScore)}`,
      "وضعیت کلی": context.statusFa ?? context.biasFa ?? coerceString(raw.statusFa) ?? coerceString(raw.biasFa) ?? "نیازمند رصد",
      "کیفیت داده": dataLabel,
    },
    audit_details: {
      "شرط بازنگری سناریو": invalidation ?? "اگر محرک‌های اصلی در بروزرسانی‌های بعدی خلاف این خوانش حرکت کنند، نتیجه باید دوباره بررسی شود.",
      "محرک‌های استفاده‌شده": drivers.length ? drivers : "جزئیات در بخش بررسی فنی موجود است.",
      "نسخه توضیح‌ساز": HUMANIZER_VERSION,
    },
    data_quality_label: dataLabel,
    risk_label: riskLabel,
    non_advisory_note: NON_ADVISORY_NOTE,
  };
}

export function renderHumanizedBlockText(block: HumanizedReportBlock) {
  return [
    `۱. خلاصه انسانی\n${block.human_summary}`,
    `۲. معنی برای کاربر\n${block.user_meaning}`,
    `۳. دلیل\n${block.reasoning}`,
    `۴. اعتماد و کیفیت داده\n${block.confidence_explanation}`,
    `۵. جزئیات فنی\n${Object.entries(block.technical_details)
      .map(([key, value]) => `- ${key}: ${String(value)}`)
      .join("\n")}`,
    `۶. جزئیات Audit\n${Object.entries(block.audit_details)
      .map(([key, value]) => `- ${key}: ${Array.isArray(value) ? value.join("، ") : String(value)}`)
      .join("\n")}`,
    block.non_advisory_note,
  ].join("\n\n");
}
