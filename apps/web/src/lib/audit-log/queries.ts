import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AuditLogFilters {
  entityType?: string | undefined;
}

export async function listAuditLog(filters: AuditLogFilters = {}): Promise<AuditLogEntry[]> {
  const supabase = await createClient();

  let query = supabase
    .from("audit_log")
    .select("id, actor_id, action, entity_type, entity_id, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (filters.entityType) query = query.eq("entity_type", filters.entityType);

  const { data: entries, error } = await query;
  if (error) throw error;
  if (!entries || entries.length === 0) return [];

  const actorIds = [...new Set(entries.map((e) => e.actor_id).filter((id): id is string => id !== null))];
  const { data: profiles } = actorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", actorIds)
    : { data: [] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  return entries.map((e) => ({
    id: e.id,
    actorId: e.actor_id,
    actorName: e.actor_id ? (nameById.get(e.actor_id) ?? e.actor_id) : "Sistema",
    action: e.action,
    entityType: e.entity_type,
    entityId: e.entity_id,
    metadata: e.metadata,
    createdAt: e.created_at,
  }));
}
