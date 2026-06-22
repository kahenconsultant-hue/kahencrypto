import Link from "next/link";
import { Search, UserRoundCog } from "lucide-react";
import { CustomerStatusForm } from "@/components/admin/CustomerStatusForm";
import { Badge } from "@/components/ui/badge";
import { requireAdminAccount } from "@/server/auth/session";
import { getCustomerAccounts } from "@/server/auth/repository";
import { CUSTOMER_STATUSES, customerStatusFa, type CustomerStatus } from "@/server/auth/types";

function statusVariant(status: CustomerStatus) {
  return status === "ACTIVE" ? "success" : status === "SUSPENDED" || status === "REJECTED" || status === "DISABLED" ? "danger" : "warning";
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
        <select name="status" defaultValue={status} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="ALL">همه وضعیت‌ها</option>{CUSTOMER_STATUSES.map((item) => <option key={item} value={item}>{customerStatusFa(item)}</option>)}</select>
        <button className="h-10 rounded-md bg-primary px-5 text-xs font-bold text-primary-foreground">اعمال فیلتر</button>
      </form>
      <section className="hidden overflow-x-auto rounded-md border bg-card md:block"><table className="w-full min-w-[1120px] text-right text-xs"><thead className="border-b bg-secondary/35 text-muted-foreground"><tr><th className="px-3 py-3">نام و ایمیل</th><th className="px-3 py-3">تماس</th><th className="px-3 py-3">وضعیت فعلی</th><th className="px-3 py-3">تغییر دستی وضعیت</th><th className="px-3 py-3">ثبت‌نام</th><th className="px-3 py-3">آخرین ورود</th><th className="px-3 py-3">جزئیات</th></tr></thead><tbody>{users.map((user) => <tr key={user.id} className="border-b last:border-0"><td className="px-3 py-3"><div className="font-bold">{user.fullName}</div><div className="mt-1 text-[11px] text-muted-foreground" dir="ltr">{user.email}</div></td><td className="px-3 py-3">{user.phoneOrTelegram ?? "ثبت نشده"}</td><td className="px-3 py-3"><Badge variant={statusVariant(user.status)}>{customerStatusFa(user.status)}</Badge></td><td className="px-3 py-3"><CustomerStatusForm userId={user.id} currentStatus={user.status} isAdmin={user.role === "admin"} compact /></td><td className="px-3 py-3">{new Date(user.createdAt).toLocaleString("fa-IR")}</td><td className="px-3 py-3">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("fa-IR") : "هنوز وارد نشده"}</td><td className="px-3 py-3"><Link href={`/admin/users/${user.id}`} className="font-bold text-primary">مشاهده کامل</Link></td></tr>)}</tbody></table></section>
      <section className="grid gap-3 md:hidden">{users.map((user) => <article key={user.id} className="rounded-md border bg-card p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-sm font-black">{user.fullName}</h2><p className="mt-1 truncate text-xs text-muted-foreground" dir="ltr">{user.email}</p></div><Badge variant={statusVariant(user.status)}>{customerStatusFa(user.status)}</Badge></div><dl className="mt-4 grid grid-cols-2 gap-2 text-xs"><div className="rounded-md border bg-background p-2"><dt className="text-muted-foreground">تماس</dt><dd className="mt-1 truncate font-bold">{user.phoneOrTelegram ?? "ثبت نشده"}</dd></div><div className="rounded-md border bg-background p-2"><dt className="text-muted-foreground">آخرین ورود</dt><dd className="mt-1 font-bold">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString("fa-IR") : "هنوز وارد نشده"}</dd></div></dl><div className="mt-4 border-t pt-4"><div className="mb-2 text-xs font-bold">تغییر دستی وضعیت دسترسی</div><CustomerStatusForm userId={user.id} currentStatus={user.status} isAdmin={user.role === "admin"} /></div><Link href={`/admin/users/${user.id}`} className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-md border text-xs font-bold text-primary">مشاهده جزئیات و یادداشت داخلی</Link></article>)}{!users.length ? <div className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">مشتری مطابق فیلتر پیدا نشد.</div> : null}</section>
    </div>
  );
}
