-- Add dedicated privacy settings per user and enforce sharing preferences in sync payloads.

create table if not exists privacy_settings (
  user_id uuid primary key references profiles (id) on delete cascade,
  share_location boolean not null default true,
  show_on_map boolean not null default true,
  share_trips boolean not null default true,
  share_waypoints boolean not null default true,
  notify_contacts boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_privacy_settings_updated on privacy_settings (updated_at desc);

create or replace function public.set_privacy_settings_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_privacy_settings_updated_at
before update on privacy_settings
for each row execute procedure public.set_privacy_settings_updated_at();

-- Ensure every profile receives a default privacy row.
create or replace function public.ensure_privacy_settings()
returns trigger as $$
begin
  insert into privacy_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql;

create trigger trg_profiles_privacy_defaults
after insert on profiles
for each row execute procedure public.ensure_privacy_settings();

alter table privacy_settings enable row level security;

create policy privacy_settings_select on privacy_settings
for select using (
  user_id = auth.uid()
  or user_id in (
    select unnest(member_ids)
    from groups
    where owner_id = auth.uid() or auth.uid() = any(member_ids)
  )
);

create policy privacy_settings_insert on privacy_settings
for insert with check (user_id = auth.uid());

create policy privacy_settings_update on privacy_settings
for update using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists profiles_select on profiles;

create policy profiles_select on profiles
for select using (
  id = auth.uid()
  or id in (
    select unnest(member_ids)
    from groups
    where owner_id = auth.uid() or auth.uid() = any(member_ids)
  )
);

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
          and not exists (
            select 1 from unnest(participant_ids) as pid
            left join privacy_settings ps on ps.user_id = pid
            where pid <> auth.uid() and coalesce(ps.share_trips, true) = false
          )
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
          and not exists (
            select 1 from unnest(c.participant_ids) as pid
            left join privacy_settings ps on ps.user_id = pid
            where pid <> auth.uid() and coalesce(ps.share_trips, true) = false
          )
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
        left join privacy_settings ps on ps.user_id = w.user_id
        where (
          w.user_id = auth.uid()
          or (
            w.shared = true
            and coalesce(ps.share_waypoints, true)
            and w.conversation_id is not null
            and auth.uid() = any(c.participant_ids)
          )
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
        left join privacy_settings ps on ps.user_id = gf.user_id
        where (
          gf.user_id = auth.uid()
          or (
            gf.group_id is not null and (g.owner_id = auth.uid() or auth.uid() = any(g.member_ids))
          )
          or (
            gf.conversation_id is not null
            and auth.uid() = any(c.participant_ids)
            and coalesce(ps.share_trips, true)
          )
        )
          and (since is null or gf.updated_at > since)
        order by gf.updated_at asc
        limit max_rows
      ) as gf
    ),
    'profiles', (
      select coalesce(jsonb_agg(to_jsonb(safe_profile)), '[]'::jsonb) from (
        select
          p.id,
          p.display_name,
          p.avatar_url,
          p.email,
          p.phone,
          p.emergency_contacts,
          p.is_premium,
          jsonb_strip_nulls(jsonb_build_object(
            'shareLocation', coalesce(ps.share_location, true),
            'showOnMap', coalesce(ps.show_on_map, true),
            'shareTrips', coalesce(ps.share_trips, true),
            'shareWaypoints', coalesce(ps.share_waypoints, true),
            'notifyContacts', coalesce(ps.notify_contacts, true)
          )) as privacy_settings,
          case
            when coalesce(ps.share_location, true) and coalesce(ps.show_on_map, true) then p.metadata
            else coalesce(p.metadata, '{}'::jsonb) - 'last_location' - 'lastLocation'
          end as metadata,
          p.created_at,
          p.updated_at
        from profiles p
        left join privacy_settings ps on ps.user_id = p.id
        where (
          p.id = auth.uid()
          or p.id in (
            select unnest(member_ids)
            from groups
            where owner_id = auth.uid() or auth.uid() = any(member_ids)
          )
        )
          and (since is null or p.updated_at > since)
        order by p.updated_at asc
        limit max_rows
      ) as safe_profile
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
        order by updated_at asc
        limit max_rows
      ) as ga
    ),
    'privacy_settings', (
      select coalesce(jsonb_agg(to_jsonb(ps)), '[]'::jsonb) from (
        select * from privacy_settings
        where (
          user_id = auth.uid()
          or user_id in (
            select unnest(member_ids)
            from groups
            where owner_id = auth.uid() or auth.uid() = any(member_ids)
          )
        )
          and (since is null or updated_at > since)
        order by updated_at asc
        limit max_rows
      ) as ps
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

comment on function public.pull_updates is 'Return constrained batches of conversations, messages, sync cursors, and related entities while enforcing privacy preferences.';
