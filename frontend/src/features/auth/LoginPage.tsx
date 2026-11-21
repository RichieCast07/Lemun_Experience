import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import Logo from "../../components/Logo";
import { Field } from "../../components/ui";
import { HOME_BY_ROLE, useAuth } from "../../core/auth";
import { errorMessage } from "../../core/hooks";

export default function LoginPage() {
  const { user, login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={HOME_BY_ROLE[user.rol]} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <Logo size="lg" tagline />
        <div className="auth-panel">
          <form className="auth-form" onSubmit={submit} noValidate>
            <div className="divider-title">Acceso</div>
            {error && (
              <div className="alert alert-error" role="alert">
                {error}
              </div>
            )}
            <Field label="Usuario">
              {(id) => (
                <input
                  id={id}
                  className="input"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="tu.usuario"
                />
              )}
            </Field>
            <Field label="Contraseña">
              {(id) => (
                <input
                  id={id}
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              )}
            </Field>
            <button className="btn btn-primary btn-block" type="submit" disabled={busy || !username || !password}>
              {busy ? "Ingresando…" : "Ingresar"}
            </button>
          </form>
        </div>
        <div className="auth-foot">Administración · Relaciones públicas · Accesos</div>
      </div>
    </div>
  );
}
