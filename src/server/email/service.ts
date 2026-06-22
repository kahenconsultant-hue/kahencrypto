import "server-only";

import { ADMIN_EMAIL_DEFAULT } from "@/lib/auth/constants";
import type { CustomerAccount } from "@/server/auth/types";
import { createSupabaseServiceRoleClient } from "@/server/supabase/auth-client";

type EmailRequest = {
  userId?: string | null;
  to: string;
  subject: string;
  templateKey: string;
  html: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] ?? char);
}

async function logEmail(request: EmailRequest, status: "sent" | "failed" | "skipped_not_configured", error?: string) {
  const service = createSupabaseServiceRoleClient();
  if (!service) return;
  await service.from("email_logs").insert({
    user_id: request.userId ?? null,
    recipient_email: request.to,
    subject: request.subject,
    template_key: request.templateKey,
    status,
    sent_at: status === "sent" ? new Date().toISOString() : null,
    error: error ?? null,
  });
}

export async function sendEmail(request: EmailRequest) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    await logEmail(request, "skipped_not_configured", "RESEND_API_KEY or EMAIL_FROM is missing");
    return { sent: false, reason: "not_configured" as const };
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [request.to], subject: request.subject, html: request.html }),
    });
    if (!response.ok) throw new Error(`Resend HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    await logEmail(request, "sent");
    return { sent: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logEmail(request, "failed", message);
    return { sent: false, reason: message };
  }
}

export async function sendRegistrationEmails(account: CustomerAccount) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://kahencrypto.vercel.app";
  const adminEmail = process.env.ADMIN_EMAIL ?? ADMIN_EMAIL_DEFAULT;
  const name = escapeHtml(account.fullName);
  const contact = escapeHtml(account.phoneOrTelegram ?? "ثبت نشده");
  await Promise.allSettled([
    sendEmail({
      userId: account.id,
      to: adminEmail,
      subject: "ثبت‌نام جدید در CMIP",
      templateKey: "admin_new_registration",
      html: `<div dir="rtl" style="font-family:Vazirmatn,Tahoma,Arial,sans-serif;font-weight:600"><h2>ثبت‌نام جدید در CMIP</h2><p>نام: ${name}</p><p>ایمیل: ${escapeHtml(account.email)}</p><p>تلفن/تلگرام: ${contact}</p><p>وضعیت: PENDING_PAYMENT</p><p>زمان: ${escapeHtml(account.createdAt)}</p><p><a href="${appUrl}/admin/users/${account.id}">مشاهده حساب در پنل ادمین</a></p><p>اطلاعات پرداخت باید طبق فرایند دستی ارسال شود.</p></div>`,
    }),
    sendEmail({
      userId: account.id,
      to: account.email,
      subject: "ثبت‌نام شما در CMIP دریافت شد",
      templateKey: "customer_registration_received",
      html: `<div dir="rtl" style="font-family:Vazirmatn,Tahoma,Arial,sans-serif;font-weight:600"><p>سلام ${name}،</p><p>ثبت‌نام شما برای دسترسی کامل به داشبورد تحلیلی CMIP دریافت شد.</p><p>اطلاعات پرداخت از طریق ایمیل برای شما ارسال خواهد شد. پس از انجام پرداخت و تأیید ادمین، دسترسی کامل فعال می‌شود.</p><p>CMIP ابزار تحلیل بازار است و سیگنال خرید و فروش یا تضمین سود ارائه نمی‌دهد.</p><p>با احترام،<br/>تیم CMIP</p></div>`,
    }),
  ]);
}

export async function sendActivationEmail(account: CustomerAccount) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://kahencrypto.vercel.app";
  await sendEmail({
    userId: account.id,
    to: account.email,
    subject: "دسترسی کامل CMIP برای شما فعال شد",
    templateKey: "customer_access_activated",
    html: `<div dir="rtl" style="font-family:Vazirmatn,Tahoma,Arial,sans-serif;font-weight:600"><p>سلام ${escapeHtml(account.fullName)}،</p><p>دسترسی کامل شما به داشبورد تحلیلی CMIP فعال شد.</p><p><a href="${appUrl}/login">ورود به حساب کاربری</a></p><p>با احترام،<br/>تیم CMIP</p></div>`,
  });
}
