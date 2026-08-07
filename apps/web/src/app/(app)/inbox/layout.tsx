import { listConversations } from "@/lib/inbox/queries";
import { ConversationList } from "@/components/inbox/conversation-list";

export default async function InboxLayout({ children }: { children: React.ReactNode }) {
  const conversations = await listConversations();

  return (
    <div className="flex flex-1 overflow-hidden">
      <aside className="w-80 shrink-0 overflow-y-auto border-r">
        <ConversationList initialConversations={conversations} />
      </aside>
      <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}
