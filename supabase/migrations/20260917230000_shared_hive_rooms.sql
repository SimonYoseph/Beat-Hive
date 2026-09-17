create extension if not exists pgcrypto;

create table if not exists public.hive_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{8}$'),
  host_email text not null,
  host_name text not null,
  name text not null check (char_length(name) between 1 and 100),
  state jsonb not null default jsonb_build_object(
    'requests', '[]'::jsonb,
    'queue', '[]'::jsonb,
    'nowPlaying', null,
    'settings', jsonb_build_object('requestsPaused', false, 'queueLocked', false, 'maxRequests', 20, 'preventDuplicates', true, 'voteThreshold', 0)
  ),
  version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.hive_rooms enable row level security;

create policy "Public room reads" on public.hive_rooms for select using (true);

create table if not exists public.hive_room_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.hive_rooms(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  display_name text not null check (char_length(display_name) between 1 and 60),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (room_id, token)
);

create table if not exists public.hive_request_votes (
  room_id uuid not null references public.hive_rooms(id) on delete cascade,
  video_id text not null,
  participant_id uuid not null references public.hive_room_participants(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (room_id, video_id, participant_id)
);

alter table public.hive_room_participants enable row level security;
alter table public.hive_request_votes enable row level security;

grant usage on schema public to anon, authenticated, service_role;
grant select on public.hive_rooms to anon, authenticated;
grant all on public.hive_rooms, public.hive_room_participants, public.hive_request_votes to service_role;

create or replace function public.update_hive_room_state(
  room_code text,
  expected_version bigint,
  next_state jsonb
) returns public.hive_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_room public.hive_rooms;
begin
  update public.hive_rooms
  set state = next_state, version = version + 1, updated_at = now()
  where code = room_code and version = expected_version
  returning * into updated_room;

  if updated_room is null then
    raise exception 'Room state was updated by another participant';
  end if;

  return updated_room;
end;
$$;

create or replace function public.upvote_hive_request(
  room_code text,
  video_id text,
  voter_token uuid
) returns public.hive_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_room public.hive_rooms;
  voter_id uuid;
begin
  select participants.id into voter_id
  from public.hive_room_participants as participants
  join public.hive_rooms as rooms on rooms.id = participants.room_id
  where rooms.code = room_code and participants.token = voter_token;

  if voter_id is null then
    raise exception 'Room membership is required';
  end if;

  insert into public.hive_request_votes (room_id, video_id, participant_id)
  select id, video_id, voter_id from public.hive_rooms where code = room_code
  on conflict do nothing;
  if not found then
    raise exception 'You have already voted for this request';
  end if;

  update public.hive_rooms
  set state = jsonb_set(
        state,
        '{requests}',
        coalesce((
          select jsonb_agg(
            case when item->>'videoId' = video_id
              then jsonb_set(item, '{upvotes}', to_jsonb(coalesce((item->>'upvotes')::int, 0) + 1))
              else item
            end
          )
          from jsonb_array_elements(coalesce(state->'requests', '[]'::jsonb)) as item
        ), '[]'::jsonb)
      ),
      version = version + 1,
      updated_at = now()
  where code = room_code
  returning * into updated_room;

  if updated_room is null then
    raise exception 'Room not found';
  end if;

  return updated_room;
end;
$$;

revoke all on function public.update_hive_room_state(text, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.upvote_hive_request(text, text, uuid) from public, anon, authenticated;
grant execute on function public.update_hive_room_state(text, bigint, jsonb) to service_role;
grant execute on function public.upvote_hive_request(text, text, uuid) to service_role;

alter publication supabase_realtime add table public.hive_rooms;