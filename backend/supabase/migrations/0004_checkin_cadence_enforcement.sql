-- Enforce server-side check-in cadence and harden purchase batching.
create or replace function public.send_message_batch(messages jsonb)
returns setof messages as $$
declare
  max_count int := coalesce(current_setting('app.max_message_batch', true)::int, 20);
  max_body_bytes int := 4000;
  free_min_cadence int := coalesce(current_setting('app.free_min_checkin_cadence_hours', true)::int, 6);
  oversized boolean;
  next_allowed timestamptz;
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

  with prepared as (
    select
      (entry.value->>'conversation_id')::uuid as conversation_id,
      trim(entry.value->>'body') as body,
      coalesce(entry.value->'metadata', '{}'::jsonb) as metadata,
      entry.value->>'client_id' as client_id,
      coalesce((entry.value->>'created_at')::timestamptz, now()) as created_at
    from jsonb_array_elements(messages) as entry(value)
    where (entry.value ? 'conversation_id')
      and (entry.value ? 'body')
      and length(trim(coalesce(entry.value->>'body', ''))) > 0
  ), joined as (
    select
      p.conversation_id,
      p.body,
      p.metadata,
      p.client_id,
      p.created_at,
      c.metadata as conversation_metadata,
      coalesce((c.metadata->>'checkInCadence')::int, 4) as trip_cadence,
      coalesce(c.metadata->>'status', 'active') as trip_status,
      coalesce(p.metadata->>'status', '') as checkin_status,
      prof.is_premium
    from prepared p
    join conversations c on c.id = p.conversation_id
    join profiles prof on prof.id = auth.uid()
    where auth.uid() = any(c.participant_ids)
  ), violations as (
    select
      j.conversation_id,
      last_checkin.last_checkin_at,
      last_checkin.last_checkin_at
        + make_interval(hours => cadence_hours.cadence_hours) as next_allowed_at
    from joined j
    cross join lateral (
      select greatest(
          case
            when j.is_premium then j.trip_cadence
            else greatest(j.trip_cadence, free_min_cadence)
          end,
          0
        ) as cadence_hours
    ) as cadence_hours
    left join lateral (
      select max(m.created_at) as last_checkin_at
      from messages m
      where m.conversation_id = j.conversation_id
        and m.sender_id = auth.uid()
        and (m.metadata->>'status') in ('ok', 'need-help')
    ) as last_checkin on true
    where j.checkin_status in ('ok', 'need-help')
      and j.trip_status = 'active'
      and last_checkin.last_checkin_at is not null
      and now() < last_checkin.last_checkin_at + make_interval(hours => cadence_hours.cadence_hours)
  )
  select min(next_allowed_at) into next_allowed from violations;

  if next_allowed is not null then
    raise exception 'Check-in cadence not satisfied. Next allowed at %', next_allowed
      using errcode = 'P0001';
  end if;

  return query
  insert into messages (conversation_id, sender_id, body, metadata, client_id, created_at)
  select
    j.conversation_id,
    auth.uid(),
    j.body,
    j.metadata,
    j.client_id,
    j.created_at
  from joined j
  limit max_count
  returning *;
end;
$$ language plpgsql security invoker set search_path = public;

comment on function public.send_message_batch is 'Batch insert messages for conversations the caller participates in. Enforces auth, batch size, payload limits, and check-in cadence for trip conversations.';
