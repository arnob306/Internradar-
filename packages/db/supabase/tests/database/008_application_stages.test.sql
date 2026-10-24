-- Application stages: the optional, sourced list of steps an employer's own page describes.
begin;
select plan(6);

select has_column('public', 'programs', 'application_stages', 'programs has an application_stages column');
select col_type_is('public', 'programs', 'application_stages', 'jsonb', 'the stages are stored as jsonb');

insert into public.companies (id, slug, name, careers_url) values
  ('00000000-0000-0000-0000-0000000000c1', 'acme', 'Acme', 'https://acme.example/careers');

insert into public.programs (id, company_id, slug, name, program_type, source_url, is_published) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1',
   'grad', 'Acme Graduate Program', 'graduate', 'https://acme.example/grad', true);

select is(
  (select application_stages from public.programs where slug = 'grad'),
  '[]'::jsonb,
  'a program with no stages published has an empty list, not null');

select throws_ok(
  $$update public.programs set application_stages = '{"name":"Interview"}' where slug = 'grad'$$,
  '23514', null, 'the stages must be a list, not an object');

update public.programs
  set application_stages = '[{"name":"Online application","sourceUrl":"https://acme.example/grad"}]'
  where slug = 'grad';

set local role anon;
select is(
  (select application_stages -> 0 ->> 'name' from public.programs where slug = 'grad'),
  'Online application',
  'a visitor can read the stages of a published program');
reset role;

select is(
  (select jsonb_array_length(application_stages) from public.programs where slug = 'grad'),
  1,
  'a program can hold a list of stages');

select * from finish();
rollback;
