# Deployment Guide

## 1. Environment

Copy `.env.example` to `.env.local` and fill:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- provider keys as needed
- `REDIS_URL`
- `CRON_SECRET`

## 2. Supabase

Run the migration:

```bash
supabase db push
```

Then configure Supabase Auth and add JWT custom claim `app_role=admin` for admin users, or set `public.users.role = 'admin'`.

## 3. Vercel

Set the same environment variables in Vercel and deploy:

```bash
npm run build
vercel deploy --prod
```

Configure Vercel Cron to call:

```text
GET /api/cron/ingest
Authorization: Bearer $CRON_SECRET
```

The repository already includes this schedule in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/ingest",
      "schedule": "*/30 * * * *"
    }
  ]
}
```

For local scheduler testing:

```bash
npm run dev -- -p 3004
CMIP_BASE_URL=http://127.0.0.1:3004 npm run ingest:once
CMIP_BASE_URL=http://127.0.0.1:3004 npm run ingest:scheduler
```

## 4. Python Analytics Service

```bash
cd services/python/analytics
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8080
```

In production, deploy this as a separate container and call it from the queue worker for heavier correlation/regime jobs.

## 5. WordPress Widget

Add this to a WordPress page or plugin render output:

```html
<div id="crypto-macro-widget"></div>
<script src="https://your-app.vercel.app/embed-widget.js" data-api-base="https://your-app.vercel.app" data-target="crypto-macro-widget"></script>
```

The widget consumes `/api/v1/wordpress`.
