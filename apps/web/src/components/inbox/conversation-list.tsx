"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import type { ConversationListItem } from "@/lib/inbox/queries";

const CONVERSATION_STATUS_BADGE_VARIANTS: Record<string, BadgeProps["variant"]> = {
  open: "brand",
  pending: "warning",
  closed: "neutral",
};

/**
 * Única suscripción Realtime de la bandeja: al recibir cualquier cambio en
 * conversations o un mensaje nuevo, se refresca la ruta completa
 * (server components), que vuelve a leer con RLS aplicado. Se prioriza
 * corrección/simplicidad sobre un merge optimista en el cliente.
 */
export function ConversationList({ initialConversations }: { initialConversations: ConversationListItem[] }) {
  const router = useRouter();
  const params = useParams<{ conversationId?: string }>();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("inbox-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => router.refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => router.refresh())
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router]);

  return (
    <ul className="flex flex-col">
      {initialConversations.map((conversation) => (
        <li key={conversation.id}>
          <Link
            href={`/inbox/${conversation.id}`}
            className={cn(
              "flex flex-col gap-1 border-b px-4 py-3 text-sm hover:bg-accent",
              params.conversationId === conversation.id && "bg-accent",
            )}
          >
            <span className="flex items-center gap-1.5">
              {conversation.isUnread && (
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" aria-label="No leído" />
              )}
              <span className={cn("font-medium", conversation.isUnread && "font-semibold text-foreground")}>
                {conversation.contact.displayName ?? conversation.contact.waId}
              </span>
            </span>
            {conversation.lastMessagePreview && (
              <span
                className={cn(
                  "truncate text-xs",
                  conversation.isUnread ? "font-medium text-foreground/80" : "text-muted-foreground",
                )}
              >
                {conversation.lastMessagePreview}
              </span>
            )}
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Badge variant={CONVERSATION_STATUS_BADGE_VARIANTS[conversation.status] ?? "neutral"}>
                {conversation.status}
              </Badge>
              {conversation.assignedTo ? "asignada" : "sin asignar"}
            </span>
          </Link>
        </li>
      ))}
      {initialConversations.length === 0 && (
        <li className="p-4 text-sm text-muted-foreground">No hay conversaciones todavía.</li>
      )}
    </ul>
  );
}
