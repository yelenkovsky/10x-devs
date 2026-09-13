create table public.flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  generation_id uuid not null,
  status text not null default 'generated',
  cloze text not null,
  word_phrase text not null,
  full_sentence text not null,
  definition text not null,
  collocation_pattern text not null,
  translation_pl text not null,
  created_at timestamptz not null default now(),
  constraint flashcards_status_check check (status in ('generated', 'kept'))
);

create index flashcards_user_id_idx on public.flashcards (user_id);
create index flashcards_user_id_created_at_idx on public.flashcards (user_id, created_at desc);
create index flashcards_user_id_generation_id_idx on public.flashcards (user_id, generation_id);

alter table public.flashcards enable row level security;

create policy flashcards_select_own
  on public.flashcards
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy flashcards_insert_own
  on public.flashcards
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy flashcards_update_own
  on public.flashcards
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy flashcards_delete_own
  on public.flashcards
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.flashcards from anon, public;
grant select, insert, update, delete on table public.flashcards to authenticated;
