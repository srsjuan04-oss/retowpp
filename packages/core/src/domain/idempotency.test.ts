import { describe, expect, test } from "bun:test";
import { buildCampaignSendJobId, buildMessageStatusDedupeKey, buildWebhookDedupeKey } from "./idempotency";

describe("buildWebhookDedupeKey", () => {
  test("es determinístico para el mismo body exacto", () => {
    const body = JSON.stringify({ entry: [{ id: "1" }] });
    expect(buildWebhookDedupeKey(body)).toBe(buildWebhookDedupeKey(body));
  });

  test("difiere si el body cambia aunque sea en un carácter", () => {
    const a = JSON.stringify({ entry: [{ id: "1" }] });
    const b = JSON.stringify({ entry: [{ id: "2" }] });
    expect(buildWebhookDedupeKey(a)).not.toBe(buildWebhookDedupeKey(b));
  });
});

describe("buildCampaignSendJobId", () => {
  test("combina campaignId y contactId de forma estable", () => {
    expect(buildCampaignSendJobId("camp-1", "contact-1")).toBe("camp-1|contact-1");
    expect(buildCampaignSendJobId("camp-1", "contact-1")).toBe(buildCampaignSendJobId("camp-1", "contact-1"));
  });

  test("produce ids distintos para distintos destinatarios de la misma campaña", () => {
    expect(buildCampaignSendJobId("camp-1", "contact-1")).not.toBe(buildCampaignSendJobId("camp-1", "contact-2"));
  });
});

describe("buildMessageStatusDedupeKey", () => {
  test("la misma entrega exacta produce la misma clave", () => {
    const key1 = buildMessageStatusDedupeKey("wamid.123", "delivered", "1700000000");
    const key2 = buildMessageStatusDedupeKey("wamid.123", "delivered", "1700000000");
    expect(key1).toBe(key2);
  });

  test("transiciones de estado legítimas (distinto status) no colapsan entre sí", () => {
    const sent = buildMessageStatusDedupeKey("wamid.123", "sent", "1700000000");
    const delivered = buildMessageStatusDedupeKey("wamid.123", "delivered", "1700000100");
    expect(sent).not.toBe(delivered);
  });
});
