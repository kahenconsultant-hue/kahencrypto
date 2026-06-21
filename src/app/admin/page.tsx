import Link from "next/link";
import { UsersRound } from "lucide-react";
import { AdminConsole } from "@/components/admin/admin-console";
import { requireAdminAccount } from "@/server/auth/session";

export const metadata = {
  title: "Admin | C.M.I.P",
};

export default async function AdminPage() {
  await requireAdminAccount();
  return (
    <div className="space-y-4">
      <section className="flex flex-col gap-3 rounded-md border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-lg font-black">مدیریت CMIP</h1><p className="mt-1 text-xs text-muted-foreground">عملیات داده و دسترسی مشتریان فقط برای ادمین قابل مشاهده است.</p></div>
        <Link href="/admin/users" className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-xs font-bold text-primary-foreground"><UsersRound className="h-4 w-4" />مدیریت مشتریان</Link>
      </section>
      <AdminConsole />
    </div>
  );
}
