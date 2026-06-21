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

export async function updateCustomerAccessAction(formData: FormData) {
  await requireAdminAccount();
  const parsed = updateSchema.parse({
    userId: formData.get("userId"),
    status: formData.get("status"),
    adminNotes: formData.get("adminNotes") ?? "",
  });
  const service = createSupabaseServiceRoleClient();
  if (!service) throw new Error("Supabase service role configured نیست.");
  const previous = await getCustomerAccountById(parsed.userId);
  if (!previous) throw new Error("حساب مشتری پیدا نشد.");
  const now = new Date().toISOString();
  const { error } = await service
    .from("users")
    .update({
      status: parsed.status,
      admin_notes: parsed.adminNotes || null,
      activated_at: parsed.status === "ACTIVE" ? previous.activatedAt ?? now : previous.activatedAt,
      suspended_at: parsed.status === "SUSPENDED" ? now : null,
      updated_at: now,
    })
    .eq("id", parsed.userId);
  if (error) throw new Error(`بروزرسانی حساب ناموفق بود: ${error.message}`);
  if (parsed.status === "ACTIVE" && previous.status !== "ACTIVE") {
    const activated = await getCustomerAccountById(parsed.userId);
    if (activated) await sendActivationEmail(activated);
  }
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${parsed.userId}`);
}

