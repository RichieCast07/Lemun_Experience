import { useMemo, useState } from "react";
import Icon from "../../components/Icon";
import { Badge, EmptyState, ErrorState, Loading, PageHeader, Stat } from "../../components/ui";
import { api } from "../../core/api";
import { formatDateTime, formatInt, formatMoney, formatMoneyShort, onlyDigits } from "../../core/format";
import { useAsync } from "../../core/hooks";
import type { Boleto, MyMetrics, Paginated } from "../../core/types";
import TicketModal from "../tickets/TicketModal";

export default function RpSalesPage() {
  const sales = useAsync(() => api<Paginated<Boleto>>("/tickets/mine", { query: { limit: 500 } }), []);
  const me = useAsync(() => api<MyMetrics>("/metrics/me"), []);
  const [eventId, setEventId] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Boleto | null>(null);

  const all = sales.data?.items ?? [];
  const events = useMemo(() => {
    const map = new Map<number, string>();
    for (const t of all) map.set(t.evento_id, t.evento_nombre);
    return [...map.entries()];
  }, [all]);

  const filtered = useMemo(() => {
    const digits = onlyDigits(search);
    const text = search.trim().toLowerCase();
    return all.filter((t) => {
      if (eventId && t.evento_id !== Number(eventId)) return false;
      if (!text) return true;
      return (digits && t.cliente_telefono.includes(digits)) || t.cliente_nombre.toLowerCase().includes(text);
    });
  }, [all, eventId, search]);

  const totals = useMemo(
    () => ({
      count: filtered.length,
      revenue: filtered.reduce((a, t) => a + t.precio, 0),
      commission: filtered.reduce((a, t) => a + t.comision_rp, 0),
    }),
    [filtered]
  );

  return (
    <>
      <PageHeader eyebrow="Historial" title="Mis ventas" sub="Boletos que has vendido y tu comisión acumulada." />

      <div className="grid grid-3">
        <Stat icon="ticket" label="Boletos" value={formatInt(totals.count)} foot={me.data ? `${formatInt(me.data.resumen.usados)} ya ingresaron (total)` : undefined} />
        <Stat icon="chart" label="Ingresos" value={formatMoneyShort(totals.revenue)} gold />
        <Stat icon="sparkle" label="Comisión" value={formatMoneyShort(totals.commission)} />
      </div>

      <div className="toolbar" style={{ marginTop: 28 }}>
        <div className="search-box">
          <Icon name="search" size={16} className="icon" />
          <input className="input" placeholder="Buscar por nombre o teléfono" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar ventas" />
        </div>
        <select className="select" value={eventId} onChange={(e) => setEventId(e.target.value)} aria-label="Filtrar por evento">
          <option value="">Todos los eventos</option>
          {events.map(([id, nombre]) => (
            <option key={id} value={id}>
              {nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="card card-flush">
        {sales.loading && !sales.data ? (
          <Loading />
        ) : sales.error ? (
          <ErrorState message={sales.error} onRetry={sales.reload} />
        ) : filtered.length === 0 ? (
          <EmptyState icon="ticket" title={all.length === 0 ? "Aún no tienes ventas" : "Sin resultados"}>
            {all.length === 0 ? "Cuando generes tu primer boleto aparecerá aquí." : "Prueba con otro filtro o búsqueda."}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Evento</th>
                  <th className="num">Precio</th>
                  <th className="num">Comisión</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                  <th className="actions" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} style={{ cursor: "pointer" }} onClick={() => setSelected(t)}>
                    <td>
                      <div className="cell-title">{t.cliente_nombre}</div>
                      <div className="cell-sub">{t.cliente_telefono}</div>
                    </td>
                    <td>
                      <div>{t.evento_nombre}</div>
                      <div className="cell-sub">
                        {t.tipo_boleto} · {t.fase_nombre}
                      </div>
                    </td>
                    <td className="num">{formatMoney(t.precio)}</td>
                    <td className="num">{formatMoney(t.comision_rp)}</td>
                    <td>
                      <Badge tone={t.estado === "USADO" ? "gold" : "success"}>{t.estado === "USADO" ? "Utilizado" : "Válido"}</Badge>
                    </td>
                    <td className="muted">{formatDateTime(t.vendido_en)}</td>
                    <td className="actions">
                      <Icon name="eye" size={16} className="faint" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && <TicketModal ticket={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
