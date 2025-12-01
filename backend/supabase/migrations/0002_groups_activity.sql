-- Enhance group collaboration with invitations, activity feeds, and richer roles.

-- Track member roles explicitly for richer client displays.
alter table if exists groups
  add column if not exists member_roles jsonb not null default '{}'::jsonb;

update groups
set member_roles = coalesce(member_roles, '{}'::jsonb) || jsonb_build_object(owner_id::text, 'owner')
where owner_id is not null;

-- Invitations table for group membership workflows.
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

create trigger set_group_invitations_updated_at
before update on group_invitations
for each row execute procedure public.set_updated_at();

-- Activity feed for group actions.
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

create trigger set_group_activity_updated_at
before update on group_activity
for each row execute procedure public.set_updated_at();

-- Enable RLS for new tables.
alter table group_invitations enable row level security;
alter table group_activity enable row level security;

-- Invitations policies
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

create policy group_invitations_insert on group_invitations
for insert with check (
  sender_id = auth.uid()
  and exists (
    select 1 from groups g
    where g.id = group_id
      and (g.owner_id = auth.uid() or auth.uid() = any(g.member_ids))
  )
);

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

-- Activity policies
create policy group_activity_select on group_activity
for select using (
  actor_id = auth.uid()
  or exists (
    select 1 from groups g
    where g.id = group_activity.group_id
      and (g.owner_id = auth.uid() or auth.uid() = any(g.member_ids))
  )
);

create policy group_activity_insert on group_activity
for insert with check (actor_id = auth.uid());

-- Refresh group functions to manage roles and create activity entries.
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

  insert into groups (name, description, owner_id, member_ids, member_roles)
  values (group_name, group_description, auth.uid(), array[auth.uid()], jsonb_build_object(auth.uid()::text, 'owner'))
  returning * into new_group;

  insert into group_activity (group_id, actor_id, activity_type, description)
  values (new_group.id, auth.uid(), 'create', 'Created the group');

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
  set member_ids = array_append(member_ids, auth.uid()),
      member_roles = coalesce(member_roles, '{}'::jsonb) || jsonb_build_object(auth.uid()::text, 'member')
  where id = group_id
    and not (auth.uid() = any(member_ids))
  returning * into updated_group;

  if updated_group is null then
    raise exception 'Group not found or already a member';
  end if;

  insert into group_activity (group_id, actor_id, activity_type, description)
  values (group_id, auth.uid(), 'join', 'Joined the group');

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

  if group_owner is null then
    raise exception 'Group not found';
  end if;

  if group_owner = auth.uid() then
    raise exception 'Owner cannot leave group. Delete the group instead.';
  end if;

  update groups
  set member_ids = array_remove(member_ids, auth.uid()),
      member_roles = (member_roles - auth.uid()::text)
  where id = group_id
    and auth.uid() = any(member_ids);

  if found then
    insert into group_activity (group_id, actor_id, activity_type, description)
    values (group_id, auth.uid(), 'leave', 'Left the group');
  end if;

  return found;
end;
$$ language plpgsql security invoker set search_path = public;

comment on function public.leave_group is 'Remove authenticated user from a group.';

-- Group invitation helpers
create or replace function public.create_group_invitation(
  group_id uuid,
  invite_email text,
  invite_role text default 'member'
)
returns group_invitations as $$
declare
  invitation group_invitations;
  invitee_id uuid;
  normalized_role text := lower(coalesce(invite_role, 'member'));
  normalized_email text := trim(invite_email);
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if normalized_role not in ('member', 'admin') then
    raise exception 'Invalid role requested';
  end if;

  if coalesce(normalized_email, '') = '' then
    raise exception 'Invitation email is required';
  end if;

  if normalized_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'Invalid invitation email';
  end if;

  if not exists (
    select 1 from groups g
    where g.id = group_id and (g.owner_id = auth.uid() or auth.uid() = any(g.member_ids))
  ) then
    raise exception 'Group not found or access denied';
  end if;

  if lower(normalized_email) = lower(coalesce((select email from profiles where id = auth.uid()), '')) then
    raise exception 'Cannot invite yourself';
  end if;

  if exists (
    select 1
    from group_invitations gi
    where gi.group_id = group_id
      and lower(coalesce(gi.recipient_email, '')) = lower(normalized_email)
      and gi.status = 'pending'
  ) then
    raise exception 'Invitation already sent to this email';
  end if;

  select id into invitee_id from profiles where lower(coalesce(email, '')) = lower(normalized_email) limit 1;

  insert into group_invitations (
    group_id, sender_id, recipient_id, recipient_email, role, metadata
  ) values (
    group_id, auth.uid(), invitee_id, normalized_email, normalized_role, jsonb_build_object('role', normalized_role)
  ) returning * into invitation;

  insert into group_activity (group_id, actor_id, activity_type, description, metadata)
  values (group_id, auth.uid(), 'invite', 'Sent an invitation', jsonb_build_object('recipient_email', normalized_email));

  return invitation;
end;
$$ language plpgsql security invoker set search_path = public;

comment on function public.create_group_invitation is 'Invite a user to join a group with an optional role.';

