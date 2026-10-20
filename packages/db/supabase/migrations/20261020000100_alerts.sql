-- Alerts outbox (D29). One row per email a student is owed, written by the notify worker and read by
-- the worker and, for transparency, by the student it is for. The sender claims pending rows, sends,
-- and marks them; a row is never deleted by anyone but the account being deleted.

create table public.alerts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users on delete cascade,
  program_id        uuid not null references public.programs on delete cascade,
  program_window_id uuid not null references public.program_windows on delete cascade,
  kind              text not null check (kind in ('opened', 'dates_changed', 'closing_soon')),
  -- why this alert exists, for example 'event:42' or 'closing:<window id>:2026-12-01'. The same reason
  -- can be queued only once per student, so running the worker twice sends one email, not two.
  dedupe_key        text not null,
  -- what the email will say, frozen when the alert is made so a later edit cannot change it
  details           jsonb not null default '{}' check (jsonb_typeof(details) = 'object'),
  status            text not null default 'pending'
                    check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts          int not null default 0 check (attempts >= 0),
  send_after        timestamptz not null default now(),
  -- a safe code such as 'SEND_FAILED', never provider or address detail
  last_error_code   text,
  sent_at           timestamptz,
  created_at        timestamptz not null default now(),
  unique (user_id, dedupe_key),
  check (status <> 'sent' or sent_at is not null)
);
create index alerts_pending_idx on public.alerts (send_after) where status = 'pending';
create index alerts_program_idx on public.alerts (program_id);

alter table public.alerts enable row level security;
revoke all on public.alerts from anon, authenticated;
grant select on public.alerts to authenticated;
create policy alerts_select_own on public.alerts for select to authenticated
  using (user_id = (select auth.uid()));
