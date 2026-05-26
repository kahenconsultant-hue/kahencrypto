import type {
  AssetIntelligence,
  DataSourceStatus,
  HorizonIntelligence,
  IntelligenceAssetSymbol,
  MarketRegime,
  SignalScores,
  SourceSignal,
  TimeHorizon,
} from "@/lib/types";
import { getDynamicCorrelationReport } from "@/server/analytics/correlation-engine";
import { getLiquidityReport } from "@/server/analytics/liquidity-engine";
import { calculateMarketRegime } from "@/server/analytics/market-regime-engine";
import { getSourcesForAsset } from "@/collectors/registry";

export const supportedIntelligenceAssets: IntelligenceAssetSymbol[] = ["BTC", "ETH", "SOL", "USDT", "DXY", "Gold", "Nasdaq", "US10Y"];

export const horizonLabelsFa: Record<TimeHorizon, string> = {
  short: "کوتاه‌مدت: ۷ روز آینده",
  medium: "میان‌مدت: ۱ ماه آینده",
  long: "بلندمدت: ۶ ماه آینده",
};

const horizonLastUpdated: Record<TimeHorizon, string> = {
  short: "2026-05-23T14:10:00+02:00",
  medium: "2026-05-23T13:40:00+02:00",
  long: "2026-05-23T12:55:00+02:00",
};

const regimeByAssetHorizon: Record<IntelligenceAssetSymbol, Record<TimeHorizon, MarketRegime>> = {
  BTC: { short: "Macro Uncertainty", medium: "ETF Accumulation", long: "Liquidity Expansion" },
  ETH: { short: "Macro Uncertainty", medium: "Risk-On", long: "Liquidity Expansion" },
  SOL: { short: "Leverage Overheating", medium: "Risk-On", long: "Euphoria" },
  USDT: { short: "Stablecoin Stress", medium: "Stablecoin Expansion", long: "Geopolitical Stress" },
  DXY: { short: "Risk-Off", medium: "Macro Uncertainty", long: "Liquidity Contraction" },
  Gold: { short: "Geopolitical Stress", medium: "Macro Uncertainty", long: "Liquidity Contraction" },
  Nasdaq: { short: "Macro Uncertainty", medium: "Risk-On", long: "Liquidity Expansion" },
  US10Y: { short: "Liquidity Contraction", medium: "Macro Uncertainty", long: "Risk-Off" },
};

const confidenceByAssetHorizon: Record<IntelligenceAssetSymbol, Record<TimeHorizon, number>> = {
  BTC: { short: 76, medium: 72, long: 66 },
  ETH: { short: 70, medium: 68, long: 63 },
  SOL: { short: 68, medium: 64, long: 58 },
  USDT: { short: 74, medium: 70, long: 61 },
  DXY: { short: 78, medium: 71, long: 62 },
  Gold: { short: 73, medium: 69, long: 60 },
  Nasdaq: { short: 72, medium: 67, long: 59 },
  US10Y: { short: 77, medium: 70, long: 62 },
};

type NarrativePack = Omit<
  HorizonIntelligence,
  "asset" | "horizon" | "horizonLabelFa" | "regime" | "confidence" | "dataQuality" | "forecast" | "quantitativeScores" | "usedSources" | "lastUpdatedAt"
>;

