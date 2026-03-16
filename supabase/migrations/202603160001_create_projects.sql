-- Projects table
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  document_type text not null default '',
  created_at timestamptz not null default now()
);

alter table public.projects enable row level security;

create policy "Users can view own projects"
on public.projects for select
using (user_id = auth.uid());

create policy "Users can insert own projects"
on public.projects for insert
with check (user_id = auth.uid());

create policy "Users can update own projects"
on public.projects for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete own projects"
on public.projects for delete
using (user_id = auth.uid());

-- Add project_id to documents (required going forward)
alter table public.documents
  add column if not exists project_id uuid
  references public.projects(id) on delete cascade;

-- Move codebook to project level
-- Add project_id to codebook, make document_id optional
alter table public.codebook
  add column if not exists project_id uuid
  references public.projects(id) on delete cascade;
