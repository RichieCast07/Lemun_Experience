import { useState } from "react";
import Icon from "../../components/Icon";
import { Badge, ConfirmModal, EmptyState, ErrorState, Loading, PageHeader, useToast } from "../../components/ui";
import { api } from "../../core/api";
import { formatDateTime, formatInt, formatMoney } from "../../core/format";
import { errorMessage, useAsync, useDebounced } from "../../core/hooks";
import type { Boleto, EstadoBoleto, EventoItem, Paginated, User } from "../../core/types";
import TicketModal from "../tickets/TicketModal";

const PAGE_SIZE = 50;

export default function TicketsPage() {
  const toast = useToast();
  const [eventId, setEventId] = useState("");
  const [rpId, setRpId] = useState("");
  const [estado, setEstado] = useState<"" | EstadoBoleto>("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Boleto | null>(null);
  const [deleting, setDeleting] = useState<Boleto | null>(null);
  const [busy, setBusy] = useState(false);
  const q = useDebounced(search.trim(), 300);

  const events = useAsync(() => api<EventoItem[]>("/events"), []);
  const rps = useAsync(() => api<User[]>("/users", { query: { rol: "RP" } }), []);
  const tickets = useAsync(
    () =>
      api<Paginated<Boleto>>("/tickets", {
        query: { evento_id: eventId, rp_id: rpId, estado, q, limit: PAGE_SIZE, offset: page * PAGE_SIZE },
      }),
    [eventId, rpId, estado, q, page]
  );

  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(0);
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api(`/tickets/code/${encodeURIComponent(deleting.codigo)}`, { method: "DELETE" });
      toast("Boleto eliminado");
      setDeleting(null);
      tickets.reload();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const total = tickets.data?.total ?? 0;
  const items = tickets.data?.items ?? [];
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader eyebrow="Operación" title="Boletos" sub="Todos los boletos vendidos. Busca por cliente, teléfono o código." />

      <div className="toolbar">
        <div className="search-box">
          <Icon name="search" size={16} className="icon" />
          <input className="input" placeholder="Buscar cliente, teléfono o código" value={search} onChange={(e) => resetPage(setSearch)(e.target.value)} aria-label="Buscar boletos" />
        </div>
        <select className="select" value={eventId} onChange={(e) => resetPage(setEventId)(e.target.value)} aria-label="Evento">
          <option value="">Todos los eventos</option>
          {(events.data ?? []).map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.nombre}
            </option>
          ))}
        </select>
        <select className="select" value={rpId} onChange={(e) => resetPage(setRpId)(e.target.value)} aria-label="Vendedor">
          <option value="">Todos los vendedores</option>
          {(rps.data ?? []).map((rp) => (
            <option key={rp.id} value={rp.id}>
              {rp.nombre_completo}
            </option>
          ))}
        </select>
        <select className="select" value={estado} onChange={(e) => resetPage(setEstado)(e.target.value as "" | EstadoBoleto)} aria-label="Estado">
          <option value="">Todos los estados</option>
          <option value="ACTIVO">Válidos</option>
          <option value="USADO">Utilizados</option>
        </select>
      </div>

      <div className="card card-flush">
        {tickets.loading && !tickets.data ? (
          <Loading />
        ) : tickets.error ? (
          <ErrorState message={tickets.error} onRetry={tickets.reload} />
        ) : items.length === 0 ? (
          <EmptyState icon="ticket" title="Sin resultados">
            No hay boletos que coincidan con los filtros.
          </EmptyState>
        ) : (
          <>
            <div className="table-wrap" style={{ opacity: tickets.loading ? 0.6 : 1, transition: "opacity .15s" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Evento</th>
                    <th>Tipo · Fase</th>
                    <th>Vendedor</th>
                    <th className="num">Precio</th>
                    <th>Estado</th>
                    <th>Vendido</th>
                    <th className="actions" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <div className="cell-title">{t.cliente_nombre}</div>
                        <div className="cell-sub">{t.cliente_telefono}</div>
                      </td>
                      <td>
                        <div>{t.evento_nombre}</div>
                        <div className="cell-sub mono">{t.codigo}</div>
                      </td>
                      <td>
                        <div>{t.tipo_boleto}</div>
                        <div className="cell-sub">{t.fase_nombre}</div>
                      </td>
                      <td>{t.rp_nombre}</td>
                      <td className="num">{formatMoney(t.precio)}</td>
                      <td>
                        <Badge tone={t.estado === "USADO" ? "gold" : "success"}>{t.estado === "USADO" ? "Utilizado" : "Válido"}</Badge>
                      </td>
                      <td className="muted">{formatDateTime(t.vendido_en)}</td>
                      <td className="actions">
                        <button className="btn btn-quiet btn-icon btn-sm" onClick={() => setSelected(t)} aria-label="Ver boleto" title="Ver boleto / QR">
                          <Icon name="eye" size={16} />
                        </button>
                        <button className="btn btn-quiet btn-icon btn-sm" onClick={() => setDeleting(t)} aria-label="Eliminar boleto" title="Eliminar">
                          <Icon name="trash" size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <span>
                {formatInt(total)} boletos · página {page + 1} de {pages}
              </span>
              <div className="row" style={{ gap: 6 }}>
                <button className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  <Icon name="chevronLeft" size={15} /> Anterior
                </button>
                <button className="btn btn-ghost btn-sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
                  Siguiente <Icon name="chevronRight" size={15} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {selected && <TicketModal ticket={selected} onClose={() => setSelected(null)} />}
      {deleting && (
        <ConfirmModal
          title="Eliminar boleto"
          danger
          busy={busy}
          confirmLabel="Eliminar"
          message={`Se eliminará el boleto de ${deleting.cliente_nombre} (${deleting.codigo}). El QR dejará de funcionar y la venta saldrá de las métricas.`}
          onConfirm={remove}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}