const narratives: Record<IntelligenceAssetSymbol, Record<TimeHorizon, NarrativePack>> = {
  BTC: {
    short: {
      summary:
        "در کوتاه‌مدت، فشار اصلی روی بیت‌کوین از سمت بازده اوراق ۱۰ ساله آمریکا و شاخص دلار می‌آید. تا وقتی DXY و US10Y هم‌زمان بالا بمانند، ورود سرمایه به دارایی‌های پرریسک محدود می‌شود. با این حال، تداوم ورود سرمایه به ETFهای اسپات می‌تواند بخشی از این فشار را جذب کند و مانع تبدیل نوسان به فروش ساختاری شود.",
      bullishFactors: ["ورود خالص ETFهای اسپات", "کاهش ذخایر BTC در صرافی‌ها", "نبود جهش شدید در ورودی نهنگ‌ها به صرافی", "ثبات نسبی نرخ فاندینگ نسبت به موقعیت‌های باز"],
      bearishFactors: ["دلار قوی و بازده بالای اوراق", "افزایش open interest بدون رشد حجم اسپات", "فشار headlineهای ژئوپلیتیک روی نقدینگی", "کاهش همبستگی حمایتی با Nasdaq بدون تایید طلا"],
      liquiditySignal: "نقدینگی بومی کریپتو کمی بهتر شده، اما نقدینگی کلان هنوز انبساطی نیست. ETFها نقش ضربه‌گیر دارند، نه موتور قطعی رشد.",
      macroSignal: "BTC فعلاً به DXY و US10Y حساس است؛ افت هم‌زمان این دو می‌تواند فضا را برای بازگشت risk appetite باز کند.",
      flowSignal: "ترکیب ورود سرمایه به ETF و کاهش ذخایر صرافی‌ها مثبت است، ولی برای کوتاه‌مدت باید نقشه لیکوییدیشن و نرخ فاندینگ هم‌زمان پایش شوند.",
      sentimentSignal: "هیجان ETF بالاست، اما هنوز به سطح سرخوشی گسترده نرسیده؛ این یعنی narrative فعال است ولی crowded نیست.",
      correlationSignal: "همبستگی کوتاه‌مدت BTC با Nasdaq کاهش یافته و با Gold کمی تقویت شده؛ بازار بین tech beta و macro hedge در حال جابه‌جایی است.",
      keyRisks: ["جهش ناگهانی US10Y", "خروجی چندروزه از ETFها", "شلوغ شدن leverage در جهت خرید", "خبر تحریمی یا امنیتی که نقدشوندگی را کم کند"],
      recommendedMonitoring: ["DXY و US10Y در تایم روزانه", "جریان خالص IBIT/FBTC/GBTC", "نرخ فاندینگ و موقعیت‌های باز", "ذخایر صرافی و ورودی نهنگ‌ها", "VIX/MOVE و DVOL"],
    },
    medium: {
      summary:
        "در افق یک‌ماهه، بیت‌کوین بیشتر با کیفیت جریان نهادی سنجیده می‌شود تا با یک خبر منفرد. اگر ETFها جریان مثبت اما آرام داشته باشند و دلار از سقف‌های اخیر فاصله بگیرد، سناریوی انباشت نهادی معتبرتر می‌شود. اگر نرخ‌ها بالا بمانند و ETFها ضعیف شوند، بازار احتمالاً به محدوده‌سازی فرسایشی برمی‌گردد.",
      bullishFactors: ["پایداری جریان ورودی ETF", "کاهش فشار فروش ماینرها", "بهبود عرضه استیبل‌کوین", "بازگشت همبستگی مثبت با نقدینگی"],
      bearishFactors: ["چرخش فدرال رزرو به لحن سخت‌گیرانه‌تر", "خروج سرمایه از ETFها", "افزایش realized profit taking", "افزایش MOVE Index"],
      liquiditySignal: "برای یک ماه آینده، کیفیت نقدینگی مهم‌تر از مقدار خام آن است؛ ورود آهسته و پیوسته بهتر از spikeهای کوتاه‌مدت است.",
      macroSignal: "سناریوی بهتر زمانی شکل می‌گیرد که داده‌های تورمی فشار نرخ را کم کنند و بازار دوباره pivot را قابل‌باور بداند.",
      flowSignal: "ETFها و exchange reserves باید هم‌جهت بمانند؛ واگرایی میان ورودی ETF و افزایش ذخایر صرافی هشدار توزیع است.",
      sentimentSignal: "اگر بحث ETF از تیترهای هیجانی به روایت تخصیص نهادی تبدیل شود، پایداری حرکت بیشتر می‌شود.",
      correlationSignal: "کاهش وابستگی به Nasdaq فقط وقتی سازنده است که با تقویت نقش بیت‌کوین به‌عنوان hedge نقدینگی همراه شود.",
      keyRisks: ["تورم بالاتر از انتظار", "ضعف تقاضای نهادی", "فشار فروش ماینرها", "کاهش عمق بازار در آخر هفته‌ها"],
      recommendedMonitoring: ["CPI/PCE و FOMC", "جریان تجمعی ETF", "ذخایر ماینرها", "ورودی استیبل‌کوین به صرافی", "همبستگی rolling BTC/Nasdaq و BTC/Gold"],
    },
    long: {
      summary:
        "در افق شش‌ماهه، مسئله اصلی بیت‌کوین این است که آیا نقش آن در پرتفوی نهادی تثبیت می‌شود یا دوباره به دارایی پرریسک صرف تقلیل پیدا می‌کند. کاهش نرخ‌های واقعی، رشد آرام استیبل‌کوین‌ها و ادامه ETF accumulation می‌تواند سناریوی سازنده بسازد؛ اما دلار قوی و سیاست پولی سخت‌گیرانه این مسیر را کند می‌کند.",
      bullishFactors: ["نهادینه‌شدن ETFها", "کاهش نرخ واقعی", "گسترش نقدینگی استیبل‌کوین", "کاهش عرضه قابل‌فروش در صرافی‌ها"],
      bearishFactors: ["دوره طولانی نرخ‌های بالا", "سخت‌گیری قانون‌گذاری نگه‌داری دارایی", "کاهش تقاضای نهادی", "فشار فروش ناشی از شناسایی سود بلندمدت"],
      liquiditySignal: "BTC در افق بلندتر بیش از هر چیز به جهت نقدینگی جهانی حساس است؛ گسترش پایدار نقدینگی می‌تواند ارزش‌گذاری را جابه‌جا کند.",
      macroSignal: "کاهش تدریجی فشار دلار و اوراق برای تغییر رژیم بازار لازم است؛ بدون آن، رشدها شکننده‌تر می‌مانند.",
      flowSignal: "ترکیب ETF، ماینرها و هولدرهای بلندمدت باید تصویر عرضه را روشن کند.",
      sentimentSignal: "ورود سرمایه بلندمدت زمانی بهتر می‌شود که روایت از هیجان قیمت به تخصیص ساختاری تغییر کند.",
      correlationSignal: "اگر همبستگی با نقدینگی از همبستگی با بتای فناوری پیشی بگیرد، روایت بیت‌کوین بالغ‌تر می‌شود.",
      keyRisks: ["سیاست پولی انقباضی طولانی", "ریسک نگه‌داری دارایی یا ETF", "شوک ژئوپلیتیک شدید", "ضعف مزمن حجم اسپات"],
      recommendedMonitoring: ["بازده واقعی", "سهم ETF از دارایی تحت مدیریت", "عرضه هولدرهای بلندمدت", "شاخص‌های نقدینگی جهانی", "قوانین نگه‌داری دارایی و ETF"],
    },
  },
  ETH: {
    short: {
      summary:
        "اتریوم در کوتاه‌مدت بیشتر از بیت‌کوین به نرخ تنزیل و سهام فناوری حساس است. اگر Nasdaq زیر فشار نرخ‌ها بماند، ETH معمولاً سخت‌تر رشد می‌کند. نقطه حمایتی تحلیل، فعالیت لایه دوم و تقاضای نسبی برای staking است؛ اما این محرک‌ها برای خنثی کردن فشار ماکرو به جریان سرمایه نیاز دارند.",
      bullishFactors: ["فعالیت پایدار لایه دوم", "کاهش gas fee بدون افت activity", "بهبود ETH/BTC ratio", "تقاضای staking"],
      bearishFactors: ["ضعف Nasdaq", "کاهش revenue لایه اصلی", "ریسک قانون‌گذاری staking", "OI بالا بدون حجم اسپات"],
      liquiditySignal: "ETH به نقدینگی ریسک‌پذیر وابسته‌تر از BTC است؛ اگر دلار قوی بماند، rotation به ETH محدود می‌شود.",
      macroSignal: "بازده اوراق بالا ارزش‌گذاری دارایی‌های شبه‌رشد را فشرده می‌کند و ETH از این مسیر آسیب‌پذیر است.",
      flowSignal: "ETF احتمالی یا جریان نهادی برای ETH هنوز به قدرت BTC نیست؛ فعلاً ETH/BTC ratio شاخص مهم‌تری است.",
      sentimentSignal: "روایت L2 و restaking فعال است، اما بدون درآمد شبکه ممکن است بیش از حد روایی بماند.",
      correlationSignal: "همبستگی ETH با tech beta بالاست؛ افت Nasdaq سریع‌تر از BTC روی ETH منعکس می‌شود.",
      keyRisks: ["کاهش ETH/BTC", "افزایش فشار قانون‌گذاری staking", "ضعف fee capture", "ازدحام leverage در آپشن‌ها"],
      recommendedMonitoring: ["ETH/BTC", "L2 transactions", "Gas fees", "Staking queue", "Options skew"],
    },
    medium: {
      summary:
        "در افق یک‌ماهه، اتریوم به ترکیب فعالیت شبکه، جریان DeFi و نگاه بازار به ETF یا ابزارهای نهادی وابسته است. اگر L2ها رشد کنند اما ارزش اقتصادی به ETH منتقل نشود، روایت شبکه ضعیف می‌ماند. سناریوی بهتر زمانی است که فعالیت، staking و ETH/BTC هم‌زمان بهبود نشان دهند.",
      bullishFactors: ["رشد L2 activity", "TVL پایدار DeFi", "تقویت ETH/BTC", "کاهش فشار فروش صرافی‌ها"],
      bearishFactors: ["رقابت لایه یک‌ها", "کاهش درآمد کارمزدی", "افزایش تمرکز staking", "ضعف تقاضای نهادی"],
      liquiditySignal: "ETH به دوره‌های گسترش نقدینگی پاسخ قوی می‌دهد، اما در انقباض نقدینگی معمولاً نسبت به BTC ضعیف‌تر می‌شود.",
      macroSignal: "نرم شدن داده‌های تورمی و افت real yield برای rerating ETH مهم است.",
      flowSignal: "DeFi TVL، staking و exchange reserves باید کنار هم دیده شوند؛ فقط رشد TVL کافی نیست.",
      sentimentSignal: "اگر restaking به روایت ریسک سیستمی تبدیل شود، اثر آن از bullish به caution تغییر می‌کند.",
      correlationSignal: "ETH تا وقتی با Nasdaq هم‌جهت است، محرک اصلی آن هزینه سرمایه است نه صرفاً تکنولوژی شبکه.",
      keyRisks: ["افت ارزش قفل‌شده DeFi", "ریسک Lido/EigenLayer", "ضعف ETH/BTC", "افزایش همبستگی با سهام فناوری در روزهای فشار"],
      recommendedMonitoring: ["ارزش قفل‌شده DeFi", "شاخص‌های Lido/EigenLayer", "ذخایر صرافی", "روند ETH/BTC", "همبستگی با Nasdaq"],
    },
    long: {
      summary:
        "در شش ماه آینده، پرسش کلیدی ETH این است که آیا اکوسیستم می‌تواند رشد فعالیت را به ارزش اقتصادی پایدار برای دارایی اصلی تبدیل کند. اگر لایه دوم‌ها، staking و DeFi به جریان درآمد و تقاضای واقعی تبدیل شوند، تصویر بلندمدت بهتر می‌شود؛ در غیر این صورت ETH زیر سایه BTC و رقبای سریع‌تر می‌ماند.",
      bullishFactors: ["رشد پایدار اقتصاد L2", "افزایش تقاضای نهادی", "تعادل سالم staking", "بازگشت revenue شبکه"],
      bearishFactors: ["فرار ارزش از لایه اصلی", "تمرکز staking", "رقابت SOL و L1های دیگر", "ریسک قانون‌گذاری"],
      liquiditySignal: "ETH در چرخه‌های انبساط نقدینگی می‌تواند leverage عملیاتی بالاتری نسبت به BTC داشته باشد.",
      macroSignal: "افت نرخ‌های واقعی و تقویت سهام رشد برای سناریوی بلندمدت ETH حیاتی است.",
      flowSignal: "جریان نهادی، staking و DeFi باید نشان دهند تقاضا فقط سفته‌بازانه نیست.",
      sentimentSignal: "روایت توسعه‌دهنده و GitHub activity برای اعتماد بلندمدت مهم‌تر از موج‌های کوتاه اجتماعی است.",
      correlationSignal: "کاهش وابستگی به Nasdaq و رشد همبستگی با فعالیت شبکه می‌تواند بلوغ اکوسیستم را نشان دهد.",
      keyRisks: ["ضعف مدل capture value", "ریسک restaking", "رقابت شدید اکوسیستم‌ها", "کاهش سهم توسعه‌دهندگان"],
      recommendedMonitoring: ["Developer activity", "L2 economics", "Staking concentration", "Institutional products", "ETH/BTC multi-month trend"],
    },
  },
  SOL: {
    short: {
      summary:
        "سولانا در کوتاه‌مدت بیش از همه به اشتهای ریسک کاربران خرد، حجم DEX و وضعیت اهرم معاملاتی حساس است. وقتی سنتیمنت بالا می‌رود، SOL سریع واکنش نشان می‌دهد؛ اما همین ویژگی در روزهای فشار دلار یا افت نقدینگی می‌تواند نوسان را تند کند. سلامت شبکه و رفتار برنامه‌هایی مثل Jupiter و Tensor باید کنار نرخ فاندینگ دیده شود.",
      bullishFactors: ["رشد حجم DEX", "افزایش استفاده از برنامه‌ها", "مومنتوم اجتماعی مثبت", "جریان استیبل‌کوین روی Solana"],
      bearishFactors: ["شلوغ شدن نرخ فاندینگ", "افت Nasdaq و اشتهای ریسک", "اختلال شبکه", "کاهش عمق بازار"],
      liquiditySignal: "نقدینگی SOL بیشتر از مسیر rotation آلت‌کوین و جریان retail می‌آید؛ نسبت به شوک‌های نقدینگی شکننده‌تر است.",
      macroSignal: "DXY و US10Y بالا می‌توانند rotation به آلت‌کوین‌ها را سریع خشک کنند.",
      flowSignal: "حجم DEX و جریان استیبل‌کوین روی Solana باید رشد واقعی کاربر را تایید کنند.",
      sentimentSignal: "سنتیمنت SOL داغ است؛ این می‌تواند محرک باشد، اما اگر نرخ فاندینگ هم بالا برود، ریسک پاکسازی اهرمی زیاد می‌شود.",
      correlationSignal: "SOL با retail risk appetite همبستگی بالایی دارد و کمتر نقش defensive دارد.",
      keyRisks: ["ازدحام پوزیشن‌های لانگ", "اختلال شبکه", "افت حجم Jupiter", "چرخش سرمایه از آلت‌کوین‌ها به BTC"],
      recommendedMonitoring: ["حجم Jupiter", "فعالیت Tensor", "سلامت شبکه در Helius/Solscan", "نرخ فاندینگ SOL", "جریان استیبل‌کوین روی Solana"],
    },
    medium: {
      summary:
        "در یک ماه آینده، سولانا باید ثابت کند رشد اکوسیستم فقط موج اجتماعی نیست. اگر DEX volume، کاربران فعال و جریان استیبل‌کوین هم‌زمان رشد کنند، روایت شبکه معتبرتر می‌شود. اگر فقط قیمت و social momentum جلو بروند، ریسک اصلاح اهرمی بالا می‌ماند.",
      bullishFactors: ["رشد کاربران فعال", "حجم پایدار DEX", "افزایش نقدینگی برنامه‌ها", "بهبود network stability"],
      bearishFactors: ["کاهش activity پس از موج social", "افزایش liquidations", "رقابت شدید app-chainها", "تمرکز تقاضا روی meme narratives"],
      liquiditySignal: "SOL به نقدینگی حاشیه‌ای بازار حساس است؛ کوچک‌ترین کاهش appetite می‌تواند روی آن بزرگ‌نمایی شود.",
      macroSignal: "برای ادامه rotation، بازار باید حداقل از فاز risk-off واضح خارج شود.",
      flowSignal: "جریان استیبل‌کوین روی Solana و DEX volume نشانه بهتر از صرف تعداد mentionهاست.",
      sentimentSignal: "روایت مصرفی مثبت است، اما اگر به meme-only تبدیل شود، کیفیت ریسک پایین می‌آید.",
      correlationSignal: "اگر SOL از retail appetite جدا شود و با activity شبکه هم‌جهت‌تر شود، تحلیل میان‌مدت سالم‌تر است.",
      keyRisks: ["افت کاربران فعال", "فشار فروش بعد از رشد سریع", "اختلال زیرساخت", "کاهش نقدینگی استیبل‌کوین"],
      recommendedMonitoring: ["Active addresses", "DEX volume", "App revenues", "Network outages", "Social narrative quality"],
    },
    long: {
      summary:
        "در افق شش‌ماهه، ارزش سولانا به توان تبدیل سرعت و تجربه کاربری به تقاضای اقتصادی پایدار وابسته است. اگر برنامه‌های مصرفی، پرداخت و DeFi روی شبکه رشد واقعی داشته باشند، SOL می‌تواند سهم بیشتری از جریان آلت‌کوین‌ها بگیرد. اما اگر روایت به موج‌های کوتاه retail محدود بماند، چرخه‌های نوسانی شدید ادامه پیدا می‌کند.",
      bullishFactors: ["رشد برنامه‌های مصرفی", "افزایش تسویه استیبل‌کوین", "پایداری شبکه", "جذب توسعه‌دهنده و نقدینگی"],
      bearishFactors: ["ریسک اختلال‌های تکراری", "وابستگی بیش از حد به retail", "رقابت Ethereum L2", "کاهش انگیزه توسعه‌دهنده"],
      liquiditySignal: "در چرخه‌های expansion، SOL می‌تواند از rotation سرمایه بهره ببرد؛ در contraction آسیب‌پذیری آن بیشتر است.",
      macroSignal: "سناریوی بلندمدت مثبت نیازمند محیطی است که سرمایه‌گذار به دارایی‌های پرریسک‌تر اجازه تنفس بدهد.",
      flowSignal: "تسویه استیبل‌کوین و عمق نقدینگی DEX باید نشان دهد شبکه فقط محل سفته‌بازی نیست.",
      sentimentSignal: "سنتیمنت پایدار زمانی ارزشمند است که با usage و revenue همراه شود.",
      correlationSignal: "کاهش وابستگی به meme/retail و افزایش ارتباط با activity شبکه، کیفیت بلندمدت را بالا می‌برد.",
      keyRisks: ["فرسایش اعتماد به پایداری شبکه", "وابستگی به روایت‌های کوتاه", "افت نقدینگی در آلت‌کوین‌ها", "رقابت اکوسیستمی"],
      recommendedMonitoring: ["فعالیت توسعه‌دهندگان", "تسویه استیبل‌کوین", "عمق نقدینگی DEX", "پایداری شبکه", "قدرت نسبی SOL/BTC"],
    },
  },
  USDT: {
    short: {
      summary:
        "در کوتاه‌مدت، USDT باید به‌عنوان شاخص نقدینگی و ریسک عملیاتی دیده شود، نه ابزار سرمایه‌گذاری. رشد صدور توکن می‌تواند نشان‌دهنده آمادگی نقدینگی باشد، اما اگر هم‌زمان پریمیوم محلی، فشار برداشت یا خبر تحریمی بالا برود، همان داده می‌تواند رنگ ریسک بگیرد.",
      bullishFactors: ["رشد عرضه بدون افزایش پریمیوم اضطراری", "ورودی سالم به صرافی‌های بزرگ", "پخش شبکه‌ای متوازن‌تر", "شفافیت گزارش ذخایر"],
      bearishFactors: ["افزایش تیترهای مسدودسازی یا تحریم", "پریمیوم غیرعادی در بازار محلی", "تمرکز انتقال روی یک شبکه", "وابستگی شدید به چند صرافی"],
      liquiditySignal: "USDT کانال نقدینگی سریع بازار است؛ تغییر عرضه آن به‌خصوص وقتی مهم می‌شود که به صرافی‌ها وارد شود.",
      macroSignal: "در تنش ژئوپلیتیک یا دلار قوی، تقاضا برای USDT می‌تواند محلی و دفاعی شود.",
      flowSignal: "Mint/burn باید همراه با مقصد انتقال، شبکه و ذخایر صرافی خوانده شود.",
      sentimentSignal: "افزایش بحث ریسک تتر در جامعه فارسی معمولاً با پریمیوم و نگرانی نگه‌داری دارایی همراه می‌شود.",
      correlationSignal: "رشد dominance استیبل‌کوین‌ها گاهی نشانه نقد آماده است و گاهی نشانه فرار از ریسک؛ context تعیین‌کننده است.",
      keyRisks: ["ریسک مسدودسازی", "تحریم آدرس یا صرافی", "پریمیوم محلی غیرعادی", "مشکل برداشت در صرافی‌های وابسته"],
      recommendedMonitoring: ["شفافیت Tether", "توزیع TRON/ERC20/Solana", "ذخایر صرافی", "پریمیوم ایران", "رویدادهای تحریم یا مسدودسازی"],
    },
    medium: {
      summary:
        "در افق یک‌ماهه، پایداری USDT به شفافیت عرضه، کیفیت reserve، جریان بین شبکه‌ها و رفتار صرافی‌ها وابسته است. رشد عرضه زمانی برای بازار کریپتو سازنده است که به نقدینگی قابل‌استفاده تبدیل شود، نه صرفاً جابه‌جایی بین شبکه‌ها.",
      bullishFactors: ["رشد عرضه استیبل‌کوین", "کاهش پریمیوم اضطراری", "ذخایر صرافی شفاف‌تر", "کاهش خبرهای تحریمی مرتبط"],
      bearishFactors: ["تمرکز شبکه‌ای روی TRON", "افزایش وابستگی کاربران به صرافی‌های محدود", "ابهام گزارش ذخایر", "رشد رویدادهای مسدودسازی"],
      liquiditySignal: "اگر عرضه USDT رشد کند و exchange inflow هم بالا برود، می‌تواند نقد آماده برای بازار باشد.",
      macroSignal: "در دوره‌های فشار دلار، تقاضای USDT ممکن است محلی بالا برود اما این همیشه bullish برای کریپتو نیست.",
      flowSignal: "توزیع TRON/ERC20/Solana باید نشان دهد جریان‌ها برای پرداخت خرد، نگه‌داری نهادی یا DeFi استفاده می‌شوند.",
      sentimentSignal: "افزایش نگرانی فارسی‌زبان‌ها درباره تتر باید از شایعه جدا شود و با پریمیوم و داده مسدودسازی سنجیده شود.",
      correlationSignal: "USDT dominance اگر همراه با افت قیمت دارایی‌ها باشد بیشتر نشانه ریسک‌گریزی است؛ همراه با inflow به صرافی می‌تواند آماده‌باش نقدینگی باشد.",
      keyRisks: ["تحریم شدیدتر", "ریسک صرافی", "کاهش اعتماد به reserve", "اختلال شبکه غالب انتقال"],
      recommendedMonitoring: ["سهم بازار استیبل‌کوین‌ها", "صدور/سوزاندن بر اساس شبکه", "موجودی USDT در صرافی‌های متمرکز", "گزارش آدرس‌های مسدودشده", "روند پریمیوم محلی"],
    },
    long: {
      summary:
        "در افق شش‌ماهه، ریسک اصلی USDT تمرکز نقدینگی و وابستگی کاربران به یک صادرکننده و چند شبکه غالب است. اگر شفافیت ذخایر و تنوع شبکه‌ای بهتر شود، نقش USDT به‌عنوان زیرساخت نقدینگی تقویت می‌شود. اما فشار تحریمی یا ریسک نگه‌داری دارایی می‌تواند تجربه کاربران پرریسک را به‌سرعت تغییر دهد.",
      bullishFactors: ["شفافیت بیشتر reserve", "تنوع شبکه‌ای", "کاهش وابستگی به صرافی‌های پرریسک", "رشد کاربرد پرداختی سالم"],
      bearishFactors: ["ریسک قانون‌گذاری صادرکننده", "مسدودسازی گسترده‌تر", "تمرکز روی TRON", "رقابت استیبل‌کوین‌های قانون‌مندتر"],
      liquiditySignal: "USDT همچنان ستون نقدینگی برون‌مرزی است، اما کیفیت آن به قابلیت تبدیل، نگه‌داری دارایی و دسترسی منطقه‌ای بستگی دارد.",
      macroSignal: "فشارهای ژئوپلیتیک و تحریم می‌توانند تقاضای محلی را بالا ببرند و هم‌زمان ریسک استفاده را افزایش دهند.",
      flowSignal: "در بلندمدت باید دید mint/burn به رشد واقعی بازار کمک می‌کند یا صرفاً جایگزینی شبکه‌ای است.",
      sentimentSignal: "اعتماد عمومی به USDT آهسته تغییر می‌کند، اما شوک‌های خبری می‌توانند پریمیوم و رفتار کاربران را سریع جابه‌جا کنند.",
      correlationSignal: "رابطه USDT با بازار کریپتو غیرخطی است؛ افزایش آن گاهی سوخت رشد و گاهی پناهگاه موقت است.",
      keyRisks: ["ریسک صادرکننده", "تحریم و مسدودسازی", "وابستگی نگه‌داری دارایی", "پریمیوم ساختاری در بازار محلی"],
      recommendedMonitoring: ["Reserve attestations", "Chain distribution", "Regulatory actions", "Exchange dependency", "Long-term stablecoin market share"],
    },
  },
  DXY: {
    short: {
      summary:
        "DXY در کوتاه‌مدت یکی از driverهای اصلی فشار روی کریپتو است. وقتی دلار تقویت می‌شود، سرمایه جهانی معمولاً از دارایی‌های پرریسک فاصله می‌گیرد و BTC، ETH و SOL برای جذب نقدینگی سخت‌تر رقابت می‌کنند. افت DXY می‌تواند اولین نشانه سبک‌تر شدن فشار ماکرو باشد.",
      bullishFactors: ["داده‌های قوی آمریکا", "لحن سخت‌گیرانه فدرال رزرو", "تنش ژئوپلیتیک", "ضعف ارزهای رقیب"],
      bearishFactors: ["داده تورمی نرم‌تر", "افت بازده اوراق", "بهبود risk appetite جهانی", "کاهش safe-haven demand"],
      liquiditySignal: "دلار قوی نقدینگی جهانی را برای کریپتو گران‌تر می‌کند.",
      macroSignal: "DXY به اختلاف نرخ بهره، داده‌های آمریکا و تنش جهانی حساس است.",
      flowSignal: "برای DXY جریان آن‌چین مستقیم وجود ندارد؛ اثر آن از مسیر نقدینگی و ارزش‌گذاری منتقل می‌شود.",
      sentimentSignal: "وقتی بازار از دلار به‌عنوان پناهگاه استفاده می‌کند، narrative کریپتو دفاعی‌تر می‌شود.",
      correlationSignal: "رابطه DXY با BTC معمولاً معکوس است و در روزهای تنش قوی‌تر می‌شود.",
      keyRisks: ["شوک CPI", "لحن hawkish فدرال رزرو", "تنش ژئوپلیتیک", "ضعف یورو/ین"],
      recommendedMonitoring: ["روند DXY", "بازده واقعی آمریکا", "EUR/USD", "سخنرانی‌های اعضای FOMC", "پهنای بازار دارایی‌های پرریسک"],
    },
    medium: {
      summary:
        "در یک ماه آینده، مسیر DXY تعیین می‌کند فشار ماکرو روی کریپتو موقت است یا ساختاری‌تر. دلار اگر بالای محدوده‌های کلیدی بماند، هر رشد کریپتو بیشتر به جریان‌های خاص مثل ETF نیاز پیدا می‌کند. افت تدریجی DXY می‌تواند زمینه چرخش به ریسک‌پذیری را فراهم کند.",
      bullishFactors: ["ادامه برتری رشد آمریکا", "انتظارات نرخ بالاتر", "تقاضای پناهگاه امن", "ضعف اقتصادهای رقیب"],
      bearishFactors: ["کاهش انتظارات نرخ", "بهبود رشد جهانی", "تقویت یورو/ین", "کاهش تنش انرژی"],
      liquiditySignal: "DXY پایین‌تر معمولاً فضای نقدینگی دلاری را برای دارایی‌های پرریسک بهتر می‌کند.",
      macroSignal: "داده‌های تورم و اشتغال آمریکا محرک اصلی یک‌ماهه‌اند.",
      flowSignal: "اثر DXY روی جریان سرمایه کریپتو غیرمستقیم اما قدرتمند است؛ ETFها می‌توانند بخشی از آن را تعدیل کنند.",
      sentimentSignal: "افت دلار معمولاً زبان بازار را از دفاعی به فرصت‌محور تغییر می‌دهد.",
      correlationSignal: "اگر همبستگی منفی BTC/DXY ضعیف شود، باید دنبال محرک‌های مستقل مثل ETF بود.",
      keyRisks: ["بازگشت تورم خدمات", "جهش نفت", "ضعف اقتصاد اروپا", "تنش در بازارهای نوظهور"],
      recommendedMonitoring: ["CPI/PCE", "گزارش اشتغال آمریکا", "روند ۳۰ روزه DXY", "همبستگی BTC/DXY", "PMI جهانی"],
    },
    long: {
      summary:
        "در شش ماه آینده، DXY نقش قطب‌نمای نقدینگی جهانی را دارد. دلار پایدار و قوی می‌تواند ارزش‌گذاری دارایی‌های پرریسک را محدود کند؛ اما اگر چرخه نرخ به سمت کاهش واقعی برود، بخشی از فشار دلار از بازار کریپتو برداشته می‌شود.",
      bullishFactors: ["تداوم نرخ واقعی بالا", "برتری رشد آمریکا", "ریسک ژئوپلیتیک", "کمبود نقدینگی دلاری"],
      bearishFactors: ["شروع چرخه کاهش نرخ", "بهبود رشد جهانی", "کاهش تنش‌ها", "افت بازده واقعی"],
      liquiditySignal: "کاهش پایدار DXY یکی از پیش‌شرط‌های گسترش نقدینگی برای کریپتو است.",
      macroSignal: "چرخه سیاست پولی و کسری مالی آمریکا مسیر بلندمدت دلار را تعیین می‌کند.",
      flowSignal: "دلار ضعیف‌تر می‌تواند تخصیص جهانی به کریپتو و Nasdaq را آسان‌تر کند.",
      sentimentSignal: "ضعف دلار روایت پوشش ریسک و کاهش ارزش پولی را برای BTC تقویت می‌کند.",
      correlationSignal: "در چرخه‌های گسترش نقدینگی، BTC معمولاً از فشار معکوس DXY آزادتر می‌شود.",
      keyRisks: ["تداوم نرخ‌های بالا برای مدت طولانی", "بحران دلار جهانی", "جهش انرژی", "واگرایی سیاست پولی"],
      recommendedMonitoring: ["روند بازده واقعی", "قیمت‌گذاری کاهش نرخ توسط فدرال رزرو", "نقدینگی دلاری", "انتشار بدهی مالی دولت", "همبستگی بین دارایی‌ها"],
    },
  },
  Gold: {
    short: {
      summary:
        "طلا در کوتاه‌مدت نقش سنجش ترس ژئوپلیتیک و نرخ واقعی را دارد. اگر طلا هم‌زمان با BTC قوی شود، بازار ممکن است روایت hedge را جدی‌تر بگیرد. اگر طلا قوی بماند اما BTC عقب بماند، پیام آن بیشتر risk-off است تا ورود سرمایه به کریپتو.",
      bullishFactors: ["تنش ژئوپلیتیک", "افت نرخ واقعی", "خرید بانک‌های مرکزی", "ضعف دلار"],
      bearishFactors: ["دلار قوی", "افزایش بازده واقعی", "کاهش تنش", "چرخش به سهام رشد"],
      liquiditySignal: "طلا از نقدینگی امن تغذیه می‌کند؛ اثر آن روی کریپتو به نوع ترس بازار بستگی دارد.",
      macroSignal: "طلا به بازده واقعی و DXY حساس است و برای فهم روایت بیت‌کوین مفید است.",
      flowSignal: "برای کریپتو، جریان طلا بیشتر نقش مقایسه‌ای دارد تا جریان مستقیم.",
      sentimentSignal: "تقویت طلا نشان می‌دهد بازار دنبال پوشش ریسک است؛ این همیشه به نفع BTC نیست.",
      correlationSignal: "افزایش همبستگی BTC/Gold می‌تواند نشانه چرخش روایت BTC به سمت پوشش ریسک باشد.",
      keyRisks: ["جهش بازده واقعی", "کاهش تنش سیاسی", "تقویت شدید دلار", "فروش پوشش‌های دفاعی"],
      recommendedMonitoring: ["قیمت نقدی طلا", "بازده واقعی", "DXY", "تیترهای ژئوپلیتیک", "همبستگی BTC/Gold"],
    },
    medium: {
      summary:
        "در یک ماه آینده، طلا برای تشخیص کیفیت ترس بازار مهم است. اگر طلا با افت بازده و کاهش دلار رشد کند، محیط برای دارایی‌های غیرسودده و حتی BTC بهتر می‌شود. اگر طلا فقط از تنش سیاسی رشد کند، اثر آن روی کریپتو می‌تواند دوگانه باشد.",
      bullishFactors: ["افت بازده واقعی", "خرید رسمی", "تنش انرژی", "کاهش اعتماد به ارزها"],
      bearishFactors: ["بازده بالاتر", "تقویت دلار", "کاهش ریسک‌های سیاسی", "رالی سهام فناوری"],
      liquiditySignal: "طلا نقدینگی دفاعی را نشان می‌دهد؛ برای کریپتو باید دید این دفاع به روایت پوشش ریسک منتقل می‌شود یا نه.",
      macroSignal: "مسیر بازده واقعی محرک اصلی یک‌ماهه است.",
      flowSignal: "ETFهای طلا و خرید بانک‌های مرکزی برای جهت میان‌مدت مهم‌اند.",
      sentimentSignal: "اگر سرمایه‌گذار از ریسک سیستماتیک بترسد، طلا مقدم‌تر از کریپتو حرکت می‌کند.",
      correlationSignal: "اگر BTC هم‌زمان با طلا رشد کند و از Nasdaq جدا شود، کیفیت روایت تغییر می‌کند.",
      keyRisks: ["بازده واقعی بالاتر", "فروش ETFهای طلا", "کاهش تقاضای پناهگاه امن", "بازگشت ریسک‌پذیری در سهام"],
      recommendedMonitoring: ["جریان ETFهای طلا", "خرید بانک‌های مرکزی", "MOVE/VIX", "فاصله رفتاری BTC/Gold", "روند DXY"],
    },
    long: {
      summary:
        "در افق شش‌ماهه، طلا محرک مهمی برای سنجش نگرانی نسبت به پول، تورم و ژئوپلیتیک است. اگر طلا به‌خاطر افت بازده واقعی رشد کند، فضا برای BTC هم می‌تواند بهتر شود. اگر رشد طلا ناشی از ترس شدید باشد، کریپتو ممکن است هم‌زمان تحت فشار نقدشوندگی بماند.",
      bullishFactors: ["کاهش نرخ واقعی", "تنش ژئوپلیتیک طولانی", "خرید بانک‌های مرکزی", "ریسک بدهی و ارز"],
      bearishFactors: ["دلار قوی پایدار", "نرخ واقعی بالا", "کاهش تورم", "بازگشت سرمایه به سهام"],
      liquiditySignal: "طلا مسیر نقدینگی دفاعی را نشان می‌دهد؛ هم‌راستایی آن با BTC نشانه مهمی برای روایت بازار است.",
      macroSignal: "طلا به سیاست پولی، تورم و اعتماد به دلار وابسته است.",
      flowSignal: "جریان‌های ETF طلا و خرید رسمی تصویر بلندمدت را روشن می‌کنند.",
      sentimentSignal: "افزایش توجه به طلا می‌تواند روایت hedge را برای BTC هم تقویت کند، ولی فقط اگر ریسک نقدشوندگی پایین بماند.",
      correlationSignal: "رشد پایدار همبستگی BTC/Gold یکی از نشانه‌های بالغ شدن روایت پوشش ریسک کلان است.",
      keyRisks: ["بازگشت نرخ واقعی بالا", "کاهش ریسک ژئوپلیتیک", "ضعف تقاضای رسمی", "تقویت ساختاری دلار"],
      recommendedMonitoring: ["بازده واقعی", "تقاضای طلای بانک‌های مرکزی", "جریان ETFهای طلا", "همبستگی ۹۰ روزه BTC/Gold", "انتظارات تورمی"],
    },
  },
  Nasdaq: {
    short: {
      summary:
        "Nasdaq در کوتاه‌مدت محرک اشتهای ریسک برای ETH و SOL و تا حدی BTC است. اگر سهام فناوری زیر فشار نرخ تنزیل باشد، بازار کریپتو برای رشد فراگیر به کمک بیشتری از ETF یا نقدینگی داخلی نیاز دارد.",
      bullishFactors: ["افت US10Y", "گزارش‌های قوی فناوری", "بهبود پهنای بازار", "کاهش VIX"],
      bearishFactors: ["افزایش نرخ تنزیل", "فشار روی شرکت‌های بزرگ فناوری", "ضعف سودآوری شرکت‌ها", "چرخش به دارایی‌های دفاعی"],
      liquiditySignal: "Nasdaq قوی نشان می‌دهد سرمایه هنوز حاضر به پذیرش ریسک دارایی‌های بلندمدت است.",
      macroSignal: "نرخ‌های بلندمدت و انتظارات رشد بیشترین اثر را دارند.",
      flowSignal: "اثر آن روی crypto از مسیر risk appetite و allocation می‌آید.",
      sentimentSignal: "رالی فناوری معمولاً narrative آلت‌کوین‌ها را گرم‌تر می‌کند.",
      correlationSignal: "ETH و SOL به Nasdaq حساس‌تر از BTC هستند.",
      keyRisks: ["US10Y بالاتر", "افت پهنای بازار", "فشار سودآوری شرکت‌ها", "افزایش VIX"],
      recommendedMonitoring: ["پهنای بازار Nasdaq", "US10Y", "VIX", "سودآوری شرکت‌های بزرگ فناوری", "همبستگی ETH/Nasdaq"],
    },
    medium: {
      summary:
        "در یک ماه آینده، Nasdaq نشان می‌دهد بازار حاضر است ریسک دارایی‌های بلندمدت را بپذیرد یا نه. اگر سهام فناوری پایدار بماند، ETH و SOL معمولاً فضای بهتری برای چرخش سرمایه دارند. اگر Nasdaq ضعیف شود، BTC تنها در صورت حمایت ETF می‌تواند جدا حرکت کند.",
      bullishFactors: ["رشد سودآوری شرکت‌ها", "افت نرخ‌ها", "روایت سرمایه‌گذاری هوش مصنوعی", "ورود سرمایه به سهام رشد"],
      bearishFactors: ["ارزش‌گذاری فشرده", "نرخ‌های بالا", "فروش در mega-capها", "افزایش volatility"],
      liquiditySignal: "بهبود Nasdaq با گسترش نقدینگی هم‌خوان است و می‌تواند ریسک‌پذیری کریپتو را بالا ببرد.",
      macroSignal: "داده‌های تورم و نرخ اوراق جهت اصلی را تعیین می‌کنند.",
      flowSignal: "جریان ETF سهام فناوری و پهنای بازار برای سنجش عمق حرکت مهم است.",
      sentimentSignal: "وقتی Nasdaq سالم رشد می‌کند، social momentum آلت‌کوین‌ها هم بهتر می‌شود.",
      correlationSignal: "اگر BTC از Nasdaq جدا شود اما ETH/SOL همراه بمانند، بازار بین روایت پوشش ریسک و روایت رشد تفکیک می‌کند.",
      keyRisks: ["فشردگی ارزش‌گذاری", "تورم چسبنده", "ضعف پهنای بازار", "شوک سودآوری شرکت‌ها"],
      recommendedMonitoring: ["مومنتوم ۳۰ روزه Nasdaq", "پهنای بازار", "بازده واقعی", "فاصله بتای کریپتو", "VIX"],
    },
    long: {
      summary:
        "در افق شش‌ماهه، Nasdaq محرک اصلی چرخه ریسک‌پذیری برای ETH و SOL است. محیطی که در آن سهام فناوری با نرخ‌های پایین‌تر و سودآوری سالم رشد کند، معمولاً به چرخش سرمایه در کریپتو کمک می‌کند. اما اگر رشد Nasdaq فقط در چند سهم متمرکز بماند، اثر آن بر کریپتو محدودتر می‌شود.",
      bullishFactors: ["کاهش نرخ واقعی", "رشد درآمد فناوری", "گسترش پهنای بازار", "تداوم چرخه سرمایه‌گذاری هوش مصنوعی"],
      bearishFactors: ["رکود سودآوری شرکت‌ها", "نرخ بالا", "فروش متمرکز در شرکت‌های بزرگ فناوری", "کاهش نقدینگی"],
      liquiditySignal: "Nasdaq سالم نشانه آمادگی سرمایه برای ریسک دارایی‌های بلندمدت است.",
      macroSignal: "چرخه نرخ و رشد اقتصادی آمریکا مسیر بلندمدت را می‌سازد.",
      flowSignal: "جریان سرمایه به سهام رشد و بتای فناوری برای ETH/SOL اهمیت بیشتری دارد.",
      sentimentSignal: "روایت هوش مصنوعی و سهام رشد می‌تواند ریسک‌پذیری کاربران خرد را به آلت‌کوین‌ها منتقل کند.",
      correlationSignal: "پایداری همبستگی ETH/SOL با Nasdaq نشان می‌دهد کریپتو هنوز بخشی از سبد ریسک رشد است.",
      keyRisks: ["تمرکز بیش از حد بازار", "رشد بدون پهنای بازار", "افزایش بازده واقعی", "افت سودآوری شرکت‌ها"],
      recommendedMonitoring: ["Nasdaq 90D trend", "Earnings revisions", "Breadth (پهنای بازار)", "Real yields", "ETH/SOL beta to Nasdaq"],
    },
  },
  US10Y: {
    short: {
      summary:
        "US10Y در کوتاه‌مدت مهم‌ترین کانال فشار نرخ روی کریپتو است. وقتی بازده ۱۰ ساله بالا می‌رود، ارزش فعلی دارایی‌های پرریسک و بدون جریان نقدی مستقیم فشرده می‌شود. BTC می‌تواند با ETF مقاومت کند، اما ETH و SOL معمولاً حساس‌ترند.",
      bullishFactors: ["داده تورمی بالا", "عرضه سنگین اوراق", "لحن hawkish فدرال رزرو", "کاهش تقاضای اوراق"],
      bearishFactors: ["داده‌های نرم‌تر", "تقاضای پناهگاه امن برای اوراق", "کاهش انتظارات رشد", "افت نفت"],
      liquiditySignal: "بازده بالاتر هزینه سرمایه را بالا می‌برد و نقدینگی speculative را کم می‌کند.",
      macroSignal: "US10Y هم پیام تورم دارد و هم پیام رشد؛ تفسیر بازار تعیین‌کننده است.",
      flowSignal: "اثر مستقیم آن از مسیر تخصیص سرمایه و ارزش‌گذاری وارد کریپتو می‌شود.",
      sentimentSignal: "جهش US10Y معمولاً لحن بازار را محتاط می‌کند.",
      correlationSignal: "BTC و ETH در روزهای جهش نرخ معمولاً همبستگی منفی‌تری با US10Y می‌گیرند.",
      keyRisks: ["مزایده ضعیف اوراق", "CPI داغ", "افزایش صرف ریسک سررسید", "لحن سخت فدرال رزرو"],
      recommendedMonitoring: ["US10Y", "بازده واقعی", "صرف ریسک سررسید", "مزایده‌های خزانه‌داری", "همبستگی BTC/US10Y"],
    },
    medium: {
      summary:
        "در یک ماه آینده، پایداری یا شکست سطح‌های بالای US10Y تعیین می‌کند فشار روی ارزش‌گذاری کریپتو ادامه دارد یا نه. اگر بازده بالا بماند، رشدهای کریپتو برای دوام به پشتوانه‌هایی مثل ورود سرمایه به ETF، نقدینگی استیبل‌کوین و حجم اسپات نیاز دارند. افت بازده می‌تواند سریعاً اشتهای ریسک را بهتر کند.",
      bullishFactors: ["تورم sticky", "کسری مالی و عرضه اوراق", "انتظارات رشد مقاوم", "کاهش تقاضای خارجی"],
      bearishFactors: ["ضعف داده‌های رشد", "کاهش تورم", "افزایش تقاضای امن", "pricing کاهش نرخ"],
      liquiditySignal: "US10Y پایین‌تر فضای تنفس برای دارایی‌های بلندمدت و کریپتو ایجاد می‌کند.",
      macroSignal: "ترکیب CPI، payrolls و مزایده اوراق جهت یک‌ماهه را می‌سازد.",
      flowSignal: "اگر بازده بالا و ETF inflow هم‌زمان مثبت باشند، BTC نسبت به آلت‌کوین‌ها مقاوم‌تر می‌شود.",
      sentimentSignal: "کاهش بازده معمولاً narrative pivot را فعال می‌کند.",
      correlationSignal: "افزایش حساسیت ETH/SOL به US10Y نشانه شکنندگی ریسک‌پذیری است.",
      keyRisks: ["افزایش صرف ریسک سررسید", "داده تورمی غافلگیرکننده", "ضعف تقاضای اوراق", "افت نقدینگی بازار اوراق"],
      recommendedMonitoring: ["Auction tails", "MOVE Index", "Inflation surprises", "Fed speakers", "Crypto beta reaction"],
    },
    long: {
      summary:
        "در افق شش‌ماهه، US10Y مسیر اصلی قیمت‌گذاری رژیم نقدینگی است. بازده واقعی بالا می‌تواند چرخه رشد کریپتو را کند کند؛ اما چرخش تدریجی به سمت نرخ‌های پایین‌تر، مخصوصاً اگر با رشد اقتصادی سالم همراه باشد، فضای مطلوب‌تری برای BTC و سپس ETH/SOL می‌سازد.",
      bullishFactors: ["بدهی و عرضه اوراق", "تورم پایدار", "صرف ریسک سررسید بالا", "کاهش اعتماد به مسیر کسری"],
      bearishFactors: ["کاهش تورم", "شروع کاهش نرخ", "تقاضای نهادی برای اوراق بلندمدت", "کاهش رشد اقتصادی"],
      liquiditySignal: "افت پایدار US10Y یکی از قوی‌ترین محرک‌های گسترش نقدینگی برای کریپتو است.",
      macroSignal: "بازار باید بین کاهش نرخ سالم و کاهش نرخ رکودی تفکیک کند.",
      flowSignal: "در افت سالم بازده، flowهای ETF و stablecoin معمولاً اثرگذاری بیشتری پیدا می‌کنند.",
      sentimentSignal: "انتظار کاهش نرخ می‌تواند روایت ریسک‌پذیری را فعال کند؛ رکود شدید اما آن را خنثی می‌کند.",
      correlationSignal: "کاهش همبستگی منفی کریپتو/US10Y نشانه کم‌شدن فشار نرخ است.",
      keyRisks: ["تداوم نرخ‌های بالا برای مدت طولانی", "رکود همراه با فروش ریسک", "بی‌نظمی بازار اوراق", "شوک مالی"],
      recommendedMonitoring: ["US10Y 90D trend", "Real yields", "Fed path", "Credit spreads", "Liquidity score"],
    },
  },
};

