-- Window events: every real change to an application window leaves a history row, because email
-- alerts are built from this history (D28). A row that changes nothing leaves none.
begin;
select plan(13);

insert into public.companies (id, slug, name, careers_url) values
  ('00000000-0000-0000-0000-0000000000c1', 'acme', 'Acme', 'https://acme.example/careers');

insert into public.programs (id, company_id, slug, name, program_type, source_url, is_published) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1',
   'grad', 'Acme Graduate Program', 'graduate', 'https://acme.example/grad', true);

select has_trigger('public', 'program_windows', 'program_windows_record_event',
  'program_windows has the trigger that records events');

-- w1 starts with nothing known.
insert into public.program_windows (id, program_id, cycle_year, window_seq, status, provenance, source_url) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1',
   2027, 1, 'unknown', 'monitor', 'https://acme.example/grad');

select is(
  (select count(*)::int from public.program_window_events where program_window_id = '00000000-0000-0000-0000-0000000000b1'),
  0,
  'a window added with nothing known leaves no event');

update public.program_windows set status = 'open' where id = '00000000-0000-0000-0000-0000000000b1';

select is(
  (select array_agg(event_type order by id) from public.program_window_events
    where program_window_id = '00000000-0000-0000-0000-0000000000b1'),
  array['opened'],
  'a window that becomes open records an opened event');

select is(
  (select (before ->> 'status') || '>' || (after ->> 'status') from public.program_window_events
    where program_window_id = '00000000-0000-0000-0000-0000000000b1' and event_type = 'opened'),
  'unknown>open',
  'the opened event keeps the status before and after');

update public.program_windows set closes_on = '2026-12-01', closes_precision = 'day'
  where id = '00000000-0000-0000-0000-0000000000b1';

select is(
  (select array_agg(event_type order by id) from public.program_window_events
    where program_window_id = '00000000-0000-0000-0000-0000000000b1'),
  array['opened', 'dates_changed'],
  'a changed closing date records a dates_changed event');

select is(
  (select after ->> 'closes_on' from public.program_window_events
    where program_window_id = '00000000-0000-0000-0000-0000000000b1' and event_type = 'dates_changed'
    order by id desc limit 1),
  '2026-12-01',
  'the dates_changed event holds the new closing date');

select is(
  (select before ->> 'closes_on' from public.program_window_events
    where program_window_id = '00000000-0000-0000-0000-0000000000b1' and event_type = 'dates_changed'
    order by id desc limit 1),
  null,
  'and the date before, which was not known');

update public.program_windows set last_verified_at = now() where id = '00000000-0000-0000-0000-0000000000b1';

select is(
  (select count(*)::int from public.program_window_events where program_window_id = '00000000-0000-0000-0000-0000000000b1'),
  2,
  'a change that touches no date or status leaves no event');

update public.program_windows set closes_precision = 'month' where id = '00000000-0000-0000-0000-0000000000b1';

select is(
  (select event_type from public.program_window_events
    where program_window_id = '00000000-0000-0000-0000-0000000000b1' order by id desc limit 1),
  'dates_changed',
  'a date that becomes less precise is a change too');

update public.program_windows set status = 'closed' where id = '00000000-0000-0000-0000-0000000000b1';

select is(
  (select event_type from public.program_window_events
    where program_window_id = '00000000-0000-0000-0000-0000000000b1' order by id desc limit 1),
  'closed',
  'a window that becomes closed records a closed event');

update public.program_windows
  set status = 'open', opens_on = '2026-10-01', opens_precision = 'day'
  where id = '00000000-0000-0000-0000-0000000000b1';

select is(
  (select jsonb_object_agg(event_type, n) from (
     select event_type, count(*) as n from public.program_window_events
      where program_window_id = '00000000-0000-0000-0000-0000000000b1' group by event_type) counted),
  '{"opened": 2, "dates_changed": 3, "closed": 1}'::jsonb,
  'one update that reopens a window and sets its opening date records both events');

select is(
  (select count(*)::int from public.program_window_events
    where program_window_id = '00000000-0000-0000-0000-0000000000b1' and actor <> 'monitor'),
  0,
  'each event names who made the change');

insert into public.program_windows (id, program_id, cycle_year, window_seq, status, provenance, source_url) values
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a1',
   2028, 1, 'open', 'seed', 'https://acme.example/grad');

select is(
  (select array_agg(event_type order by id) from public.program_window_events
    where program_window_id = '00000000-0000-0000-0000-0000000000b2'),
  array['opened'],
  'a window added already open records an opened event');

select * from finish();
rollback;
