create table public.contact_imports (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid references public.profiles (id),
  file_path text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  total_rows integer not null default 0,
  success_count integer not null default 0,
  error_count integer not null default 0,
  error_report_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger contact_imports_set_updated_at
  before update on public.contact_imports
  for each row execute function public.set_updated_at();

alter table public.contact_imports enable row level security;

create policy contact_imports_select on public.contact_imports
  for select to authenticated
  using (true);

-- El usuario sube el archivo a Storage y crea el registro; el worker (service role)
-- es quien lo procesa y actualiza el progreso, nunca la propia request HTTP.
create policy contact_imports_insert on public.contact_imports
  for insert to authenticated
  with check (uploaded_by = auth.uid());
