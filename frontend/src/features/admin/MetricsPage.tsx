import { useState } from "react";
import { BarChart, EmptyState, ErrorState, Loading, PageHeader, SectionTitle, Stat, Badge } from "../../components/ui";
import { api } from "../../core/api";
import { formatDate, formatInt, formatMoney, formatMoneyShort } from "../../core/format";
import { useAsync } from "../../core/hooks";
import type { DayPoint, EventMetrics, EventoItem, RpMetric, Summary } from "../../core/types";

export default function MetricsPage() {
  const [eventId, setEventId] = useState<number | "">("");
  const eventFilter = eventId === "" ? undefined : eventId;

  const events = useAsync(() => api<EventoItem[]>("/events"), []);
  const summary = useAsync(() => api<Summary>("/metrics/summary", { query: { evento_id: eventFilter } }), [eventId]);
  const days = useAsync(() => api<DayPoint[]>("/metrics/sales-by-day", { query: { days: 30, evento_id: eventFilter } }), [eventId]);
  const rps = useAsync(() => api<RpMetric[]>("/metrics/rps", { query: { evento_id: eventFilter } }), [eventId]);
  const detail = useAsync(
    () => (eventFilter ? api<EventMetrics>(`/metrics/events/${eventFilter}`) : Promise.resolve(null)),
    [eventId]
  );

  const s = summary.data;
  const attendance = s && s.boletos > 0 ? Math.round((s.usados / s.boletos) * 100) : 0;
  const maxRp = Math.max(1, ...(rps.data ?? []).map((r) => r.ingresos));

  return (
    <>
      <PageHeader
        eyebrow="Panel"
        title="Métricas"
        sub="Ventas, asistencia y desempeño del equipo."
        actions={
          <select className="select" value={eventId} onChange={(e) => setEventId(e.target.value === "" ? "" : Number(e.target.value))} aria-label="Filtrar por evento">
            <option value="">Todos los eventos</option>
            {(events.data ?? []).map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.nombre}
              </option>
            ))}
          </select>
        }
      />

      {summary.loading && !s ? (
        <Loading />
      ) : summary.error ? (
        <ErrorState message={summary.error} onRetry={summary.reload} />
      ) : s ? (
        <div className="grid grid-4">
          <Stat icon="chart" label="Ingresos" value={formatMoneyShort(s.ingresos)} gold foot={`${formatInt(s.boletos)} boletos vendidos`} />
          <Stat icon="ticket" label="Boletos" value={formatInt(s.boletos)} foot={`${formatInt(s.clientes)} clientes únicos`} />
          <Stat icon="scan" label="Asistencia" value={`${attendance}%`} foot={`${formatInt(s.usados)} de ${formatInt(s.boletos)} ingresaron`} />
          <Stat icon="users" label="Comisiones" value={formatMoneyShort(s.comisiones)} foot={`${s.rps_activos} RPs activos · ${s.eventos_activos} eventos activos`} />
        </div>
      ) : null}

      <SectionTitle>Ventas · últimos 30 días</SectionTitle>
      <div className="card">
        {days.loading && !days.data ? (
          <Loading />
        ) : days.error ? (
          <ErrorState message={days.error} onRetry={days.reload} />
        ) : (
          <BarChart
            points={(days.data ?? []).map((d) => ({
              label: formatDate(`${d.dia}T12:00:00`),
              value: d.boletos,
              tip: `${formatDate(`${d.dia}T12:00:00`)} · ${d.boletos} boletos · ${formatMoney(d.ingresos)}`,
            }))}
          />
        )}
      </div>

      {detail.data && (
        <>
          <SectionTitle>Detalle del evento</SectionTitle>
          <div className="grid grid-2">
            <div className="card card-flush">
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Fase</th>
                      <th className="num">Boletos</th>
                      <th className="num">Ingresos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.data.por_fase.map((f) => (
                      <tr key={f.id} className={f.activa ? "" : "is-off"}>
                        <td>
                          <div className="cell-title">{f.nombre}</div>
                          <div className="cell-sub">Base {formatMoney(f.precio)}</div>
                        </td>
                        <td className="num">{formatInt(f.boletos)}</td>
                        <td className="num">{formatMoney(f.ingresos)}</td>
                      </tr>
                    ))}
                    {detail.data.por_fase.length === 0 && (
                      <tr>
                        <td colSpan={3} className="muted">
                          Este evento aún no tiene fases.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="card card-flush">
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Tipo de boleto</th>
                      <th className="num">Boletos</th>
                      <th className="num">Ingresos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.data.por_tipo.map((t) => (
                      <tr key={t.nombre}>
                        <td className="cell-title">{t.nombre}</td>
                        <td className="num">{formatInt(t.boletos)}</td>
                        <td className="num">{formatMoney(t.ingresos)}</td>
                      </tr>
                    ))}
                    {detail.data.por_tipo.length === 0 && (
                      <tr>
                        <td colSpan={3} className="muted">
                          Aún no hay ventas.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      <SectionTitle>Ranking de RPs</SectionTitle>
      <div className="card">
        {rps.loading && !rps.data ? (
          <Loading />
        ) : rps.error ? (
          <ErrorState message={rps.error} onRetry={rps.reload} />
        ) : (rps.data ?? []).length === 0 ? (
          <EmptyState icon="users" title="Sin RPs todavía">
            Crea usuarios con rol RP en la sección Equipo para empezar a vender.
          </EmptyState>
        ) : (
          (rps.data ?? []).map((rp, i) => (
            <div key={rp.id} className="rank-row">
              <span className="rank-pos">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <div className="row" style={{ gap: 10 }}>
                  <span className="cell-title" style={{ color: "var(--text)" }}>
                    {rp.nombre_completo}
                  </span>
                  {!rp.activo && <Badge plain>Inactivo</Badge>}
                </div>
                <div className="faint" style={{ fontSize: "0.78rem", marginTop: 2 }}>
                  {formatInt(rp.boletos)} boletos · comisión {formatMoney(rp.comision)}
                </div>
                <div className="progress">
                  <span style={{ width: `${(rp.ingresos / maxRp) * 100}%` }} />
                </div>
                {rp.desglose.length > 0 && (
                  <div className="breakdown" aria-label={`Ventas de ${rp.nombre_completo} por tipo y fase`}>
                    {rp.desglose.map((d) => (
                      <span key={`${d.evento}|${d.fase}|${d.tipo}`} className="sale-chip" title={`${formatMoney(d.ingresos)} · ${d.evento}`}>
                        <b>{formatInt(d.boletos)}</b>
                        <span className="sale-type">{d.tipo}</span>
                        <span className="sale-phase">
                          {d.fase}
                          {!eventFilter && ` · ${d.evento}`}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <span className="mono" style={{ color: "var(--text)" }}>
                {formatMoney(rp.ingresos)}
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
