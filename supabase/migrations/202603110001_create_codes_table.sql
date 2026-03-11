create table if not exists public.codes (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  code_label text not null,
  quote text not null,
  rationale text not null,
  source text not null,
  created_at timestamptz not null default now()
);

alter table public.codes enable row level security;

create policy "Users can view own document codes"
on public.codes
for select
using (
  exists (
    select 1
    from public.documents d
    where d.id = codes.document_id and d.user_id = auth.uid()
  )
);

create policy "Users can insert own document codes"
on public.codes
for insert
with check (
  exists (
    select 1
    from public.documents d
    where d.id = codes.document_id and d.user_id = auth.uid()
  )
);
