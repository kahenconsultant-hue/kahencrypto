import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  CircleGauge,
  DatabaseZap,
  Filter,
  Globe2,
  Languages,
  Radar,
  ShieldCheck,
  Sparkles,
  Waves,
} from "lucide-react";

const assets = ["USDT", "BTC", "ETH", "TRX", "TON", "SOL", "XRP", "DOGE", "BNB", "ADA"];
const dashboardLayers = [
  "قیمت و مومنتوم در افق ۲۴ ساعت، ۷ روز و ۳۰ روز",
  "نقدینگی استیبل‌کوین و جریان ETF بیت‌کوین و اتریوم",
  "Funding، Open Interest و وضعیت محدود مشتقات عمومی",
  "اقتصاد کلان، قدرت دلار، بازده اوراق، طلا و ریسک بازار",
  "احساسات بازار، خبرهای جهانی و ارتباط مستقیم با دارایی‌ها",
  "سناریوهای محتمل، سطح ریسک، سطح اطمینان و داده‌های ناقص",
];
const faqs = [
  ["آیا CMIP یک منبع خبری فرانسوی است؟", "خیر. CMIP یک سیستم تحلیل بازار کریپتو با قلب عملیاتی در فرانسه است که از منابع جهانی، آمریکایی و اروپایی استفاده می‌کند."],
  ["آیا CMIP فقط خبرها را ترجمه می‌کند؟", "خیر. خبر و داده را فیلتر، اعتبارسنجی و از نظر اثر احتمالی بر نقدینگی، ریسک و دارایی‌ها بررسی می‌کند."],
  ["آیا CMIP چند پلن مختلف دارد؟", "خیر. فقط یک آبونمان کامل وجود دارد؛ چون ارزش محصول در دید یکپارچه و چندلایه از بازار است."],
  ["آیا می‌توان قبل از خرید نمونه داشبورد را دید؟", "بله. نمونه عمومی، زبان تحلیل و ساختار محصول را نشان می‌دهد؛ داده‌ها و جزئیات کامل فقط برای حساب فعال در دسترس‌اند."],
  ["آیا CMIP سیگنال خرید و فروش می‌دهد؟", "خیر. CMIP وضعیت بازار، ریسک، نقدینگی و سناریوهای محتمل را توضیح می‌دهد و سود یا نتیجه معامله را تضمین نمی‌کند."],
  ["CMIP برای چه کسانی مناسب‌تر است؟", "برای کاربران فارسی‌زبانی که می‌خواهند بازار جهانی کریپتو را منظم‌تر و با اتکا به داده‌های قابل بررسی دنبال کنند."],
];

function CTA({ secondary = false, children, href }: { secondary?: boolean; children: React.ReactNode; href: string }) {
  return <Link href={href} className={secondary ? "inline-flex h-11 items-center justify-center gap-2 rounded-md border border-white/25 bg-black/30 px-5 text-sm font-bold text-white backdrop-blur transition hover:bg-white/10" : "inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90"}>{children}<ArrowLeft className="h-4 w-4" /></Link>;
}

function SectionHeading({ eyebrow, title, copy }: { eyebrow: string; title: string; copy?: string }) {
  return <div className="max-w-3xl"><div className="text-xs font-bold text-primary">{eyebrow}</div><h2 className="mt-2 text-2xl font-black leading-[1.7] text-foreground md:text-3xl">{title}</h2>{copy ? <p className="mt-3 text-sm leading-8 text-muted-foreground md:text-base">{copy}</p> : null}</div>;
}

