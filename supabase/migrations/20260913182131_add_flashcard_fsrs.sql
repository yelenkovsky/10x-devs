alter table public.flashcards
  add column due timestamptz,
  add column last_review timestamptz,
  add column stability double precision,
  add column difficulty double precision,
  add column elapsed_days integer,
  add column scheduled_days integer,
  add column learning_steps integer,
  add column reps integer,
  add column lapses integer,
  add column state smallint,
  add constraint flashcards_state_check check (state is null or state in (0, 1, 2, 3));

create index flashcards_user_id_due_kept_idx
  on public.flashcards (user_id, due)
  where status = 'kept';
