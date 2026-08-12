// Nombres de colas BullMQ compartidos entre apps/web (productor) y apps/worker
// (consumidor), para que nunca diverjan entre quien encola y quien procesa.
export const WEBHOOK_PROCESSING_QUEUE = "webhook-processing";
export const CAMPAIGN_DISPATCH_QUEUE = "campaign-dispatch";
export const MESSAGE_SEND_QUEUE = "message-send";
export const TEMPLATE_SYNC_QUEUE = "template-sync";
export const CONTACT_IMPORT_QUEUE = "contact-import";
export const AI_AGENT_REPLY_QUEUE = "ai-agent-reply";
export const HOTMART_WEBHOOK_QUEUE = "hotmart-webhook";
export const FLOW_ENGINE_QUEUE = "flow-engine";
