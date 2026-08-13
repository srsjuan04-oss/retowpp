"use server";

import { revalidatePath } from "next/cache";
import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { enqueueContactImport } from "@/lib/queues/contact-import";

export interface UploadCsvState {
  error?: string;
  success?: boolean;
}

/**
 * Sube el CSV a Storage y crea el registro de importación; el procesamiento
 * real (parseo, upsert de contactos) ocurre en el worker, nunca en esta request.
 */
export async function uploadContactsCsv(_prev: UploadCsvState | undefined, formData: FormData): Promise<UploadCsvState> {
  const session = await verifySession();
  if (!session.companyId) return { error: "Tu usuario no pertenece a ninguna empresa." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecciona un archivo CSV." };
  if (!file.name.toLowerCase().endsWith(".csv")) return { error: "El archivo debe tener extensión .csv." };

  const supabase = await createClient();
  const path = `${session.id}/${Date.now()}-${file.name}`;

  const { error: uploadError } = await supabase.storage.from("contact-imports").upload(path, file, {
    contentType: "text/csv",
  });
  if (uploadError) return { error: `No se pudo subir el archivo: ${uploadError.message}` };

  const { data: importRow, error: insertError } = await supabase
    .from("contact_imports")
    .insert({ uploaded_by: session.id, file_path: path, company_id: session.companyId })
    .select("id")
    .single();
  if (insertError) return { error: insertError.message };

  await enqueueContactImport(importRow.id);

  revalidatePath("/contacts/import");
  return { success: true };
}
