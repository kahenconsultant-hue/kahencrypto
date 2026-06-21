"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { accountFromRow } from "@/server/auth/types";
import { clearSessionCookies, setSessionCookies } from "@/server/auth/session";
import { sendRegistrationEmails } from "@/server/email/service";
import { createSupabaseAnonServerClient, createSupabaseServiceRoleClient } from "@/server/supabase/auth-client";

export type AuthActionState = {
  message: string;
  fieldErrors?: Record<string, string[]>;
};

const passwordSchema = z
  .string()
  .min(8, "رمز عبور باید حداقل ۸ نویسه باشد.")
  .regex(/[a-z]/, "رمز عبور باید حداقل یک حرف کوچک انگلیسی داشته باشد.")
  .regex(/[A-Z]/, "رمز عبور باید حداقل یک حرف بزرگ انگلیسی داشته باشد.")
  .regex(/[0-9]/, "رمز عبور باید حداقل یک عدد داشته باشد.");

const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, "نام و نام خانوادگی الزامی است.").max(120),
    email: z.string().trim().toLowerCase().email("ایمیل معتبر وارد کنید."),
    password: passwordSchema,
    confirmPassword: z.string(),
    phoneOrTelegram: z.string().trim().max(120).optional(),
    country: z.string().trim().max(80).optional(),
    consent: z.literal("on", { errorMap: () => ({ message: "تأیید ماهیت تحلیلی CMIP الزامی است." }) }),
    terms: z.literal("on", { errorMap: () => ({ message: "پذیرش قوانین استفاده الزامی است." }) }),
  })
  .refine((value) => value.password === value.confirmPassword, { path: ["confirmPassword"], message: "تکرار رمز عبور یکسان نیست." });

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("ایمیل معتبر وارد کنید."),
  password: z.string().min(1, "رمز عبور الزامی است."),
});

function fields(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

export async function registerAction(_previous: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = registerSchema.safeParse(fields(formData));
  if (!parsed.success) return { message: "لطفاً خطاهای فرم را اصلاح کنید.", fieldErrors: parsed.error.flatten().fieldErrors };
  const service = createSupabaseServiceRoleClient();
  if (!service) return { message: "سرویس ثبت‌نام هنوز در محیط production پیکربندی نشده است." };

  const existing = await service.from("users").select("id").ilike("email", parsed.data.email).maybeSingle();
  if (existing.data) return { message: "این ایمیل قبلاً ثبت شده است. از صفحه ورود استفاده کنید." };

  const { data: authData, error: authError } = await service.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.fullName },
  });
  if (authError || !authData.user) {
    const duplicate = /already|registered|exists/i.test(authError?.message ?? "");
    return { message: duplicate ? "این ایمیل قبلاً ثبت شده است." : `ساخت حساب ناموفق بود: ${authError?.message ?? "خطای نامشخص"}` };
  }

  const now = new Date().toISOString();
  const row = {
    id: authData.user.id,
    email: parsed.data.email,
    role: "customer",
    status: "PENDING_PAYMENT",
    full_name: parsed.data.fullName,
    phone_or_telegram: parsed.data.phoneOrTelegram || null,
    country: parsed.data.country || null,
    consent_accepted: true,
    terms_accepted: true,
    created_at: now,
    updated_at: now,
  };
  const { error: userError } = await service.from("users").insert(row);
  if (userError) {
    await service.auth.admin.deleteUser(authData.user.id);
    return { message: `ثبت پروفایل مشتری ناموفق بود: ${userError.message}` };
  }
  await service.from("profiles").upsert({ user_id: authData.user.id, display_name: parsed.data.fullName, locale: "fa-IR", mode: "pro" });
  await sendRegistrationEmails(accountFromRow(row));
  redirect("/thank-you");
}

export async function loginAction(_previous: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse(fields(formData));
  if (!parsed.success) return { message: "اطلاعات ورود را بررسی کنید.", fieldErrors: parsed.error.flatten().fieldErrors };
  const authClient = createSupabaseAnonServerClient();
  const service = createSupabaseServiceRoleClient();
  if (!authClient || !service) return { message: "سرویس ورود پیکربندی نشده است." };
  const { data, error } = await authClient.auth.signInWithPassword(parsed.data);
  if (error || !data.session || !data.user) return { message: "ایمیل یا رمز عبور صحیح نیست." };
  const { data: row, error: accountError } = await service.from("users").select("*").eq("id", data.user.id).maybeSingle();
  if (accountError || !row) return { message: "پروفایل دسترسی این حساب کامل نیست. با پشتیبانی تماس بگیرید." };
  await setSessionCookies(data.session);
  await service.from("users").update({ last_login_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", data.user.id);
  const account = accountFromRow(row as Record<string, unknown>);
  if (account.role === "admin") redirect("/admin");
  if (account.status === "ACTIVE") redirect("/dashboard");
  redirect("/pending-activation");
}

export async function logoutAction() {
  await clearSessionCookies();
  redirect("/login");
}

