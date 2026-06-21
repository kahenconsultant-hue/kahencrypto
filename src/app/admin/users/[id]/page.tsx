import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { updateCustomerAccessAction } from "@/app/admin/users/actions";
import { requireAdminAccount } from "@/server/auth/session";
import { getCustomerAccountById, getCustomerEmailLogs } from "@/server/auth/repository";
import { CUSTOMER_STATUSES } from "@/server/auth/types";

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminAccount();
  const { id } = await params;
  const [user, logs] = await Promise.all([getCustomerAccountById(id), getCustomerEmailLogs(id)]);
  if (!user) notFound();
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_0.8fr]">
      <section className="rounded-md border bg-card p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-lg font-black">{user.fullName}</h1><p className="mt-1 text-sm text-muted-foreground" dir="ltr">{user.email}</p></div><Badge variant={user.status === "ACTIVE" ? "success" : "warning"}>{user.status}</Badge></div><dl className="mt-5 grid gap-3 text-xs sm:grid-cols-2"><div className="rounded-md border p-3"><dt className="text-muted-foreground">تماس</dt><dd className="mt-1 font-bold">{user.phoneOrTelegram ?? "ثبت نشده"}</dd></div><div className="rounded-md border p-3"><dt className="text-muted-foreground">کشور</dt><dd className="mt-1 font-bold">{user.country ?? "ثبت نشده"}</dd></div><div className="rounded-md border p-3"><dt className="text-muted-foreground">تاریخ ثبت</dt><dd className="mt-1 font-bold">{new Date(user.createdAt).toLocaleString("fa-IR")}</dd></div><div className="rounded-md border p-3"><dt className="text-muted-foreground">آخرین ورود</dt><dd className="mt-1 font-bold">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("fa-IR") : "هنوز وارد نشده"}</dd></div></dl><form action={updateCustomerAccessAction} className="mt-6 space-y-4"><input type="hidden" name="userId" value={user.id} /><label className="block text-sm"><span className="mb-1.5 block text-muted-foreground">وضعیت دسترسی</span><select name="status" defaultValue={user.status} className="h-11 w-full rounded-md border bg-background px-3">{CUSTOMER_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label><label className="block text-sm"><span className="mb-1.5 block text-muted-foreground">یادداشت داخلی ادمین</span><textarea name="adminNotes" defaultValue={user.adminNotes ?? ""} rows={6} className="w-full rounded-md border bg-background p-3 outline-none focus:border-primary" /></label><button className="h-11 w-full rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground">ذخیره وضعیت و ارسال ایمیل فعال‌سازی در صورت نیاز</button></form></section>
      <section className="rounded-md border bg-card p-5"><h2 className="text-base font-black">تاریخچه ایمیل</h2><div className="mt-4 space-y-3">{logs.map((log) => <div key={String(log.id)} className="rounded-md border p-3 text-xs"><div className="flex items-center justify-between gap-3"><span className="font-bold">{String(log.subject)}</span><Badge variant={log.status === "sent" ? "success" : log.status === "failed" ? "danger" : "warning"}>{String(log.status)}</Badge></div><div className="mt-2 text-muted-foreground">{new Date(String(log.created_at)).toLocaleString("fa-IR")}</div>{log.error ? <div className="mt-2 text-red-300">{String(log.error)}</div> : null}</div>)}{!logs.length ? <p className="text-sm text-muted-foreground">هنوز ایمیلی ثبت نشده است.</p> : null}</div></section>
    </div>
  );
}

