import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata = { title: "تغییر رمز عبور | CMIP" };

export default function ResetPasswordPage() {
  return <AuthPageShell title="تنظیم رمز عبور جدید" description="پس از اعتبارسنجی لینک، رمز تازه را برای حساب CMIP ثبت کنید."><ResetPasswordForm /></AuthPageShell>;
}
