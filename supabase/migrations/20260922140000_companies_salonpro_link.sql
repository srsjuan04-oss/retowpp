-- Alta automática desde SalonPro: cuando alguien compra un plan en SalonPro (checkout de
-- Wompi), SalonPro llama a /api/integrations/salonpro/provision y se crea acá la empresa,
-- su admin con la misma contraseña y la conexión MCP a su organización de SalonPro.
-- Esta columna enlaza ambas cuentas: hace idempotente el alta y permite suspender/reactivar
-- la empresa cuando cambia el estado de la suscripción en SalonPro.
alter table public.companies add column salonpro_organization_id uuid unique;
