"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminAccount } from "@/server/auth/session";
import { CUSTOMER_STATUSES } from "@/server/auth/types";
import { getCustomerAccountById } from "@/server/auth/repository";
import { sendActivationEmail } from "@/server/email/service";
import { createSupabaseServiceRoleClient } from "@/server/supabase/auth-client";

const updateSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum(CUSTOMER_STATUSES),
  adminNotes: z.string().max(4000).optional(),
});

const statusSchema = updateSchema.pick({ userId: true, status: true });

export type CustomerStatusActionState = {
  ok: boolean;
  message: string;
};

async function updateCustomerStatus(userId: string, status: (typeof CUSTOMER_STATUSES)[number], adminNotes?: string) {
  const service = createSupabaseServiceRoleClient();
  if (!service) throw new Error("Supabase service role configured نیست.");
  const previous = await getCustomerAccountById(userId);
  if (!previous) throw new Error("حساب مشتری پیدا نشد.");
  if (previous.role === "admin" && status !== previous.status) throw new Error("وضعیت حساب مدیر از پنل مشتریان قابل تغییر نیست.");
  const now = new Date().toISOString();
  const changes: Record<string, unknown> = {
    status,
    activated_at: status === "ACTIVE" ? previous.activatedAt ?? now : previous.activatedAt,
    suspended_at: status === "SUSPENDED" ? now : null,
    updated_at: now,
  };
  if (adminNotes !== undefined) changes.admin_notes = adminNotes || null;
  const { error } = await service.from("users").update(changes).eq("id", userId);
  if (error) throw new Error(`بروزرسانی حساب ناموفق بود: ${error.message}`);
  if (status === "ACTIVE" && previous.status !== "ACTIVE") {
    const activated = await getCustomerAccountById(userId);
    if (activated) await sendActivationEmail(activated);
  }
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
}

export async function updateCustomerStatusAction(_previous: CustomerStatusActionState, formData: FormData): Promise<CustomerStatusActionState> {
  await requireAdminAccount();
  const parsed = statusSchema.safeParse({ userId: formData.get("userId"), status: formData.get("status") });
  if (!parsed.success) return { ok: false, message: "وضعیت انتخاب‌شده معتبر نیست." };
  try {
    await updateCustomerStatus(parsed.data.userId, parsed.data.status);
    return { ok: true, message: "وضعیت کاربر ذخیره شد." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "تغییر وضعیت ناموفق بود." };
  }
}

export async function updateCustomerAccessAction(formData: FormData) {
  await requireAdminAccount();
  const parsed = updateSchema.parse({
    userId: formData.get("userId"),
    status: formData.get("status"),
    adminNotes: formData.get("adminNotes") ?? "",
  });
  await updateCustomerStatus(parsed.userId, parsed.status, parsed.adminNotes);
}
