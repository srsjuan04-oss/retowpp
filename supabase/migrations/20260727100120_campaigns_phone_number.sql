-- Toda campaña debe originarse desde un Phone Number ID concreto. Se agrega
-- ahora (en vez de en la migración original de campaigns) para mantener las
-- migraciones versionadas como un historial real de cambios.
alter table public.campaigns
  add column phone_number_id uuid not null references public.phone_numbers (id);
