import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Chat CharlIA</h1>
        <p className="text-sm text-muted-foreground">Ingresa con tu cuenta del equipo.</p>
      </div>
      <LoginForm />
    </div>
  );
}
