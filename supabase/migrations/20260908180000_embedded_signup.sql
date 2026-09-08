-- Números conectados por Embedded Signup necesitan un PIN de verificación en dos pasos
-- para poder registrarse (POST /{phone_number_id}/register). Se guarda cifrado por si
-- hace falta volver a registrar el número más adelante (ej. migración a otra WABA).
alter table public.phone_numbers add column two_step_pin_encrypted text;

-- Defensa en profundidad, mismo patrón que waba_accounts.access_token_encrypted: el rol
-- `authenticated` no debe poder leer el PIN cifrado aunque tenga una policy de SELECT
-- sobre la fila. Solo el service role (server actions con admin client) lo necesita.
revoke select on public.phone_numbers from authenticated;
grant select (
  id, waba_account_id, phone_number_id, display_phone_number, label,
  quality_rating, messaging_tier, is_active, created_at, company_id
) on public.phone_numbers to authenticated;
