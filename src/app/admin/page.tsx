import { AdminConsole } from "@/components/admin/admin-console";

export const metadata = {
  title: "Admin | C.M.I.P",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AdminPage() {
  return <AdminConsole />;
}
