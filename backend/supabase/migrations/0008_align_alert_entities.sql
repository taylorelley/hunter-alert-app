-- Align alert-related entities with client expectations and ensure update triggers exist.

-- Provide compatibility trigger function for migrations that referenced trigger_set_updated_at.
create or replace function public.trigger_set_updated_at()
returns trigger as $$
begin
  return public.set_updated_at();
end;
$$ language plpgsql;

-- Ensure group invitations table exists with required constraints and indexes.
create table if not exists group_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups (id) on delete cascade,
  sender_id uuid not null references profiles (id) on delete cascade,
  recipient_id uuid references profiles (id) on delete set null,
  recipient_email text,
  role text not null default 'member' check (role in ('member', 'admin')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_recipient_present check (recipient_id is not null or recipient_email is not null)
);

create index if not exists idx_group_invitations_group on group_invitations (group_id, status);
create index if not exists idx_group_invitations_recipient on group_invitations (recipient_id);
create index if not exists idx_group_invitations_sender on group_invitations (sender_id);

alter table group_invitations enable row level security;

drop policy if exists group_invitations_select on group_invitations;
create policy group_invitations_select on group_invitations
for select using (
  sender_id = auth.uid()
  or recipient_id = auth.uid()
  or exists (
    select 1 from groups g
    where g.id = group_invitations.group_id
      and (g.owner_id = auth.uid() or auth.uid() = any(g.member_ids))
  )
);

drop policy if exists group_invitations_insert on group_invitations;
create policy group_invitations_insert on group_invitations
for insert with check (
  sender_id = auth.uid()
  and exists (
    select 1 from groups g
    where g.id = group_id
      and (g.owner_id = auth.uid() or auth.uid() = any(g.member_ids))
  )
);

drop policy if exists group_invitations_update on group_invitations;
create policy group_invitations_update on group_invitations
for update using (
  sender_id = auth.uid()
  or recipient_id = auth.uid()
  or (
    recipient_id is null
    and recipient_email is not null
    and exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.email, '')) = lower(recipient_email)
    )
  )
)
with check (
  sender_id = auth.uid()
  or recipient_id = auth.uid()
  or (
    recipient_id is null
    and recipient_email is not null
    and exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.email, '')) = lower(recipient_email)
    )
  )
);

drop trigger if exists set_group_invitations_updated_at on group_invitations;
create trigger set_group_invitations_updated_at
before update on group_invitations
for each row execute procedure public.set_updated_at();

-- Ensure group activity table exists for feeds.
create table if not exists group_activity (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups (id) on delete cascade,
  actor_id uuid not null references profiles (id) on delete cascade,
  activity_type text not null check (activity_type in ('create', 'invite', 'join', 'leave', 'geofence', 'waypoint', 'role_change', 'alert')),
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_group_activity_group on group_activity (group_id, created_at desc);
create index if not exists idx_group_activity_actor on group_activity (actor_id);

alter table group_activity enable row level security;

drop policy if exists group_activity_select on group_activity;
create policy group_activity_select on group_activity
for select using (
  actor_id = auth.uid()
  or exists (
    select 1 from groups g
    where g.id = group_activity.group_id
      and (g.owner_id = auth.uid() or auth.uid() = any(g.member_ids))
  )
);

drop policy if exists group_activity_insert on group_activity;
create policy group_activity_insert on group_activity
for insert with check (actor_id = auth.uid());

drop trigger if exists set_group_activity_updated_at on group_activity;
create trigger set_group_activity_updated_at
before update on group_activity
for each row execute procedure public.set_updated_at();

-- Device sessions alignment
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

alter table device_sessions enable row level security;

drop policy if exists device_sessions_select on device_sessions;
create policy device_sessions_select on device_sessions
for select using (user_id = auth.uid());

drop policy if exists device_sessions_insert on device_sessions;
create policy device_sessions_insert on device_sessions
for insert with check (user_id = auth.uid());

drop policy if exists device_sessions_update on device_sessions;
create policy device_sessions_update on device_sessions
for update using (user_id = auth.uid())
with check (user_id = auth.uid());

drop trigger if exists set_device_sessions_updated_at on device_sessions;
create trigger set_device_sessions_updated_at
before update on device_sessions
for each row execute procedure public.set_updated_at();

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

-- Privacy settings alignment
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

drop trigger if exists trg_privacy_settings_updated_at on privacy_settings;
create trigger trg_privacy_settings_updated_at
before update on privacy_settings
for each row execute procedure public.set_updated_at();

alter table privacy_settings enable row level security;

drop policy if exists privacy_settings_select on privacy_settings;
create policy privacy_settings_select on privacy_settings
for select using (
  user_id = auth.uid()
  or user_id in (
    select unnest(member_ids)
    from groups
    where owner_id = auth.uid() or auth.uid() = any(member_ids)
  )
);

drop policy if exists privacy_settings_insert on privacy_settings;
create policy privacy_settings_insert on privacy_settings
for insert with check (user_id = auth.uid());

drop policy if exists privacy_settings_update on privacy_settings;
create policy privacy_settings_update on privacy_settings
for update using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Push subscriptions with consistent defaults
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  device_session_id uuid references device_sessions (id) on delete set null,
  token text not null,
  platform text,
  environment text default 'production',
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  last_delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_user_token unique (user_id, token)
);

