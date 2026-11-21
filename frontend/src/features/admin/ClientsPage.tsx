import { useState } from "react";
import Icon from "../../components/Icon";
import { Badge, EmptyState, ErrorState, Loading, Modal, PageHeader, useToast } from "../../components/ui";
import { api, downloadFile } from "../../core/api";
import { formatDate, formatInt, formatMoney, formatPhone } from "../../core/format";
import { errorMessage, useAsync, useDebounced } from "../../core/hooks";
import type { Cliente, ClienteDetalle } from "../../core/types";

export default function ClientsPage() {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const q = useDebounced(search.trim(), 300);
  const { data, loading, error, reload } = useAsync(() => api<Cliente[]>("/clients", { query: { q } }), [q]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadFile("/clients/export/csv", "lumen-clientes.csv");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Cartera"
        title="Clientes"
        sub="Personas que han comprado boletos. Un cliente se identifica por su teléfono."
        actions={
          <button className="btn btn-ghost" onClick={exportCsv} disabled={exporting}>
            <Icon name="download" size={16} /> {exporting ? "Exportando…" : "Exportar CSV"}
          </button>
        }
      />

      <div className="toolbar">
        <div className="search-box">
          <Icon name="search" size={16} className="icon" />
          <input className="input" placeholder="Buscar por nombre o teléfono" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar clientes" />
        </div>
      </div>

      <div className="card card-flush">
        {loading && !data ? (
          <Loading />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : (data ?? []).length === 0 ? (
          <EmptyState icon="user" title="Sin clientes">
            {q ? "Ningún cliente coincide con la búsqueda." : "Los clientes aparecen aquí cuando se vende su primer boleto."}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Teléfono</th>
                  <th className="num">Boletos</th>
                  <th className="num">Total</th>
                  <th>Última compra</th>
                  <th className="actions" />
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((c) => (
                  <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => setSelectedId(c.id)}>
                    <td className="cell-title">{c.nombre_completo}</td>
                    <td className="mono">{formatPhone(c.telefono)}</td>
                    <td className="num">{formatInt(c.boletos)}</td>
                    <td className="num">{formatMoney(c.total_gastado)}</td>
                    <td className="muted">{formatDate(c.ultima_compra)}</td>
                    <td className="actions">
                      <Icon name="chevronRight" size={16} className="faint" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedId !== null && <ClientDetailModal id={selectedId} onClose={() => setSelectedId(null)} />}
    </>
  );
}

function ClientDetailModal({ id, onClose }: { id: number; onClose: () => void }) {
  const { data, loading, error } = useAsync(() => api<ClienteDetalle>(`/clients/${id}`), [id]);
  return (
    <Modal title={data?.nombre_completo ?? "Cliente"} eyebrow="Historial" size="lg" onClose={onClose}>
      {loading ? (
        <Loading />
      ) : error || !data ? (
        <ErrorState message={error ?? "No se encontró el cliente"} />
      ) : (
        <div className="stack">
          <p className="muted">
            {formatPhone(data.telefono)} · cliente desde {formatDate(data.creado_en)}
          </p>
          <div className="card card-flush">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Evento</th>
                    <th>Tipo</th>
                    <th>Vendedor</th>
                    <th className="num">Precio</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.boletos.map((b) => (
                    <tr key={b.codigo}>
                      <td>
                        <div className="cell-title">{b.evento_nombre}</div>
                        <div className="cell-sub">{formatDate(b.vendido_en)}</div>
                      </td>
                      <td>{b.tipo_boleto}</td>
                      <td>{b.rp_nombre}</td>
                      <td className="num">{formatMoney(b.precio)}</td>
                      <td>
                        <Badge tone={b.estado === "USADO" ? "gold" : "success"}>{b.estado === "USADO" ? "Utilizado" : "Válido"}</Badge>
                      </td>
                    </tr>
                  ))}
                  {data.boletos.length === 0 && (
                    <tr>
                      <td colSpan={5} className="muted">
                        Sin boletos.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
