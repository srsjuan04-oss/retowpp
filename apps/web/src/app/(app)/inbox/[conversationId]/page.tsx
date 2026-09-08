import { notFound } from "next/navigation";
import { verifySession } from "@/lib/auth/dal";
import { getConversation, listAssignableProfiles, listMessages } from "@/lib/inbox/queries";
import { listApprovedTemplates } from "@/lib/templates/queries";
import { ConversationThread } from "@/components/inbox/conversation-thread";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;

  const [session, conversation, messages, profiles, templates] = await Promise.all([
    verifySession(),
    getConversation(conversationId),
    listMessages(conversationId),
    listAssignableProfiles(),
    listApprovedTemplates(),
  ]);

  if (!conversation) notFound();

  return (
    <ConversationThread
      conversation={conversation}
      initialMessages={messages}
      profiles={profiles}
      templates={templates}
      canDelete={session.role === "admin" || session.role === "supervisor"}
    />
  );
}
