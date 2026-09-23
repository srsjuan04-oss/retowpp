import { type NextRequest, NextResponse } from "next/server";
import * as z from "zod";
import { encryptWabaToken } from "@reto-whatsapp/core";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedSalonProRequest } from "@/lib/integrations/salonpro";

const ProvisionSchema = z.object({
  organization_id: z.uuid(),
  email: z.email(),
  password: z.string().min(6),
  company_name: z.string().min(1),
  full_name: z.string().optional(),
  mcp_url: z.url().optional(),
  mcp_token: z.string().min(1).optional(),
});

const MCP_SERVER_NAME = "SalonPro";

/**
 * Alta automática de un cliente que compró un plan en SalonPro: crea la empresa, su usuario
 * admin con la MISMA contraseña que eligió en el checkout (llega una sola vez, por HTTPS, y
 * no se guarda en ningún lado — Supabase Auth solo guarda su hash) y deja conectado el
 * servidor MCP de su organización de SalonPro para el agente de IA.
 *
 * Idempotente por organization_id: si SalonPro reintenta, no se duplica nada. Si el correo
 * ya tiene cuenta acá, NO se toca su contraseña ni su empresa: se responde 409 y el alta de
 * ese caso se hace a mano desde /plataforma/empresas.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedSalonProRequest(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const parsed = ProvisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }
  const input = parsed.data;
  const supabase = createAdminClient();

  const { data: existing, error: existingError } = await supabase
    .from("companies")
    .select("id")
    .eq("salonpro_organization_id", input.organization_id)
    .maybeSingle();
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (existing) return NextResponse.json({ status: "already_provisioned", company_id: existing.id });

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .insert({ name: input.company_name, salonpro_organization_id: input.organization_id })
    .select("id")
    .single();
  if (companyError) {
    // Carrera entre dos reintentos simultáneos: el otro ya la creó.
    if (companyError.code === "23505") return NextResponse.json({ status: "already_provisioned" });
    return NextResponse.json({ error: companyError.message }, { status: 500 });
  }

  const { data: created, error: userError } = await supabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.full_name ?? null, company_id: company.id, role: "admin" },
  });
  if (userError || !created.user) {
    // Sin usuario la empresa queda huérfana; se borra para que un reintento empiece de cero.
    await supabase.from("companies").delete().eq("id", company.id);
    const emailExists = userError?.code === "email_exists" || /already.*registered/i.test(userError?.message ?? "");
    return NextResponse.json(
      { status: emailExists ? "email_exists" : "error", error: userError?.message ?? "No se pudo crear el usuario" },
      { status: emailExists ? 409 : 500 },
    );
  }

  let mcpConnected = false;
  const encryptionKey = process.env.WABA_TOKEN_ENCRYPTION_KEY;
  if (input.mcp_url && input.mcp_token && encryptionKey) {
    const { error: mcpError } = await supabase.from("mcp_servers").insert({
      company_id: company.id,
      name: MCP_SERVER_NAME,
      url: input.mcp_url,
      authorization_token_encrypted: encryptWabaToken(input.mcp_token, encryptionKey),
      created_by: created.user.id,
    });
    // La cuenta ya sirve sin esto (el MCP se puede conectar a mano en /settings/ai).
    if (mcpError) console.error("[salonpro/provision] no se pudo conectar el MCP", mcpError);
    else mcpConnected = true;
  }

  await supabase.from("audit_log").insert({
    company_id: company.id,
    actor_id: null,
    action: "company.provisioned_from_salonpro",
    entity_type: "company",
    entity_id: company.id,
    metadata: { salonpro_organization_id: input.organization_id, email: input.email, mcp_connected: mcpConnected },
  });

  return NextResponse.json({ status: "created", company_id: company.id, mcp_connected: mcpConnected }, { status: 201 });
}
