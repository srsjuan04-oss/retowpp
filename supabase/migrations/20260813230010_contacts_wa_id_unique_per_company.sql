-- wa_id (el número de WhatsApp) ya no es único a nivel global: dos empresas
-- distintas pueden tener contactos con el mismo número, cada una con sus
-- propios datos (consent_status, tags, custom_fields, etc.) sin mezclarse.
alter table public.contacts drop constraint contacts_wa_id_key;
create unique index contacts_wa_id_company_id_key on public.contacts (wa_id, company_id);
