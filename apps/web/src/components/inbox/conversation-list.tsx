"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { formatContactName } from "@/lib/format";
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
    let channel: ReturnType<typeof supabase.channel> | undefined;

    // El cliente de @supabase/ssr hidrata la sesión desde las cookies, pero no propaga
    // ese JWT al websocket de Realtime por su cuenta: sin este setAuth, la conexión queda
    // autenticada como "anon" (confirmado en realtime.subscription: claims_role = anon) y
    // las políticas RLS de conversations/messages, que dependen de auth.uid(), descartan
    // todos los eventos en silencio — el canal se suscribe bien, pero nunca llega nada.
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) await supabase.realtime.setAuth(session.access_token);

      channel = supabase
        .channel("inbox-realtime")
        .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, (payload) => {
          console.log("[inbox-realtime] conversations change", payload);
          router.refresh();
        })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
          console.log("[inbox-realtime] messages insert", payload);
          router.refresh();
        })
        .subscribe((status, err) => {
          console.log("[inbox-realtime] subscribe status", status, err);
        });
    })();

    // El access token rota mientras la pestaña de bandeja queda abierta muchas horas;
    // sin refrescarlo acá, Realtime desconecta al vencer el token viejo.
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) void supabase.realtime.setAuth(session.access_token);
    });

    return () => {
      authListener.subscription.unsubscribe();
      if (channel) void supabase.removeChannel(channel);
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
                {formatContactName(conversation.contact.displayName) ?? conversation.contact.waId}
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
