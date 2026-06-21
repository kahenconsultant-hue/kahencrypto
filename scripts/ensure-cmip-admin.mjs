import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = (process.env.ADMIN_EMAIL ?? "kahensolution@gmail.com").trim().toLowerCase();
const password = process.env.CMIP_ADMIN_PASSWORD;

if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const listed = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listed.error) throw listed.error;
let authUser = listed.data.users.find((user) => user.email?.toLowerCase() === email);
if (!authUser) {
  if (!password) {
    console.error("CMIP_ADMIN_PASSWORD is required when creating the admin account for the first time.");
    process.exit(1);
  }
  const created = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "CMIP Admin" } });
  if (created.error || !created.data.user) throw created.error ?? new Error("Admin auth user could not be created.");
  authUser = created.data.user;
} else if (password) {
  const updated = await supabase.auth.admin.updateUserById(authUser.id, { password, email_confirm: true });
  if (updated.error) throw updated.error;
}

const now = new Date().toISOString();
const row = await supabase.from("users").upsert({
  id: authUser.id,
  email,
  full_name: "CMIP Admin",
  role: "admin",
  status: "ACTIVE",
  consent_accepted: true,
  terms_accepted: true,
  activated_at: now,
  updated_at: now,
}, { onConflict: "id" });
if (row.error) throw row.error;
console.log(JSON.stringify({ ok: true, email, userId: authUser.id, role: "admin", status: "ACTIVE" }));