create or replace function public.respond_group_invitation(
  invitation_id uuid,
  decision text
)
returns group_invitations as $$
declare
  invitation group_invitations;
  normalized_decision text := lower(coalesce(decision, ''));
  target_group groups;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  select * into invitation from group_invitations where id = invitation_id and status = 'pending';

  if not found then
    raise exception 'Invitation not found or already processed';
  end if;

  if invitation.recipient_id is not null and invitation.recipient_id <> auth.uid() then
    raise exception 'Not authorized to respond to this invitation';
  end if;

  if invitation.recipient_id is null and invitation.recipient_email is not null then
    if not exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.email, '')) = lower(invitation.recipient_email)
    ) then
      raise exception 'Invitation not addressed to this user';
    end if;
  end if;

  if normalized_decision not in ('accept', 'decline') then
    raise exception 'Decision must be accept or decline';
  end if;

  update group_invitations
  set status = case normalized_decision when 'accept' then 'accepted' else 'declined' end,
      recipient_id = coalesce(recipient_id, auth.uid())
  where id = invitation_id
  returning * into invitation;

  select * into target_group from groups where id = invitation.group_id;

  if normalized_decision = 'accept' then
    update groups
    set member_ids = array_append(member_ids, auth.uid()),
        member_roles = coalesce(member_roles, '{}'::jsonb) || jsonb_build_object(auth.uid()::text, invitation.role)
    where id = invitation.group_id
      and not (auth.uid() = any(member_ids));

    insert into group_activity (group_id, actor_id, activity_type, description, metadata)
    values (
      invitation.group_id,
      auth.uid(),
      'join',
      'Accepted an invitation',
      jsonb_build_object('invitation_id', invitation.id, 'role', invitation.role)
    );
  else
    insert into group_activity (group_id, actor_id, activity_type, description, metadata)
    values (
      invitation.group_id,
      auth.uid(),
      'leave',
      'Declined an invitation',
      jsonb_build_object('invitation_id', invitation.id)
    );
  end if;

  return invitation;
end;
$$ language plpgsql security invoker set search_path = public;

comment on function public.respond_group_invitation is 'Accept or decline a group invitation.';

-- Update waypoint and geofence helpers to write activity entries.
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

  if target_group_id is not null then
    insert into group_activity (group_id, actor_id, activity_type, description, metadata)
    values (
      target_group_id,
      auth.uid(),
      'geofence',
      'Created a geofence',
      jsonb_build_object('geofence_id', new_geofence.id, 'name', geofence_name)
    );
  end if;

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

  if updated_geofence.group_id is not null then
    insert into group_activity (group_id, actor_id, activity_type, description, metadata)
    values (
      updated_geofence.group_id,
      auth.uid(),
      'alert',
      case when is_enabled then 'Enabled geofence alerts' else 'Disabled geofence alerts' end,
      jsonb_build_object('geofence_id', updated_geofence.id)
    );
  end if;

  return updated_geofence;
end;
$$ language plpgsql security invoker set search_path = public;

comment on function public.toggle_geofence is 'Enable or disable a geofence owned by the authenticated user.';

create or replace function public.update_geofence_alerts(
  geofence_id uuid,
  notify_entry boolean,
  notify_exit boolean,
  is_enabled boolean default true
)
returns geofences as $$
declare
  updated_geofence geofences;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  update geofences
  set notify_on_entry = notify_entry,
      notify_on_exit = notify_exit,
      enabled = is_enabled
  where id = geofence_id and user_id = auth.uid()
  returning * into updated_geofence;

  if updated_geofence is null then
    raise exception 'Geofence not found or access denied';
  end if;

  if updated_geofence.group_id is not null then
    insert into group_activity (group_id, actor_id, activity_type, description, metadata)
    values (
      updated_geofence.group_id,
      auth.uid(),
      'alert',
      'Updated geofence alert preferences',
      jsonb_build_object('geofence_id', updated_geofence.id, 'notify_entry', notify_entry, 'notify_exit', notify_exit)
    );
  end if;

  return updated_geofence;
end;
$$ language plpgsql security invoker set search_path = public;

comment on function public.update_geofence_alerts is 'Update notification preferences for a geofence.';

-- Pull updates now streams invitations, activities, and related profiles.
create or replace function public.pull_updates(since timestamptz default null)
returns jsonb as $$
declare
  max_rows int := coalesce(current_setting('app.max_pull_limit', true)::int, 100);
  related_profile_ids uuid[];
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  select array(
    select distinct id from (
      select auth.uid() as id
      union
      select owner_id from groups where owner_id = auth.uid() or auth.uid() = any(member_ids)
      union
      select unnest(member_ids) from groups where owner_id = auth.uid() or auth.uid() = any(member_ids)
      union
      select sender_id from group_invitations where sender_id = auth.uid() or recipient_id = auth.uid()
      union
      select recipient_id from group_invitations where sender_id = auth.uid() or recipient_id = auth.uid()
      union
      select actor_id from group_activity where exists (
        select 1 from groups g
        where g.id = group_activity.group_id
          and (g.owner_id = auth.uid() or auth.uid() = any(g.member_ids))
      )
    ) as profile_ids
    where id is not null
  ) into related_profile_ids;

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
    'group_invitations', (
      select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) from (
        select * from group_invitations
        where (
          sender_id = auth.uid()
          or recipient_id = auth.uid()
          or exists (
            select 1 from groups g
            where g.id = group_invitations.group_id
              and (g.owner_id = auth.uid() or auth.uid() = any(g.member_ids))
          )
        )
          and (since is null or updated_at > since)
        order by updated_at asc
        limit max_rows
      ) as i
    ),
    'group_activity', (
      select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from (
        select * from group_activity
        where exists (
          select 1 from groups g
          where g.id = group_activity.group_id
            and (g.owner_id = auth.uid() or auth.uid() = any(g.member_ids))
        )
          and (since is null or group_activity.created_at > since)
        order by a.created_at asc
        limit max_rows
      ) as a
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
        where id = any(related_profile_ids)
          and (since is null or updated_at > since)
        order by updated_at asc
        limit max_rows
      ) as p
    )
  );
end;
$$ language plpgsql security invoker set search_path = public;

comment on function public.pull_updates is 'Return constrained batches of conversations, messages, sync cursors, groups, invites, activity, waypoints, geofences, and profile updates after the provided timestamp for the authenticated user.';
