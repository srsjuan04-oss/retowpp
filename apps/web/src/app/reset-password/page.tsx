import { ResetPasswordForm } from "./reset-password-form";

export default function ResetPasswordPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Elige una nueva contraseña</h1>
        <p className="text-sm text-muted-foreground">Debe tener al menos 6 caracteres.</p>
      </div>
      <ResetPasswordForm />
    </div>
  );
}
