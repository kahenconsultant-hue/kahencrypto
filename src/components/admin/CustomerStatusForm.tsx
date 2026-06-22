"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { LoaderCircle, Save } from "lucide-react";
import { updateCustomerStatusAction, type CustomerStatusActionState } from "@/app/admin/users/actions";
import { CUSTOMER_STATUSES, customerStatusFa, type CustomerStatus } from "@/server/auth/types";
import { cn } from "@/lib/utils";

const initialState: CustomerStatusActionState = { ok: false, message: "" };

function SaveButton({ compact, disabled }: { compact: boolean; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={disabled || pending} className={cn("inline-flex items-center justify-center gap-1.5 rounded-md bg-primary font-bold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45", compact ? "h-9 px-3 text-[11px]" : "h-10 w-full px-4 text-xs")}>
      {pending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Save className="h-3.5 w-3.5" aria-hidden />}
      {pending ? "در حال ذخیره" : "ذخیره وضعیت"}
    </button>
  );
}

export function CustomerStatusForm({ userId, currentStatus, isAdmin = false, compact = false }: { userId: string; currentStatus: CustomerStatus; isAdmin?: boolean; compact?: boolean }) {
  const [state, action] = useActionState(updateCustomerStatusAction, initialState);
  return (
    <form action={action} className={cn("space-y-2", compact && "min-w-[250px]")}>
      <input type="hidden" name="userId" value={userId} />
      <div className={cn("grid gap-2", compact && "grid-cols-[1fr_auto]")}>
        <select name="status" defaultValue={currentStatus} disabled={isAdmin} aria-label="وضعیت دسترسی کاربر" className="h-9 min-w-0 rounded-md border bg-background px-2 text-xs outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-55">
          {CUSTOMER_STATUSES.map((status) => <option key={status} value={status}>{customerStatusFa(status)}</option>)}
        </select>
        <SaveButton compact={compact} disabled={isAdmin} />
      </div>
      {isAdmin ? <p className="text-[10px] leading-5 text-muted-foreground">حساب مدیر از این کنترل مستثناست.</p> : null}
      {state.message ? <p role="status" className={cn("text-[10px] leading-5", state.ok ? "text-emerald-300" : "text-red-300")}>{state.message}</p> : null}
    </form>
  );
}