create index if not exists idx_push_subscriptions_user_updated on push_subscriptions (user_id, updated_at desc);
create index if not exists idx_push_subscriptions_updated_at on push_subscriptions (updated_at desc);

drop trigger if exists set_push_subscriptions_updated_at on push_subscriptions;
create trigger set_push_subscriptions_updated_at
before update on push_subscriptions
for each row execute procedure public.set_updated_at();

alter table push_subscriptions enable row level security;

drop policy if exists push_subscriptions_select on push_subscriptions;
create policy push_subscriptions_select on push_subscriptions
for select using (user_id = auth.uid());

drop policy if exists push_subscriptions_insert on push_subscriptions;
create policy push_subscriptions_insert on push_subscriptions
for insert with check (user_id = auth.uid());

drop policy if exists push_subscriptions_update on push_subscriptions;
create policy push_subscriptions_update on push_subscriptions
for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists push_subscriptions_delete on push_subscriptions;
create policy push_subscriptions_delete on push_subscriptions
for delete using (user_id = auth.uid());

-- SMS alert subscriptions
create table if not exists sms_alert_subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  phone text not null,
  status text not null default 'pending' check (status in ('pending', 'verified', 'disabled')),
  verification_code text,
  verification_expires_at timestamptz,
  verified_at timestamptz,
  allow_checkins boolean not null default true,
  allow_sos boolean not null default true,
  last_dispatched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sms_alert_subscriptions_updated on sms_alert_subscriptions (updated_at desc);

drop trigger if exists set_sms_alert_subscriptions_updated_at on sms_alert_subscriptions;
create trigger set_sms_alert_subscriptions_updated_at
before update on sms_alert_subscriptions
for each row execute procedure public.set_updated_at();

alter table sms_alert_subscriptions enable row level security;

drop policy if exists sms_alert_subscriptions_select on sms_alert_subscriptions;
create policy sms_alert_subscriptions_select on sms_alert_subscriptions
for select using (user_id = auth.uid());

drop policy if exists sms_alert_subscriptions_insert on sms_alert_subscriptions;
create policy sms_alert_subscriptions_insert on sms_alert_subscriptions
for insert with check (user_id = auth.uid());

drop policy if exists sms_alert_subscriptions_update on sms_alert_subscriptions;
create policy sms_alert_subscriptions_update on sms_alert_subscriptions
for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists sms_alert_subscriptions_delete on sms_alert_subscriptions;
create policy sms_alert_subscriptions_delete on sms_alert_subscriptions
for delete using (user_id = auth.uid());

