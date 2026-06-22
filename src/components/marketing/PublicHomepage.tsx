import Image from "next/image";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  CircleGauge,
  DatabaseZap,
  Eye,
  Filter,
  Globe2,
  Languages,
  Layers3,
  Newspaper,
  Radar,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Waves,
} from "lucide-react";

const assets = ["USDT", "BTC", "ETH", "TRX", "TON", "SOL", "XRP", "DOGE", "BNB", "ADA"];

const marketQuestions = [
  "آیا رشد فعلی بازار با نقدینگی حمایت می‌شود؟",
  "آیا ETFها و جریان سرمایه حرکت بازار را تأیید می‌کنند؟",
  "آیا مشتقات و فاندینگ درباره افزایش ریسک هشدار می‌دهند؟",
  "آیا خبرهای جهانی اثر واقعی دارند یا فقط فضای احساسی ساخته‌اند؟",
  "آیا بازار در فاز ریسک‌پذیری است یا احتیاط؟",
  "آیا حرکت ۲۴ ساعته با روند ۷ و ۳۰ روزه هم‌خوانی دارد؟",
];

const dashboardLayers = [
  "قیمت، مومنتوم و تفکیک روند ۲۴ ساعته، ۷ روزه و ۳۰ روزه",
  "وضعیت بیت‌کوین، اتریوم و رمزارزهای مهم برای کاربران ایرانی",
  "نقدینگی بازار، استیبل‌کوین‌ها و جریان ETF بیت‌کوین و اتریوم",
  "مشتقات، فاندینگ، Open Interest و داده‌های لیکوییدیشن در صورت دسترسی معتبر",
  "احساسات بازار، خبرهای جهانی و ارتباط آن‌ها با دارایی‌ها",
  "اقتصاد کلان، دلار، نرخ بهره، طلا و شاخص‌های ریسک",
  "سناریوهای احتمالی ۷ و ۳۰ روزه، سطح ریسک و اعتماد تحلیل",
  "داده‌های ناقص، محدود یا نامطمئن که باید پیش از نتیجه‌گیری دیده شوند",
];

const regimeStates = [
  "صعودی اما شکننده",
  "خنثی با فشار منفی",
  "صعودی با حمایت نقدینگی",
  "نزولی با فشار مشتقات",
  "پرریسک و خبری",
  "آرام اما آماده نوسان",
  "در حال تغییر فاز",
  "بدون تأیید کافی برای حرکت بزرگ",
];

const iranBenefits = [
  "خبر معتبر را از شایعه و بازنشر بی‌منبع جدا کنید",
  "داده جهانی را به فارسی و در بستر بازار ببینید",
  "اثر خبرهای بین‌المللی را روی بیت‌کوین و آلت‌کوین‌ها بهتر بفهمید",
  "تفاوت نوسان کوتاه‌مدت و روند واقعی را بررسی کنید",
  "داده‌های تأییدکننده یا تضعیف‌کننده سناریو را یک‌جا ببینید",
  "سطح اعتماد تحلیل را همراه با محدودیت‌های داده مشاهده کنید",
];

const subscriptionBenefits = [
  "داشبورد کامل وضعیت بازار جهانی کریپتو به زبان فارسی",
  "تحلیل و اعتبارسنجی خبرها و داده‌های اثرگذار بازار",
  "تحلیل ۱۰ رمزارز مهم برای کاربران ایرانی",
  "بررسی روندهای ۲۴ ساعته، ۷ روزه و ۳۰ روزه",
  "تحلیل نقدینگی، استیبل‌کوین‌ها و جریان ETF",
  "بررسی مشتقات، فاندینگ و Open Interest در صورت دسترسی معتبر",
  "تحلیل احساسات بازار، اقتصاد کلان و شاخص‌های ریسک",
  "سناریوهای احتمالی، سطح ریسک و سطح اعتماد تحلیل",
  "شفافیت درباره داده‌های ناقص، محدود یا نامطمئن",
  "آرشیو داشبوردهای قبلی و دسترسی به گزارش‌های جدید",
];

