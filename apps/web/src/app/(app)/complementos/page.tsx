import Link from "next/link";
import { requireRole } from "@/lib/auth/dal";

export default async function ComplementosPage() {
  await requireRole("admin", "supervisor");

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <header>
        <h1 className="text-xl font-semibold">Complementos</h1>
        <p className="text-sm text-muted-foreground">Conecta plataformas externas y dispara mensajes automáticos.</p>
      </header>

      <Link
        href="/complementos/hotmart"
        className="flex max-w-md items-center justify-between rounded-lg border p-4 hover:bg-accent"
      >
        <div>
          <p className="font-medium">Hotmart</p>
          <p className="text-sm text-muted-foreground">Manda una plantilla al comprador cuando hay una compra o carrito abandonado.</p>
        </div>
        <span className="text-sm text-muted-foreground">→</span>
      </Link>

      <Link
        href="/complementos/appointment-reminders"
        className="flex max-w-md items-center justify-between rounded-lg border p-4 hover:bg-accent"
      >
        <div>
          <p className="font-medium">Recordatorios de cita (salon-pro)</p>
          <p className="text-sm text-muted-foreground">Manda una plantilla al cliente cuando salon-pro dispara un recordatorio de cita.</p>
        </div>
        <span className="text-sm text-muted-foreground">→</span>
      </Link>
    </div>
  );
}
