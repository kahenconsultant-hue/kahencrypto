import Link from "next/link";
import { Search, UserRoundCog } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { requireAdminAccount } from "@/server/auth/session";
import { getCustomerAccounts } from "@/server/auth/repository";
import { CUSTOMER_STATUSES, type CustomerStatus } from "@/server/auth/types";

function statusFa(status: string) {
  return ({ PENDING_PAYMENT: "در انتظار پرداخت", PAYMENT_SUBMITTED: "پرداخت ثبت‌شده", ACTIVE: "فعال", SUSPENDED: "تعلیق", REJECTED: "ردشده", DISABLED: "غیرفعال" } as Record<string, string>)[status] ?? status;
}

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  await requireAdminAccount();
  const params = await searchParams;
  const status = CUSTOMER_STATUSES.includes(params.status as CustomerStatus) ? (params.status as CustomerStatus) : "ALL";
  const users = await getCustomerAccounts({ search: params.q, status });
  return (
    <div className="space-y-4">
      <section className="rounded-md border bg-card p-4"><div className="flex items-center gap-2"><UserRoundCog className="h-5 w-5 text-primary" /><h1 className="text-lg font-black">مدیریت مشتریان</h1></div><p className="mt-2 text-xs leading-6 text-muted-foreground">فعال‌سازی، تعلیق و یادداشت داخلی فقط از این مسیر server-side انجام می‌شود.</p></section>
      <form className="grid gap-3 rounded-md border bg-card p-3 sm:grid-cols-[1fr_220px_auto]">
        <label className="flex h-10 items-center gap-2 rounded-md border bg-background px-3"><Search className="h-4 w-4 text-muted-foreground" /><input name="q" defaultValue={params.q} placeholder="نام یا ایمیل" className="w-full bg-transparent text-sm outline-none" /></label>
        <select name="status" defaultValue={status} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="ALL">همه وضعیت‌ها</option>{CUSTOMER_STATUSES.map((item) => <option key={item} value={item}>{statusFa(item)}</option>)}</select>
        <button className="h-10 rounded-md bg-primary px-5 text-xs font-bold text-primary-foreground">اعمال فیلتر</button>
      </form>
      <section className="overflow-x-auto rounded-md border bg-card"><table className="w-full min-w-[900px] text-right text-xs"><thead className="border-b bg-secondary/35 text-muted-foreground"><tr><th className="px-3 py-3">نام</th><th className="px-3 py-3">ایمیل</th><th className="px-3 py-3">تماس</th><th className="px-3 py-3">وضعیت</th><th className="px-3 py-3">ثبت‌نام</th><th className="px-3 py-3">آخرین ورود</th><th className="px-3 py-3">عملیات</th></tr></thead><tbody>{users.map((user) => <tr key={user.id} className="border-b last:border-0"><td className="px-3 py-3 font-bold">{user.fullName}</td><td className="px-3 py-3" dir="ltr">{user.email}</td><td className="px-3 py-3">{user.phoneOrTelegram ?? "ثبت نشده"}</td><td className="px-3 py-3"><Badge variant={user.status === "ACTIVE" ? "success" : user.status === "SUSPENDED" ? "danger" : "warning"}>{statusFa(user.status)}</Badge></td><td className="px-3 py-3">{new Date(user.createdAt).toLocaleString("fa-IR")}</td><td className="px-3 py-3">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("fa-IR") : "هنوز وارد نشده"}</td><td className="px-3 py-3"><Link href={`/admin/users/${user.id}`} className="font-bold text-primary">مشاهده و مدیریت</Link></td></tr>)}</tbody></table>{!users.length ? <div className="p-8 text-center text-sm text-muted-foreground">مشتری مطابق فیلتر پیدا نشد.</div> : null}</section>
    </div>
  );
}

