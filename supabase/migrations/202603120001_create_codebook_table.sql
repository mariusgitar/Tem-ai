create table if not exists public.codebook (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  code_name text not null,
  definition text not null default '',
  status text not null default 'draft' check (status in ('draft', 'approved')),
  source text not null,
  created_at timestamptz not null default now()
);

alter table public.codebook enable row level security;

create policy "Users can view own codebook"
on public.codebook
for select
using (user_id = auth.uid());

create policy "Users can insert own codebook"
on public.codebook
for insert
with check (user_id = auth.uid());

create policy "Users can update own codebook"
on public.codebook
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());
