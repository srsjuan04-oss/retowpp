-- Bucket privado para los archivos CSV subidos en la importación de contactos.
-- RLS de storage.objects ya viene habilitada por defecto en todo proyecto Supabase.
insert into storage.buckets (id, name, public)
values ('contact-imports', 'contact-imports', false)
on conflict (id) do nothing;

create policy contact_imports_bucket_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'contact-imports');

-- El dueño del archivo (quien lo subió) o un admin/supervisor pueden leerlo;
-- el worker usa el service role y no pasa por RLS.
create policy contact_imports_bucket_select on storage.objects
  for select to authenticated
  using (bucket_id = 'contact-imports' and (owner = auth.uid() or public.is_admin_or_supervisor()));