create or replace function public.begin_sms_verification(
  phone text,
  allow_checkins boolean default true,
  allow_sos boolean default true
) returns sms_alert_subscriptions as $$
declare
  generated_code text;
  subscription sms_alert_subscriptions;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if phone is null or char_length(trim(phone)) < 6 then
    raise exception 'A valid phone number is required';
  end if;

  generated_code := lpad((abs(('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::int) % 1000000)::text, 6, '0');

  insert into sms_alert_subscriptions (
    user_id,
    phone,
    status,
    verification_code,
    verification_expires_at,
    verified_at,
    allow_checkins,
    allow_sos
  ) values (
    auth.uid(),
    trim(phone),
    'pending',
    generated_code,
    now() + interval '15 minutes',
    null,
    allow_checkins,
    allow_sos
  )
  on conflict (user_id) do update set
    phone = excluded.phone,
    status = 'pending',
    verification_code = excluded.verification_code,
    verification_expires_at = excluded.verification_expires_at,
    verified_at = null,
    allow_checkins = excluded.allow_checkins,
    allow_sos = excluded.allow_sos,
    updated_at = now()
  returning * into subscription;

  return subscription;
end;
$$ language plpgsql security invoker set search_path = public;

create or replace function public.confirm_sms_verification(code text)
returns sms_alert_subscriptions as $$
declare
  subscription sms_alert_subscriptions;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  select * into subscription from sms_alert_subscriptions where user_id = auth.uid();

  if not found then
    raise exception 'No SMS alert subscription found';
  end if;

  if subscription.status = 'verified' and subscription.verified_at is not null then
    return subscription;
  end if;

  if subscription.verification_code is null or subscription.verification_expires_at is null then
    raise exception 'Verification code missing';
  end if;

  if subscription.verification_expires_at < now() then
    raise exception 'Verification code expired';
  end if;

  if encode(digest(subscription.verification_code, 'sha256'), 'hex') <> encode(digest(code, 'sha256'), 'hex') then
    raise exception 'Invalid verification code';
  end if;

  update sms_alert_subscriptions
  set status = 'verified', verified_at = now(), verification_code = null, verification_expires_at = null, updated_at = now()
  where user_id = auth.uid()
  returning * into subscription;

  return subscription;
end;
$$ language plpgsql security invoker set search_path = public;

-- Invitation helpers that clients rely on
create or replace function public.resend_group_invitation(invitation_id uuid)
returns group_invitations as $$
declare
  invitation group_invitations;
  updated_invitation group_invitations;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  select * into invitation
  from group_invitations
  where id = invitation_id;

  if not found then
    raise exception 'Invitation not found';
  end if;

  if invitation.status <> 'pending' then
    raise exception 'Only pending invitations can be resent';
  end if;

  if invitation.sender_id <> auth.uid() then
    raise exception 'Not authorized to resend this invitation';
  end if;

  update group_invitations
  set metadata = coalesce(invitation.metadata, '{}'::jsonb) || jsonb_build_object('resent_at', now())
  where id = invitation_id
  returning * into updated_invitation;

  return updated_invitation;
end;
$$ language plpgsql security invoker set search_path = public;

create or replace function public.withdraw_group_invitation(invitation_id uuid)
returns group_invitations as $$
declare
  invitation group_invitations;
  updated_invitation group_invitations;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  select * into invitation
  from group_invitations
  where id = invitation_id;

  if not found then
    raise exception 'Invitation not found';
  end if;

  if invitation.sender_id <> auth.uid() then
    raise exception 'Not authorized to withdraw this invitation';
  end if;

  if invitation.status <> 'pending' then
    raise exception 'Only pending invitations can be withdrawn';
  end if;

  update group_invitations
  set status = 'declined',
      metadata = coalesce(invitation.metadata, '{}'::jsonb) || jsonb_build_object('withdrawn_by_sender', true)
  where id = invitation_id
  returning * into updated_invitation;

  return updated_invitation;
end;
$$ language plpgsql security invoker set search_path = public;

-- Pull updates aligned with lib/supabase/types.ts
create or replace function public.pull_updates(
  since timestamptz default null,
  max_rows int default null
)
returns jsonb as $$
declare
  configured_max int := coalesce(current_setting('app.max_pull_limit', true)::int, 100);
  effective_max int := greatest(1, least(coalesce(max_rows, configured_max), configured_max));
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
        limit effective_max
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
        limit effective_max
      ) as m
    ),
    'sync_cursors', (
      select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from (
        select * from sync_cursors
        where user_id = auth.uid()
          and (since is null or updated_at > since)
        order by updated_at asc
        limit effective_max
      ) as s
    ),
    'groups', (
      select coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) from (
        select * from groups
        where (owner_id = auth.uid() or auth.uid() = any(member_ids))
          and (since is null or updated_at > since)
        order by updated_at asc
        limit effective_max
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
        limit effective_max
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
        limit effective_max
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
        limit effective_max
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
        limit effective_max
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
        limit effective_max
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
        limit effective_max
      ) as ps
    ),
    'device_sessions', (
      select coalesce(jsonb_agg(to_jsonb(ds)), '[]'::jsonb) from (
        select * from device_sessions
        where user_id = auth.uid()
          and (since is null or updated_at > since)
        order by updated_at asc
        limit effective_max
      ) as ds
    ),
    'push_subscriptions', (
      select coalesce(jsonb_agg(to_jsonb(psub)), '[]'::jsonb) from (
        select * from push_subscriptions
        where user_id = auth.uid()
          and (since is null or updated_at > since)
        order by updated_at asc
        limit effective_max
      ) as psub
    ),
    'sms_alert_subscriptions', (
      select coalesce(jsonb_agg(to_jsonb(sms)), '[]'::jsonb) from (
        select * from sms_alert_subscriptions
        where user_id = auth.uid()
          and (since is null or updated_at > since)
        order by updated_at asc
        limit effective_max
      ) as sms
    )
  );
end;
$$ language plpgsql security invoker set search_path = public;
