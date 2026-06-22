import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CUSTOMER_STATUSES, accountFromRow } from "../src/server/auth/types";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("commercial homepage is public and live intelligence moved to the protected dashboard", () => {
  const root = source("../src/app/page.tsx");
  const dashboard = source("../src/app/dashboard/page.tsx");
  const shell = source("../src/components/layout/route-shell.tsx");

  assert.match(root, /PublicHomepage/);
  assert.equal(root.includes("buildPublicMarketBrief"), false);
  assert.match(dashboard, /buildPublicMarketBrief/);
  assert.match(shell, /"\/"/);
  assert.match(shell, /"\/sample-dashboard"/);
  assert.match(shell, /"\/forgot-password"/);
  assert.match(shell, /"\/reset-password"/);
  assert.equal(shell.includes('"/dashboard"'), false);
});

test("login offers a complete Supabase password recovery flow", () => {
  const forms = source("../src/components/auth/AuthForms.tsx");
  const actions = source("../src/app/(public)/auth-actions.ts");
  const reset = source("../src/components/auth/ResetPasswordForm.tsx");
  assert.match(forms, /href="\/forgot-password"/);
  assert.match(actions, /resetPasswordForEmail/);
  assert.match(actions, /\/reset-password/);
  assert.match(reset, /exchangeCodeForSession/);
  assert.match(reset, /type: "recovery"/);
  assert.match(reset, /updateUser\(\{ password \}\)/);
});

test("global typography uses the requested Persian font roles with a bundled fallback", () => {
  const layout = source("../src/app/layout.tsx");
  const css = source("../src/app/globals.css");
  assert.match(layout, /@fontsource\/vazirmatn\/600\.css/);
  assert.match(css, /--font-heading: "Yekan Bakh"/);
  assert.match(css, /--font-numeric: Dana/);
  assert.match(css, /font-family: var\(--font-body\)/);
  assert.equal(css.includes("font-weight: 400"), false);
});

test("public homepage exposes one subscription and the required customer journeys", () => {
  const homepage = source("../src/components/marketing/PublicHomepage.tsx");
  assert.match(homepage, /یک آبونمان/);
  assert.match(homepage, /cmip-gold-hero\.jpg/);
  assert.match(homepage, /href="\/register"/);
  assert.match(homepage, /href="\/login"/);
  assert.match(homepage, /href="\/sample-dashboard"/);
  assert.match(homepage, /سیگنال خرید و فروش، توصیه مالی یا تضمین سود ارائه نمی‌دهد/);
  for (const image of [
    "cmip-gold-hero.jpg",
    "cmip-gold-noise-filter.jpg",
    "cmip-gold-positioning.jpg",
    "cmip-gold-process.jpg",
    "cmip-gold-membership.jpg",
  ]) {
    assert.match(homepage, new RegExp(image));
  }
  for (const asset of ["USDT", "BTC", "ETH", "TRX", "TON", "SOL", "XRP", "DOGE", "BNB", "ADA"]) {
    assert.match(homepage, new RegExp(`"${asset}"`));
  }
  assert.match(homepage, /تصاویر صفحه نمای مفهومی محصول‌اند/);
  for (const forbidden of ["Basic Plan", "Pro Plan", "Enterprise Plan", "تضمین سود"]) {
    if (forbidden === "تضمین سود") continue;
    assert.equal(homepage.includes(forbidden), false);
  }
});

test("middleware protects live analysis, API and admin routes", () => {
  const middleware = source("../src/middleware.ts");
  for (const route of [
    '"/dashboard/:path*"',
    '"/assets/:path*"',
    '"/liquidity/:path*"',
    '"/audit/:path*"',
    '"/admin/:path*"',
    '"/api/v1/:path*"',
  ]) {
    assert.match(middleware, new RegExp(route.replace(/[/*]/g, "\\$&")));
  }
  assert.match(middleware, /account\.status !== "ACTIVE"/);
  assert.match(middleware, /account\.role !== "admin"/);
});

test("customer access states are explicit and default account mapping is non-privileged", () => {
  assert.deepEqual(CUSTOMER_STATUSES, [
    "PENDING_PAYMENT",
    "PAYMENT_SUBMITTED",
    "ACTIVE",
    "SUSPENDED",
    "REJECTED",
    "DISABLED",
  ]);
  const account = accountFromRow({ id: "u1", email: "customer@example.com" });
  assert.equal(account.role, "customer");
  assert.equal(account.status, "PENDING_PAYMENT");
});

test("database migration keeps role and status server-managed", () => {
  const migration = source("../supabase/migrations/202606210001_customer_access.sql");
  assert.match(migration, /revoke update on public\.users from authenticated/i);
  assert.match(migration, /grant update \(full_name, phone_or_telegram, country, updated_at, last_login_at\)/i);
  assert.equal(/grant update \([^)]*(role|status)/i.test(migration), false);
  assert.match(migration, /security definer/i);
  assert.match(migration, /role = 'admin'/i);
});

test("live intelligence tables require active customer access instead of anonymous public reads", () => {
  const migration = source("../supabase/migrations/202606210002_customer_analytics_rls.sql");
  assert.match(migration, /status = 'ACTIVE'/);
  assert.match(migration, /role = 'admin'/);
  assert.match(migration, /drop policy if exists "public read normalized events"/i);
  assert.match(migration, /active customers read intelligence outputs/i);
  assert.match(migration, /alter table public\.forecast_validations enable row level security/i);
  assert.match(migration, /admins read raw events/i);
  assert.equal(/create policy "public read/i.test(migration), false);
});

test("registration cannot assign privilege or active access", () => {
  const actions = source("../src/app/(public)/auth-actions.ts");
  assert.match(actions, /role: "customer"/);
  assert.match(actions, /status: "PENDING_PAYMENT"/);
  assert.equal(actions.includes('role: "admin"'), false);
  assert.equal(actions.includes('status: "ACTIVE"'), false);
});

test("sample dashboard is clearly structural and does not claim live values", () => {
  const sample = source("../src/app/(public)/sample-dashboard/page.tsx");
  assert.match(sample, /نمونه عمومی/);
  assert.match(sample, /شامل داده زنده یا جزئیات کامل موتور نیست/);
  assert.match(sample, /فعال‌سازی پس از ثبت‌نام و تأیید دستی انجام می‌شود/);
});

test("admin customer list exposes responsive manual status controls", () => {
  const page = source("../src/app/admin/users/page.tsx");
  const form = source("../src/components/admin/CustomerStatusForm.tsx");
  assert.match(page, /CustomerStatusForm/);
  assert.match(page, /md:hidden/);
  assert.match(page, /تغییر دستی وضعیت دسترسی/);
  assert.match(form, /updateCustomerStatusAction/);
  assert.match(form, /CUSTOMER_STATUSES\.map/);
  assert.match(form, /ذخیره وضعیت/);
});

test("manual status update preserves notes and protects administrator accounts", () => {
  const actions = source("../src/app/admin/users/actions.ts");
  assert.match(actions, /previous\.role === "admin" && status !== previous\.status/);
  assert.match(actions, /if \(adminNotes !== undefined\) changes\.admin_notes/);
  assert.match(actions, /updateCustomerStatus\(parsed\.data\.userId, parsed\.data\.status\)/);
  assert.match(actions, /sendActivationEmail/);
});
