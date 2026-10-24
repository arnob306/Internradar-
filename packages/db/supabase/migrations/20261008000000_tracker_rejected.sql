-- Decision D9: a student can mark an application rejected from any status except offer, including
-- one they only saved and never sent. A saved-then-rejected application has no applied date, so
-- the rule "every status past saved needs applied_at" now exempts rejected as well. Every other
-- status keeps it, so funnel numbers that count applications still start from a real date.
alter table public.applications drop constraint applications_check;
alter table public.applications
  add constraint applications_applied_at_check
  check (status in ('saved', 'rejected') or applied_at is not null);
