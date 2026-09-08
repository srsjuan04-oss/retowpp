export interface WhatsAppTemplateComponent {
  type: "header" | "body" | "footer" | "button";
  parameters?: Array<{ type: "text" | "currency" | "date_time" | "image" | "document" | "video"; text?: string; [key: string]: unknown }>;
  sub_type?: string;
  index?: string;
}

export interface SendTemplateMessageInput {
  to: string;
  templateName: string;
  languageCode: string;
  components?: WhatsAppTemplateComponent[];
}

export interface SendTextMessageInput {
  to: string;
  body: string;
  previewUrl?: boolean;
  /** Reutiliza el wamid del mensaje entrante al que se responde, si aplica */
  contextMessageId?: string;
}

export interface SendMediaMessageInput {
  to: string;
  type: "image" | "audio";
  /** URL pública o firmada desde donde Meta descarga el archivo (no requiere subida previa a /media). */
  link: string;
}

export interface WhatsAppSendResponse {
  messaging_product: "whatsapp";
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string; message_status?: string }>;
}

export interface MetaTemplateApiItem {
  id: string;
  name: string;
  language: string;
  category: string;
  status: "APPROVED" | "PENDING" | "REJECTED" | "PAUSED" | "DISABLED";
  components: WhatsAppTemplateComponent[];
}

export interface CreateTemplateComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: "TEXT";
  text?: string;
  example?: { header_text?: string[]; body_text?: string[][] };
  buttons?: Array<{ type: "QUICK_REPLY" | "URL"; text: string; url?: string }>;
}

export interface CreateTemplateInput {
  name: string;
  language: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  components: CreateTemplateComponent[];
}

export interface CreateTemplateApiResponse {
  id: string;
  status: string;
  category: string;
}

/** Forma cruda del payload que Meta envía a POST /webhooks (antes de cualquier transformación) */
export interface WhatsAppWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      field: string;
      value: {
        messaging_product: "whatsapp";
        metadata: { display_phone_number: string; phone_number_id: string };
        // wa_id/from son el número de teléfono de siempre; cuando el contacto escribe desde
        // un identificador de usuario (mensajería por username, sin exponer el teléfono),
        // Meta solo manda user_id/from_user_id (formato "CO.<dígitos>"), que se usa como
        // identidad de reemplazo tanto para crear el contacto como para responderle.
        contacts?: Array<{ profile: { name: string }; wa_id?: string; user_id?: string }>;
        messages?: Array<{
          id: string;
          from?: string;
          from_user_id?: string;
          timestamp: string;
          type: string;
          text?: { body: string };
          [key: string]: unknown;
        }>;
        statuses?: Array<{
          id: string;
          status: "sent" | "delivered" | "read" | "failed";
          timestamp: string;
          recipient_id: string;
          errors?: Array<{ code: number; title: string; message?: string }>;
        }>;
      };
    }>;
  }>;
}