const faqs = [
  ["آیا CMIP یک منبع خبری فرانسوی است؟", "خیر. CMIP یک سیستم تحلیل بازار کریپتو است که قلب موتور تحلیلی آن در فرانسه فعال است و از منابع معتبر جهانی، آمریکایی، اروپایی و بین‌المللی استفاده می‌کند."],
  ["آیا CMIP فقط خبرها را ترجمه می‌کند؟", "خیر. CMIP خبر و داده را فیلتر، اعتبارسنجی و از نظر اثر احتمالی بر بازار بررسی می‌کند؛ ترجمه خام خبر هدف این محصول نیست."],
  ["آیا CMIP چند پلن مختلف دارد؟", "خیر. CMIP یک آبونمان کامل دارد، چون ارزش اصلی محصول در دید یکپارچه و چندلایه از بازار است."],
  ["با آبونمان CMIP به چه چیزهایی دسترسی دارم؟", "به داشبورد کامل تحلیل بازار، بررسی منابع جهانی، تحلیل ۱۰ رمزارز، سناریوهای ۷ و ۳۰ روزه، سطح ریسک و اعتماد، و آرشیو داشبوردها دسترسی دارید."],
  ["آیا می‌توان قبل از خرید نمونه داشبورد را دید؟", "بله. نمونه عمومی برای آشنایی با سبک تحلیل و ساختار محصول قابل مشاهده است؛ داده زنده و جزئیات کامل موتور فقط در دسترسی فعال ارائه می‌شود."],
  ["آیا CMIP باعث موفقیت در بازار می‌شود؟", "هیچ ابزاری نمی‌تواند سود یا موفقیت را تضمین کند. CMIP فقط کمک می‌کند بازار را با داده معتبرتر، دید وسیع‌تر و هیجان کمتر دنبال کنید."],
  ["آیا CMIP سیگنال خرید و فروش می‌دهد؟", "خیر. CMIP وضعیت بازار، سناریوها، ریسک‌ها، خبرها و داده‌های مهم را تحلیل می‌کند و سیگنال معامله ارائه نمی‌دهد."],
  ["چرا برای CMIP آبونمان بخرم؟", "برای اینکه به‌جای دنبال کردن ده‌ها منبع پراکنده، یک داشبورد فارسی، منظم، بازارسنجی‌شده و متکی بر منابع جهانی داشته باشید."],
  ["CMIP برای چه کسانی مناسب‌تر است؟", "برای کاربران ایرانی و فارسی‌زبانی که می‌خواهند بازار کریپتو را جدی‌تر، منظم‌تر و با اتکا به داده‌های جهانی دنبال کنند؛ نه فقط با شایعه و هیجان."],
];

type Feature = {
  icon: LucideIcon;
  title: string;
  copy: string;
};

const coreBenefits: Feature[] = [
  {
    icon: Globe2,
    title: "دسترسی تحلیلی به منابع معتبر جهانی",
    copy: "داده‌ها و خبرهای مهم بازار از منابع جهانی، آمریکایی و اروپایی بررسی می‌شوند تا وابستگی به شایعه، ترجمه دیرهنگام و تحلیل بدون منبع کمتر شود.",
  },
  {
    icon: Languages,
    title: "تبدیل داده جهانی به تحلیل فارسی قابل فهم",
    copy: "CMIP فقط اصطلاحاتی مثل ETF inflow یا Funding Rate را ترجمه نمی‌کند؛ توضیح می‌دهد این داده‌ها چه معنایی برای نقدینگی، ریسک و دارایی‌ها دارند.",
  },
  {
    icon: ShieldCheck,
    title: "اعتبارسنجی خبر و داده قبل از تحلیل",
    copy: "اعتبار منبع، تازگی، ارتباط مستقیم با بازار، اثر احتمالی و هماهنگی با سایر لایه‌های داده پیش از ورود به تحلیل بررسی می‌شود.",
  },
];

const processSteps: Feature[] = [
  { icon: DatabaseZap, title: "جمع‌آوری داده و خبر", copy: "قیمت، ETF، نقدینگی، مشتقات، احساسات، خبر و اقتصاد کلان." },
  { icon: Filter, title: "فیلتر کردن نویز", copy: "کنار گذاشتن محتوای تکراری، تبلیغاتی، دیرهنگام یا کم‌اثر." },
  { icon: SearchCheck, title: "اعتبارسنجی منبع", copy: "کنترل اعتبار، تازگی، ارتباط و کیفیت داده‌های ورودی." },
  { icon: BarChart3, title: "بازارسنجی و تحلیل اثر", copy: "بررسی اثر بر بیت‌کوین، آلت‌کوین‌ها، نقدینگی، ریسک و سناریوها." },
  { icon: Languages, title: "ساخت داشبورد فارسی", copy: "ارائه نتیجه به زبان روشن همراه با جزئیات فنی قابل بررسی." },
];

