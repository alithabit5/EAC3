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