const assetSourceQuality: Record<IntelligenceAssetSymbol, DataSourceStatus> = {
  BTC: "partial_live",
  ETH: "partial_live",
  SOL: "partial_live",
  USDT: "partial_live",
  DXY: "delayed",
  Gold: "delayed",
  Nasdaq: "delayed",
  US10Y: "delayed",
};

const dataQualityLabelsFa: Record<DataSourceStatus, string> = {
  live: "زنده",
  partial_live: "نیمه‌زنده",
  delayed: "با تأخیر",
  estimated: "برآوردی با توضیح",
  unavailable: "ناموجود",
};

function buildQuantitativeScores(asset: IntelligenceAssetSymbol, horizon: TimeHorizon): SignalScores {
  const liquidity = getLiquidityReport();
  const regime = calculateMarketRegime();
  const regimeLabel = regime.regimeLabel ?? "Neutral / Transition";
  const horizonAdjustment = horizon === "short" ? 0 : horizon === "medium" ? -2 : -5;
  const assetBeta: Record<IntelligenceAssetSymbol, number> = {
    BTC: 0,
    ETH: 4,
    SOL: 9,
    USDT: -10,
    DXY: 12,
    Gold: -4,
    Nasdaq: 5,
    US10Y: 14,
  };
  const beta = assetBeta[asset] + horizonAdjustment;

  return {
    marketRiskScore: Math.max(0, Math.min(100, regime.marketRiskScore + beta)),
    liquidityScore: Math.max(0, Math.min(100, liquidity.liquidityScore + (asset === "BTC" ? 4 : asset === "USDT" ? 7 : asset === "SOL" ? -3 : 0))),
    macroStressScore: Math.max(0, Math.min(100, regime.macroStressScore + (asset === "US10Y" || asset === "DXY" ? 8 : asset === "Gold" ? 2 : 0))),
    narrativeStrength: Math.max(0, Math.min(100, regime.narrativeStrength + (asset === "SOL" ? 8 : asset === "BTC" ? 4 : asset === "ETH" ? 1 : 0))),
    volatilityRisk: Math.max(0, Math.min(100, regime.volatilityRisk + (asset === "SOL" ? 10 : asset === "ETH" ? 5 : asset === "USDT" ? -12 : 0))),
  };
}

