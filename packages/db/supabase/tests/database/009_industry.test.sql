-- Industry: one optional tag per program, so students can narrow the timeline to a kind of employer.
begin;
select plan(7);

select has_column('public', 'programs', 'industry', 'programs has an industry column');
select enum_has_labels(
  'public', 'industry',
  array['banking_finance', 'consulting', 'technology', 'engineering_resources', 'government_defence', 'other'],
  'the industries are the six the site offers');

insert into public.companies (id, slug, name, careers_url) values
  ('00000000-0000-0000-0000-0000000000c1', 'acme', 'Acme', 'https://acme.example/careers');

insert into public.programs (id, company_id, slug, name, program_type, source_url, is_published) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1',
   'grad', 'Acme Graduate Program', 'graduate', 'https://acme.example/grad', true);

select is(
  (select industry::text from public.programs where slug = 'grad'),
  null,
  'a program with no tag has no industry, not a guess');

select throws_ok(
  $$update public.programs set industry = 'mining' where slug = 'grad'$$,
  '22P02', null, 'an industry outside the list is refused');

update public.programs set industry = 'consulting' where slug = 'grad';

select is(
  (select industry::text from public.programs where slug = 'grad'),
  'consulting',
  'a program can carry one industry');

set local role anon;
select is(
  (select industry::text from public.programs where slug = 'grad'),
  'consulting',
  'a visitor can read the industry of a published program');
reset role;

select lives_ok(
  $$update public.programs set industry = null where slug = 'grad'$$,
  'the tag can be removed again');

select * from finish();
rollback;
