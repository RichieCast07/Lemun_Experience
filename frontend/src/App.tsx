import { Navigate, Route, Routes } from "react-router-dom";
import Shell, { type NavItem } from "./components/Shell";
import AdminClientsPage from "./features/admin/ClientsPage";
import AdminEventDetailPage from "./features/admin/EventDetailPage";
import AdminEventsPage from "./features/admin/EventsPage";
import AdminMetricsPage from "./features/admin/MetricsPage";
import AdminTeamPage from "./features/admin/TeamPage";
import AdminTicketsPage from "./features/admin/TicketsPage";
import LoginPage from "./features/auth/LoginPage";
import ScannerPage from "./features/manager/ScannerPage";
import RpEventsPage from "./features/rp/RpEventsPage";
import RpSalesPage from "./features/rp/RpSalesPage";
import RpSellPage from "./features/rp/RpSellPage";
import PublicTicketPage from "./features/tickets/PublicTicketPage";
import { HomeRedirect, RequireRole } from "./routes/guards";

const ADMIN_NAV: NavItem[] = [
  { to: "/admin/metricas", label: "Métricas", icon: "chart" },
  { to: "/admin/eventos", label: "Eventos", icon: "calendar" },
  { to: "/admin/boletos", label: "Boletos", icon: "ticket" },
  { to: "/admin/clientes", label: "Clientes", icon: "user" },
  { to: "/admin/equipo", label: "Equipo", icon: "users" },
];

const RP_NAV: NavItem[] = [
  { to: "/rp/eventos", label: "Eventos", icon: "calendar" },
  { to: "/rp/vender", label: "Vender", icon: "ticket" },
  { to: "/rp/ventas", label: "Mis ventas", icon: "chart" },
];

const MANAGER_NAV: NavItem[] = [{ to: "/manager/acceso", label: "Control de acceso", icon: "scan" }];

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/t/:token" element={<PublicTicketPage />} />

      <Route element={<RequireRole roles={["ADMIN"]} />}>
        <Route path="/admin" element={<Shell items={ADMIN_NAV} section="Administración" />}>
          <Route index element={<Navigate to="metricas" replace />} />
          <Route path="metricas" element={<AdminMetricsPage />} />
          <Route path="eventos" element={<AdminEventsPage />} />
          <Route path="eventos/:id" element={<AdminEventDetailPage />} />
          <Route path="boletos" element={<AdminTicketsPage />} />
          <Route path="clientes" element={<AdminClientsPage />} />
          <Route path="equipo" element={<AdminTeamPage />} />
        </Route>
      </Route>

      <Route element={<RequireRole roles={["RP"]} />}>
        <Route path="/rp" element={<Shell items={RP_NAV} section="Relaciones públicas" />}>
          <Route index element={<Navigate to="eventos" replace />} />
          <Route path="eventos" element={<RpEventsPage />} />
          <Route path="vender" element={<RpSellPage />} />
          <Route path="vender/:eventId" element={<RpSellPage />} />
          <Route path="ventas" element={<RpSalesPage />} />
        </Route>
      </Route>

      <Route element={<RequireRole roles={["MANAGER"]} />}>
        <Route path="/manager" element={<Shell items={MANAGER_NAV} section="Operación" />}>
          <Route index element={<Navigate to="acceso" replace />} />
          <Route path="acceso" element={<ScannerPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