function confidenceFromSignals(asset: IntelligenceAssetSymbol, horizon: TimeHorizon, sources: SourceSignal[]) {
  const base = confidenceByAssetHorizon[asset][horizon];
  const sourceCoverage = Math.min(10, sources.length);
  const freshnessPenalty = sources.filter((source) => (source.freshnessMinutes ?? 0) > 180).length * 2;
  const estimatedPenalty = sources.filter((source) => source.status === "estimated").length * 2;
  const partialBonus = sources.filter((source) => source.status === "partial_live" || source.status === "live").length;

  return Math.max(44, Math.min(92, Math.round(base + sourceCoverage * 0.7 + partialBonus - freshnessPenalty - estimatedPenalty)));
}

function correlationNarrative(asset: IntelligenceAssetSymbol) {
  const report = getDynamicCorrelationReport();
  const preferredPair =
    asset === "ETH"
      ? "ETH ↔ Tech Beta"
      : asset === "SOL"
        ? "SOL ↔ Retail Risk Appetite"
        : asset === "Gold"
          ? "BTC ↔ Gold"
          : asset === "DXY"
            ? "BTC ↔ DXY"
            : asset === "US10Y"
              ? "BTC ↔ US10Y"
              : "BTC ↔ Nasdaq";
  const signal = report.signals.find((item) => item.assetPair === preferredPair) ?? report.signals[0];

  return `${signal.assetPair}: ${signal.interpretation}`;
}

