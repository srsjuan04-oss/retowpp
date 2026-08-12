import { createHmac } from "node:crypto";
import type {
  MetaTemplateApiItem,
  SendMediaMessageInput,
  SendTemplateMessageInput,
  SendTextMessageInput,
  WhatsAppSendResponse,
} from "./types";

export class WhatsAppApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: number,
    public readonly isRateLimited = false,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "WhatsAppApiError";
  }
}

export interface WhatsAppClientConfig {
  /** Access token descifrado en memoria, solo en runtime server-side (Route Handler o worker) */
  accessToken: string;
  /** Requerido para enviar/marcar mensajes (endpoints a nivel de número); no para operaciones a nivel de WABA. */
  phoneNumberId?: string;
  graphApiVersion?: string;
  fetchImpl?: typeof fetch;
  /**
   * App secret de la app de Meta. Requerido cuando la app tiene habilitado "Require App Secret":
   * sin él, Graph API responde "appsecret_proof is required but not provided" en toda request.
   */
  appSecret?: string;
}

/**
 * Cliente delgado sobre WhatsApp Cloud API (Meta Graph API).
 * Nunca debe instanciarse ni importarse en código que se ejecute en el navegador:
 * requiere el access token del WABA, que es un secreto server-only.
 */
export class WhatsAppClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: WhatsAppClientConfig) {
    const version = config.graphApiVersion ?? "v21.0";
    this.baseUrl = `https://graph.facebook.com/${version}`;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  private requirePhoneNumberId(): string {
    if (!this.config.phoneNumberId) {
      throw new Error("Esta operación requiere phoneNumberId en la configuración del WhatsAppClient.");
    }
    return this.config.phoneNumberId;
  }

  /**
   * Añade appsecret_proof (HMAC-SHA256 del access token con el app secret) cuando está
   * configurado. Meta lo exige en toda request si la app tiene "Require App Secret" activado,
   * incluso cuando el token viaja en el header Authorization en vez de como query param.
   */
  private withAppSecretProof(url: string): string {
    if (!this.config.appSecret) return url;
    const proof = createHmac("sha256", this.config.appSecret).update(this.config.accessToken).digest("hex");
    const withProof = new URL(url);
    withProof.searchParams.set("appsecret_proof", proof);
    return withProof.toString();
  }

  async sendTemplateMessage(input: SendTemplateMessageInput): Promise<WhatsAppSendResponse> {
    return this.post(`/${this.requirePhoneNumberId()}/messages`, {
      messaging_product: "whatsapp",
      to: input.to,
      type: "template",
      template: {
        name: input.templateName,
        language: { code: input.languageCode },
        components: input.components ?? [],
      },
    });
  }

  async sendTextMessage(input: SendTextMessageInput): Promise<WhatsAppSendResponse> {
    return this.post(`/${this.requirePhoneNumberId()}/messages`, {
      messaging_product: "whatsapp",
      to: input.to,
      type: "text",
      text: { body: input.body, preview_url: input.previewUrl ?? false },
      ...(input.contextMessageId ? { context: { message_id: input.contextMessageId } } : {}),
    });
  }

  /** Envío de imagen/audio por link (URL pública o firmada): sin subida previa a /media. */
  async sendMediaMessage(input: SendMediaMessageInput): Promise<WhatsAppSendResponse> {
    return this.post(`/${this.requirePhoneNumberId()}/messages`, {
      messaging_product: "whatsapp",
      to: input.to,
      type: input.type,
      [input.type]: { link: input.link },
    });
  }

  async markAsRead(messageId: string): Promise<void> {
    await this.post(`/${this.requirePhoneNumberId()}/messages`, {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    });
  }

  async fetchApprovedTemplates(wabaId: string): Promise<MetaTemplateApiItem[]> {
    const items: MetaTemplateApiItem[] = [];
    let url: string | null = this.withAppSecretProof(`${this.baseUrl}/${wabaId}/message_templates?limit=100`);
    while (url) {
      const res: Response = await this.fetchImpl(url, {
        headers: { Authorization: `Bearer ${this.config.accessToken}` },
      });
      const json = await this.parseJson(res);
      items.push(...(json.data as MetaTemplateApiItem[]));
      url = json.paging?.next ? this.withAppSecretProof(json.paging.next as string) : null;
    }
    return items;
  }

  async getMediaUrl(mediaId: string): Promise<{ url: string; mimeType: string }> {
    const res = await this.fetchImpl(this.withAppSecretProof(`${this.baseUrl}/${mediaId}`), {
      headers: { Authorization: `Bearer ${this.config.accessToken}` },
    });
    const json = await this.parseJson(res);
    return { url: json.url as string, mimeType: json.mime_type as string };
  }

  private async post(path: string, body: unknown): Promise<WhatsAppSendResponse> {
    const res = await this.fetchImpl(this.withAppSecretProof(`${this.baseUrl}${path}`), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return this.parseJson(res) as Promise<WhatsAppSendResponse>;
  }

  private async parseJson(res: Response): Promise<any> {
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errorCode = json?.error?.code as number | undefined;
      const isRateLimited = res.status === 429 || errorCode === 80007 || errorCode === 130429;
      const retryAfterHeader = res.headers.get("Retry-After");
      throw new WhatsAppApiError(
        json?.error?.message ?? `WhatsApp API error (${res.status})`,
        res.status,
        errorCode,
        isRateLimited,
        retryAfterHeader ? Number(retryAfterHeader) : undefined,
      );
    }
    return json;
  }
}
