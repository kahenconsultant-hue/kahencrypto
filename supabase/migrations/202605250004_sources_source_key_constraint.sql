alter table public.sources
  add constraint sources_source_key_unique unique (source_key);
