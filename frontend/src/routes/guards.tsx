import { Navigate, Outlet, useLocation } from "react-router-dom";
import { HOME_BY_ROLE, useAuth } from "../core/auth";
import type { Rol } from "../core/types";
import { Loading } from "../components/ui";

/** Exige sesión y uno de los roles permitidos; si no, redirige. */
export function RequireRole({ roles }: { roles: Rol[] }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <Loading label="Verificando sesión…" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!roles.includes(user.rol)) return <Navigate to={HOME_BY_ROLE[user.rol]} replace />;
  return <Outlet />;
}

/** `/` → lleva a cada rol a su pantalla de inicio. */
export function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <Loading label="Cargando…" />;
  return <Navigate to={user ? HOME_BY_ROLE[user.rol] : "/login"} replace />;
}
