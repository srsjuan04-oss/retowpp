"use client";

import { useActionState, useEffect, useRef } from "react";
import { isWithinServiceWindow } from "@reto-whatsapp/core";
import {
  assignConversation,
  closeConversation,
  markConversationRead,
  sendMessage,
  type SendMessageState,
} from "@/app/(app)/inbox/actions";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatContactName } from "@/lib/format";
import type { AssignableProfile, ConversationDetail, MessageItem } from "@/lib/inbox/queries";
import type { TemplateOption } from "@/lib/templates/queries";
import { TemplatePicker } from "./template-picker";
import { WhatsAppText } from "./whatsapp-text";

const initialState: SendMessageState = {};

const CONVERSATION_STATUS_BADGE_VARIANTS: Record<string, BadgeProps["variant"]> = {
  open: "brand",
  pending: "warning",
  closed: "neutral",
};

export function ConversationThread({
  conversation,
  initialMessages,
  profiles,
  templates,
}: {
  conversation: ConversationDetail;
  initialMessages: MessageItem[];
  profiles: AssignableProfile[];
  templates: TemplateOption[];
}) {
  const [state, formAction, pending] = useActionState(sendMessage, initialState);
  const withinWindow = isWithinServiceWindow(conversation.lastInboundAt);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void markConversationRead(conversation.id);
  }, [conversation.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [conversation.id, initialMessages.length]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <div>
            <h2 className="font-medium">
              {formatContactName(conversation.contact.displayName) ?? conversation.contact.waId}
            </h2>
            <p className="text-xs text-muted-foreground">{conversation.contact.waId}</p>
          </div>
          <Badge variant={CONVERSATION_STATUS_BADGE_VARIANTS[conversation.status] ?? "neutral"}>
            {conversation.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <select
            defaultValue={conversation.assignedTo ?? ""}
            onChange={(e) => void assignConversation(conversation.id, e.target.value || null)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">Sin asignar</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.fullName ?? profile.id}
              </option>
            ))}
          </select>
          {conversation.status !== "closed" && (
            <Button variant="outline" size="sm" onClick={() => void closeConversation(conversation.id)}>
              Cerrar
            </Button>
          )}
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
        {initialMessages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "max-w-md rounded-lg px-3 py-2 text-sm",
              message.direction === "outbound"
                ? "self-end bg-primary text-primary-foreground"
                : "self-start bg-muted text-muted-foreground",
            )}
          >
            <p className="whitespace-pre-wrap">
              {message.messageType === "text" && typeof message.content.body === "string" ? (
                <WhatsAppText text={message.content.body} />
              ) : (
                `[${message.messageType}]`
              )}
            </p>
            {message.direction === "outbound" && <p className="mt-1 text-xs opacity-70">{message.status}</p>}
          </div>
        ))}
        {initialMessages.length === 0 && <p className="text-sm text-muted-foreground">Sin mensajes todavía.</p>}
        <div ref={bottomRef} />
      </div>

      <div className="flex flex-col gap-3 border-t p-4">
        {withinWindow ? (
          <form
            action={(formData) => {
              formData.set("clientDedupeKey", crypto.randomUUID());
              formAction(formData);
            }}
            className="flex flex-col gap-2"
          >
            <input type="hidden" name="conversationId" value={conversation.id} />
            <div className="flex gap-2">
              <textarea
                name="body"
                required
                rows={2}
                className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                placeholder="Escribe un mensaje…"
              />
              <Button type="submit" disabled={pending}>
                {pending ? "Enviando…" : "Enviar"}
              </Button>
            </div>
            {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            Fuera de la ventana de atención de 24h: solo se pueden enviar plantillas aprobadas.
          </p>
        )}
        <TemplatePicker conversationId={conversation.id} templates={templates} />
      </div>
    </div>
  );
}
