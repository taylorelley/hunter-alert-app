-- Add RPC helpers for invitation management and geofence updates

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

comment on function public.resend_group_invitation is 'Resend a pending group invitation as the original sender.';

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

comment on function public.withdraw_group_invitation is 'Allow invitation senders to withdraw pending invitations.';

create or replace function public.update_geofence(
  geofence_id uuid,
  geofence_name text,
  latitude double precision,
  longitude double precision,
  radius_meters int,
  geofence_description text default null
)
returns geofences as $$
declare
  updated_geofence geofences;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  update geofences
  set name = geofence_name,
      description = geofence_description,
      latitude = latitude,
      longitude = longitude,
      radius_meters = radius_meters
  where id = geofence_id
    and user_id = auth.uid()
  returning * into updated_geofence;

  if updated_geofence is null then
    raise exception 'Geofence not found or access denied';
  end if;

  if updated_geofence.group_id is not null then
    insert into group_activity (group_id, actor_id, activity_type, description, metadata)
    values (
      updated_geofence.group_id,
      auth.uid(),
      'geofence',
      'Updated a geofence',
      jsonb_build_object('geofence_id', updated_geofence.id, 'name', updated_geofence.name)
    );
  end if;

  return updated_geofence;
end;
$$ language plpgsql security invoker set search_path = public;

comment on function public.update_geofence is 'Update a geofence owned by the authenticated user.';
