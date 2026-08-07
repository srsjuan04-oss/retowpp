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
        contacts?: Array<{ profile: { name: string }; wa_id: string }>;
        messages?: Array<{
          id: string;
          from: string;
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
