import { clamp } from "@/lib/intelligence/moduleGating";

export const HUMANIZER_VERSION = "cmip-humanizer-v1.1";
export const NON_ADVISORY_NOTE = "این تحلیل سیگنال خرید یا فروش نیست؛ فقط خلاصه وضعیت فعلی بازار بر اساس داده‌های موجود است.";

export type HumanizedReportBlock = {
  human_summary: string;
  user_meaning: string;
  reasoning: string;
  watch_next: string;
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
  watchNextFa?: string | null;
  invalidationFa?: string | null;
  driversFa?: string[];
};

const requiredHumanizedKeys: Array<keyof HumanizedReportBlock> = [
  "human_summary",
  "user_meaning",
  "reasoning",
  "watch_next",
  "confidence_explanation",
  "technical_details",
  "non_advisory_note",
];

const forbiddenHumanJargon = [
  "در وضعیت سناریویی خوانده می‌شود",
  "فشارزا",
  "اثر کلی بازار",
  "رژیم بازار با داده محدود",
  "این دارایی را باید در کنار محرک‌های کلان، نقدینگی و کیفیت داده خواند",
  "خروجی به‌تنهایی برای تصمیم‌گیری کافی نیست",
  "نیازمند تأیید",
  "داده عمیق محدود است",
  "سناریویی",
  "ابطال",
  "پروکسی",
  "ریسک افزایشی",
  "اثر کلی",
  "رژیم بازار",
  "این بخش معنی عملی وضعیت فعلی را نشان می‌دهد",
];

const assetPersianNames: Record<string, string> = {
  USDT: "تتر",
  BTC: "بیت‌کوین",
  ETH: "اتریوم",
  TRX: "ترون",
  TON: "تون",
  SOL: "سولانا",
  XRP: "ریپل",
  DOGE: "دوج‌کوین",
  BNB: "بی‌ان‌بی",
  ADA: "کاردانو",
};

const assetGroupLabel: Record<string, string> = {
  USDT: "شاخص نقدینگی و ثبات",
  BTC: "دارایی مرجع بازار",
  ETH: "دارایی زیرساختی و ریسک‌پذیر",
  TRX: "دارایی پرداخت و شبکه انتقال تتر",
  TON: "دارایی اکوسیستمی",
  SOL: "دارایی بتای بالا",
  XRP: "دارایی حساس به خبرهای مقرراتی",
  DOGE: "دارایی سفته‌بازانه و احساسی",
  BNB: "دارایی وابسته به اکوسیستم صرافی",
  ADA: "دارایی اکوسیستمی با پوشش سبک‌تر",
};

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

export function dataQualityLabelFa(coverage: number | null | undefined, fallback = "داده ناقص یا در انتظار تأیید") {
  if (typeof coverage !== "number" || !Number.isFinite(coverage)) return fallback;
  if (coverage >= 75) return "پوشش داده مناسب";
  if (coverage >= 50) return "پوشش داده متوسط";
  return "داده ناقص یا در انتظار تأیید";
}

export function riskLabelFromImpactFa(impactScore: number | null | undefined, fallback = "ریسک نیازمند رصد") {
  if (typeof impactScore !== "number" || !Number.isFinite(impactScore)) return fallback;
  if (impactScore <= -30) return "ریسک فشار منفی بالا";
  if (impactScore < -9) return "ریسک فشار منفی ملایم";
  if (impactScore <= 9) return "ریسک خنثی / قابل پایش";
  return "ریسک فشار مثبت / در انتظار تأیید";
}

export function validateHumanizedBlock(block: Partial<HumanizedReportBlock> | null | undefined) {
  if (!block) return false;
  const hasRequiredFields = requiredHumanizedKeys.every((key) => {
    const value = block[key];
    if (key === "technical_details") return Boolean(value && typeof value === "object" && !Array.isArray(value));
    return typeof value === "string" && value.trim().length > 0;
  });
  if (!hasRequiredFields) return false;

  const humanSections = [block.human_summary, block.user_meaning, block.reasoning, block.watch_next].filter((value): value is string => typeof value === "string");
  return humanSections.every((section) => !forbiddenHumanJargon.some((term) => section.includes(term)));
}

