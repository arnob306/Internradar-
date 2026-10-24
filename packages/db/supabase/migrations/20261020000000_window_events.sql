-- Window events: record every real change to an application window (D28).
-- Email alerts are built from this history, so it is written by the database itself and cannot be
-- forgotten by whichever code or person changes a window. Status and the four date columns are what
-- a student would care about; any other change (for example a re-check of the source) records nothing.

create function public.record_window_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  after_state  jsonb := jsonb_build_object(
    'status', new.status, 'opens_on', new.opens_on, 'opens_precision', new.opens_precision,
    'closes_on', new.closes_on, 'closes_precision', new.closes_precision);
  before_state jsonb;
begin
  if tg_op = 'INSERT' then
    -- a window added with nothing known has no change to report
    if new.status = 'open' then
      insert into public.program_window_events (program_window_id, event_type, after, actor)
      values (new.id, 'opened', after_state, new.provenance);
    end if;
    return new;
  end if;

  before_state := jsonb_build_object(
    'status', old.status, 'opens_on', old.opens_on, 'opens_precision', old.opens_precision,
    'closes_on', old.closes_on, 'closes_precision', old.closes_precision);

  if new.status is distinct from old.status and new.status in ('open', 'closed') then
    insert into public.program_window_events (program_window_id, event_type, before, after, actor)
    values (new.id, case new.status when 'open' then 'opened' else 'closed' end,
            before_state, after_state, new.provenance);
  end if;

  if (new.opens_on, new.opens_precision, new.closes_on, new.closes_precision)
     is distinct from (old.opens_on, old.opens_precision, old.closes_on, old.closes_precision) then
    insert into public.program_window_events (program_window_id, event_type, before, after, actor)
    values (new.id, 'dates_changed', before_state, after_state, new.provenance);
  end if;

  return new;
end
$$;
revoke all on function public.record_window_event() from public, anon, authenticated;

create trigger program_windows_record_event
  after insert or update on public.program_windows
  for each row execute function public.record_window_event();