function CTA({ secondary = false, children, href }: { secondary?: boolean; children: React.ReactNode; href: string }) {
  return (
    <Link
      href={href}
      className={secondary
        ? "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-white/25 bg-black/35 px-5 py-2 text-sm font-bold text-white backdrop-blur transition hover:bg-white/10"
        : "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-bold text-primary-foreground transition hover:bg-primary/90"}
    >
      {children}
      <ArrowLeft className="h-4 w-4" />
    </Link>
  );
}

function SectionHeading({ eyebrow, title, copy }: { eyebrow: string; title: string; copy?: string }) {
  return (
    <div className="max-w-4xl">
      <div className="text-xs font-bold text-primary">{eyebrow}</div>
      <h2 className="mt-2 text-2xl font-black leading-[1.7] text-foreground md:text-3xl">{title}</h2>
      {copy ? <p className="mt-4 text-sm leading-8 text-muted-foreground md:text-base md:leading-9">{copy}</p> : null}
    </div>
  );
}

function ConceptImage({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <figure className="overflow-hidden rounded-md border border-white/10 bg-[#050b12] shadow-2xl shadow-black/20">
      <div className="relative aspect-video">
        <Image src={src} alt={alt} fill sizes="(max-width: 1024px) 100vw, 1200px" className="object-cover" />
      </div>
      <figcaption className="border-t border-white/10 bg-[#08111c] px-4 py-3 text-xs leading-6 text-slate-400">
        تصویر مفهومی محصول — {caption}؛ اعداد داخل تصویر داده زنده نیستند.
      </figcaption>
    </figure>
  );
}

