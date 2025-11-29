-- Schema initialization for constrained-network messaging backend.
create extension if not exists "pgcrypto";

create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
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

create index if not exists idx_conversations_updated_at on conversations (updated_at desc);
create index if not exists idx_messages_conversation_created on messages (conversation_id, created_at desc);
create index if not exists idx_sync_cursors_user_updated on sync_cursors (user_id, updated_at desc);

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

-- Row Level Security
alter table profiles enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table sync_cursors enable row level security;

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
    )
  );
end;
$$ language plpgsql security invoker set search_path = public;

comment on function public.pull_updates is 'Return constrained batches of conversations, messages, and sync cursors updated after the provided timestamp for the authenticated user.';
