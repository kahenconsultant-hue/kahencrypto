drop index if exists public.normalized_events_raw_event_uidx;
create unique index if not exists normalized_events_raw_event_uidx on public.normalized_events (raw_event_id);