function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-sm leading-7 text-muted-foreground">
          <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function PublicHomepage() {
  return (
    <main className="min-h-screen bg-background text-foreground" dir="rtl">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-background/92 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 md:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <Image src="/cmip-logo.jpg" alt="CMIP" width={128} height={63} priority className="h-11 w-auto object-contain invert mix-blend-screen" />
            <span className="hidden truncate text-xs text-muted-foreground sm:inline">Crypto Macro Intelligence Platform</span>
          </Link>
          <nav className="flex shrink-0 items-center gap-2">
            <Link href="/login" className="hidden h-9 items-center rounded-md border px-4 text-xs font-bold hover:bg-muted sm:inline-flex">ورود</Link>
            <Link href="/register" className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-xs font-bold text-primary-foreground">دسترسی کامل CMIP</Link>
          </nav>
        </div>
      </header>

      <section className="relative min-h-[calc(100svh-4rem)] overflow-hidden border-b border-white/10">
        <Image
          src="/marketing/cmip-360-market-analysis.jpg"
          alt="نمای مفهومی تحلیل ۳۶۰ درجه بازار کریپتو در CMIP"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-black/72" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,7,13,0.3),rgba(2,7,13,0.82)_62%,rgba(2,7,13,0.96))]" />
        <div className="relative mx-auto flex min-h-[calc(100svh-4rem)] max-w-7xl items-center px-4 py-14 md:px-6 md:py-20">
          <div className="max-w-4xl">
            <div className="inline-flex items-center gap-2 border-r-2 border-primary pr-3 text-xs font-bold text-primary">
              <Radar className="h-4 w-4" />
              داشبورد تحلیلی بازار جهانی کریپتو برای کاربران فارسی‌زبان
            </div>
            <h1 className="mt-5 max-w-4xl text-[1.75rem] font-black leading-[1.55] text-white md:text-5xl md:leading-[1.5]">
              قبل از تصمیم در بازار کریپتو، تحلیل ۳۶۰ درجه‌ای از وضعیت واقعی بازار ببینید
            </h1>
            <p className="mt-5 max-w-3xl text-sm leading-8 text-white/78 md:text-lg md:leading-9">
              CMIP فقط قیمت را نشان نمی‌دهد؛ قیمت، نقدینگی، ETF، مشتقات، احساسات، اخبار جهانی و شاخص‌های کلان را کنار هم می‌گذارد تا روشن شود بازار در چه رژیمی قرار دارد و حرکت فعلی چقدر پشتوانه دارد.
            </p>
            <p className="mt-4 max-w-3xl text-sm font-bold leading-7 text-white">
              قلب موتور تحلیلی CMIP در فرانسه فعال است و تحلیل آن بر منابع معتبر جهانی، آمریکایی و اروپایی تکیه دارد.
            </p>
            <p className="mt-4 text-sm font-bold text-accent">قطب‌نمای رژیم بازار رمزارز؛ برای فهم کیفیت حرکت بازار، نه فقط جهت قیمت.</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <CTA href="/sample-dashboard">مشاهده داشبورد امروز بازار</CTA>
              <CTA href="/register" secondary>فعال‌سازی دسترسی کامل CMIP</CTA>
            </div>
            <p className="mt-5 max-w-2xl text-xs leading-6 text-white/60">CMIP ابزار تحلیل بازار است و سیگنال خرید و فروش، توصیه مالی یا تضمین سود ارائه نمی‌دهد.</p>
          </div>
        </div>
      </section>

      <section className="border-b bg-card/25 py-16 md:py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <SectionHeading
            eyebrow="مسئله اصلی بازار"
            title="بازار کریپتو پر از اطلاعات است؛ اما همه اطلاعات ارزش تصمیم‌گیری ندارند."
            copy="قیمت، خبر، نمودار، تحلیل، توییت و نظرهای متناقض هر لحظه منتشر می‌شوند. مسئله اصلی کمبود اطلاعات نیست؛ مسئله تشخیص داده مهم، خبر اثرگذار، حرکت دارای پشتوانه و نویز کوتاه‌مدت است."
          />
          <div className="mt-9 grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div className="grid gap-3 sm:grid-cols-2">
              {marketQuestions.map((item) => (
                <div key={item} className="rounded-md border bg-background p-4 text-sm leading-7">
                  <CircleGauge className="mb-3 h-5 w-5 text-accent" />
                  {item}
                </div>
              ))}
            </div>
            <ConceptImage src="/marketing/cmip-noise-filter.jpg" alt="فیلتر نویز و اعتبارسنجی اطلاعات بازار توسط CMIP" caption="نمایش مسیر جدا کردن نویز از داده قابل بررسی" />
          </div>
          <p className="mt-8 border-r-2 border-accent pr-4 text-base font-black leading-8">مزیت واقعی در بازار، دیدن داده بیشتر نیست؛ فهمیدن داده درست در زمان درست است.</p>
        </div>
      </section>

      <section className="py-16 md:py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <SectionHeading
            eyebrow="CMIP چیست؟"
            title="CMIP یک داشبورد تحلیلی برای تشخیص رژیم بازار کریپتو است."
            copy="این پلتفرم برای کاربرانی ساخته شده که نمی‌خواهند بازار را فقط با سبز و قرمز قیمت‌ها قضاوت کنند. CMIP تلاش می‌کند قدرت یا شکنندگی حرکت، وضعیت ریسک، هم‌جهتی داده‌ها، سناریوهای محتمل و سطح اعتماد تحلیل را یک‌جا نشان دهد."
          />
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              [BrainCircuit, "کیفیت حرکت بازار", "رشد یا افت قیمت در کنار نقدینگی، ETF، مشتقات و شرایط کلان سنجیده می‌شود."],
              [Layers3, "تحلیل چندلایه", "داده‌های پراکنده در یک چارچوب مشترک قرار می‌گیرند تا تضادها و تأییدها دیده شوند."],
              [CircleGauge, "اعتماد و محدودیت", "سطح اعتماد و نقاطی که هنوز به داده بیشتری نیاز دارند، از نتیجه نهایی جدا نمی‌شوند."],
            ].map(([Icon, title, copy]) => {
              const Component = Icon as LucideIcon;
              return (
                <article key={String(title)} className="rounded-md border bg-card p-5">
                  <Component className="h-6 w-6 text-primary" />
                  <h3 className="mt-4 text-base font-black">{String(title)}</h3>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">{String(copy)}</p>
                </article>
              );
            })}
          </div>
          <p className="mt-7 text-base font-bold leading-8 text-accent">CMIP جهت، فشار، کیفیت و اعتبار حرکت بازار را در یک داشبورد فارسی قابل فهم کنار هم قرار می‌دهد.</p>
        </div>
      </section>

      <section className="border-y bg-card/25 py-16 md:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 lg:grid-cols-[0.9fr_1.1fr] lg:items-center md:px-6">
          <div>
            <SectionHeading
              eyebrow="جایگاه CMIP"
              title="تحلیل جهانی، داشبورد فارسی، طراحی‌شده برای نیاز کاربر ایرانی."
              copy="داده‌های اثرگذار بازار در منابع تخصصی بین‌المللی منتشر می‌شوند. فهم جریان ETF، مشتقات، نقدینگی استیبل‌کوین‌ها، اقتصاد کلان و خبرهای مؤسسات مالی به زمان، زبان تخصصی و چارچوب تحلیلی نیاز دارد. CMIP این لایه‌های پراکنده را در یک مسیر فارسی منظم می‌کند."
            />
            <p className="mt-6 border-r-2 border-primary pr-4 text-sm font-bold leading-8">یک موتور تحلیلی با قلب عملیاتی در فرانسه؛ متکی بر منابع جهانی، برای تحلیل فارسی بازار کریپتو.</p>
          </div>
          <ConceptImage src="/marketing/cmip-global-persian-dashboard.jpg" alt="تحلیل جهانی و داشبورد فارسی CMIP" caption="جایگاه جهانی داده‌ها و تمرکز فارسی محصول" />
        </div>
      </section>

      <section className="py-16 md:py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <SectionHeading
            eyebrow="چرا CMIP متفاوت است؟"
            title="CMIP فقط بازار را نمایش نمی‌دهد؛ بازار را تحلیل، فیلتر و اعتبارسنجی می‌کند."
            copy="خبر را بازنشر نمی‌کند، عدد خام را بدون تفسیر رها نمی‌کند و رشد قیمت را بدون بررسی پشتوانه آن نتیجه‌گیری نمی‌کند. هدف این است که روشن شود چرا یک رویداد برای بازار مهم است و کدام داده‌ها آن را تأیید یا تضعیف می‌کنند."
          />
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {coreBenefits.map(({ icon: Icon, title, copy }) => (
              <article key={title} className="rounded-md border bg-card p-5">
                <Icon className="h-6 w-6 text-primary" />
                <h3 className="mt-4 text-base font-black leading-7">{title}</h3>
                <p className="mt-3 text-sm leading-8 text-muted-foreground">{copy}</p>
              </article>
            ))}
          </div>
          <p className="mt-7 text-base font-black leading-8">وقتی بازار جهانی است، تحلیل آن هم باید جهانی باشد.</p>
        </div>
      </section>

      <section className="border-y bg-card/25 py-16 md:py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <SectionHeading eyebrow="روش کار CMIP" title="از داده خام تا تحلیل قابل استفاده؛ در پنج مرحله مشخص." />
          <div className="mt-8 grid gap-3 md:grid-cols-5">
            {processSteps.map(({ icon: Icon, title, copy }, index) => (
              <article key={title} className="rounded-md border bg-background p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-bold text-accent">مرحله {index + 1}</span>
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="mt-4 text-sm font-black leading-7">{title}</h3>
                <p className="mt-2 text-xs leading-6 text-muted-foreground">{copy}</p>
              </article>
            ))}
          </div>
          <div className="mt-8">
            <ConceptImage src="/marketing/cmip-analysis-pipeline.jpg" alt="فرآیند پنج مرحله‌ای تحلیل داده در CMIP" caption="نمایش مفهومی مسیر داده خام تا داشبورد فارسی" />
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <SectionHeading eyebrow="داخل داشبورد" title="تحلیل بازار کریپتو فقط قیمت نیست؛ CMIP پشت قیمت را هم بررسی می‌کند." />
          <div className="mt-8 grid gap-9 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <CheckList items={dashboardLayers} />
            <ConceptImage src="/marketing/cmip-multilayer-analysis.jpg" alt="لایه‌های تحلیل بازار در داشبورد CMIP" caption="نمایش مفهومی لایه‌های قیمت، نقدینگی، ETF، مشتقات، احساسات و کلان" />
          </div>
          <p className="mt-7 text-base font-black text-accent">CMIP بازار را مثل یک سیستم بررسی می‌کند، نه فقط مثل یک نمودار قیمت.</p>
        </div>
      </section>

      <section className="border-y bg-card/25 py-16 md:py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <SectionHeading
            eyebrow="قطب‌نمای رژیم بازار رمزارز"
            title="بازار فقط بالا یا پایین نمی‌رود؛ بازار وارد رژیم‌های مختلف می‌شود."
            copy="CMIP تلاش می‌کند علاوه بر جهت قیمت، کیفیت حرکت، پشتوانه نقدینگی و سطح ریسک را هم نشان دهد. یک حرکت صعودی می‌تواند شکننده باشد و یک بازار آرام می‌تواند برای نوسان آماده شود."
          />
          <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
            {regimeStates.map((state) => (
              <div key={state} className="flex min-h-20 items-center justify-center rounded-md border bg-card px-4 text-center text-sm font-bold leading-7">{state}</div>
            ))}
          </div>
          <p className="mt-7 border-r-2 border-accent pr-4 text-sm font-bold leading-8">قطب‌نمای رژیم بازار یعنی فهمیدن اینکه بازار با چه کیفیت، پشتوانه و سطح ریسکی حرکت می‌کند؛ نه فقط به کدام سمت.</p>
        </div>
      </section>

      <section className="py-16 md:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 lg:grid-cols-2 md:px-6">
          <div>
            <SectionHeading
              eyebrow="مزیت برای کاربر ایرانی"
              title="برای کاربر ایرانی، مزیت اطلاعاتی یعنی تحلیل بازار با دید وسیع‌تر."
              copy="پراکندگی منابع، زبان تخصصی، دسترسی دشوار، ترجمه‌های غیررسمی و شایعات شبکه‌های اجتماعی می‌توانند تصویر بازار را ناقص کنند. CMIP این فاصله را با یک داشبورد فارسی و مبتنی بر منابع جهانی کمتر می‌کند."
            />
          </div>
          <CheckList items={iranBenefits} />
        </div>
        <div className="mx-auto mt-8 max-w-7xl px-4 md:px-6">
          <p className="rounded-md border border-primary/25 bg-primary/5 p-5 text-sm font-bold leading-8">CMIP برای این ساخته شده که کاربر ایرانی تحلیل بازار جهانی کریپتو را با تأخیر، پراکندگی و برداشت‌های ناقص دنبال نکند.</p>
        </div>
      </section>

      <section className="border-y bg-card/25 py-16 md:py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <SectionHeading
            eyebrow="فهرست پایش"
            title="تحلیل جهانی، با تمرکز روی دارایی‌هایی که برای کاربران ایرانی مهم‌ترند."
            copy="CMIP این دارایی‌ها را به‌عنوان فهرست پایش پرکاربرد و پرمخاطب بررسی می‌کند؛ این عنوان به معنی ادعای دسترسی به حجم معاملات صرافی‌های ایرانی نیست."
          />
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {assets.map((asset, index) => (
              <div key={asset} className="rounded-md border bg-card p-4 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-primary/35 bg-primary/10 text-xs font-black text-primary">{asset.slice(0, 2)}</div>
                <div className="mt-3 text-sm font-black">{asset}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">دارایی {index + 1} از ۱۰</div>
              </div>
            ))}
          </div>
          <p className="mt-7 text-sm leading-8 text-muted-foreground">برای هر دارایی، وضعیت فعلی، روندهای زمانی، قدرت نسبی، ریسک‌ها، حمایت شرایط کلی بازار و هماهنگی حرکت با داده‌های جهانی بررسی می‌شود.</p>
        </div>
      </section>

      <section className="py-16 md:py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <SectionHeading eyebrow="نمونه زبان داشبورد" title="CMIP فقط نمی‌گوید چه اتفاقی افتاده؛ توضیح می‌دهد چرا برای بازار مهم است." />
          <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <blockquote className="rounded-md border bg-card p-6 text-base leading-9 md:text-lg">
              اگر بیت‌کوین در ۲۴ ساعت اخیر رشد کند، هنوز باید بررسی شود که آیا این رشد با ورود نقدینگی، جریان مثبت ETF، کاهش فشار مشتقات و بهبود احساسات همراه است یا نه. اگر داده‌ها همدیگر را تأیید نکنند، حرکت می‌تواند شکننده بماند.
            </blockquote>
            <div className="rounded-md border bg-card p-5">
              <h3 className="font-black">خروجی چه چیزی را روشن می‌کند؟</h3>
              <CheckList items={["بازار در چه فازی قرار دارد", "کدام داده‌ها این فاز را تأیید می‌کنند", "کدام خبرها واقعاً مهم‌اند", "سناریوی ۷ و ۳۰ روزه چیست", "سطح اعتماد و کمبود داده چقدر است"]} />
            </div>
          </div>
          <p className="mt-7 text-sm font-bold leading-8 text-accent">شما فقط نمی‌بینید بازار بالا یا پایین رفته؛ می‌فهمید پشت این حرکت چه داده‌هایی وجود دارد و چقدر می‌توان به آن اعتماد کرد.</p>
        </div>
      </section>

      <section className="border-y bg-card/25 py-16 md:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 lg:grid-cols-2 md:px-6">
          <div>
            <SectionHeading
              eyebrow="چرا سیگنال‌فروشی نیست؟"
              title="تحلیل واقعی بازار پیچیده‌تر از یک جمله «بخر» یا «بفروش» است."
              copy="CMIP قرار نیست به‌جای کاربر تصمیم بگیرد. بازار کریپتو پیچیده‌تر از آن است که با یک دستور ساده، پیش‌بینی تضمینی یا وعده سود قابل مدیریت باشد."
            />
            <div className="mt-7 flex items-start gap-3 rounded-md border border-amber-500/25 bg-amber-500/5 p-5">
              <TriangleAlert className="mt-1 h-5 w-5 shrink-0 text-amber-400" />
              <p className="text-sm leading-8 text-muted-foreground">CMIP سود قطعی، خرید و فروش بدون ریسک، جلو زدن همیشگی از بازار یا تصمیم‌گیری به‌جای کاربر را وعده نمی‌دهد.</p>
            </div>
          </div>
          <div className="rounded-md border bg-background p-6">
            <h3 className="text-lg font-black">CMIP به چه چیزی کمک می‌کند؟</h3>
            <div className="mt-5"><CheckList items={["جدا کردن خبر معتبر از نویز", "فهم بهتر داده مهم", "دنبال کردن منابع جهانی به زبان فارسی", "دیدن وضعیت بازار به‌صورت چندلایه", "بررسی سناریوها با هیجان کمتر"]} /></div>
            <p className="mt-6 font-black text-primary">CMIP ابزار فهم بهتر بازار است، نه دستگاه وعده سود.</p>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 lg:grid-cols-[0.85fr_1.15fr] md:px-6">
          <div>
            <SectionHeading
              eyebrow="آبونمان CMIP"
              title="یک دسترسی کامل؛ تمام داشبورد تحلیلی CMIP در یک آبونمان."
              copy="محصول به نسخه‌های ناقص تقسیم نشده است. با فعال‌سازی آبونمان، به هسته کامل تحلیل بازار و آرشیو داشبوردها دسترسی دارید."
            />
            <p className="mt-6 text-base font-black leading-8 text-accent">یک آبونمان، یک داشبورد کامل، یک قطب‌نمای تحلیلی برای فهم بهتر رژیم بازار رمزارز.</p>
            <div className="mt-7"><CTA href="/register">فعال‌سازی دسترسی کامل CMIP</CTA></div>
          </div>
          <div className="rounded-md border border-primary/30 bg-primary/5 p-6">
            <h3 className="text-lg font-black">دسترسی کامل شامل</h3>
            <div className="mt-5"><CheckList items={subscriptionBenefits} /></div>
          </div>
        </div>
      </section>

      <section className="border-y bg-card/25 py-16 md:py-20">
        <div className="mx-auto max-w-5xl px-4 text-center md:px-6">
          <Eye className="mx-auto h-7 w-7 text-primary" />
          <h2 className="mt-4 text-2xl font-black leading-[1.7] md:text-3xl">اول نمونه داشبورد تحلیلی را ببینید.</h2>
          <p className="mx-auto mt-4 max-w-3xl text-sm leading-8 text-muted-foreground md:text-base">نمونه داشبورد نشان می‌دهد CMIP چطور داده‌های جهانی، خبرهای معتبر، شاخص‌های بازار و سناریوهای احتمالی را به یک تحلیل فارسی قابل فهم تبدیل می‌کند. اگر این مدل تحلیل برای شما ارزشمند بود، دسترسی کامل را فعال کنید.</p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <CTA href="/sample-dashboard">مشاهده نمونه داشبورد تحلیلی</CTA>
            <CTA href="/register" secondary>فعال‌سازی دسترسی کامل</CTA>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 lg:grid-cols-[1fr_1fr] md:px-6">
          <div>
            <SectionHeading
              eyebrow="اعتمادسازی"
              title="موتور تحلیلی با قلب عملیاتی در فرانسه؛ ساخته‌شده برای کاربر فارسی‌زبان."
              copy="CMIP داده‌های جهانی را بررسی، خبرهای مهم را فیلتر، اعتبار منابع را کنترل و محدودیت داده‌ها را شفاف می‌کند. بین داده قطعی، داده ناقص و تحلیل احتمالی تفاوت گذاشته می‌شود."
            />
            <p className="mt-6 border-r-2 border-primary pr-4 text-sm font-bold leading-8">CMIP واقعیت بازار را بهتر از چیزی که داده‌ها اجازه می‌دهند نشان نمی‌دهد. اگر داده کافی نباشد، داشبورد باید صادقانه آن را مشخص کند.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              [Globe2, "منابع جهانی"],
              [Filter, "فیلتر خبر"],
              [ShieldCheck, "اعتبار منبع"],
              [Languages, "داشبورد فارسی"],
              [CircleGauge, "سطح اعتماد"],
              [TriangleAlert, "افشای محدودیت"],
            ].map(([Icon, title]) => {
              const Component = Icon as LucideIcon;
              return <div key={String(title)} className="flex items-center gap-3 rounded-md border bg-card p-4 text-sm font-bold"><Component className="h-5 w-5 text-primary" />{String(title)}</div>;
            })}
          </div>
        </div>
      </section>

      <section className="border-y bg-card/25 py-16 md:py-20">
        <div className="mx-auto max-w-5xl px-4 md:px-6">
          <SectionHeading eyebrow="پرسش‌های متداول" title="پیش از فعال‌سازی دسترسی" />
          <div className="mt-8 divide-y rounded-md border bg-card">
            {faqs.map(([question, answer]) => (
              <details key={question} className="group p-4 md:p-5">
                <summary className="cursor-pointer list-none text-sm font-black leading-7">{question}</summary>
                <p className="mt-3 text-sm leading-8 text-muted-foreground">{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[#060d16] py-20">
        <div className="absolute inset-0 opacity-10"><Image src="/marketing/cmip-360-market-analysis.jpg" alt="" fill sizes="100vw" className="object-cover" /></div>
        <div className="absolute inset-0 bg-black/75" />
        <div className="relative mx-auto max-w-4xl px-4 text-center md:px-6">
          <Waves className="mx-auto h-8 w-8 text-primary" />
          <h2 className="mt-5 text-2xl font-black leading-[1.7] text-white md:text-4xl">تحلیل بازار جهانی کریپتو را با داده‌های پراکنده و برداشت‌های ناقص دنبال نکنید.</h2>
          <p className="mx-auto mt-5 max-w-3xl text-sm leading-8 text-white/70 md:text-base">CMIP داده‌ها و خبرهای مهم بازار جهانی را از یک موتور تحلیلی با قلب عملیاتی در فرانسه، به زبان فارسی، فیلترشده، اعتبارسنجی‌شده و قابل استفاده ارائه می‌کند.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2 text-sm font-bold text-white/80">
            {["نه شایعه", "نه سیگنال کور", "نه ترجمه خام خبر", "نه تحلیل پراکنده"].map((item) => <span key={item} className="rounded-md border border-white/15 bg-black/30 px-4 py-2">{item}</span>)}
          </div>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <CTA href="/register">فعال‌سازی دسترسی کامل CMIP</CTA>
            <CTA href="/sample-dashboard" secondary>مشاهده نمونه داشبورد</CTA>
          </div>
          <p className="mt-6 text-xs leading-6 text-white/50">CMIP سیگنال خرید و فروش یا تضمین سود ارائه نمی‌دهد. تصمیم نهایی و مدیریت ریسک بر عهده کاربر است.</p>
        </div>
      </section>
    </main>
  );
}
