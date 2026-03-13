create table if not exists public.segments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  code_name text not null,
  quote text not null,
  rationale text not null,
  source text not null,
  created_at timestamptz not null default now()
);

alter table public.segments enable row level security;

create policy "Users can view own document segments"
on public.segments for select
using (
  exists (
    select 1 from public.documents d
    where d.id = segments.document_id and d.user_id = auth.uid()
  )
);

create policy "Users can insert own document segments"
on public.segments for insert
with check (
  exists (
    select 1 from public.documents d
    where d.id = segments.document_id and d.user_id = auth.uid()
  )
);
