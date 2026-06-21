import { RegisterForm } from "@/components/auth/AuthForms";
import { AuthPageShell } from "@/components/auth/AuthPageShell";

export const metadata = { title: "ثبت‌نام | CMIP" };

export default function RegisterPage() {
  return <AuthPageShell title="فعال‌سازی دسترسی کامل CMIP" description="ثبت‌نام را تکمیل کنید. اطلاعات پرداخت از طریق ایمیل ارسال می‌شود و دسترسی پس از تأیید دستی ادمین فعال خواهد شد."><RegisterForm /></AuthPageShell>;
}