function buildForecastStructure(asset: IntelligenceAssetSymbol, horizon: TimeHorizon, narrative: NarrativePack, scores: SignalScores) {
  const liquidity = getLiquidityReport();
  const regime = calculateMarketRegime();
  const regimeLabel = regime.regimeLabel ?? "Neutral / Transition";
  const liquidityStateFa: Record<string, string> = {
    expansion: "گسترش نقدینگی",
    contraction: "انقباض نقدینگی",
    overheating: "داغ شدن اهرم معاملاتی",
    fragile: "شکننده",
    neutral: "خنثی",
  };
  const regimeFa: Record<string, string> = {
    "Risk-On Expansion": "گسترش ریسک‌پذیری",
    "Weak Risk-On": "ریسک‌پذیری ضعیف",
    "Fragile Risk-On": "ریسک‌پذیری شکننده",
    "Liquidity-Constrained Risk-On": "ریسک‌پذیری محدودشده با نقدینگی",
    "Risk-Off Defensive": "دفاعی / ریسک‌گریز",
    "Liquidity Squeeze": "فشار نقدینگی",
    "Dollar Strength Pressure": "فشار تقویت دلار",
    "Rates Shock": "شوک نرخ بهره",
    "Crypto-Specific Bullish": "حمایت اختصاصی کریپتو",
    "Crypto-Specific Stress": "تنش اختصاصی کریپتو",
    "Geopolitical Shock": "شوک ژئوپلیتیک",
    "Neutral / Transition": "خنثی / در حال گذار",
    "High Volatility Unclear Regime": "نوسان بالا با رژیم نامشخص",
  };
  const assetFocus: Record<IntelligenceAssetSymbol, string> = {
    BTC: "برای BTC، کانال اصلی انتقال ریسک از جریان ETF، شاخص دلار، بازده اوراق ۱۰ ساله و ذخایر صرافی می‌آید؛ بنابراین واکنش قیمت بدون تأیید جریان نهادی قابل اتکا نیست.",
    ETH: "برای ETH، نرخ تنزیل و Nasdaq مهم‌اند، اما کیفیت فعالیت لایه دوم، استیکینگ و ارزش قفل‌شده DeFi تعیین می‌کند که روایت شبکه فقط خبری بماند یا به تقاضای واقعی تبدیل شود.",
    SOL: "برای SOL، حجم صرافی غیرمتمرکز، رفتار Jupiter/Tensor، مومنتوم اجتماعی و نرخ فاندینگ باید کنار هم دیده شوند؛ رشد قیمت بدون فعالیت واقعی شبکه ریسک پاکسازی اهرم را بالا می‌برد.",
    USDT: "برای USDT، موضوع اصلی بازدهی نیست؛ تمرکز تحلیل روی نگه‌داری دارایی، ریسک مسدودسازی، توزیع شبکه‌ای، پریمیوم محلی و نقش آن در نقدینگی بازار است.",
    DXY: "شاخص دلار یک محرک کلان است نه دارایی کریپتویی؛ تقویت آن معمولاً هزینه نقدینگی دلاری را بالا می‌برد و فشار ریسک‌گریزی را منتقل می‌کند.",
    Gold: "طلا سنجه کیفیت ترس بازار است؛ اگر BTC با Gold هم‌سو و از Nasdaq جدا شود، روایت پوشش ریسک کلان قوی‌تر می‌شود.",
    Nasdaq: "Nasdaq نماینده بتای فناوری و اشتهای ریسک دارایی‌های رشد است؛ اثر آن روی ETH و SOL معمولاً قوی‌تر از BTC است.",
    US10Y: "بازده اوراق ۱۰ ساله آمریکا کانال نرخ تنزیل است؛ بالا ماندن آن رشدهای کریپتو را به جریان ETF و استیبل‌کوین وابسته‌تر می‌کند.",
  };

  return {
    currentMarketStatus: `${assetFocus[asset]} امتیاز ریسک بازار ${scores.marketRiskScore}/100، فشار ماکرو ${scores.macroStressScore}/100 و ریسک نوسان ${scores.volatilityRisk}/100 است.`,
    shortTermScenario:
      horizon === "short"
        ? narrative.summary
        : `در ۷ روز آینده، بازار بیشتر به مسیر شاخص دلار، بازده اوراق ۱۰ ساله، جریان ETF و نرخ فاندینگ واکنش نشان می‌دهد. ${narrative.liquiditySignal}`,
    mediumTermScenario:
      horizon === "medium"
        ? narrative.summary
        : `در افق یک ماه، پایداری نقدینگی مهم‌تر از یک خبر منفرد است. وضعیت فعلی موتور نقدینگی «${liquidityStateFa[liquidity.liquidityState] ?? liquidity.liquidityState}» با اطمینان ${liquidity.confidence}٪ است و رژیم کلی روی «${regimeFa[regimeLabel] ?? regimeLabel}» قرار دارد.`,
    mainRisks: narrative.keyRisks,
    monitoringData: narrative.recommendedMonitoring,
    analysisConfidenceText: `سطح اطمینان از هم‌خوانی ${scores.narrativeStrength}/100 روایت‌ها، کیفیت منابع «${dataQualityLabelsFa[assetSourceQuality[asset]]}» و وضعیت نقدینگی «${dataQualityLabelsFa[liquidity.dataQuality]}» ساخته شده است؛ در صورت تضاد داده‌های نرخ، ETF و اهرم معاملاتی، امتیاز اطمینان کاهش می‌یابد.`,
  };
}

