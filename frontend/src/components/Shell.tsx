import { NavLink, Outlet } from "react-router-dom";
import { ROLE_LABEL, useAuth } from "../core/auth";
import { initials } from "../core/format";
import Icon, { type IconName } from "./Icon";
import Logo from "./Logo";

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
}

/** Layout autenticado: cabecera con navegación en píldoras (escritorio) y barra inferior flotante (móvil). */
export default function Shell({ items, section }: { items: NavItem[]; section: string }) {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <div className="shell">
      <header className="topnav">
        <Logo size="sm" />
        <nav className="pillnav" aria-label={section}>
          {items.map((item) => (
            <NavLink key={item.to} to={item.to}>
              <Icon name={item.icon} size={16} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="user-box">
          <div className="who" style={{ textAlign: "right" }}>
            <div className="name">{user.nombre_completo}</div>
            <div className="role">{ROLE_LABEL[user.rol]}</div>
          </div>
          <div className="avatar">{initials(user.nombre_completo)}</div>
          <button className="btn btn-quiet btn-icon btn-sm" onClick={logout} aria-label="Cerrar sesión" title="Cerrar sesión">
            <Icon name="logout" />
          </button>
        </div>
      </header>

      <div className="main">
        <div className="topbar">
          <Logo size="sm" />
          <button className="btn btn-quiet btn-sm" onClick={logout}>
            <Icon name="logout" size={16} /> Salir
          </button>
        </div>
        <main className="main-inner">
          <Outlet />
        </main>
        <nav className="bottom-nav" aria-label="Principal móvil">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to}>
              <Icon name={item.icon} size={20} />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
