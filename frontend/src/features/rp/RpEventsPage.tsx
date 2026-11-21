import { Link } from "react-router-dom";
import Icon from "../../components/Icon";
import { Badge, EmptyState, ErrorState, Loading, PageHeader, Stat } from "../../components/ui";
import { api } from "../../core/api";
import { useAuth } from "../../core/auth";
import { formatDateTime, formatInt, formatMoney, formatMoneyShort } from "../../core/format";
import { useAsync } from "../../core/hooks";
import type { EventoItem, MyMetrics } from "../../core/types";

export default function RpEventsPage() {
  const { user } = useAuth();
  const events = useAsync(() => api<EventoItem[]>("/events"), []);
  const me = useAsync(() => api<MyMetrics>("/metrics/me"), []);

  return (
    <>
      <PageHeader eyebrow="Relaciones públicas" title={`Hola, ${user?.nombre_completo.split(" ")[0] ?? ""}`} sub="Elige un evento y genera boletos para tus clientes." />

      {me.data && (
        <div className="grid grid-3" style={{ marginBottom: 8 }}>
          <Stat icon="ticket" label="Mis boletos" value={formatInt(me.data.resumen.boletos)} />
          <Stat icon="chart" label="Ingresos generados" value={formatMoneyShort(me.data.resumen.ingresos)} gold />
          <Stat icon="sparkle" label="Mi comisión" value={formatMoneyShort(me.data.resumen.comision)} foot={`${me.data.comision_porcentaje}% por boleto`} />
        </div>
      )}

      <div className="section-title">
        <h2>Próximos eventos</h2>
      </div>

      {events.loading && !events.data ? (
        <Loading />
      ) : events.error ? (
        <ErrorState message={events.error} onRetry={events.reload} />
      ) : (events.data ?? []).length === 0 ? (
        <div className="card">
          <EmptyState icon="calendar" title="No hay eventos disponibles">
            Cuando el administrador publique un evento activo aparecerá aquí.
          </EmptyState>
        </div>
      ) : (
        <div className="grid grid-auto">
          {(events.data ?? []).map((ev) => (
            <article key={ev.id} className="card on-ink card-hover stack" style={{ gap: 14 }}>
              <div>
                <div className="eyebrow">{ev.codigo_evento}</div>
                <h3 style={{ marginTop: 6, fontSize: "1.15rem" }}>{ev.nombre}</h3>
              </div>
              <div className="muted" style={{ fontSize: "0.88rem", display: "grid", gap: 4 }}>
                <span className="row" style={{ gap: 8 }}>
                  <Icon name="clock" size={15} /> {formatDateTime(ev.fecha_evento)}
                </span>
                <span className="row" style={{ gap: 8 }}>
                  <Icon name="pin" size={15} /> {ev.lugar}
                </span>
              </div>
              <div className="row-between" style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}>
                {ev.fase_vigente ? (
                  <div>
                    <Badge tone="gold">{ev.fase_vigente.nombre}</Badge>
                    <div className="mono" style={{ marginTop: 6, color: "var(--text)" }}>
                      desde {formatMoney(ev.fase_vigente.precio)}
                    </div>
                  </div>
                ) : (
                  <Badge plain>Venta no disponible</Badge>
                )}
                <Link to={`/rp/vender/${ev.id}`} className={`btn btn-sm ${ev.fase_vigente ? "btn-primary" : "btn-ghost"}`} aria-disabled={!ev.fase_vigente}>
                  <Icon name="ticket" size={15} /> Vender
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
