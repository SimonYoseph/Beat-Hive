alter table public.hive_room_participants
  add column if not exists attendee_email text;

create index if not exists hive_room_participants_attendee_email_joined_at_idx
  on public.hive_room_participants (attendee_email, joined_at desc)
  where attendee_email is not null;