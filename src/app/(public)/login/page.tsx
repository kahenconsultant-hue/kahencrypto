import { LoginForm } from "@/components/auth/AuthForms";
import { AuthPageShell } from "@/components/auth/AuthPageShell";

export const metadata = { title: "ورود | CMIP" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const params = await searchParams;
  return <AuthPageShell title="ورود به داشبورد CMIP" description="فقط حساب‌های فعال به داشبورد تحلیلی کامل دسترسی دارند.">{params.reset === "success" ? <div className="mb-4 rounded-md border border-emerald-400/30 bg-emerald-400/10 p-3 text-xs leading-6 text-emerald-100">رمز عبور با موفقیت تغییر کرد. اکنون با رمز جدید وارد شوید.</div> : null}<LoginForm /></AuthPageShell>;
}