export function buildSourceSignals(asset: IntelligenceAssetSymbol, horizon: TimeHorizon): SourceSignal[] {
  return getSourcesForAsset(asset, horizon)
    .sort((left, right) => right.reliabilityScore - left.reliabilityScore)
    .slice(0, 8)
    .map((source, index) => ({
      sourceId: source.id,
      sourceName: source.name,
      category: source.category,
      status: source.currentStatus,
      reliabilityScore: source.reliabilityScore,
      freshnessMinutes: 24 + index * 17 + (source.currentStatus === "delayed" ? 120 : source.currentStatus === "estimated" ? 90 : 0),
      dataQuality: source.currentStatus,
      lastUpdatedAt: new Date(Date.parse(horizonLastUpdated[horizon]) - index * 17 * 60_000).toISOString(),
      confidence: Math.min(94, Math.round(source.reliabilityScore * 0.72 + 18 - index)),
      signalFa: `${source.name} برای ${asset} در افق ${horizonLabelsFa[horizon]} اثرگذار است: ${source.notes}`,
    }));
}

export function generateAssetIntelligence(
  asset: IntelligenceAssetSymbol,
  horizon: TimeHorizon,
  sourceSignals: SourceSignal[] = buildSourceSignals(asset, horizon),
): HorizonIntelligence {
  const narrative = narratives[asset][horizon];
  const scores = buildQuantitativeScores(asset, horizon);
  const confidence = confidenceFromSignals(asset, horizon, sourceSignals);

  return {
    asset,
    horizon,
    horizonLabelFa: horizonLabelsFa[horizon],
    regime: regimeByAssetHorizon[asset][horizon],
    confidence,
    dataQuality: assetSourceQuality[asset],
    forecast: buildForecastStructure(asset, horizon, narrative, scores),
    quantitativeScores: scores,
    usedSources: sourceSignals,
    lastUpdatedAt: horizonLastUpdated[horizon],
    ...narrative,
    correlationSignal: correlationNarrative(asset),
  };
}

