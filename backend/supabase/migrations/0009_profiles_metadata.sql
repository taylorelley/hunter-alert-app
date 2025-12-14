-- Add metadata column to profiles to support messaging RPC projections.
alter table profiles
add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column profiles.metadata is 'Arbitrary profile metadata used for messaging and location contexts.';
