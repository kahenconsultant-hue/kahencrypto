import { ForgotPasswordForm } from "@/components/auth/AuthForms";
import { AuthPageShell } from "@/components/auth/AuthPageShell";

export const metadata = { title: "بازیابی رمز عبور | CMIP" };

export default function ForgotPasswordPage() {
  return <AuthPageShell title="بازیابی رمز عبور" description="ایمیل حساب را وارد کنید تا لینک امن تغییر رمز برای شما ارسال شود."><ForgotPasswordForm /></AuthPageShell>;
}
