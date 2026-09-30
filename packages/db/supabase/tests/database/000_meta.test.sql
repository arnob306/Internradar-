-- Meta tests: rules every table must follow, so a new table cannot skip them
-- (test plan §5).
begin;
select plan(3);

select is(
  (select count(*)::int
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  0,
  'every table in public has row-level security enabled');

select is(
  (select coalesce(string_agg(tablename || '.' || policyname, ', '), '')
   from pg_policies
   where schemaname = 'public'
     and tablename in ('profiles', 'program_follows', 'resumes', 'applications',
                       'application_events', 'alerts')
     -- INSERT policies have no USING clause, so judge those on WITH CHECK instead
     and coalesce(case when cmd = 'INSERT' then with_check else qual end, 'true')
         in ('true', '(true)')),
  '',
  'no policy on a user table uses USING (true)');

select is(
  (select count(*)::int
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and (has_table_privilege('anon', c.oid, 'insert')
       or has_table_privilege('anon', c.oid, 'update')
       or has_table_privilege('anon', c.oid, 'delete'))),
  0,
  'anon has no write privileges on any table in public');

select * from finish();
rollback;
