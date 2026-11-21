import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../../components/Icon";
import { Badge, EmptyState, ErrorState, Loading, PageHeader, useToast } from "../../components/ui";
import { api } from "../../core/api";
import { formatDateTime, formatInt, formatMoney } from "../../core/format";
import { errorMessage, useAsync } from "../../core/hooks";
import type { EventoItem } from "../../core/types";
import EventForm from "./EventForm";

export default function EventsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, error, reload } = useAsync(() => api<EventoItem[]>("/events"), []);
  const [creating, setCreating] = useState(false);

  const toggle = async (ev: EventoItem) => {
    try {
      await api(`/events/${ev.id}/toggle`, { method: "PATCH" });
      toast(ev.activo ? "Evento desactivado" : "Evento activado");
      reload();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Catálogo"
        title="Eventos"
        sub="Crea eventos, define sus fases de venta y los tipos de boleto."
        actions={
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={16} /> Nuevo evento
          </button>
        }
      />

      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (data ?? []).length === 0 ? (
        <div className="card">
          <EmptyState
            icon="calendar"
            title="Aún no hay eventos"
            action={
              <button className="btn btn-primary" onClick={() => setCreating(true)}>
                Crear el primero
              </button>
            }
          >
            Un evento reúne sus fases de venta, tipos de boleto y todo el control de accesos.
          </EmptyState>
        </div>
      ) : (
        <div className="grid grid-auto">
          {(data ?? []).map((ev) => {
            const pct = ev.boletos_vendidos > 0 ? Math.round((ev.boletos_usados / ev.boletos_vendidos) * 100) : 0;
            return (
              <article
                key={ev.id}
                className="card on-ink card-hover card-clickable stack"
                style={{ gap: 14, opacity: ev.activo ? 1 : 0.62 }}
                onClick={() => navigate(`/admin/eventos/${ev.id}`)}
                role="link"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && navigate(`/admin/eventos/${ev.id}`)}
              >
                <div className="row-between" style={{ alignItems: "flex-start" }}>
                  <div>
                    <div className="eyebrow">{ev.codigo_evento}</div>
                    <h3 style={{ marginTop: 6, fontSize: "1.15rem" }}>{ev.nombre}</h3>
                  </div>
                  <Badge tone={ev.activo ? "success" : "neutral"}>{ev.activo ? "Activo" : "Inactivo"}</Badge>
                </div>
                <div className="muted" style={{ fontSize: "0.88rem", display: "grid", gap: 4 }}>
                  <span className="row" style={{ gap: 8 }}>
                    <Icon name="clock" size={15} /> {formatDateTime(ev.fecha_evento)}
                  </span>
                  <span className="row" style={{ gap: 8 }}>
                    <Icon name="pin" size={15} /> {ev.lugar}
                  </span>
                </div>
                <div>
                  <div className="row-between faint" style={{ fontSize: "0.78rem", marginBottom: 8 }}>
                    <span>{formatInt(ev.boletos_vendidos)} vendidos</span>
                    <span>{pct}% ingresó</span>
                  </div>
                  <div className="progress">
                    <span style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div className="row-between" style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}>
                  {ev.fase_vigente ? (
                    <span style={{ fontSize: "0.82rem" }}>
                      <span className="gold-text" style={{ color: "var(--text)" }}>
                        {ev.fase_vigente.nombre}
                      </span>{" "}
                      <span className="muted">· desde {formatMoney(ev.fase_vigente.precio)}</span>
                    </span>
                  ) : (
                    <span className="faint" style={{ fontSize: "0.82rem" }}>
                      Sin fase vigente
                    </span>
                  )}
                  <button
                    className="btn btn-quiet btn-icon btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      void toggle(ev);
                    }}
                    title={ev.activo ? "Desactivar evento" : "Activar evento"}
                    aria-label={ev.activo ? "Desactivar evento" : "Activar evento"}
                  >
                    <Icon name="power" size={16} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {creating && (
        <EventForm
          onClose={() => setCreating(false)}
          onSaved={(saved) => {
            setCreating(false);
            toast("Evento creado");
            navigate(`/admin/eventos/${saved.id}`);
          }}
        />
      )}
    </>
  );
}
