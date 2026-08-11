/**
 * Forma (parcial, solo los campos que usamos) del payload que envía Hotmart
 * en sus webhooks de venta: `{ id, event, data: { buyer, product, purchase } }`.
 * Referencia: verificado contra payloads reales durante el desarrollo de este
 * módulo, no documentación oficial re-tipada de memoria.
 */
export interface HotmartWebhookPayload {
  id?: string;
  event?: string;
  data?: {
    buyer?: {
      name?: string;
      first_name?: string;
      email?: string;
      checkout_phone?: string;
    };
    product?: {
      name?: string;
    };
    purchase?: {
      status?: string;
      transaction?: string;
      price?: { value?: number; currency_value?: string };
    };
  };
}

export interface HotmartPurchaseData {
  event: string;
  buyerName: string | null;
  buyerFirstName: string | null;
  buyerEmail: string | null;
  /** Tal como lo manda Hotmart (puede traer o no un "+" adelante); normalizar con `normalizeWaId` antes de usar como wa_id. */
  buyerPhone: string | null;
  productName: string | null;
  transaction: string | null;
  priceValue: number | null;
  currency: string | null;
  status: string | null;
}

export function extractHotmartPurchaseData(payload: HotmartWebhookPayload): HotmartPurchaseData {
  const buyer = payload.data?.buyer;
  const product = payload.data?.product;
  const purchase = payload.data?.purchase;

  return {
    event: payload.event ?? "unknown",
    buyerName: buyer?.name ?? null,
    buyerFirstName: buyer?.first_name ?? null,
    buyerEmail: buyer?.email ?? null,
    buyerPhone: buyer?.checkout_phone ?? null,
    productName: product?.name ?? null,
    transaction: purchase?.transaction ?? null,
    priceValue: purchase?.price?.value ?? null,
    currency: purchase?.price?.currency_value ?? null,
    status: purchase?.status ?? null,
  };
}

const HOTMART_FIELD_RE = /\{\{hotmart\.(\w+)\}\}/g;

/**
 * Resuelve el mapeo de variables de una "receta" Hotmart (definido una vez al
 * crearla) contra los datos concretos de una compra, sustituyendo referencias
 * como `{{hotmart.buyer_name}}` o `{{hotmart.product_name}}`. Mismo patrón
 * que `resolveCampaignVariables` pero con namespace `hotmart` en vez de `contact`.
 */
export function resolveHotmartVariables(
  mapping: Record<string, string>,
  data: HotmartPurchaseData,
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const [index, template] of Object.entries(mapping)) {
    resolved[index] = template.replace(HOTMART_FIELD_RE, (_match, field: string) => {
      switch (field) {
        case "buyer_name":
          return data.buyerName ?? "";
        case "buyer_first_name":
          return data.buyerFirstName ?? "";
        case "product_name":
          return data.productName ?? "";
        case "total":
          return data.priceValue !== null ? String(data.priceValue) : "";
        case "currency":
          return data.currency ?? "";
        case "transaction":
          return data.transaction ?? "";
        default:
          return "";
      }
    });
  }
  return resolved;
}
