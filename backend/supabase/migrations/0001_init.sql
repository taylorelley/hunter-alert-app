-- Schema initialization for constrained-network messaging backend.
create extension if not exists "pgcrypto";

create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  email text,
  phone text,
  emergency_contacts jsonb not null default '[]'::jsonb,
  is_premium boolean not null default false,
  privacy_settings jsonb not null default '{"shareLocation": true, "showOnMap": true, "notifyContacts": true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  participant_ids uuid[] not null,
  title text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint participant_not_empty check (array_length(participant_ids, 1) >= 1)
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  sender_id uuid not null references profiles (id) on delete cascade,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  client_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sync_cursors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  conversation_id uuid not null references conversations (id) on delete cascade,
  last_cursor timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sync_cursors_unique unique (user_id, conversation_id)
);

create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  owner_id uuid not null references profiles (id) on delete cascade,
  member_ids uuid[] not null default array[]::uuid[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists waypoints (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  name text not null,
  description text,
  latitude double precision not null check (latitude >= -90 and latitude <= 90),
  longitude double precision not null check (longitude >= -180 and longitude <= 180),
  waypoint_type text not null default 'custom' check (waypoint_type in ('stand', 'camera', 'camp', 'vehicle', 'water', 'landmark', 'custom')),
  shared boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_waypoints_shared_conv check (shared = false or conversation_id is not null)
);

create table if not exists geofences (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups (id) on delete cascade,
  conversation_id uuid references conversations (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  name text not null,
  description text,
  latitude double precision not null check (latitude >= -90 and latitude <= 90),
  longitude double precision not null check (longitude >= -180 and longitude <= 180),
  radius_meters int not null default 500 check (radius_meters > 0),
  enabled boolean not null default true,
  notify_on_entry boolean not null default true,
  notify_on_exit boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_conversations_updated_at on conversations (updated_at desc);
create index if not exists idx_messages_conversation_created on messages (conversation_id, created_at desc);
create index if not exists idx_sync_cursors_user_updated on sync_cursors (user_id, updated_at desc);
create index if not exists idx_groups_owner on groups (owner_id);
create index if not exists idx_groups_updated_at on groups (updated_at desc);
create index if not exists idx_groups_member_ids_gin on groups using gin (member_ids);
create index if not exists idx_waypoints_conversation on waypoints (conversation_id);
create index if not exists idx_waypoints_user on waypoints (user_id);
create index if not exists idx_waypoints_updated_at on waypoints (updated_at desc);
create index if not exists idx_geofences_group on geofences (group_id);
create index if not exists idx_geofences_conversation on geofences (conversation_id);
create index if not exists idx_geofences_user_enabled on geofences (user_id, enabled);
create index if not exists idx_geofences_updated_at on geofences (updated_at desc);

-- Timestamp maintenance
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_profiles_updated_at
before update on profiles
for each row execute procedure public.set_updated_at();

create trigger set_conversations_updated_at
before update on conversations
for each row execute procedure public.set_updated_at();

create trigger set_messages_updated_at
before update on messages
for each row execute procedure public.set_updated_at();

create trigger set_sync_cursors_updated_at
before update on sync_cursors
for each row execute procedure public.set_updated_at();

create trigger set_groups_updated_at
before update on groups
for each row execute procedure public.set_updated_at();

create trigger set_waypoints_updated_at
before update on waypoints
for each row execute procedure public.set_updated_at();

create trigger set_geofences_updated_at
before update on geofences
for each row execute procedure public.set_updated_at();

-- Row Level Security
alter table profiles enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table sync_cursors enable row level security;
alter table groups enable row level security;
alter table waypoints enable row level security;
alter table geofences enable row level security;

-- Profiles policies
create policy profiles_select on profiles
for select using (auth.uid() = id);

create policy profiles_insert on profiles
for insert with check (auth.uid() = id);

create policy profiles_update on profiles
for update using (auth.uid() = id)
with check (auth.uid() = id);

-- Conversations policies
create policy conversations_select on conversations
for select using (auth.uid() = any(participant_ids));

create policy conversations_insert on conversations
for insert with check (auth.uid() = any(participant_ids));

create policy conversations_update on conversations
for update using (auth.uid() = any(participant_ids))
with check (auth.uid() = any(participant_ids));

-- Messages policies
create policy messages_select on messages
for select using (
  exists (
    select 1 from conversations c
    where c.id = conversation_id
      and auth.uid() = any(c.participant_ids)
  )
);

create policy messages_insert on messages
for insert with check (
  sender_id = auth.uid()
  and exists (
    select 1 from conversations c
    where c.id = conversation_id
      and auth.uid() = any(c.participant_ids)
  )
);

create policy messages_update on messages
for update using (
  sender_id = auth.uid()
  and exists (
    select 1 from conversations c
    where c.id = conversation_id
      and auth.uid() = any(c.participant_ids)
  )
) with check (
  sender_id = auth.uid()
  and exists (
    select 1 from conversations c
    where c.id = conversation_id
      and auth.uid() = any(c.participant_ids)
  )
);

-- Sync cursor policies
create policy sync_cursors_select on sync_cursors
for select using (user_id = auth.uid());

create policy sync_cursors_insert on sync_cursors
for insert with check (user_id = auth.uid());

create policy sync_cursors_update on sync_cursors
for update using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Groups policies
create policy groups_select on groups
for select using (owner_id = auth.uid() or auth.uid() = any(member_ids));

create policy groups_insert on groups
for insert with check (owner_id = auth.uid());

create policy groups_update on groups
for update using (owner_id = auth.uid() or auth.uid() = any(member_ids))
with check (owner_id = auth.uid() or auth.uid() = any(member_ids));

create policy groups_delete on groups
for delete using (owner_id = auth.uid());

-- Waypoints policies
create policy waypoints_select on waypoints
for select using (
  user_id = auth.uid()
  or (shared = true and conversation_id is not null and exists (
    select 1 from conversations c
    where c.id = conversation_id
      and auth.uid() = any(c.participant_ids)
  ))
);

create policy waypoints_insert on waypoints
for insert with check (user_id = auth.uid());

create policy waypoints_update on waypoints
for update using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy waypoints_delete on waypoints
for delete using (user_id = auth.uid());

-- Geofences policies
create policy geofences_select on geofences
for select using (
  user_id = auth.uid()
  or (group_id is not null and exists (
    select 1 from groups g
    where g.id = group_id
      and (g.owner_id = auth.uid() or auth.uid() = any(g.member_ids))
  ))
  or (conversation_id is not null and exists (
    select 1 from conversations c
    where c.id = conversation_id
      and auth.uid() = any(c.participant_ids)
  ))
);

create policy geofences_insert on geofences
for insert with check (user_id = auth.uid());

create policy geofences_update on geofences
for update using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy geofences_delete on geofences
for delete using (user_id = auth.uid());

-- RPC Functions
create or replace function public.send_message_batch(messages jsonb)
returns setof messages as $$
declare
  max_count int := coalesce(current_setting('app.max_message_batch', true)::int, 20);
  max_body_bytes int := 4000;
  oversized boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if coalesce(jsonb_typeof(messages), 'null') <> 'array' then
    raise exception 'messages payload must be a JSON array';
  end if;

  if jsonb_array_length(messages) > max_count then
    raise exception 'Too many messages: max batch size is %', max_count;
  end if;

  select exists (
    select 1 from jsonb_array_elements(messages) as entry(value)
    where length(coalesce(entry.value->>'body', '')) > max_body_bytes
  ) into oversized;

  if oversized then
    raise exception 'Message body exceeds % bytes', max_body_bytes;
  end if;

  return query
  insert into messages (conversation_id, sender_id, body, metadata, client_id, created_at)
  select
    (entry.value->>'conversation_id')::uuid,
    auth.uid(),
    trim(entry.value->>'body'),
    coalesce(entry.value->'metadata', '{}'::jsonb),
    entry.value->>'client_id',
    coalesce((entry.value->>'created_at')::timestamptz, now())
  from jsonb_array_elements(messages) as entry(value)
  where (entry.value ? 'conversation_id')
    and (entry.value ? 'body')
    and length(trim(coalesce(entry.value->>'body', ''))) > 0
    and exists (
      select 1 from conversations c
      where c.id = (entry.value->>'conversation_id')::uuid
        and auth.uid() = any(c.participant_ids)
    )
  limit max_count
  returning *;
end;
$$ language plpgsql security invoker set search_path = public;

comment on function public.send_message_batch is 'Batch insert messages for conversations the caller participates in. Enforces auth, batch size, and payload limits.';

create or replace function public.pull_updates(since timestamptz default null)
returns jsonb as $$
declare
  max_rows int := coalesce(current_setting('app.max_pull_limit', true)::int, 100);
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  return jsonb_build_object(
    'conversations', (
      select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from (
        select * from conversations
        where auth.uid() = any(participant_ids)
          and (since is null or updated_at > since)
        order by updated_at asc
        limit max_rows
      ) as c
    ),
    'messages', (
      select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from (
        select m.* from messages m
        join conversations c on c.id = m.conversation_id
        where auth.uid() = any(c.participant_ids)
          and (since is null or m.created_at > since)
        order by m.created_at asc
        limit max_rows
      ) as m
    ),
    'sync_cursors', (
      select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from (
        select * from sync_cursors
        where user_id = auth.uid()
          and (since is null or updated_at > since)
        order by updated_at asc
        limit max_rows
      ) as s
    ),
    'groups', (
      select coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) from (
        select * from groups
        where (owner_id = auth.uid() or auth.uid() = any(member_ids))
          and (since is null or updated_at > since)
        order by updated_at asc
        limit max_rows
      ) as g
    ),
    'waypoints', (
      select coalesce(jsonb_agg(to_jsonb(w)), '[]'::jsonb) from (
        select w.* from waypoints w
        left join conversations c on c.id = w.conversation_id
        where (
          w.user_id = auth.uid()
          or (w.shared = true and w.conversation_id is not null and auth.uid() = any(c.participant_ids))
        )
          and (since is null or w.updated_at > since)
        order by w.updated_at asc
        limit max_rows
      ) as w
    ),
    'geofences', (
      select coalesce(jsonb_agg(to_jsonb(gf)), '[]'::jsonb) from (
        select gf.* from geofences gf
        left join groups g on g.id = gf.group_id
        left join conversations c on c.id = gf.conversation_id
        where (
          gf.user_id = auth.uid()
          or (gf.group_id is not null and (g.owner_id = auth.uid() or auth.uid() = any(g.member_ids)))
          or (gf.conversation_id is not null and auth.uid() = any(c.participant_ids))
        )
          and (since is null or gf.updated_at > since)
        order by gf.updated_at asc
        limit max_rows
      ) as gf
    ),
    'profiles', (
      select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) from (
        select * from profiles
        where id = auth.uid()
          and (since is null or updated_at > since)
        limit 1
      ) as p
    )
  );
end;
$$ language plpgsql security invoker set search_path = public;

comment on function public.pull_updates is 'Return constrained batches of conversations, messages, sync cursors, groups, waypoints, geofences, and profile updated after the provided timestamp for the authenticated user.';

-- Group management functions
create or replace function public.create_group(
  group_name text,
  group_description text default null
)
returns groups as $$
declare
  new_group groups;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  insert into groups (name, description, owner_id, member_ids)
  values (group_name, group_description, auth.uid(), array[auth.uid()])
  returning * into new_group;

  return new_group;
end;
$$ language plpgsql security invoker set search_path = public;

comment on function public.create_group is 'Create a new group with the authenticated user as owner and initial member.';

create or replace function public.join_group(group_id uuid)
returns groups as $$
declare
  updated_group groups;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  update groups
  set member_ids = array_append(member_ids, auth.uid())
  where id = group_id
    and not (auth.uid() = any(member_ids))
  returning * into updated_group;

  if updated_group is null then
    raise exception 'Group not found or already a member';
  end if;

  return updated_group;
end;
$$ language plpgsql security invoker set search_path = public;

comment on function public.join_group is 'Add authenticated user to a group.';

create or replace function public.leave_group(group_id uuid)
returns boolean as $$
declare
  group_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  select owner_id into group_owner from groups where id = group_id;

  if group_owner = auth.uid() then
    raise exception 'Owner cannot leave group. Delete the group instead.';
  end if;

  update groups
  set member_ids = array_remove(member_ids, auth.uid())
  where id = group_id
    and auth.uid() = any(member_ids);

  return found;
end;
$$ language plpgsql security invoker set search_path = public;

comment on function public.leave_group is 'Remove authenticated user from a group.';

-- Waypoint management functions
create or replace function public.add_waypoint(
  waypoint_name text,
  latitude double precision,
  longitude double precision,
  waypoint_type text default 'custom',
  waypoint_description text default null,
  trip_id uuid default null,
  is_shared boolean default false
)
returns waypoints as $$
declare
  new_waypoint waypoints;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if is_shared and trip_id is null then
    raise exception 'Shared waypoints must be associated with a trip (conversation)';
  end if;

  if trip_id is not null and not exists (
    select 1 from conversations
    where id = trip_id and auth.uid() = any(participant_ids)
  ) then
    raise exception 'Trip not found or access denied';
  end if;

  insert into waypoints (
    name, description, latitude, longitude,
    waypoint_type, user_id, conversation_id, shared
  )
  values (
    waypoint_name, waypoint_description, latitude, longitude,
    waypoint_type, auth.uid(), trip_id, is_shared
  )
  returning * into new_waypoint;

  return new_waypoint;
end;
$$ language plpgsql security invoker set search_path = public;

comment on function public.add_waypoint is 'Create a new waypoint for the authenticated user, optionally associated with a trip.';

create or replace function public.delete_waypoint(waypoint_id uuid)
returns boolean as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  delete from waypoints
  where id = waypoint_id and user_id = auth.uid();

  return found;
end;
$$ language plpgsql security invoker set search_path = public;

comment on function public.delete_waypoint is 'Delete a waypoint owned by the authenticated user.';

-- Geofence management functions
create or replace function public.create_geofence(
  geofence_name text,
  latitude double precision,
  longitude double precision,
  radius_meters int default 500,
  geofence_description text default null,
  target_group_id uuid default null,
  target_conversation_id uuid default null,
  notify_entry boolean default true,
  notify_exit boolean default true
)
returns geofences as $$
declare
  new_geofence geofences;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if target_group_id is not null and not exists (
    select 1 from groups
    where id = target_group_id
      and (owner_id = auth.uid() or auth.uid() = any(member_ids))
  ) then
    raise exception 'Group not found or access denied';
  end if;

  if target_conversation_id is not null and not exists (
    select 1 from conversations
    where id = target_conversation_id and auth.uid() = any(participant_ids)
  ) then
    raise exception 'Trip not found or access denied';
  end if;

  insert into geofences (
    name, description, latitude, longitude, radius_meters,
    user_id, group_id, conversation_id,
    notify_on_entry, notify_on_exit
  )
  values (
    geofence_name, geofence_description, latitude, longitude, radius_meters,
    auth.uid(), target_group_id, target_conversation_id,
    notify_entry, notify_exit
  )
  returning * into new_geofence;

  return new_geofence;
end;
$$ language plpgsql security invoker set search_path = public;

comment on function public.create_geofence is 'Create a new geofence for the authenticated user, optionally associated with a group or trip.';

create or replace function public.toggle_geofence(geofence_id uuid, is_enabled boolean)
returns geofences as $$
declare
  updated_geofence geofences;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  update geofences
  set enabled = is_enabled
  where id = geofence_id and user_id = auth.uid()
  returning * into updated_geofence;

  if updated_geofence is null then
    raise exception 'Geofence not found or access denied';
  end if;

  return updated_geofence;
end;
$$ language plpgsql security invoker set search_path = public;

comment on function public.toggle_geofence is 'Enable or disable a geofence owned by the authenticated user.';

create or replace function public.delete_geofence(geofence_id uuid)
returns boolean as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  delete from geofences
  where id = geofence_id and user_id = auth.uid();

  return found;
end;
$$ language plpgsql security invoker set search_path = public;

comment on function public.delete_geofence is 'Delete a geofence owned by the authenticated user.';
