import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BarChart3, CircleGauge, ShieldAlert, Waves } from "lucide-react";

export const metadata = { title: "نمونه داشبورد تحلیلی | CMIP" };

export default function SampleDashboardPage() {
  return (
    <main className="min-h-screen bg-background terminal-grid" dir="rtl">
      <header className="border-b bg-background/95"><div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4"><Link href="/"><Image src="/cmip-logo.jpg" alt="CMIP" width={128} height={63} className="h-11 w-auto object-contain invert mix-blend-screen" /></Link><Link href="/register" className="rounded-md bg-primary px-4 py-2 text-xs font-bold text-primary-foreground">دسترسی کامل CMIP</Link></div></header>
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-8">
        <Link href="/" className="inline-flex items-center gap-2 text-xs text-muted-foreground"><ArrowRight className="h-4 w-4" />بازگشت به صفحه اصلی</Link>
        <section><div className="text-xs font-bold text-primary">نمونه عمومی</div><h1 className="mt-2 text-2xl font-black leading-10">نمونه ساختار داشبورد تحلیلی CMIP</h1><p className="mt-3 max-w-3xl text-sm leading-8 text-muted-foreground">این صفحه فقط زبان و ساختار محصول را نشان می‌دهد و شامل داده زنده یا جزئیات کامل موتور نیست.</p></section>
        <section className="grid gap-3 md:grid-cols-4">{[[CircleGauge,"رژیم بازار","خنثی / در حال تغییر","نمونه ساختاری"],[Waves,"نقدینگی","نیازمند تأیید چند لایه","بدون عدد زنده"],[ShieldAlert,"ریسک","نمایش همراه با دلیل","بدون سیگنال"],[BarChart3,"اعتماد تحلیل","بر پایه پوشش داده","شفاف و محدود"]].map(([Icon,label,value,note]) => { const Component=Icon as typeof Waves; return <article key={String(label)} className="rounded-md border bg-card p-4"><Component className="h-5 w-5 text-primary" /><div className="mt-4 text-xs text-muted-foreground">{String(label)}</div><div className="mt-2 text-base font-black">{String(value)}</div><div className="mt-2 text-[11px] text-muted-foreground">{String(note)}</div></article>; })}</section>
        <section className="rounded-md border bg-card p-5"><h2 className="text-lg font-black">نمونه روایت بازار</h2><p className="mt-3 text-sm leading-8 text-muted-foreground">حرکت روزانه قیمت به‌تنهایی برای تعیین وضعیت بازار کافی نیست. CMIP بررسی می‌کند آیا نقدینگی، ETF، مشتقات و شرایط کلان همان حرکت را تأیید می‌کنند یا نه؛ اگر داده‌ها هم‌جهت نباشند، نتیجه با سطح اعتماد محدود نمایش داده می‌شود.</p></section>
        <section className="grid gap-3 rounded-md border bg-card p-4 sm:grid-cols-3"><div className="rounded-md border bg-background p-4"><div className="text-xs text-muted-foreground">روایت بازار</div><div className="mt-2 text-sm font-black">جهت بازار فقط با قیمت روز تعیین نمی‌شود</div><p className="mt-2 text-xs leading-6 text-muted-foreground">نقدینگی، ETF و شرایط کلان باید حرکت را تأیید کنند.</p></div><div className="rounded-md border bg-background p-4"><div className="text-xs text-muted-foreground">کیفیت داده</div><div className="mt-2 text-sm font-black">داده ناقص پنهان نمی‌شود</div><p className="mt-2 text-xs leading-6 text-muted-foreground">هر لایه همراه با پوشش، تازگی و محدودیت نمایش داده می‌شود.</p></div><div className="rounded-md border bg-background p-4"><div className="text-xs text-muted-foreground">برای رصد بعدی</div><div className="mt-2 text-sm font-black">محرک‌های قابل پیگیری</div><p className="mt-2 text-xs leading-6 text-muted-foreground">قدرت دلار، بازده اوراق، جریان ETF و نقدینگی استیبل‌کوین.</p></div></section>
        <section className="flex flex-col items-start justify-between gap-4 rounded-md border border-primary/30 bg-primary/5 p-5 sm:flex-row sm:items-center"><div><h2 className="font-black">برای داده زنده و لایه‌های کامل آماده‌اید؟</h2><p className="mt-1 text-xs text-muted-foreground">فعال‌سازی پس از ثبت‌نام و تأیید دستی انجام می‌شود.</p></div><Link href="/register" className="rounded-md bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground">فعال‌سازی دسترسی کامل</Link></section>
      </div>
    </main>
  );
}
