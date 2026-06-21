import { LoginForm } from "@/components/auth/AuthForms";
import { AuthPageShell } from "@/components/auth/AuthPageShell";

export const metadata = { title: "ورود | CMIP" };

export default function LoginPage() {
  return <AuthPageShell title="ورود به داشبورد CMIP" description="فقط حساب‌های فعال به داشبورد تحلیلی کامل دسترسی دارند."><LoginForm /></AuthPageShell>;
}

