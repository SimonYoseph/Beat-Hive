create table if not exists public.hive_room_hosts (
  room_id uuid not null references public.hive_rooms(id) on delete cascade,
  email text not null,
  added_by_email text,
  created_at timestamptz not null default now(),
  primary key (room_id, email)
);

insert into public.hive_room_hosts (room_id, email, added_by_email)
select id, lower(host_email), lower(host_email)
from public.hive_rooms
on conflict (room_id, email) do nothing;

create index if not exists hive_room_hosts_email_idx
  on public.hive_room_hosts (email);

grant all on public.hive_room_hosts to service_role;