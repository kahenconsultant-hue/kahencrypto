import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Compass,
  Eye,
  Globe2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

const assets = ["USDT", "BTC", "ETH", "TRX", "TON", "SOL", "XRP", "DOGE", "BNB", "ADA"];

const marketQuestions = [
  "آیا رشد فعلی بازار با نقدینگی حمایت می‌شود؟",
  "آیا ETFها و جریان سرمایه حرکت بازار را تأیید می‌کنند؟",
  "آیا مشتقات و فاندینگ درباره افزایش ریسک هشدار می‌دهند؟",
  "آیا خبرهای جهانی اثر واقعی دارند یا فقط فضای احساسی ساخته‌اند؟",
  "آیا حرکت ۲۴ ساعته با روند ۷ و ۳۰ روزه هم‌خوانی دارد؟",
  "آیا بازار در حال تغییر رژیم است یا فقط نوسان موقت دارد؟",
];

const dashboardLayers = [
  "قیمت و مومنتوم در افق ۲۴ ساعت، ۷ روز و ۳۰ روز",
  "نقدینگی استیبل‌کوین‌ها و جریان ETF بیت‌کوین و اتریوم",
  "Funding، Open Interest و وضعیت مشتقات در صورت دسترسی معتبر",
  "احساسات بازار و خبرهای جهانی مرتبط با دارایی‌ها",
  "اقتصاد کلان، دلار، بازده اوراق، طلا و شاخص‌های ریسک",
  "سناریوهای محتمل، سطح ریسک، اعتماد تحلیل و محدودیت داده",
];

const subscriptionBenefits = [
  "داشبورد کامل وضعیت بازار جهانی کریپتو به زبان فارسی",
  "تحلیل و اعتبارسنجی خبرها و داده‌های اثرگذار",
  "بررسی ۱۰ رمزارز مهم برای کاربران ایرانی",
  "تحلیل نقدینگی، ETF، مشتقات و احساسات بازار",
  "سناریوهای ۷ و ۳۰ روزه همراه با سطح ریسک و اعتماد",
  "آرشیو داشبوردهای قبلی و دسترسی به گزارش‌های جدید",
];

const faqs = [
  ["آیا CMIP یک منبع خبری فرانسوی است؟", "خیر. CMIP یک سیستم تحلیل بازار کریپتو است که قلب موتور تحلیلی آن در فرانسه فعال است و از منابع معتبر جهانی استفاده می‌کند."],
  ["آیا CMIP فقط خبرها را ترجمه می‌کند؟", "خیر. خبر و داده پیش از ورود به تحلیل از نظر اعتبار، تازگی، ارتباط و اثر احتمالی بررسی می‌شوند."],
  ["آیا CMIP چند پلن مختلف دارد؟", "خیر. CMIP یک آبونمان کامل دارد؛ چون ارزش محصول در دید یکپارچه و چندلایه از بازار است."],
  ["آیا می‌توان قبل از خرید نمونه داشبورد را دید؟", "بله. نمونه عمومی برای آشنایی با ساختار و زبان تحلیل قابل مشاهده است."],
  ["آیا CMIP سیگنال خرید و فروش می‌دهد؟", "خیر. CMIP وضعیت بازار، سناریوها، ریسک‌ها و داده‌های مهم را تحلیل می‌کند و تضمین سود نمی‌دهد."],
  ["CMIP برای چه کسانی مناسب‌تر است؟", "برای کاربران فارسی‌زبانی که می‌خواهند بازار جهانی کریپتو را منظم‌تر و با اتکا به داده‌های قابل بررسی دنبال کنند."],
];

function CTA({ secondary = false, children, href }: { secondary?: boolean; children: React.ReactNode; href: string }) {
  return (
    <Link
      href={href}
      className={secondary
        ? "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[#9a713d] bg-transparent px-5 py-2 text-sm font-bold text-[#ead8bd] transition hover:bg-[#c9954f]/10"
        : "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#c9954f] px-5 py-2 text-sm font-bold text-[#07101c] transition hover:bg-[#dbac68]"}
    >
      {children}
      <ArrowLeft className="h-4 w-4" />
    </Link>
  );
}

