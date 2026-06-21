# C.M.I.P Commercial Homepage & Customer Access Report

Date: 2026-06-21

## Delivered

- Public Persian/RTL commercial homepage at `/`.
- Public structural product preview at `/sample-dashboard` with no live or fabricated values.
- Registration, login, registration receipt, and pending activation flows.
- Existing live Market Brief moved to protected `/dashboard`.
- Middleware access gate for dashboard, asset intelligence, audit, admin, and `/api/v1` routes.
- Manual customer activation panel at `/admin/users` and `/admin/users/[id]`.
- Customer states: `PENDING_PAYMENT`, `PAYMENT_SUBMITTED`, `ACTIVE`, `SUSPENDED`, `REJECTED`, `DISABLED`.
- Server-only account status and role management.
- Registration and activation email service with auditable email logs.
- One-subscription positioning with no automatic payment provider.

## Database & Security

- `202606210001_customer_access.sql` adds customer access fields, safe update grants, admin checks, and `email_logs`.
- `202606210002_customer_analytics_rls.sql` removes anonymous analytical data reads.
- Live intelligence is readable only by `ACTIVE` customers or administrators.
- Raw ingestion and operational tables are administrator-only.
- Forecast validation tables now have RLS and active-customer read policies.
- Anonymous verification returned zero visible rows for `normalized_events`, `raw_events`, and `forecast_snapshots`.
- Migration runner now discovers all ordered SQL migrations instead of relying on a stale hardcoded list.

## Email Behavior

- `ADMIN_EMAIL` is configured in Vercel Production as `kahensolution@gmail.com`.
- If Resend is not configured, registration remains available and the skipped email is recorded as `skipped_not_configured`.
- Real delivery requires `RESEND_API_KEY` and a verified `EMAIL_FROM` domain.

## Admin Bootstrap

- `npm run admin:ensure` safely creates or promotes the designated admin account.
- A password is required only when the auth account does not already exist.
- The current Supabase project does not yet contain `kahensolution@gmail.com`; an initial admin password is therefore still required.

## Validation

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run test`: 88 tests passed before the final RLS assertion; final run is recorded in the deployment closeout.
- `npm run build`: passed, 32 routes generated.
- Browser QA: desktop homepage, mobile homepage, registration form, and unauthenticated `/dashboard` redirect verified.
- Mobile hero clipping found during QA and fixed.

## Remaining External Configuration

1. Provide an initial password for `kahensolution@gmail.com` to create the first admin account.
2. Provide a Resend API key and verified sender address/domain to enable real outbound email delivery.