export function PublicHomepage() {
  return (
    <main className="min-h-screen bg-background text-foreground" dir="rtl">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 md:px-6">
          <Link href="/" className="flex items-center gap-3"><Image src="/cmip-logo.jpg" alt="CMIP" width={128} height={63} priority className="h-11 w-auto object-contain invert mix-blend-screen" /><span className="hidden text-xs text-muted-foreground sm:inline">Crypto Macro Intelligence Platform</span></Link>
          <nav className="flex items-center gap-2"><Link href="/login" className="hidden h-9 items-center rounded-md border px-4 text-xs font-bold hover:bg-muted sm:inline-flex">ورود</Link><Link href="/register" className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-xs font-bold text-primary-foreground">دسترسی کامل CMIP</Link></nav>
        </div>
      </header>

      <section className="relative flex h-[76svh] min-h-[640px] max-h-[760px] items-start overflow-hidden border-b border-white/10 md:items-end">
        <Image src="/cmip-logo.jpg" alt="CMIP Crypto Macro Intelligence Platform" fill priority sizes="100vw" className="object-contain opacity-20 invert mix-blend-screen" />
        <div className="absolute inset-0 bg-black/65" />
        <div className="relative mx-auto w-full max-w-7xl px-4 pb-8 pt-8 md:px-6 md:pb-16 md:pt-0">
          <div className="max-w-4xl">
            <div className="mb-4 inline-flex items-center gap-2 border-r-2 border-primary pr-3 text-xs font-bold text-primary"><Radar className="h-4 w-4" />قطب‌نمای رژیم بازار رمزارز</div>
            <h1 className="text-[1.7rem] font-black leading-[1.5] text-white md:text-5xl md:leading-[1.55]">تحلیل بازار جهانی کریپتو را با یک داشبورد فارسی، حرفه‌ای و قابل‌فهم دنبال کنید.</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-white/75 md:mt-5 md:text-lg md:leading-8">CMIP داده‌ها، خبرها و شاخص‌های بازار جهانی را از منابع معتبر بررسی می‌کند و نتیجه را به یک داشبورد تحلیلی فارسی تبدیل می‌کند. قلب موتور تحلیلی در فرانسه فعال است؛ نگاه آن کاملاً جهانی است.</p>
            <p className="mt-4 text-sm font-bold leading-7 text-white">فقط ترجمه خبر نیست؛ فیلتر، اعتبارسنجی و تحلیل اثر احتمالی آن بر بازار است.</p>
            <div className="mt-5 flex flex-col gap-3 sm:mt-7 sm:flex-row"><CTA href="/sample-dashboard">مشاهده داشبورد امروز بازار</CTA><CTA href="/register" secondary>فعال‌سازی دسترسی کامل CMIP</CTA></div>
            <p className="mt-4 text-xs leading-6 text-white/55">CMIP ابزار تحلیل بازار است و سیگنال خرید و فروش، توصیه مالی یا تضمین سود ارائه نمی‌دهد.</p>
          </div>
        </div>
      </section>

      <section className="border-b bg-card/25 py-16"><div className="mx-auto grid max-w-7xl gap-10 px-4 md:grid-cols-[0.9fr_1.1fr] md:px-6"><SectionHeading eyebrow="مسئله واقعی" title="مشکل کمبود اطلاعات نیست؛ تشخیص داده معتبر و اثرگذار است." copy="خبر فوری، ترجمه ناقص، نمودار پراکنده و تحلیل متناقض فراوان است. مسئله این است که کدام داده پشتوانه دارد و کدام حرکت فقط نویز کوتاه‌مدت است." /><div className="grid gap-3 sm:grid-cols-2">{["آیا حرکت قیمت با نقدینگی حمایت می‌شود؟","ETF و مشتقات حرکت را تأیید می‌کنند؟","بازار در حال تغییر فاز است یا نوسان کوتاه دارد؟","سناریوی ۷ و ۳۰ روزه چقدر قابل اتکاست؟"].map((item) => <div key={item} className="rounded-md border bg-card p-4 text-sm leading-7"><CircleGauge className="mb-3 h-5 w-5 text-accent" />{item}</div>)}</div></div></section>

      <section className="py-16"><div className="mx-auto max-w-7xl px-4 md:px-6"><SectionHeading eyebrow="CMIP چیست؟" title="داشبورد تحلیلی برای فهم رژیم بازار، نه یک صفحه قیمت و خبر." copy="CMIP تلاش می‌کند نشان دهد بازار در فاز ریسک‌پذیری است یا احتیاط، حرکت فعلی قوی است یا شکننده و کدام لایه‌های داده یکدیگر را تأیید یا رد می‌کنند." /><div className="mt-8 grid gap-4 md:grid-cols-3">{[[Globe2,"منابع جهانی","داده‌ها و خبرهای معتبر آمریکایی، اروپایی و بین‌المللی در یک مسیر تحلیلی مشترک."],[Languages,"فهم فارسی","تبدیل زبان فنی داده به توضیح فارسی روشن، بدون حذف جزئیات قابل بررسی."],[ShieldCheck,"اعتبارسنجی قبل از تفسیر","بررسی اعتبار، تازگی، ارتباط و اثر احتمالی پیش از ورود داده به سناریوی بازار."]].map(([Icon,title,copy]) => { const Component=Icon as typeof Globe2; return <article key={String(title)} className="rounded-md border bg-card p-5"><Component className="h-6 w-6 text-primary" /><h3 className="mt-4 text-base font-black">{String(title)}</h3><p className="mt-2 text-sm leading-7 text-muted-foreground">{String(copy)}</p></article>; })}</div></div></section>

      <section className="border-y bg-card/25 py-16"><div className="mx-auto max-w-7xl px-4 md:px-6"><SectionHeading eyebrow="روش کار" title="جمع‌آوری، فیلتر، اعتبارسنجی، بازارسنجی و ارائه فارسی." /><div className="mt-8 grid gap-3 md:grid-cols-5">{[[DatabaseZap,"جمع‌آوری","داده بازار، ETF، نقدینگی، مشتقات، خبر و کلان"],[Filter,"فیلتر نویز","حذف خبر تکراری، تبلیغاتی یا کم‌اثر"],[ShieldCheck,"اعتبارسنجی","کنترل منبع، تازگی و کیفیت داده"],[BarChart3,"بازارسنجی","بررسی اثر بر ریسک، نقدینگی و دارایی‌ها"],[Languages,"داشبورد فارسی","روایت روشن همراه با جزئیات فنی"]].map(([Icon,title,copy],index) => { const Component=Icon as typeof Globe2; return <article key={String(title)} className="rounded-md border bg-background p-4"><span className="text-xs text-accent">مرحله {index+1}</span><Component className="mt-3 h-5 w-5 text-primary" /><h3 className="mt-3 text-sm font-black">{String(title)}</h3><p className="mt-2 text-xs leading-6 text-muted-foreground">{String(copy)}</p></article>; })}</div></div></section>

      <section className="py-16"><div className="mx-auto grid max-w-7xl gap-10 px-4 lg:grid-cols-2 md:px-6"><div><SectionHeading eyebrow="داخل داشبورد" title="تحلیل بازار فقط قیمت نیست؛ پشت قیمت هم بررسی می‌شود." /><ul className="mt-6 grid gap-3 sm:grid-cols-2">{dashboardLayers.map((item) => <li key={item} className="flex gap-2 text-sm leading-7 text-muted-foreground"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" />{item}</li>)}</ul></div><div className="rounded-md border bg-card p-5"><div className="flex items-center gap-3"><Radar className="h-6 w-6 text-accent" /><h3 className="text-lg font-black">قطب‌نمای رژیم بازار رمزارز</h3></div><p className="mt-4 text-sm leading-8 text-muted-foreground">بازار فقط بالا یا پایین نمی‌رود. ممکن است صعودی اما شکننده، خنثی با فشار منفی، نقدینگی‌محور، مشتقات‌زده، خبری یا در حال تغییر فاز باشد.</p><div className="mt-5 grid grid-cols-2 gap-2 text-xs">{["ریسک‌پذیر","ریسک‌گریز","نقدینگی ضعیف","حرکت شکننده","اهرم داغ","داده ناکافی"].map(item => <span key={item} className="rounded-md border bg-background px-3 py-2 text-center">{item}</span>)}</div></div></div></section>

      <section className="border-y bg-card/25 py-16"><div className="mx-auto grid max-w-7xl gap-10 px-4 md:grid-cols-2 md:px-6"><SectionHeading eyebrow="مزیت برای کاربر فارسی‌زبان" title="دیدن بازار جهانی با تصویر کامل‌تر و فاصله اطلاعاتی کمتر." copy="CMIP پراکندگی منابع، زبان تخصصی، ترجمه‌های ناقص و شایعات محلی را با یک مسیر منظم تحلیلی جایگزین می‌کند؛ بدون ادعای دسترسی کامل به داده‌ای که واقعاً موجود نیست." /><div className="grid gap-3 sm:grid-cols-2">{["خبر معتبر را از شایعه جدا کنید","تفاوت نوسان کوتاه و روند را ببینید","اثر اخبار جهانی را بهتر بفهمید","سطح اطمینان و داده ناقص را ببینید"].map(item => <div key={item} className="flex items-center gap-3 rounded-md border bg-background p-4 text-sm"><Sparkles className="h-4 w-4 text-primary" />{item}</div>)}</div></div></section>

      <section className="py-16"><div className="mx-auto max-w-7xl px-4 md:px-6"><SectionHeading eyebrow="فهرست پایش" title="تحلیل جهانی با تمرکز روی دارایی‌های پرکاربرد و پرمخاطب برای بازار ایران." /><div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-5">{assets.map(asset => <div key={asset} className="rounded-md border bg-card p-4 text-center"><div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full border border-primary/35 bg-primary/10 text-xs font-black text-primary">{asset.slice(0,2)}</div><div className="mt-2 text-sm font-black">{asset}</div></div>)}</div></div></section>

      <section className="border-y bg-card/25 py-16"><div className="mx-auto max-w-7xl px-4 md:px-6"><SectionHeading eyebrow="نمونه زبان محصول" title="CMIP توضیح می‌دهد چرا وضعیت فعلی برای بازار مهم است." /><blockquote className="mt-7 max-w-4xl border-r-4 border-accent pr-5 text-base leading-9 text-foreground md:text-lg">بازار امروز فقط با سبز یا قرمز بودن قیمت‌ها قابل قضاوت نیست. اگر رشد بیت‌کوین با ورود نقدینگی، جریان ETF و کاهش فشار مشتقات همراه نباشد، حرکت می‌تواند شکننده بماند.</blockquote><div className="mt-6"><CTA href="/sample-dashboard">مشاهده نمونه داشبورد تحلیلی</CTA></div></div></section>

      <section className="py-16"><div className="mx-auto grid max-w-7xl gap-8 px-4 lg:grid-cols-[1.1fr_0.9fr] md:px-6"><div><SectionHeading eyebrow="یک آبونمان" title="یک دسترسی کامل؛ تمام داشبورد تحلیلی CMIP." copy="محصول به چند نسخه ناقص تقسیم نشده است. با فعال‌سازی حساب، به هسته کامل تحلیل بازار، ۱۰ دارایی، نقدینگی، ETF، مشتقات، کلان، احساسات، سناریوها و آرشیو دسترسی دارید." /><p className="mt-5 font-bold text-accent">یک آبونمان، یک داشبورد کامل، یک قطب‌نمای تحلیلی.</p></div><div className="rounded-md border border-primary/35 bg-primary/5 p-6"><h3 className="text-xl font-black">دسترسی کامل CMIP</h3><ul className="mt-5 space-y-3 text-sm text-muted-foreground">{["داشبورد کامل وضعیت بازار","تحلیل ۱۰ دارایی منتخب","سناریوهای ۷ و ۳۰ روزه","سطح ریسک و اطمینان","شفافیت درباره داده محدود","آرشیو داشبوردهای قبلی"].map(item => <li key={item} className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-primary" />{item}</li>)}</ul><div className="mt-6"><CTA href="/register">فعال‌سازی دسترسی کامل CMIP</CTA></div></div></div></section>

      <section className="border-y bg-card/25 py-16"><div className="mx-auto grid max-w-7xl gap-10 px-4 md:grid-cols-2 md:px-6"><SectionHeading eyebrow="شفافیت و اعتماد" title="واقعیت بازار زیباتر از چیزی که هست نمایش داده نمی‌شود." copy="منابع جهانی، کنترل تازگی، نمایش داده ناقص، سطح اطمینان و افشای ریسک بخشی از محصول‌اند. اگر داده کافی نباشد، داشبورد باید صادقانه آن را بگوید." /><div className="rounded-md border bg-background p-5"><ShieldCheck className="h-7 w-7 text-primary" /><h3 className="mt-4 text-lg font-black">ابزار فهم بازار، نه دستگاه وعده سود</h3><p className="mt-3 text-sm leading-8 text-muted-foreground">CMIP تصمیم‌گیری را جایگزین نمی‌کند و سود، پیش‌بینی یا معامله بدون ریسک را تضمین نمی‌کند.</p></div></div></section>

      <section className="py-16"><div className="mx-auto max-w-5xl px-4 md:px-6"><SectionHeading eyebrow="پرسش‌های متداول" title="پیش از فعال‌سازی دسترسی" /><div className="mt-7 divide-y rounded-md border bg-card">{faqs.map(([q,a]) => <details key={q} className="group p-4"><summary className="cursor-pointer list-none text-sm font-black">{q}</summary><p className="mt-3 text-sm leading-8 text-muted-foreground">{a}</p></details>)}</div></div></section>

      <section className="border-t bg-[#0b121d] py-16"><div className="mx-auto max-w-4xl px-4 text-center md:px-6"><Waves className="mx-auto h-8 w-8 text-primary" /><h2 className="mt-5 text-2xl font-black leading-[1.7] md:text-4xl">تحلیل بازار جهانی کریپتو را با اطلاعات پراکنده دنبال نکنید.</h2><p className="mx-auto mt-4 max-w-2xl text-sm leading-8 text-muted-foreground">یک داشبورد تحلیلی فارسی برای دیدن داده‌های مهم، سناریوهای محتمل و کیفیت واقعی حرکت بازار.</p><div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row"><CTA href="/register">فعال‌سازی دسترسی کامل CMIP</CTA><CTA href="/sample-dashboard" secondary>مشاهده نمونه داشبورد تحلیلی</CTA></div><p className="mt-6 text-xs text-muted-foreground">CMIP ابزار تحلیل بازار است، نه تضمین سود. مسئولیت نهایی هر تصمیم مالی با کاربر است.</p></div></section>
    </main>
  );
}
