import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { AuthPageShell } from "@/components/auth/AuthPageShell";

export default function ThankYouPage() {
  return (
    <AuthPageShell title="ثبت‌نام شما با موفقیت دریافت شد" description="از درخواست شما برای دسترسی کامل CMIP متشکریم.">
      <div className="rounded-md border border-emerald-400/25 bg-emerald-400/8 p-4 text-sm leading-8 text-muted-foreground">
        <CheckCircle2 className="mb-3 h-7 w-7 text-emerald-300" />
        <p>فعال‌سازی دسترسی در حال حاضر به‌صورت دستی انجام می‌شود. اطلاعات پرداخت از طریق ایمیل برای شما ارسال خواهد شد.</p>
        <p className="mt-2">پس از انجام پرداخت و تأیید آن، حساب شما توسط ادمین فعال می‌شود. تا آن زمان دسترسی به داشبورد تحلیلی محدود خواهد بود.</p>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2"><Link href="/" className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-xs font-bold hover:bg-muted">بازگشت به صفحه اصلی</Link><Link href="/login" className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-xs font-bold text-primary-foreground">ورود به حساب</Link></div>
    </AuthPageShell>
  );
}

