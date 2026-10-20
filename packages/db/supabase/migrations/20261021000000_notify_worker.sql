-- notify_worker (D30): the restricted role the alert sender connects as, like ingest_worker.
-- It reads what it needs to decide who is owed an alert, writes only alerts, and gets a student's
-- email address one pending alert at a time through alert_recipient_email, never from auth.users.
-- The migration sets no password; a deployment sets one outside version control.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'notify_worker') then
    create role notify_worker login noinherit;
  end if;
end $$;

grant usage on schema public to notify_worker;
grant select on public.companies, public.programs, public.program_windows,
  public.program_window_events, public.program_follows to notify_worker;
-- only the switch, not citizenship or anything else on a profile
grant select (user_id, email_alerts) on public.profiles to notify_worker;
grant select, insert on public.alerts to notify_worker;
-- the outcome of a send, never who an alert is for or what it says
grant update (status, attempts, send_after, last_error_code, sent_at) on public.alerts to notify_worker;

create policy companies_notify_read on public.companies for select to notify_worker using (true);
create policy programs_notify_read on public.programs for select to notify_worker using (true);
create policy windows_notify_read on public.program_windows for select to notify_worker using (true);
create policy window_events_notify_read on public.program_window_events
  for select to notify_worker using (true);
-- Student tables are scoped, not open: the worker sees only follows and profiles that ask for email,
-- creates only fresh pending alerts, and can change only an alert that is still pending.
create policy follows_notify_read on public.program_follows
  for select to notify_worker using (notify);
create policy profiles_notify_read on public.profiles
  for select to notify_worker using (email_alerts);
create policy alerts_notify_read on public.alerts
  for select to notify_worker using (status = 'pending');
create policy alerts_notify_insert on public.alerts for insert to notify_worker
  with check (status = 'pending' and attempts = 0 and sent_at is null);
create policy alerts_notify_update on public.alerts for update to notify_worker
  using (status = 'pending') with check (status in ('pending', 'sent', 'failed', 'skipped'));

-- The address for one pending alert. Sent, failed, skipped and unknown alerts return nothing, so a
-- stolen worker credential cannot be used to list student addresses.
create function public.alert_recipient_email(alert_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select u.email::text
  from public.alerts a
  join auth.users u on u.id = a.user_id
  where a.id = alert_id and a.status = 'pending'
$$;
revoke all on function public.alert_recipient_email(uuid) from public, anon, authenticated;
grant execute on function public.alert_recipient_email(uuid) to notify_worker;
