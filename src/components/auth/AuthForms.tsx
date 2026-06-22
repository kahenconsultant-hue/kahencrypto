"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { LoaderCircle, LockKeyhole, Mail, UserRound } from "lucide-react";
import { forgotPasswordAction, loginAction, registerAction, type AuthActionState } from "@/app/(public)/auth-actions";

const initialState: AuthActionState = { message: "" };
const inputClass = "h-11 w-full rounded-md border border-[#2f3d58] bg-[#0d1522] px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";

function FieldError({ errors }: { errors?: string[] }) {
  return errors?.length ? <p className="mt-1 text-xs text-red-300">{errors[0]}</p> : null;
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60">
      {pending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : null}
      {pending ? "در حال ثبت..." : label}
    </button>
  );
}

export function RegisterForm() {
  const [state, action] = useActionState(registerAction, initialState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <label className="block text-sm"><span className="mb-1.5 flex items-center gap-2 text-muted-foreground"><UserRound className="h-4 w-4" />نام و نام خانوادگی</span><input name="fullName" autoComplete="name" className={inputClass} required /><FieldError errors={state.fieldErrors?.fullName} /></label>
      <label className="block text-sm"><span className="mb-1.5 flex items-center gap-2 text-muted-foreground"><Mail className="h-4 w-4" />ایمیل</span><input name="email" type="email" autoComplete="email" dir="ltr" className={inputClass} required /><FieldError errors={state.fieldErrors?.email} /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm"><span className="mb-1.5 flex items-center gap-2 text-muted-foreground"><LockKeyhole className="h-4 w-4" />رمز عبور</span><input name="password" type="password" autoComplete="new-password" dir="ltr" className={inputClass} required /><FieldError errors={state.fieldErrors?.password} /></label>
        <label className="block text-sm"><span className="mb-1.5 text-muted-foreground">تکرار رمز عبور</span><input name="confirmPassword" type="password" autoComplete="new-password" dir="ltr" className={inputClass} required /><FieldError errors={state.fieldErrors?.confirmPassword} /></label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm"><span className="mb-1.5 text-muted-foreground">تلفن یا شناسه تلگرام (اختیاری)</span><input name="phoneOrTelegram" className={inputClass} /></label>
        <label className="block text-sm"><span className="mb-1.5 text-muted-foreground">کشور (اختیاری)</span><input name="country" className={inputClass} /></label>
      </div>
      <label className="flex items-start gap-3 rounded-md border bg-secondary/25 p-3 text-xs leading-6 text-muted-foreground"><input name="consent" type="checkbox" className="mt-1 h-4 w-4 accent-primary" required /><span>تأیید می‌کنم CMIP ابزار تحلیل بازار است و سیگنال خرید و فروش یا تضمین سود ارائه نمی‌دهد.</span></label>
      <label className="flex items-start gap-3 rounded-md border bg-secondary/25 p-3 text-xs leading-6 text-muted-foreground"><input name="terms" type="checkbox" className="mt-1 h-4 w-4 accent-primary" required /><span>قوانین و شرایط استفاده را می‌پذیرم.</span></label>
      {state.message ? <div role="alert" className="rounded-md border border-red-400/30 bg-red-400/10 p-3 text-xs leading-6 text-red-200">{state.message}</div> : null}
      <SubmitButton label="ثبت درخواست دسترسی کامل" />
      <p className="text-center text-xs text-muted-foreground">حساب دارید؟ <Link href="/login" className="font-bold text-primary">وارد شوید</Link></p>
    </form>
  );
}

export function LoginForm() {
  const [state, action] = useActionState(loginAction, initialState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <label className="block text-sm"><span className="mb-1.5 flex items-center gap-2 text-muted-foreground"><Mail className="h-4 w-4" />ایمیل</span><input name="email" type="email" autoComplete="email" dir="ltr" className={inputClass} required /><FieldError errors={state.fieldErrors?.email} /></label>
      <label className="block text-sm"><span className="mb-1.5 flex items-center gap-2 text-muted-foreground"><LockKeyhole className="h-4 w-4" />رمز عبور</span><input name="password" type="password" autoComplete="current-password" dir="ltr" className={inputClass} required /><FieldError errors={state.fieldErrors?.password} /></label>
      <div className="text-left"><Link href="/forgot-password" className="text-xs font-bold text-primary hover:underline">رمز عبور را فراموش کرده‌اید؟</Link></div>
      {state.message ? <div role="alert" className="rounded-md border border-red-400/30 bg-red-400/10 p-3 text-xs leading-6 text-red-200">{state.message}</div> : null}
      <SubmitButton label="ورود به CMIP" />
      <p className="text-center text-xs text-muted-foreground">هنوز ثبت‌نام نکرده‌اید؟ <Link href="/register" className="font-bold text-primary">درخواست دسترسی</Link></p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(forgotPasswordAction, initialState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <label className="block text-sm"><span className="mb-1.5 flex items-center gap-2 text-muted-foreground"><Mail className="h-4 w-4" />ایمیل حساب</span><input name="email" type="email" autoComplete="email" dir="ltr" className={inputClass} required /><FieldError errors={state.fieldErrors?.email} /></label>
      {state.message ? <div role="status" className={state.success ? "rounded-md border border-emerald-400/30 bg-emerald-400/10 p-3 text-xs leading-6 text-emerald-100" : "rounded-md border border-red-400/30 bg-red-400/10 p-3 text-xs leading-6 text-red-200"}>{state.message}</div> : null}
      <SubmitButton label="ارسال لینک تغییر رمز" />
      <p className="text-center text-xs text-muted-foreground"><Link href="/login" className="font-bold text-primary">بازگشت به ورود</Link></p>
    </form>
  );
}
