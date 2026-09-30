-- Hardening from the Phase 1 code review.
-- PostgREST is publicly reachable, so the database must protect itself even if the
-- web API is bypassed (architecture overview §6.1).

-- 1. Abuse limits -------------------------------------------------------------------
-- rate_limit_hit: fixed buckets, a sane limit and a window of at least a minute, so a
-- caller cannot mint unlimited rows with made-up buckets or tiny windows.
create or replace function public.rate_limit_hit(bucket text, max_hits int, window_len interval)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  current_hits int;
begin
  if uid is null then
    raise exception 'authentication required' using errcode = 'invalid_authorization_specification';
  end if;
  if bucket is null or bucket <> all (array['upload', 'profile', 'feedback', 'log_event']) then
    raise exception 'unknown rate limit bucket' using errcode = 'invalid_parameter_value';
  end if;
  if max_hits is null or max_hits < 1 or max_hits > 10000 then
    raise exception 'max_hits must be between 1 and 10000' using errcode = 'invalid_parameter_value';
  end if;
  if window_len is null or window_len < interval '1 minute' or window_len > interval '1 day' then
    raise exception 'window must be between 1 minute and 1 day' using errcode = 'invalid_parameter_value';
  end if;
  insert into public.rate_limits as r (key, window_start, hits)
  values (uid::text || ':' || bucket,
          date_bin(window_len, clock_timestamp(), timestamptz '2000-01-01'), 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning r.hits into current_hits;
  return current_hits <= max_hits;
end $$;

-- log_event: rate-limited, and a null event is refused up front.
create or replace function public.log_event(event text, props jsonb default '{}')
returns void language plpgsql security definer set search_path = '' as $$
declare
  allowed_events constant text[] := array[
    'user_signed_up', 'profile_completed', 'program_followed', 'program_unfollowed',
    'application_status_changed', 'resume_uploaded', 'account_deleted'];
  allowed_keys constant text[] := array['kind', 'status', 'program_id', 'count'];
begin
  if event is null or event <> all (allowed_events) then
    raise exception 'event is not allowed from the web app' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_typeof(props) is distinct from 'object' then
    raise exception 'props must be a JSON object' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from jsonb_object_keys(props) as k where k <> all (allowed_keys)) then
    raise exception 'props contains a key that is not allowed' using errcode = 'invalid_parameter_value';
  end if;
  -- 20 events a minute per user is far above real use and far below a flood
  if not public.rate_limit_hit('log_event', 20, interval '1 minute') then
    raise exception 'too many events' using errcode = 'program_limit_exceeded';
  end if;
  insert into public.metrics_events (event, source, user_ref, props)
  values (
    event, 'web',
    case when event = 'account_deleted' then null else (select auth.uid()) end,
    props);
end $$;

-- Old windows are useless. Not callable by clients; a scheduled job runs it (Phase 8).
create function public.purge_rate_limits() returns int
language plpgsql security definer set search_path = '' as $$
declare removed int;
begin
  delete from public.rate_limits where window_start < now() - interval '2 days';
  get diagnostics removed = row_count;
  return removed;
end $$;
revoke all on function public.purge_rate_limits() from public, anon, authenticated;

-- 2. Tracker integrity ---------------------------------------------------------------
-- The database now writes the tracker history itself, so it cannot be forged, and it
-- refuses illegal status changes. The richer rules stay in the TypeScript domain
-- (decision D9); this is the minimum that must hold even if the API is bypassed.
alter table public.application_events add column is_undo boolean not null default false;

create function public.record_application_status() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  legal public.app_status[];
  last_event public.application_events%rowtype;
  is_undo_move boolean := false;
begin
  if tg_op = 'INSERT' then
    insert into public.application_events (application_id, user_id, from_status, to_status, resume_id)
    values (new.id, new.user_id, null, new.status, new.resume_id);
    return new;
  end if;

  legal := case old.status
    when 'saved' then array['applied', 'rejected']::public.app_status[]
    when 'applied' then array['online_assessment', 'interview', 'rejected']::public.app_status[]
    when 'online_assessment' then array['interview', 'rejected']::public.app_status[]
    when 'interview' then array['offer', 'rejected']::public.app_status[]
    else array[]::public.app_status[]
  end;

  if not (new.status = any (legal)) then
    -- Not a forward move. Allowed only as an undo of the most recent, non-undo move.
    select * into last_event
    from public.application_events
    where application_id = old.id
    order by id desc limit 1;
    is_undo_move := coalesce(
      found and not last_event.is_undo
        and last_event.to_status = old.status
        and last_event.from_status = new.status,
      false);
    if not is_undo_move then
      raise exception 'illegal status change from % to %', old.status, new.status
        using errcode = 'check_violation';
    end if;
  end if;

  insert into public.application_events
    (application_id, user_id, from_status, to_status, resume_id, is_undo)
  values (old.id, old.user_id, old.status, new.status, new.resume_id, is_undo_move);
  return new;
end $$;

create trigger applications_record_status_ins after insert on public.applications
  for each row execute function public.record_application_status();
create trigger applications_record_status_upd before update of status on public.applications
  for each row when (old.status is distinct from new.status)
  execute function public.record_application_status();

-- Clients can read their history but never write it.
revoke insert, update, delete on public.application_events from authenticated;
drop policy app_events_owner on public.application_events;
create policy app_events_read_own on public.application_events
  for select to authenticated using (user_id = (select auth.uid()));

-- Applications: clients create them as 'saved' on a published program only.
drop policy applications_owner on public.applications;
create policy applications_select_own on public.applications
  for select to authenticated using (user_id = (select auth.uid()));
create policy applications_insert_own on public.applications
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'saved'
    and exists (select 1 from public.programs p where p.id = program_id and p.is_published)
  );
create policy applications_update_own on public.applications
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy applications_delete_own on public.applications
  for delete to authenticated using (user_id = (select auth.uid()));

-- 3. Cross-table consistency ---------------------------------------------------------
-- An application's window must belong to the application's own program.
alter table public.program_windows
  add constraint program_windows_id_program_key unique (id, program_id);
alter table public.applications drop constraint applications_program_window_id_fkey;
alter table public.applications
  add constraint applications_window_matches_program
  foreign key (program_window_id, program_id)
  references public.program_windows (id, program_id)
  on delete set null (program_window_id);

-- A resume's storage path must sit inside its owner's own folder.
alter table public.resumes
  add constraint resumes_storage_path_owner
  check (storage_path = user_id::text || '/' || id::text || '.bin');

-- 4. No existence oracle for unpublished programs ------------------------------------
-- Following an unpublished program and following a non-existent one now fail the same way.
drop policy follows_owner on public.program_follows;
create policy follows_select_own on public.program_follows
  for select to authenticated using (user_id = (select auth.uid()));
create policy follows_insert_own on public.program_follows
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.programs p where p.id = program_id and p.is_published)
  );
create policy follows_update_own on public.program_follows
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy follows_delete_own on public.program_follows
  for delete to authenticated using (user_id = (select auth.uid()));
