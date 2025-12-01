-- Track active client devices and allow users to revoke sessions.

create table if not exists device_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  client_session_id text not null,
  device_model text,
  platform text,
  os_version text,
  app_version text,
  metadata jsonb not null default '{}'::jsonb,
  last_seen timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint device_sessions_user_unique unique (user_id, client_session_id)
);

create index if not exists idx_device_sessions_user_last_seen on device_sessions (user_id, last_seen desc);
create index if not exists idx_device_sessions_user_revoked on device_sessions (user_id, revoked_at);

create trigger set_device_sessions_updated_at
before update on device_sessions
for each row execute procedure public.set_updated_at();

alter table device_sessions enable row level security;

create policy device_sessions_select on device_sessions
for select using (user_id = auth.uid());

create policy device_sessions_insert on device_sessions
for insert with check (user_id = auth.uid());

create policy device_sessions_update on device_sessions
for update using (user_id = auth.uid())
with check (user_id = auth.uid());

create or replace function public.record_device_session(
  client_session text,
  device_model text,
  platform text,
  os_version text,
  app_version text default null,
  metadata jsonb default '{}'::jsonb
) returns device_sessions as $$
declare
  stored device_sessions;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  insert into device_sessions (user_id, client_session_id, device_model, platform, os_version, app_version, metadata, last_seen, revoked_at)
  values (auth.uid(), client_session, device_model, platform, os_version, app_version, coalesce(metadata, '{}'::jsonb), now(), null)
  on conflict (user_id, client_session_id) do update
    set device_model = excluded.device_model,
        platform = excluded.platform,
        os_version = excluded.os_version,
        app_version = excluded.app_version,
        metadata = excluded.metadata,
        last_seen = now(),
        revoked_at = null
  returning * into stored;

  return stored;
end;
$$ language plpgsql security invoker set search_path = public;

comment on function public.record_device_session is 'Upsert a device session for the authenticated user and refresh last_seen.';

create or replace function public.revoke_device_session(target_id uuid)
returns device_sessions as $$
declare
  updated device_sessions;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  update device_sessions
  set revoked_at = now()
  where id = target_id
    and user_id = auth.uid()
  returning * into updated;

  if updated is null then
    raise exception 'Session not found or not permitted';
  end if;

  return updated;
end;
$$ language plpgsql security invoker set search_path = public;

comment on function public.revoke_device_session is 'Mark a device session as revoked for the authenticated user.';

-- Extend pull_updates to include device sessions for the caller.
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
        where (
          gf.user_id = auth.uid()
          or (gf.group_id is not null and exists (select 1 from groups g where g.id = gf.group_id and (g.owner_id = auth.uid() or auth.uid() = any(g.member_ids))))
        )
          and (since is null or gf.updated_at > since)
        order by gf.updated_at asc
        limit max_rows
      ) as gf
    ),
    'profiles', (
      select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) from (
        select * from profiles
        where (id = auth.uid() or id in (
          select unnest(member_ids) from groups where owner_id = auth.uid() or auth.uid() = any(member_ids)
        ))
          and (since is null or updated_at > since)
        order by updated_at asc
        limit max_rows
      ) as p
    ),
    'group_invitations', (
      select coalesce(jsonb_agg(to_jsonb(gi)), '[]'::jsonb) from (
        select * from group_invitations
        where (
          sender_id = auth.uid()
          or recipient_id = auth.uid()
          or exists (
            select 1 from groups g where g.id = group_invitations.group_id and (g.owner_id = auth.uid() or auth.uid() = any(g.member_ids))
          )
        )
          and (since is null or updated_at > since)
        order by updated_at asc
        limit max_rows
      ) as gi
    ),
    'group_activity', (
      select coalesce(jsonb_agg(to_jsonb(ga)), '[]'::jsonb) from (
        select * from group_activity
        where (
          actor_id = auth.uid()
          or exists (
            select 1 from groups g where g.id = group_activity.group_id and (g.owner_id = auth.uid() or auth.uid() = any(g.member_ids))
          )
        )
          and (since is null or updated_at > since)
        order by created_at asc
        limit max_rows
      ) as ga
    ),
    'device_sessions', (
      select coalesce(jsonb_agg(to_jsonb(ds)), '[]'::jsonb) from (
        select * from device_sessions
        where user_id = auth.uid()
          and (since is null or updated_at > since)
        order by updated_at asc
        limit max_rows
      ) as ds
    )
  );
end;
$$ language plpgsql security invoker set search_path = public;

comment on function public.pull_updates is 'Return constrained batches of conversations, messages, sync cursors, device sessions, groups, geofences, and profiles updated after the provided timestamp for the authenticated user.';
