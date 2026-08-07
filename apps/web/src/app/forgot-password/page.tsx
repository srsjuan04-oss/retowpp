import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">¿Olvidaste tu contraseña?</h1>
        <p className="text-sm text-muted-foreground">Te enviamos un enlace para restablecerla.</p>
      </div>
      <ForgotPasswordForm />
    </div>
  );
}