function Heading({ eyebrow, title, copy }: { eyebrow: string; title: string; copy?: string }) {
  return (
    <div className="max-w-4xl">
      <div className="text-xs font-bold text-[#c9954f]">{eyebrow}</div>
      <h2 className="mt-3 text-2xl font-black leading-[1.75] text-[#f2ece3] md:text-3xl">{title}</h2>
      {copy ? <p className="mt-4 text-sm leading-8 text-[#aeb8c5] md:text-base md:leading-9">{copy}</p> : null}
    </div>
  );
}

function Visual({ src, alt }: { src: string; alt: string }) {
  return (
    <figure className="overflow-hidden rounded-md border border-[#9a713d]/45 bg-[#020711]">
      <Image src={src} alt={alt} width={1280} height={720} sizes="(max-width: 1280px) 100vw, 1280px" className="h-auto w-full" />
    </figure>
  );
}

function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-sm leading-7 text-[#aeb8c5]">
          <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#c9954f]" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function PublicHomepage() {
  return (
    <main className="min-h-screen bg-[#020711] text-[#f2ece3]" dir="rtl">
      <header className="sticky top-0 z-50 border-b border-[#9a713d]/25 bg-[#020711]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 md:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-3 text-[#d5a45e]">
            <Compass className="h-8 w-8 shrink-0" />
            <div className="leading-none">
              <div className="font-serif text-xl font-bold tracking-wide">CMIP</div>
              <div className="mt-1 hidden text-[9px] text-[#9d8a70] sm:block">Crypto Macro Intelligence Platform</div>
            </div>
          </Link>
          <nav className="flex shrink-0 items-center gap-2">
            <Link href="/login" className="hidden h-9 items-center rounded-md border border-[#9a713d]/40 px-4 text-xs font-bold text-[#ead8bd] hover:bg-[#c9954f]/10 sm:inline-flex">ورود</Link>
            <Link href="/register" className="inline-flex h-9 items-center rounded-md bg-[#c9954f] px-4 text-xs font-bold text-[#07101c]">دسترسی کامل CMIP</Link>
          </nav>
        </div>
      </header>

      <section aria-label="معرفی CMIP" className="border-b border-[#9a713d]/20 bg-[#01050c]">
        <div className="mx-auto max-w-[1440px]">
          <Image
            src="/marketing/cmip-gold-hero.jpg"
            alt="قبل از تصمیم در بازار کریپتو، تحلیل ۳۶۰ درجه‌ای از وضعیت واقعی بازار را در CMIP ببینید"
            width={1280}
            height={720}
            priority
            sizes="100vw"
            className="h-auto w-full"
          />
        </div>
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 px-4 py-7 md:flex-row md:px-6">
          <div className="text-center md:text-right">
            <p className="text-sm font-bold text-[#ead8bd]">قطب‌نمای رژیم بازار رمزارز؛ برای فهم کیفیت حرکت بازار، نه فقط جهت قیمت.</p>
            <p className="mt-2 text-xs leading-6 text-[#788596]">تصاویر صفحه نمای مفهومی محصول‌اند؛ اعداد داخل تصاویر داده زنده نیستند.</p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <CTA href="/sample-dashboard">مشاهده داشبورد امروز بازار</CTA>
            <CTA href="/register" secondary>فعال‌سازی دسترسی کامل</CTA>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <Heading
            eyebrow="مسئله اصلی بازار"
            title="بازار کریپتو پر از اطلاعات است؛ اما همه اطلاعات ارزش تصمیم‌گیری ندارند."
            copy="قیمت، خبر، تحلیل و نظرهای متناقض هر لحظه منتشر می‌شوند. مسئله اصلی کمبود اطلاعات نیست؛ تشخیص داده مهم، خبر اثرگذار، حرکت دارای پشتوانه و نویز کوتاه‌مدت است."
          />
          <div className="mt-10"><Visual src="/marketing/cmip-gold-noise-filter.jpg" alt="فیلتر نویز و اعتبارسنجی اطلاعات بازار در CMIP" /></div>
          <div className="mt-10 grid gap-x-10 gap-y-0 md:grid-cols-2">
            {marketQuestions.map((item) => (
              <div key={item} className="flex items-start gap-3 border-b border-[#9a713d]/20 py-4 text-sm leading-7 text-[#b8c0ca]">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c9954f]" />
                {item}
              </div>
            ))}
          </div>
          <p className="mt-8 border-r-2 border-[#c9954f] pr-4 text-base font-black leading-8 text-[#ead8bd]">مزیت واقعی در بازار، دیدن داده بیشتر نیست؛ فهمیدن داده درست در زمان درست است.</p>
        </div>
      </section>

      <section className="border-y border-[#9a713d]/20 bg-[#050c17] py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <Heading
            eyebrow="CMIP چیست؟"
            title="یک داشبورد تحلیلی برای تشخیص رژیم بازار کریپتو"
            copy="CMIP برای کاربرانی ساخته شده که نمی‌خواهند بازار را فقط با سبز و قرمز قیمت‌ها قضاوت کنند. سیستم تلاش می‌کند قدرت یا شکنندگی حرکت، وضعیت ریسک، هم‌جهتی داده‌ها و سطح اعتماد تحلیل را روشن کند."
          />
          <div className="mt-10"><Visual src="/marketing/cmip-gold-positioning.jpg" alt="منابع جهانی، تحلیل فارسی و اعتبارسنجی داده در CMIP" /></div>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {[
              [Globe2, "منابع معتبر جهانی", "داده‌ها و خبرهای آمریکایی، اروپایی و بین‌المللی در یک مسیر تحلیلی مشترک بررسی می‌شوند."],
              [Sparkles, "تحلیل فارسی قابل فهم", "زبان فنی داده به توضیحی روشن درباره نقدینگی، ریسک و وضعیت دارایی‌ها تبدیل می‌شود."],
              [ShieldCheck, "اعتبارسنجی پیش از تفسیر", "اعتبار، تازگی، ارتباط و اثر احتمالی داده پیش از ورود به سناریوی بازار کنترل می‌شود."],
            ].map(([Icon, title, copy]) => {
              const Component = Icon as typeof Globe2;
              return (
                <article key={String(title)} className="border-t border-[#9a713d]/35 pt-5">
                  <Component className="h-6 w-6 text-[#c9954f]" />
                  <h3 className="mt-4 text-lg font-black text-[#f2ece3]">{String(title)}</h3>
                  <p className="mt-3 text-sm leading-8 text-[#9ea9b7]">{String(copy)}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <Heading
            eyebrow="روش کار CMIP"
            title="از داده خام تا تحلیل قابل استفاده؛ در چند مرحله مشخص"
            copy="داده و خبر جمع‌آوری می‌شوند، نویز کنار گذاشته می‌شود، منبع و کیفیت داده بررسی می‌شوند و نتیجه پس از بازارسنجی در یک داشبورد فارسی ارائه می‌شود."
          />
          <div className="mt-10"><Visual src="/marketing/cmip-gold-process.jpg" alt="فرآیند پنج مرحله‌ای تبدیل داده خام به داشبورد فارسی CMIP" /></div>
        </div>
      </section>

      <section className="border-y border-[#9a713d]/20 bg-[#050c17] py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <Heading
            eyebrow="داخل داشبورد"
            title="تحلیل بازار فقط قیمت نیست؛ CMIP پشت قیمت را هم بررسی می‌کند."
            copy="بازار مانند یک سیستم چندلایه دیده می‌شود. هر نتیجه باید با داده‌های مرتبط، کیفیت منبع و محدودیت‌های موجود همراه باشد."
          />
          <div className="mt-8"><CheckList items={dashboardLayers} /></div>
          <div className="mt-12 border-t border-[#9a713d]/25 pt-10">
            <h3 className="text-xl font-black text-[#ead8bd]">فهرست پایش دارایی‌های پرکاربرد و پرمخاطب برای بازار ایران</h3>
            <p className="mt-3 text-sm leading-7 text-[#8f9bab]">این فهرست به معنی ادعای دسترسی به حجم معاملات صرافی‌های ایرانی نیست.</p>
            <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {assets.map((asset) => <div key={asset} className="rounded-md border border-[#9a713d]/30 bg-[#020711] px-3 py-3 text-center font-serif text-sm font-bold text-[#e0bc83]">{asset}</div>)}
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <Heading
            eyebrow="مزیت برای کاربر ایرانی"
            title="تحلیل جهانی، داشبورد فارسی، با فاصله اطلاعاتی کمتر"
            copy="CMIP پراکندگی منابع، زبان تخصصی، ترجمه‌های ناقص و شایعات محلی را با یک مسیر منظم تحلیلی جایگزین می‌کند. هدف این است که خبر معتبر، روند واقعی، عوامل تأییدکننده و محدودیت‌های داده یک‌جا دیده شوند."
          />
          <div className="mt-9"><CheckList items={["خبر معتبر را از شایعه جدا کنید", "اثر اخبار جهانی را بهتر بفهمید", "تفاوت نوسان کوتاه و روند را بررسی کنید", "سطح اعتماد و داده ناقص را ببینید"]} /></div>
          <p className="mt-10 border-r-2 border-[#c9954f] pr-4 text-sm font-bold leading-8 text-[#d7c4a8]">CMIP واقعیت بازار را بهتر از چیزی که داده‌ها اجازه می‌دهند نشان نمی‌دهد. اگر داده کافی نباشد، داشبورد باید صادقانه آن را مشخص کند.</p>
        </div>
      </section>

      <section className="border-y border-[#9a713d]/20 bg-[#050c17] py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <Heading
            eyebrow="آبونمان CMIP"
            title="یک دسترسی کامل؛ تمام داشبورد تحلیلی CMIP در یک آبونمان"
            copy="محصول به نسخه‌های ناقص تقسیم نشده است. با فعال‌سازی آبونمان، به هسته کامل تحلیل بازار و آرشیو داشبوردها دسترسی دارید."
          />
          <div className="mt-10"><Visual src="/marketing/cmip-gold-membership.jpg" alt="عضویت حرفه‌ای و دسترسی امن به داشبورد CMIP" /></div>
          <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <CheckList items={subscriptionBenefits} />
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <CTA href="/register">فعال‌سازی دسترسی کامل CMIP</CTA>
              <CTA href="/sample-dashboard" secondary>مشاهده نمونه داشبورد</CTA>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-5xl px-4 md:px-6">
          <div className="flex items-center gap-3 text-[#c9954f]"><Eye className="h-6 w-6" /><span className="text-xs font-bold">پیش از فعال‌سازی دسترسی</span></div>
          <h2 className="mt-4 text-2xl font-black leading-[1.75] md:text-3xl">اول نمونه داشبورد تحلیلی را ببینید.</h2>
          <p className="mt-4 text-sm leading-8 text-[#aeb8c5] md:text-base">نمونه داشبورد نشان می‌دهد CMIP چگونه داده‌های جهانی، خبرهای معتبر و شاخص‌های بازار را به یک تحلیل فارسی قابل فهم تبدیل می‌کند.</p>
          <div className="mt-7"><CTA href="/sample-dashboard">مشاهده نمونه داشبورد تحلیلی</CTA></div>
        </div>
      </section>

      <section className="border-y border-[#9a713d]/20 bg-[#050c17] py-16 md:py-24">
        <div className="mx-auto max-w-5xl px-4 md:px-6">
          <Heading eyebrow="پرسش‌های متداول" title="پاسخ کوتاه به پرسش‌های اصلی" />
          <div className="mt-8 divide-y divide-[#9a713d]/20 border-y border-[#9a713d]/30">
            {faqs.map(([question, answer]) => (
              <details key={question} className="group py-5">
                <summary className="cursor-pointer list-none text-sm font-black leading-7 text-[#ead8bd]">{question}</summary>
                <p className="mt-3 max-w-4xl text-sm leading-8 text-[#9ea9b7]">{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 md:py-28">
        <div className="mx-auto max-w-4xl px-4 text-center md:px-6">
          <Compass className="mx-auto h-9 w-9 text-[#c9954f]" />
          <h2 className="mt-5 text-2xl font-black leading-[1.75] text-[#f2ece3] md:text-4xl">تحلیل بازار جهانی کریپتو را با داده‌های پراکنده دنبال نکنید.</h2>
          <p className="mx-auto mt-5 max-w-3xl text-sm leading-8 text-[#aeb8c5] md:text-base">نه شایعه، نه سیگنال کور و نه ترجمه خام خبر؛ یک داشبورد فارسی برای فهم منظم‌تر کیفیت حرکت بازار.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"><CTA href="/register">فعال‌سازی دسترسی کامل CMIP</CTA><CTA href="/sample-dashboard" secondary>مشاهده نمونه داشبورد</CTA></div>
          <p className="mt-7 text-xs leading-6 text-[#6f7b8b]">CMIP ابزار تحلیل بازار است و سیگنال خرید و فروش، توصیه مالی یا تضمین سود ارائه نمی‌دهد.</p>
        </div>
      </section>
    </main>
  );
}