export function generateAssetHorizons(asset: IntelligenceAssetSymbol): Record<TimeHorizon, HorizonIntelligence> {
  return {
    short: generateAssetIntelligence(asset, "short"),
    medium: generateAssetIntelligence(asset, "medium"),
    long: generateAssetIntelligence(asset, "long"),
  };
}

export const assetBaseProfiles: Record<IntelligenceAssetSymbol, Omit<AssetIntelligence, "horizons" | "sourceMapping">> = {
  BTC: {
    symbol: "BTC",
    titleFa: "بیت‌کوین",
    roleFa: "دارایی پایه کریپتو و سنجه اصلی جریان نهادی",
    marketStructure: "BTC بین فشار نرخ‌های بالا و حمایت جریان ETF قرار دارد؛ ساختار فعلی بیشتر سناریومحور است تا روند یک‌طرفه.",
    macroPressure: 63,
    liquidityScore: 61,
    sentimentScore: 58,
    whaleFlow: "جابه‌جایی نهنگ‌ها هنوز نشانه توزیع سنگین نمی‌دهد، اما هر افزایش ورودی به صرافی در کنار نرخ فاندینگ بالا مهم می‌شود.",
    etfFlow: "ETFهای اسپات نقش اصلی در جذب تقاضای نهادی دارند و باید همراه با GBTC outflow خوانده شوند.",
    onchainSummary: "ذخایر صرافی و رفتار هولدرهای بلندمدت برای سنجش فشار عرضه کلیدی‌اند.",
    aiInterpretation: narratives.BTC.short.summary,
    keyRisks: narratives.BTC.short.keyRisks,
    regimeSensitivity: ["ETF Accumulation", "Macro Uncertainty", "Liquidity Expansion"],
    metrics: [
      { label: "Macro (کلان)", value: "63/100", tone: "warn" },
      { label: "جریان ETF", value: "مثبت اما شکننده", tone: "good" },
      { label: "روایت BTC/Gold", value: "در حال تقویت", tone: "neutral" },
      { label: "ذخایر صرافی", value: "کاهشی", tone: "good" },
    ],
  },
  ETH: {
    symbol: "ETH",
    titleFa: "اتریوم",
    roleFa: "دارایی رشد اکوسیستم قرارداد هوشمند",
    marketStructure: "ETH نسبت به BTC به tech beta، staking و اقتصاد لایه دوم حساس‌تر است.",
    macroPressure: 67,
    liquidityScore: 55,
    sentimentScore: 52,
    whaleFlow: "جریان نهنگ‌ها پراکنده است و هنوز انباشت نهادی پرقدرت مثل BTC دیده نمی‌شود.",
    etfFlow: "اثر ETF برای ETH فعلاً بیشتر روایی است؛ جریان اسپات آن هنوز به قدرت BTC نیست.",
    onchainSummary: "L2 activity، gas fee، staking و TVL باید با ETH/BTC ratio تطبیق داده شوند.",
    aiInterpretation: narratives.ETH.short.summary,
    keyRisks: narratives.ETH.short.keyRisks,
    regimeSensitivity: ["Risk-On", "Macro Uncertainty", "Liquidity Expansion"],
    metrics: [
      { label: "ETH/BTC", value: "حساس", tone: "warn" },
      { label: "L2 Activity (فعالیت لایه دوم)", value: "بالا", tone: "good" },
      { label: "Staking Risk (ریسک استیکینگ)", value: "قابل رصد", tone: "neutral" },
      { label: "بتای فناوری", value: "زیاد", tone: "warn" },
    ],
  },
  SOL: {
    symbol: "SOL",
    titleFa: "سولانا",
    roleFa: "نماینده اشتهای ریسک retail و اکوسیستم مصرفی سریع",
    marketStructure: "SOL می‌تواند سریع‌تر از بازار حرکت کند، اما همین سرعت ریسک leverage و برگشت‌های تند را بالا می‌برد.",
    macroPressure: 72,
    liquidityScore: 54,
    sentimentScore: 71,
    whaleFlow: "رفتار نهنگ‌ها به نقدینگی برنامه‌ها، آزادسازی توکن‌ها و حجم DEX وابسته است.",
    etfFlow: "کانال ETF مستقیم ندارد و از rotation سرمایه در کریپتو اثر می‌گیرد.",
    onchainSummary: "Jupiter، Tensor، Solscan و Helius برای سنجش فعالیت واقعی شبکه ضروری‌اند.",
    aiInterpretation: narratives.SOL.short.summary,
    keyRisks: narratives.SOL.short.keyRisks,
    regimeSensitivity: ["Risk-On", "Euphoria", "Leverage Overheating"],
    metrics: [
      { label: "مومنتوم کاربران خرد", value: "بالا", tone: "warn" },
      { label: "DEX Volume (حجم صرافی غیرمتمرکز)", value: "کلیدی", tone: "good" },
      { label: "پایداری شبکه", value: "باید رصد شود", tone: "neutral" },
      { label: "نرخ فاندینگ", value: "حساس", tone: "warn" },
    ],
  },
  USDT: {
    symbol: "USDT",
    titleFa: "مرکز ریسک USDT",
    roleFa: "زیرساخت نقدینگی و ریسک عملیاتی بازار کریپتو",
    marketStructure: "USDT شاخص نقدینگی و ریسک دسترسی است؛ تحلیل آن معامله‌محور نیست و حول نگه‌داری دارایی، شبکه و پریمیوم می‌چرخد.",
    macroPressure: 49,
    liquidityScore: 66,
    sentimentScore: 44,
    whaleFlow: "انتقال‌های بزرگ USDT فقط وقتی مهم‌اند که مقصد، شبکه و صرافی دریافت‌کننده مشخص باشد.",
    etfFlow: "رابطه غیرمستقیم دارد؛ ETF بیشتر سمت onshore و USDT بیشتر سمت offshore نقدینگی را نشان می‌دهد.",
    onchainSummary: "TRON، ERC20 و Solana هر کدام ریسک و کاربرد متفاوت دارند.",
    aiInterpretation: narratives.USDT.short.summary,
    keyRisks: narratives.USDT.short.keyRisks,
    regimeSensitivity: ["Stablecoin Expansion", "Stablecoin Stress", "Geopolitical Stress"],
    metrics: [
      { label: "TRON/ERC20/Solana", value: "تفکیک‌شده", tone: "neutral" },
      { label: "ریسک مسدودسازی", value: "مهم", tone: "warn" },
      { label: "Mint/Burn (صدور/سوزاندن)", value: "نیازمند مقصد", tone: "neutral" },
      { label: "پریمیوم محلی", value: "حساس", tone: "warn" },
    ],
  },
  DXY: {
    symbol: "DXY",
    titleFa: "شاخص دلار آمریکا",
    roleFa: "محرک کلان نقدینگی و فشار ریسک‌گریزی",
    marketStructure: "DXY جهت هزینه نقدینگی دلاری را نشان می‌دهد و روی کل کریپتو اثر غیرمستقیم اما پرقدرت دارد.",
    macroPressure: 78,
    liquidityScore: 42,
    sentimentScore: 50,
    whaleFlow: "برای DXY جریان آن‌چین وجود ندارد؛ اثر آن از مسیر allocation و دلار جهانی منتقل می‌شود.",
    etfFlow: "ETFهای کریپتو می‌توانند بخشی از فشار شاخص دلار را جذب کنند، اما محرک اصلی DXY نیستند.",
    onchainSummary: "داده آن‌چین مستقیم ندارد؛ باید با BTC/DXY و شاخص‌های جایگزین نقدینگی تحلیل شود.",
    aiInterpretation: narratives.DXY.short.summary,
    keyRisks: narratives.DXY.short.keyRisks,
    regimeSensitivity: ["Risk-Off", "Macro Uncertainty", "Liquidity Contraction"],
    metrics: [
      { label: "محرک کلان", value: "فشار روی کریپتو", tone: "warn" },
      { label: "BTC/DXY", value: "معکوس", tone: "neutral" },
      { label: "Fed Sensitivity (حساسیت به فدرال رزرو)", value: "زیاد", tone: "warn" },
      { label: "اثر نقدینگی", value: "منفی در صعود", tone: "bad" },
    ],
  },
  Gold: {
    symbol: "Gold",
    titleFa: "طلا",
    roleFa: "محرک دفاعی و سنجه روایت پوشش ریسک",
    marketStructure: "طلا نشان می‌دهد بازار از تورم، ژئوپلیتیک یا نرخ واقعی چه برداشتی دارد.",
    macroPressure: 46,
    liquidityScore: 52,
    sentimentScore: 57,
    whaleFlow: "جریان مستقیم آن‌چین ندارد؛ ETFهای طلا و خرید بانک‌های مرکزی مهم‌ترند.",
    etfFlow: "جریان ETF طلا برای فهم تقاضای دفاعی و مقایسه با BTC کاربرد دارد.",
    onchainSummary: "برای طلا، آن‌چین مرتبط نیست؛ همبستگی با BTC و بازده واقعی جایگزین تحلیلی آن است.",
    aiInterpretation: narratives.Gold.short.summary,
    keyRisks: narratives.Gold.short.keyRisks,
    regimeSensitivity: ["Geopolitical Stress", "Macro Uncertainty", "Risk-Off"],
    metrics: [
      { label: "BTC/Gold", value: "در حال تغییر", tone: "neutral" },
      { label: "Real Yield (بازده واقعی)", value: "کلیدی", tone: "warn" },
      { label: "پناهگاه امن", value: "فعال", tone: "good" },
      { label: "DXY Sensitivity (حساسیت به دلار)", value: "بالا", tone: "warn" },
    ],
  },
  Nasdaq: {
    symbol: "Nasdaq",
    titleFa: "نزدک",
    roleFa: "محرک اشتهای ریسک و بتای فناوری",
    marketStructure: "Nasdaq برای ETH و SOL محرک قوی‌تری از BTC است و کیفیت ریسک‌پذیری بازار را نشان می‌دهد.",
    macroPressure: 64,
    liquidityScore: 57,
    sentimentScore: 60,
    whaleFlow: "جریان آن‌چین ندارد؛ جریان صندوق‌ها، پهنای بازار و سودآوری شرکت‌ها نقش اصلی دارند.",
    etfFlow: "جریان ETFهای سهام فناوری برای سنجش اشتهای ریسک دارایی‌های رشد مهم است.",
    onchainSummary: "برای Nasdaq، آن‌چین مستقیم وجود ندارد؛ همبستگی با ETH/SOL جایگزین تحلیلی است.",
    aiInterpretation: narratives.Nasdaq.short.summary,
    keyRisks: narratives.Nasdaq.short.keyRisks,
    regimeSensitivity: ["Risk-On", "Macro Uncertainty", "Liquidity Expansion"],
    metrics: [
      { label: "ETH/SOL Beta", value: "زیاد", tone: "warn" },
      { label: "Breadth (پهنای بازار)", value: "باید رصد شود", tone: "neutral" },
      { label: "VIX", value: "کلیدی", tone: "warn" },
      { label: "اشتیاق به رشد", value: "محرک", tone: "good" },
    ],
  },
  US10Y: {
    symbol: "US10Y",
    titleFa: "بازده اوراق ۱۰ ساله آمریکا",
    roleFa: "محرک نرخ تنزیل و فشار دارایی‌های رشد",
    marketStructure: "US10Y مسیر هزینه سرمایه را نشان می‌دهد و برای ارزش‌گذاری کریپتو بسیار اثرگذار است.",
    macroPressure: 82,
    liquidityScore: 38,
    sentimentScore: 47,
    whaleFlow: "جریان آن‌چین مستقیم ندارد؛ اثر آن از مسیر allocation، ETF و ریسک‌پذیری می‌آید.",
    etfFlow: "وقتی US10Y بالا می‌ماند، ETF inflow برای مقاومت BTC اهمیت بیشتری پیدا می‌کند.",
    onchainSummary: "برای US10Y، on-chain مستقیم وجود ندارد؛ باید واکنش BTC/ETH/SOL به نرخ سنجیده شود.",
    aiInterpretation: narratives.US10Y.short.summary,
    keyRisks: narratives.US10Y.short.keyRisks,
    regimeSensitivity: ["Liquidity Contraction", "Macro Uncertainty", "Risk-Off"],
    metrics: [
      { label: "فشار نرخ", value: "بالا", tone: "bad" },
      { label: "BTC Sensitivity (حساسیت بیت‌کوین)", value: "زیاد", tone: "warn" },
      { label: "MOVE Index", value: "کلیدی", tone: "warn" },
      { label: "نقدینگی", value: "فشارزا", tone: "bad" },
    ],
  },
};

export function buildAssetIntelligence(asset: IntelligenceAssetSymbol): AssetIntelligence {
  return {
    ...assetBaseProfiles[asset],
    horizons: generateAssetHorizons(asset),
    sourceMapping: getSourcesForAsset(asset),
  };
}

export function buildAssetIntelligenceCatalog(): Record<Lowercase<IntelligenceAssetSymbol>, AssetIntelligence> {
  return supportedIntelligenceAssets.reduce(
    (catalog, asset) => ({
      ...catalog,
      [asset.toLowerCase()]: buildAssetIntelligence(asset),
    }),
    {} as Record<Lowercase<IntelligenceAssetSymbol>, AssetIntelligence>,
  );
}
