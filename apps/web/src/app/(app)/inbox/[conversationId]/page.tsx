import { notFound } from "next/navigation";
import { getConversation, listAssignableProfiles, listMessages } from "@/lib/inbox/queries";
import { listApprovedTemplates } from "@/lib/templates/queries";
import { ConversationThread } from "@/components/inbox/conversation-thread";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;

  const [conversation, messages, profiles, templates] = await Promise.all([
    getConversation(conversationId),
    listMessages(conversationId),
    listAssignableProfiles(),
    listApprovedTemplates(),
  ]);

  if (!conversation) notFound();

  return (
    <ConversationThread conversation={conversation} initialMessages={messages} profiles={profiles} templates={templates} />
  );
}
