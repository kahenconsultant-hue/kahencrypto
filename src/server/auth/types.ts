export const CUSTOMER_STATUSES = [
  "PENDING_PAYMENT",
  "PAYMENT_SUBMITTED",
  "ACTIVE",
  "SUSPENDED",
  "REJECTED",
  "DISABLED",
] as const;

export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];
export type AccountRole = "customer" | "user" | "analyst" | "admin";

export type CustomerAccount = {
  id: string;
  email: string;
  fullName: string;
  phoneOrTelegram: string | null;
  country: string | null;
  role: AccountRole;
  status: CustomerStatus;
  consentAccepted: boolean;
  termsAccepted: boolean;
  adminNotes: string | null;
  activatedAt: string | null;
  suspendedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
};

export function accountFromRow(row: Record<string, unknown>): CustomerAccount {
  return {
    id: String(row.id),
    email: String(row.email),
    fullName: typeof row.full_name === "string" && row.full_name.trim() ? row.full_name : String(row.email),
    phoneOrTelegram: typeof row.phone_or_telegram === "string" ? row.phone_or_telegram : null,
    country: typeof row.country === "string" ? row.country : null,
    role: String(row.role ?? "customer") as AccountRole,
    status: String(row.status ?? "PENDING_PAYMENT") as CustomerStatus,
    consentAccepted: row.consent_accepted === true,
    termsAccepted: row.terms_accepted === true,
    adminNotes: typeof row.admin_notes === "string" ? row.admin_notes : null,
    activatedAt: typeof row.activated_at === "string" ? row.activated_at : null,
    suspendedAt: typeof row.suspended_at === "string" ? row.suspended_at : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    lastLoginAt: typeof row.last_login_at === "string" ? row.last_login_at : null,
  };
}

