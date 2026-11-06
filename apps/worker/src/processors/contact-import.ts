import type { SupabaseClient } from "@supabase/supabase-js";
import { Worker, type Job, type ConnectionOptions } from "bullmq";
import { parse } from "csv-parse/sync";
import { CONTACT_IMPORT_QUEUE, normalizeWaId } from "@reto-whatsapp/core";
import type { Database } from "@reto-whatsapp/db";
import { createWorkerSupabaseClient } from "../supabase";

type Client = SupabaseClient<Database>;

const RESERVED_COLUMNS = new Set(["phone", "telefono", "wa_id", "name", "tags"]);

/**
 * Excel en configuración regional española guarda los CSV con ";" aunque se elija
 * "delimitado por comas". Se decide por el separador más frecuente en el encabezado.
 */
export function detectDelimiter(csvText: string): string {
  const header = csvText.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
  const counts = [";", ",", "\t"].map((d) => [d, header.split(d).length - 1] as const);
  const [best, count] = counts.reduce((a, b) => (b[1] > a[1] ? b : a));
  return count > 0 ? best : ",";
}

async function upsertTag(supabase: Client, name: string, companyId: string): Promise<string> {
  const { data: existing } = await supabase
    .from("tags")
    .select("id")
    .eq("name", name)
    .eq("company_id", companyId)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("tags")
    .insert({ name, company_id: companyId })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

async function importRow(
  supabase: Client,
  row: Record<string, string>,
  knownCustomFieldKeys: Set<string>,
  companyId: string,
): Promise<void> {
  const rawPhone = row.phone ?? row.telefono ?? row.wa_id;
  const waId = rawPhone ? normalizeWaId(rawPhone) : null;
  if (!waId) throw new Error(`Teléfono inválido: "${rawPhone ?? ""}"`);

  const customFields: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    if (RESERVED_COLUMNS.has(key) || !knownCustomFieldKeys.has(key)) continue;
    customFields[key] = value;
  }

  const { data: existingContact } = await supabase
    .from("contacts")
    .select("id, custom_fields")
    .eq("wa_id", waId)
    .eq("company_id", companyId)
    .maybeSingle();

  let contactId: string;
  if (existingContact) {
    contactId = existingContact.id;
    const contactUpdate: Database["public"]["Tables"]["contacts"]["Update"] = {
      custom_fields: { ...existingContact.custom_fields, ...customFields },
    };
    if (row.name) contactUpdate.display_name = row.name;
    await supabase.from("contacts").update(contactUpdate).eq("id", contactId);
  } else {
    const { data: created, error: createError } = await supabase
      .from("contacts")
      .insert({ wa_id: waId, display_name: row.name || null, custom_fields: customFields, company_id: companyId })
      .select("id")
      .single();
    if (createError) throw createError;
    contactId = created.id;
  }

  if (row.tags) {
    const tagNames = row.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    for (const tagName of tagNames) {
      const tagId = await upsertTag(supabase, tagName, companyId);
      await supabase
        .from("contact_tags")
        .upsert({ contact_id: contactId, tag_id: tagId }, { onConflict: "contact_id,tag_id", ignoreDuplicates: true });
    }
  }
}

export async function processContactImport(supabase: Client, contactImportId: string): Promise<void> {
  const { data: importRowData, error } = await supabase
    .from("contact_imports")
    .select("id, file_path, status, company_id")
    .eq("id", contactImportId)
    .single();
  if (error) throw error;
  if (importRowData.status === "completed") return;

  await supabase.from("contact_imports").update({ status: "processing" }).eq("id", contactImportId);

  const { data: fieldDefinitions } = await supabase
    .from("custom_field_definitions")
    .select("key")
    .eq("company_id", importRowData.company_id);
  const knownCustomFieldKeys = new Set((fieldDefinitions ?? []).map((f) => f.key));

  const { data: fileBlob, error: downloadError } = await supabase.storage
    .from("contact-imports")
    .download(importRowData.file_path);
  if (downloadError) {
    await supabase.from("contact_imports").update({ status: "failed" }).eq("id", contactImportId);
    throw downloadError;
  }

  const csvText = await fileBlob.text();
  let rows: Record<string, string>[];
  try {
    rows = parse(csvText, {
      bom: true,
      delimiter: detectDelimiter(csvText),
      // "Phone"/"TELEFONO" cuentan como columna reservada; las demás conservan su nombre (claves de campos personalizados).
      columns: (header: string[]) =>
        header.map((h) => (RESERVED_COLUMNS.has(h.trim().toLowerCase()) ? h.trim().toLowerCase() : h.trim())),
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as Record<string, string>[];
  } catch (parseError) {
    // Sin esto la importación quedaba en "processing" para siempre y el job se reintentaba sin sentido.
    await supabase.from("contact_imports").update({ status: "failed" }).eq("id", contactImportId);
    console.error(`[contact-import] CSV ilegible (${contactImportId}):`, parseError);
    return;
  }

  let successCount = 0;
  let errorCount = 0;

  for (const row of rows) {
    try {
      await importRow(supabase, row, knownCustomFieldKeys, importRowData.company_id);
      successCount++;
    } catch {
      errorCount++;
    }
  }

  await supabase
    .from("contact_imports")
    .update({
      status: "completed",
      total_rows: rows.length,
      success_count: successCount,
      error_count: errorCount,
    })
    .eq("id", contactImportId);
}

export function createContactImportWorker(connection: ConnectionOptions) {
  const supabase = createWorkerSupabaseClient();
  return new Worker(
    CONTACT_IMPORT_QUEUE,
    async (job: Job<{ contactImportId: string }>) => {
      await processContactImport(supabase, job.data.contactImportId);
    },
    { connection },
  );
}
