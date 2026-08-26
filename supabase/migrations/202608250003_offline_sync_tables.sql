create table if not exists public.sync_snapshots (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'dashboard' check (kind in ('dashboard')),
  device_id text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.sync_snapshots enable row level security;

create policy "authenticated users can read sync snapshots" on public.sync_snapshots
  for select to authenticated using (true);

create policy "authenticated users can insert sync snapshots" on public.sync_snapshots
  for insert to authenticated with check (true);

create index if not exists sync_snapshots_created_at_idx
  on public.sync_snapshots (created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sync_snapshots'
  ) then
    alter publication supabase_realtime add table public.sync_snapshots;
  end if;
end $$;