export function validateHumanizedMeaningDiversity(blocks: Pick<HumanizedReportBlock, "user_meaning">[]) {
  const meanings = blocks.map((block) => normalizeForSimilarity(block.user_meaning)).filter(Boolean);
  if (meanings.length < 2) return { valid: true, maxSimilarity: 0 };

  let maxSimilarity = 0;
  for (let i = 0; i < meanings.length; i += 1) {
    for (let j = i + 1; j < meanings.length; j += 1) {
      maxSimilarity = Math.max(maxSimilarity, similarityRatio(meanings[i], meanings[j]));
    }
  }

  return { valid: maxSimilarity <= 0.4, maxSimilarity };
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

function normalizeForSimilarity(value: string) {
  return value
    .replace(/[،.؛:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similarityRatio(a: string, b: string) {
  const aWords = new Set(a.split(" ").filter((word) => word.length > 2));
  const bWords = new Set(b.split(" ").filter((word) => word.length > 2));
  if (!aWords.size || !bWords.size) return 0;
  const shared = [...aWords].filter((word) => bWords.has(word)).length;
  return shared / Math.max(aWords.size, bWords.size);
}

function impactHumanSentence(score: number | null | undefined) {
  if (typeof score !== "number" || !Number.isFinite(score)) return "داده عددی کافی برای برداشت جهت‌دار وجود ندارد.";
  if (score >= 30) return "فشار مثبت قابل توجه دیده می‌شود، ولی همچنان نباید به‌عنوان سیگنال معامله تفسیر شود.";
  if (score >= 10) return "نشانه‌های مثبت ملایم دیده می‌شود، اما برای قضاوت محکم‌تر باید داده‌های بعدی هم‌جهت باشند.";
  if (score >= -9) return "وضعیت فعلی تقریباً خنثی است و هنوز جهت مشخصی دیده نمی‌شود.";
  if (score >= -29) return "فشار منفی ملایم دیده می‌شود، اما هنوز آن‌قدر قوی نیست که نتیجه قطعی بدهد.";
  return "فشار منفی قابل توجه است و ریسک بازار بالا رفته است.";
}

function assetNameFromContext(context: HumanReportContext) {
  if (context.assetNameFa) return context.assetNameFa;
  if (context.assetSymbol && assetPersianNames[context.assetSymbol]) return assetPersianNames[context.assetSymbol];
  const titleSymbol = context.titleFa?.split("—")[0]?.trim();
  if (titleSymbol && assetPersianNames[titleSymbol]) return assetPersianNames[titleSymbol];
  return context.titleFa ?? "این دارایی";
}

function symbolFromContext(context: HumanReportContext) {
  if (context.assetSymbol) return context.assetSymbol;
  const titleSymbol = context.titleFa?.split("—")[0]?.trim();
  return titleSymbol && assetPersianNames[titleSymbol] ? titleSymbol : undefined;
}

function readableDriver(driver: string) {
  const normalized = sanitizeHumanText(driver.replace(/\s+/g, " ").trim());
  const [rawLabel, rawState] = normalized.split(":").map((part) => part?.trim()).filter(Boolean);
  const label = sanitizeHumanText(rawLabel || normalized);
  const state = sanitizeHumanText(rawState || "");
  if (/رژیم|فضای کلی بازار/.test(label)) return "فضای کلی بازار";
  if (/مومنتوم|قیمت/.test(label)) {
    if (/فشار|منفی/.test(state)) return "ضعف حرکت قیمت";
    if (/حمایت|مثبت/.test(state)) return "بهبود حرکت قیمت";
    return "نامشخص بودن حرکت قیمت";
  }
  if (/حجم|نقدشوندگی/.test(label)) {
    if (/فشار|منفی/.test(state)) return "نبود حمایت قوی از حجم معاملات";
    if (/حمایت|مثبت/.test(state)) return "حمایت بهتر از سمت حجم معاملات";
    return "حجم معاملات بدون پیام روشن";
  }
  if (/استیبل|عرضه|ارزش بازار/.test(label)) {
    if (/فشار|منفی/.test(state)) return "ضعف در جریان نقدینگی استیبل‌کوین‌ها";
    if (/حمایت|مثبت/.test(state)) return "بهبود جریان نقدینگی استیبل‌کوین‌ها";
    return "نبود پیام قوی از سمت استیبل‌کوین‌ها";
  }
  if (/ETF/.test(label)) {
    if (/فشار|منفی/.test(state)) return "خروج یا ضعف جریان ETF";
    if (/حمایت|مثبت/.test(state)) return "حمایت جریان ETF";
    return "خنثی بودن جریان ETF";
  }
  if (/کلان|دلار|اوراق|Nasdaq|DXY|US10Y/.test(label)) {
    if (/فشار|منفی/.test(state)) return "فشار از سمت دلار، نرخ بهره یا فضای کلان";
    if (/حمایت|مثبت/.test(state)) return "آرام‌تر شدن بخشی از فشار کلان";
    return "هم‌جهت نبودن محرک‌های کلان";
  }
  if (/خبر|سنتیمنت|روایت|اکوسیستم|رگولاتوری/.test(label)) {
    if (/فشار|منفی/.test(state)) return "فضای خبری ضعیف‌تر";
    if (/حمایت|مثبت/.test(state)) return "خبر یا فضای ذهنی بهتر بازار";
    return "خبرهای بدون جهت روشن";
  }
  if (/فیوچرز|اهرم|مشتقات/.test(label)) return "ابهام یا شکنندگی در داده‌های فیوچرز";
  if (/محدود|ناموجود|داده/.test(normalized)) return "کامل نبودن داده‌های عمیق بازار";
  return sanitizeHumanText(label).replace(/حمایتی/g, "بهتر");
}

function sanitizeHumanText(value: string) {
  return value
    .replace(/در وضعیت سناریویی خوانده می‌شود/g, "با برداشت محتاطانه خوانده می‌شود")
    .replace(/رژیم بازار با داده محدود/g, "فضای کلی بازار با داده ناقص")
    .replace(/رژیم بازار/g, "فضای کلی بازار")
    .replace(/اثر کلی بازار/g, "برداشت کلی")
    .replace(/ریسک افزایشی/g, "ریسک رو به افزایش")
    .replace(/فشارزا/g, "ضعیف‌تر")
    .replace(/سناریویی/g, "محتاطانه")
    .replace(/ابطال/g, "بازنگری")
    .replace(/پروکسی/g, "داده غیرمستقیم")
    .replace(/نیازمند تأیید/g, "در انتظار روشن‌تر شدن")
    .replace(/داده عمیق محدود است/g, "داده‌های عمیق بازار کامل نیست")
    .replace(/این دارایی را باید در کنار محرک‌های کلان، نقدینگی و کیفیت داده خواند/g, "این دارایی باید با چند داده مستقل بررسی شود")
    .replace(/خروجی به‌تنهایی برای تصمیم‌گیری کافی نیست/g, "این برداشت برای تصمیم‌گیری مستقل کافی نیست")
    .replace(/این بخش معنی عملی وضعیت فعلی را نشان می‌دهد/g, "این بخش برداشت قابل فهم وضعیت فعلی را توضیح می‌دهد");
}

function uniqueItems(items: string[]) {
  return [...new Set(items.filter((item) => item.trim().length > 0))];
}

function driverReasons(drivers: string[], fallback: string[]) {
  const reasons = uniqueItems(drivers.map(readableDriver)).filter((item) => item.length > 0);
  return (reasons.length ? reasons : fallback).slice(0, 3);
}

function sentenceList(items: string[]) {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} و ${items[1]}`;
  return `${items.slice(0, -1).join("، ")} و ${items[items.length - 1]}`;
}

function assetSummary(context: HumanReportContext, impactScore: number | null, drivers: string[]) {
  const symbol = symbolFromContext(context);
  const name = assetNameFromContext(context);
  if (symbol === "USDT") {
    return "تتر در این گزارش به‌عنوان نشانه نقدینگی و ثبات بازار سنجیده می‌شود، نه دارایی مناسب برداشت صعودی یا نزولی.";
  }
  const group = symbol ? assetGroupLabel[symbol] : undefined;
  return sanitizeHumanText(`${name}${group ? ` به‌عنوان ${group}` : ""} اکنون با این برداشت خوانده می‌شود: ${impactHumanSentence(impactScore)}`);
}

function assetMeaning(context: HumanReportContext, confidence: number | null, coverage: number | null, impactScore: number | null) {
  const symbol = symbolFromContext(context);
  const name = assetNameFromContext(context);
  if (symbol === "USDT") {
    return "برای کاربر عادی، تغییر وضعیت تتر بیشتر درباره کیفیت نقدینگی و ریسک ثبات بازار مهم است، نه انتخاب جهت قیمت.";
  }
  const assetSpecificMeaning: Record<string, string> = {
    BTC: "برای بیت‌کوین، برداشت فعلی بیشتر به رابطه ETF، دلار و بازده اوراق وابسته است؛ تغییر این سه مورد می‌تواند نگاه بازار را سریع عوض کند.",
    ETH: "برای اتریوم، کاربر باید جداگانه ببیند آیا ETF، Nasdaq و حجم معاملات یک پیام مشترک می‌دهند یا هر کدام مسیر متفاوتی دارند.",
    TRX: "برای ترون، پیام اصلی از ترکیب حجم معاملات و نقش شبکه TRON در جابه‌جایی تتر می‌آید؛ بدون بهبود این دو، برداشت محتاطانه‌تر است.",
    TON: "برای تون، اهمیت اصلی در خبرهای اکوسیستم و واکنش واقعی بازار است؛ خبر بدون رشد حجم یا قیمت نباید پررنگ شود.",
    SOL: "برای سولانا، کاربر باید بداند این دارایی معمولاً به ریسک‌پذیری بازار حساس‌تر است؛ حجم و رفتار فیوچرز می‌توانند برداشت را تغییر دهند.",
    XRP: "برای ریپل، خبرهای مقرراتی و واکنش قیمت باید با هم دیده شوند؛ فقط یکی از این دو برای برداشت قوی کافی نیست.",
    DOGE: "برای دوج‌کوین، موج احساسی و حجم غیرعادی مهم‌تر از تحلیل‌های سنگین‌تر است؛ نبود این دو یعنی بهتر است فقط دنبال شود.",
    BNB: "برای بی‌ان‌بی، ریسک و خبرهای اکوسیستم Binance کنار حجم معاملات تعیین‌کننده‌ترند؛ ضعف در یکی از این دو می‌تواند برداشت را محتاط کند.",
    ADA: "برای کاردانو، تغییر مومنتوم و خبرهای اکوسیستم باید همزمان بهتر شوند؛ در غیر این صورت برداشت محتاطانه باقی می‌ماند.",
    DXY: "برای شاخص دلار، کاربر باید ببیند قدرت دلار فشار بیشتری روی دارایی‌های ریسکی می‌گذارد یا آرام‌تر می‌شود.",
    Gold: "برای طلا، معنی اصلی در تشخیص فضای احتیاط بازار است؛ رشد طلا همیشه برای کریپتو مثبت نیست و باید کنار دلار و خبرهای ریسک‌گریزی خوانده شود.",
    Nasdaq: "برای نزدک، پیام اصلی درباره اشتهای ریسک در دارایی‌های فناوری است؛ اگر نزدک ضعیف شود، بیت‌کوین و اتریوم هم معمولاً حساس‌تر می‌شوند.",
    US10Y: "برای بازده ۱۰ ساله آمریکا، نکته مهم فشار نرخ بهره بر دارایی‌های ریسکی است؛ افزایش آن می‌تواند تحمل ریسک در کریپتو را کمتر کند.",
  };
  if (symbol && assetSpecificMeaning[symbol]) {
    if (coverage !== null && coverage < 50) {
      return `${assetSpecificMeaning[symbol]} ${limitedCoverageMeaning(symbol, name)}`;
    }
    if (confidence !== null && confidence < 45) {
      return `${assetSpecificMeaning[symbol]} فعلاً شواهد اصلی به اندازه کافی هم‌جهت نیستند، پس برداشت عجولانه پرریسک است.`;
    }
    return assetSpecificMeaning[symbol];
  }
  if (coverage !== null && coverage < 50) {
    return `${name} فعلاً داده کافی برای برداشت محکم ندارد؛ بهتر است فقط تغییرات اصلی و خبرهای معتبر آن دنبال شود.`;
  }
  if (confidence !== null && confidence < 45) {
    return `در مورد ${name}، ریسک برداشت عجولانه بالاست چون شواهد اصلی هنوز کنار هم تصویر روشنی نمی‌سازند.`;
  }
  if (impactScore !== null && impactScore <= -30) {
    return `${name} باید با احتیاط بیشتری دنبال شود، چون چند نشانه همزمان به سمت ضعف بازار اشاره دارند.`;
  }
  if (impactScore !== null && impactScore >= 30) {
    return `برای ${name} شرایط بهتر شده، اما باید دید این بهبود در حجم، خبر یا نقدینگی هم ادامه پیدا می‌کند یا نه.`;
  }
  if (impactScore !== null && impactScore < -9) {
    return `در ${name} ضعف ملایم دیده می‌شود، اما هنوز برای نتیجه‌گیری محکم کافی نیست.`;
  }
  if (impactScore !== null && impactScore > 9) {
    return `در ${name} نشانه‌های بهتر شدن دیده می‌شود، اما باید در داده‌های بعدی هم ادامه پیدا کند.`;
  }
  if (symbol === "BTC") return "برای بیت‌کوین، نبود جهت روشن یعنی باید همزمان جریان ETF، دلار و بازده اوراق را دنبال کرد.";
  if (symbol === "ETH") return "برای اتریوم، برداشت خنثی یعنی باید واکنش آن به Nasdaq، ETF و حجم معاملات جداگانه بررسی شود.";
  if (symbol === "TRX") return "برای ترون، نبود جهت روشن یعنی حجم معاملات و زمینه استفاده از تتر روی شبکه TRON مهم‌ترین نقاط رصد هستند.";
  if (symbol === "TON") return "برای تون، برداشت فعلی بیشتر به معنی انتظار برای خبر معتبر اکوسیستم و تأیید آن در قیمت و حجم است.";
  if (symbol === "SOL") return "برای سولانا، خنثی بودن یعنی باید دید ریسک‌پذیری بازار و حجم معاملات دوباره هم‌جهت می‌شوند یا نه.";
  if (symbol === "XRP") return "برای ریپل، نبود جهت روشن یعنی خبرهای مقرراتی و واکنش قیمت باید با هم دیده شوند.";
  if (symbol === "DOGE") return "برای دوج‌کوین، وضعیت خنثی یعنی موج احساسی یا حجم غیرعادی هنوز پیام کافی نداده است.";
  if (symbol === "BNB") return "برای بی‌ان‌بی، برداشت فعلی یعنی ریسک و خبرهای اکوسیستم Binance باید کنار حجم معاملات بررسی شود.";
  if (symbol === "ADA") return "برای کاردانو، نبود جهت روشن یعنی تغییر مومنتوم و خبرهای اکوسیستم هنوز باید تأیید شوند.";
  if (symbol === "DXY") return "برای شاخص دلار، نبود جهت روشن یعنی باید واکنش کریپتو به تغییر دلار و نرخ‌ها در چند بروزرسانی بعدی دیده شود.";
  if (symbol === "Gold") return "برای طلا، نبود جهت روشن یعنی باید مشخص شود حرکت آن از ریسک‌گریزی آمده یا از جریان عادی بازار.";
  if (symbol === "Nasdaq") return "برای نزدک، برداشت خنثی یعنی بازار فناوری هنوز پیام کافی برای جهت ریسک‌پذیری نداده است.";
  if (symbol === "US10Y") return "برای بازده اوراق آمریکا، برداشت خنثی یعنی فشار نرخ بهره هنوز پیام قطعی برای کریپتو نداده است.";
  return `${name} فعلاً جهت واضحی ندارد و بیشتر مناسب رصد است.`;
}

function limitedCoverageMeaning(symbol: string, name: string) {
  const suffixes: Record<string, string> = {
    BTC: "تا وقتی ETF، دلار و بازده اوراق همزمان روشن‌تر نشوند، بهتر است بیت‌کوین فقط با نگاه رصدی دنبال شود.",
    ETH: "در چنین شرایطی، اتریوم بیشتر به واکنش همزمان ETF، Nasdaq و حجم معاملات وابسته می‌ماند.",
    SOL: "برای سولانا، نبود داده کامل یعنی هر حرکت سریع قیمت باید با حجم و فیوچرز دوباره سنجیده شود.",
    DXY: "برای شاخص دلار، برداشت فعلی باید با تغییر بازده اوراق و واکنش بیت‌کوین در بروزرسانی بعدی مقایسه شود.",
    Gold: "برای طلا، بهتر است معلوم شود حرکت فعلی از ترس بازار آمده یا فقط نوسان عادی دارایی امن است.",
    US10Y: "برای بازده اوراق، تا وقتی مسیر دلار و واکنش دارایی‌های ریسکی روشن‌تر نشود، برداشت باید محتاط بماند.",
    TRX: "برای ترون، حجم معاملات و نشانه‌های مرتبط با استفاده از تتر روی TRON باید وزن بیشتری در رصد بعدی بگیرند.",
    TON: "برای تون، خبرهای اکوسیستم بدون واکنش حجم و قیمت نباید برداشت را سنگین‌تر کند.",
    XRP: "برای ریپل، نبود داده کامل یعنی خبرهای مقرراتی باید با واکنش قیمت سنجیده شوند، نه جداگانه.",
    DOGE: "برای دوج‌کوین، نبود موج حجمی یا اجتماعی قوی یعنی وضعیت بیشتر حالت پایشی دارد.",
    BNB: "برای بی‌ان‌بی، خبرهای اکوسیستم Binance و حجم معاملات باید قبل از هر برداشت جدی‌تر روشن‌تر شوند.",
    ADA: "برای کاردانو، مومنتوم و خبرهای اکوسیستم باید همزمان بهتر شوند تا برداشت از حالت محتاط خارج شود.",
  };
  return suffixes[symbol] ?? `${name} تا روشن‌تر شدن داده‌های اصلی بهتر است فقط در وضعیت پایش بماند.`;
}

function assetReasoning(context: HumanReportContext, drivers: string[], coverage: number | null) {
  const symbol = symbolFromContext(context);
  if (symbol === "USDT") {
    const reasons = driverReasons(drivers, ["ثبات قیمت تتر", "روند عرضه USDT", "وضعیت ارزش بازار استیبل‌کوین‌ها"]);
    return `برداشت فعلی از تتر بر پایه ${sentenceList(reasons)} شکل گرفته است. داده‌های شبکه یا ناشر فقط وقتی معتبرند که منبع مستقیم داشته باشند.`;
  }
  const fallback = symbol === "BTC" || symbol === "ETH"
    ? ["حرکت قیمت", "جریان ETF در صورت وجود", "فضای کلان مثل دلار و نرخ بهره"]
    : symbol === "TRX"
      ? ["حرکت قیمت", "حجم معاملات", "زمینه شبکه TRON و استفاده از تتر"]
      : ["حرکت قیمت", "حجم معاملات", "خبر یا فضای ذهنی بازار"];
  const reasons = driverReasons(drivers, fallback);
  const missingNote = coverage !== null && coverage < 75 ? " بخشی از داده‌های عمیق‌تر بازار هنوز کامل نیست، بنابراین برداشت با احتیاط خوانده می‌شود." : "";
  return `برداشت فعلی بیشتر به دلیل ${sentenceList(reasons)} شکل گرفته است.${missingNote}`;
}

function assetWatchNext(context: HumanReportContext, drivers: string[]) {
  const symbol = symbolFromContext(context);
  if (symbol === "USDT") return "برای بروزرسانی بعدی، ثبات قیمت تتر، تغییر عرضه USDT و خبرهای معتبر درباره ناشر یا شبکه انتقال باید دنبال شود.";
  if (symbol === "BTC") return "برای بروزرسانی بعدی، جریان ETF بیت‌کوین، تغییر DXY/US10Y، حجم معاملات و حرکت قیمت باید زیر نظر باشد.";
  if (symbol === "ETH") return "برای بروزرسانی بعدی، جریان ETF اتریوم، وضعیت Nasdaq، حجم معاملات و حرکت قیمت اتریوم مهم‌ترند.";
  if (symbol === "TRX") return "برای بروزرسانی بعدی، حجم معاملات TRX، تغییر قیمت و هر داده معتبر درباره استفاده از USDT روی شبکه TRON باید دنبال شود.";
  if (symbol === "DOGE") return "برای بروزرسانی بعدی، تغییر حجم، حرکت قیمت و موج‌های خبری یا اجتماعی مرتبط باید دنبال شود.";
  if (symbol === "BNB") return "برای بروزرسانی بعدی، خبرهای اکوسیستم Binance، حجم معاملات و تغییر حرکت قیمت BNB مهم‌ترند.";
  if (symbol === "XRP") return "برای بروزرسانی بعدی، خبرهای مقرراتی، حجم معاملات و تغییر حرکت قیمت XRP باید زیر نظر باشد.";
  if (symbol === "TON") return "برای بروزرسانی بعدی، خبرهای اکوسیستم TON، حجم معاملات و تغییر حرکت قیمت باید بررسی شود.";
  if (symbol === "SOL") return "برای بروزرسانی بعدی، حجم معاملات، حرکت قیمت و نشانه‌های ریسک در بازار فیوچرز سولانا باید دنبال شود.";
  if (symbol === "ADA") return "برای بروزرسانی بعدی، حرکت قیمت، حجم معاملات و خبرهای اکوسیستم کاردانو باید زیر نظر باشد.";
  if (symbol === "DXY") return "برای بروزرسانی بعدی، تغییر شاخص دلار، بازده اوراق و واکنش بیت‌کوین و اتریوم باید دنبال شود.";
  if (symbol === "Gold") return "برای بروزرسانی بعدی، تغییر طلا، شدت خبرهای ریسک‌گریز و رفتار دلار باید کنار هم بررسی شود.";
  if (symbol === "Nasdaq") return "برای بروزرسانی بعدی، حرکت نزدک، نرخ‌های آمریکا و واکنش بیت‌کوین و اتریوم باید دنبال شود.";
  if (symbol === "US10Y") return "برای بروزرسانی بعدی، تغییر بازده اوراق، جهت دلار و فشار روی دارایی‌های ریسکی باید بررسی شود.";
  const reasonText = sentenceList(driverReasons(drivers, ["حجم معاملات", "حرکت قیمت", "وضعیت نقدینگی بازار"]));
  return sanitizeHumanText(`برای بروزرسانی بعدی، ${reasonText} باید زیر نظر گرفته شود.`);
}

function driverSummary(context: HumanReportContext) {
  const title = context.titleFa ?? "این محرک";
  const direction = context.directionFa ?? context.statusFa ?? "";
  if (/حمایت|مثبت|بهتر/.test(direction)) return `${title} فعلاً می‌تواند کمی از فشار بازار کم کند، اما برای برداشت محکم باید در داده‌های بعدی هم ادامه پیدا کند.`;
  if (/فشار|ریسک|منفی/.test(direction)) return `${title} فعلاً نشانه‌ای از سخت‌تر شدن شرایط بازار می‌دهد و باید با سایر داده‌ها سنجیده شود.`;
  return sanitizeHumanText(`${title} فعلاً پیام یک‌دست و روشن برای بازار نمی‌دهد.`);
}

function driverMeaning(context: HumanReportContext) {
  const title = context.titleFa ?? "این محرک";
  if (/ETF/.test(title)) return "برای کاربر عادی یعنی جریان سرمایه نهادی در بیت‌کوین و اتریوم باید جدا از نوسان لحظه‌ای قیمت دیده شود.";
  if (/استیبل/.test(title)) return "برای کاربر عادی یعنی کیفیت نقدینگی نقدی بازار هنوز یکی از نقاط اصلی رصد است.";
  if (/کلان|دلار|اوراق/.test(title)) return "برای کاربر عادی یعنی فضای دلار، نرخ بهره و دارایی‌های ریسکی می‌تواند روی رمزارزها فشار یا آرامش ایجاد کند.";
  if (/سنتیمنت|خبر/.test(title)) return "برای کاربر عادی یعنی خبرهای مهم می‌توانند برداشت بازار را تغییر دهند، اما خبر ضعیف یا تکراری کافی نیست.";
  return "برای کاربر عادی یعنی این عامل فقط بخشی از تصویر بازار است و باید کنار بقیه داده‌ها خوانده شود.";
}

function marketSummary(rawBlock: Record<string, unknown>, context: HumanReportContext, impactScore: number | null, confidence: number | null) {
  const summary = coerceString(rawBlock.summaryFa) ?? context.reasoningFa;
  if (summary && !containsForbiddenHumanJargon(summary)) return summary;
  if (confidence !== null && confidence < 45) return "بازار هنوز تصویر روشنی نمی‌دهد و بهتر است فعلاً با نگاه احتیاطی دنبال شود.";
  return sanitizeHumanText(`در نمای کلی بازار، ${impactHumanSentence(impactScore)} چند محرک اصلی باید همزمان بررسی شوند، چون یک داده تنها برای برداشت نهایی کافی نیست.`);
}

function containsForbiddenHumanJargon(value: string) {
  return forbiddenHumanJargon.some((term) => value.includes(term));
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
  const cleanReasoning = context.kind === "asset"
    ? assetReasoning(context, drivers, coverage)
    : context.kind === "driver"
      ? driverReasons(drivers, [coerceString(raw.explanationFa) ?? context.reasoningFa ?? "این عامل با بخشی از داده‌های فعلی هم‌خوانی دارد."])[0]
      : context.kind === "market"
        ? marketSummary(raw, context, impactScore, confidence)
        : driverReasons(drivers, [coerceString(raw.explanationFa) ?? context.reasoningFa ?? "برداشت فعلی از ترکیب داده‌های موجود ساخته شده است."])[0];
  const watchNext =
    context.watchNextFa ??
    (context.kind === "asset"
      ? assetWatchNext(context, drivers)
      : context.kind === "market"
        ? "برای بروزرسانی بعدی، تغییر دلار، بازده اوراق، نقدینگی استیبل‌کوین و جریان ETF باید کنار هم بررسی شوند."
        : context.kind === "driver"
          ? "در بروزرسانی بعدی باید دید این عامل با قیمت، حجم یا داده‌های مستقل دیگر هم‌جهت می‌شود یا نه."
          : "در بروزرسانی بعدی، تغییر داده‌های اصلی و کیفیت پوشش باید دنبال شود.");

  return {
    human_summary:
      context.kind === "asset"
        ? assetSummary(context, impactScore, drivers)
        : context.kind === "driver"
          ? driverSummary(context)
          : context.kind === "market"
            ? marketSummary(raw, context, impactScore, confidence)
            : `${context.titleFa ?? "این بخش"} با زبان ساده بازنویسی شده است.`,
    user_meaning:
      context.kind === "asset"
        ? assetMeaning(context, confidence, coverage, impactScore)
        : context.kind === "driver"
          ? driverMeaning(context)
          : context.kind === "market"
            ? "برای کاربر عادی یعنی باید تصمیم را به یک محرک تنها گره نزد و تغییر چند داده اصلی را در کنار هم دید."
            : "برای کاربر عادی یعنی این بخش فقط بخشی از تصویر بازار را توضیح می‌دهد.",
    reasoning: cleanReasoning,
    watch_next: watchNext,
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
    `۴. برای رصد بعدی\n${block.watch_next}`,
    `۵. اعتماد و کیفیت داده\n${block.confidence_explanation}`,
    `۶. جزئیات فنی\n${Object.entries(block.technical_details)
      .map(([key, value]) => `- ${key}: ${String(value)}`)
      .join("\n")}`,
    `۷. جزئیات Audit\n${Object.entries(block.audit_details)
      .map(([key, value]) => `- ${key}: ${Array.isArray(value) ? value.join("، ") : String(value)}`)
      .join("\n")}`,
    block.non_advisory_note,
  ].join("\n\n");
}
