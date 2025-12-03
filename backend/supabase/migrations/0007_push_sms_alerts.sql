-- Add push notification subscriptions and SMS alert preferences with RLS.

-- Provide compatibility trigger function expected by earlier migrations.
create or replace function public.trigger_set_updated_at()
returns trigger as $$
begin
  return public.set_updated_at();
end;
$$ language plpgsql;

-- Push subscriptions mapped to device sessions
create table if not exists push_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  device_session_id uuid references device_sessions (id) on delete set null,
  token text not null,
  platform text,
  environment text default 'production',
  enabled boolean not null default true,
  metadata jsonb default '{}'::jsonb,
  last_delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_user_token unique (user_id, token)
);

create index if not exists idx_push_subscriptions_user_updated on push_subscriptions (user_id, updated_at desc);

create trigger set_push_subscriptions_updated_at
before update on push_subscriptions
for each row execute procedure trigger_set_updated_at();

alter table push_subscriptions enable row level security;

create policy push_subscriptions_select on push_subscriptions
for select using (user_id = auth.uid());

create policy push_subscriptions_insert on push_subscriptions
for insert with check (user_id = auth.uid());

create policy push_subscriptions_update on push_subscriptions
for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy push_subscriptions_delete on push_subscriptions
for delete using (user_id = auth.uid());

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

comment on table sms_alert_subscriptions is 'Per-user SMS alert subscription status with phone verification, opt-in controls for check-ins and SOS alerts, and dispatch tracking.';

create trigger set_sms_alert_subscriptions_updated_at
before update on sms_alert_subscriptions
for each row execute procedure trigger_set_updated_at();

create index if not exists idx_sms_alert_subscriptions_user_updated on sms_alert_subscriptions (user_id, updated_at desc);

alter table sms_alert_subscriptions enable row level security;

create policy sms_alert_subscriptions_select on sms_alert_subscriptions
for select using (user_id = auth.uid());

create policy sms_alert_subscriptions_insert on sms_alert_subscriptions
for insert with check (user_id = auth.uid());

create policy sms_alert_subscriptions_update on sms_alert_subscriptions
for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy sms_alert_subscriptions_delete on sms_alert_subscriptions
for delete using (user_id = auth.uid());

-- Begin SMS verification with a short-lived code
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

comment on function public.begin_sms_verification is 'Create or refresh an SMS verification code for the authenticated user.';

-- Confirm verification code and mark the phone number as verified
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

comment on function public.confirm_sms_verification is 'Validate an SMS verification code and enable alerts for the authenticated user.';

-- Extend pull_updates with push + SMS preferences
drop function if exists public.pull_updates(timestamptz);

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

comment on function public.pull_updates(timestamptz, int) is 'Return constrained batches of conversations, messages, sync cursors, and alert preferences while enforcing privacy settings.';
