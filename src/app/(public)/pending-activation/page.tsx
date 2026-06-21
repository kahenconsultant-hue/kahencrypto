import { Clock3 } from "lucide-react";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { logoutAction } from "@/app/(public)/auth-actions";

export default function PendingActivationPage() {
  return (
    <AuthPageShell title="در انتظار فعال‌سازی" description="ثبت‌نام شما دریافت شده و وضعیت حساب هنوز نهایی نشده است.">
      <div className="rounded-md border border-amber-400/25 bg-amber-400/8 p-4 text-sm leading-8 text-muted-foreground"><Clock3 className="mb-3 h-7 w-7 text-amber-300" /><p>اطلاعات پرداخت از طریق ایمیل برای شما ارسال می‌شود. پس از تأیید پرداخت، دسترسی کامل CMIP توسط ادمین فعال خواهد شد.</p></div>
      <form action={logoutAction} className="mt-5"><button className="h-10 w-full rounded-md border text-xs font-bold hover:bg-muted">خروج از حساب</button></form>
    </AuthPageShell>
  );
}

