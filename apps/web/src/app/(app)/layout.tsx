import { verifySession } from "@/lib/auth/dal";
import { logout } from "@/lib/auth/actions";
import { AppSidebar } from "@/components/app-sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await verifySession();

  return (
    <div className="flex flex-1 overflow-hidden">
      <AppSidebar
        role={session.role}
        isPlatformAdmin={session.isPlatformAdmin}
        displayName={session.fullName ?? session.email ?? "Usuario"}
        logoutAction={logout}
      />
      <main className="flex flex-1 flex-col overflow-y-auto">{children}</main>
    </div>
  );
}
