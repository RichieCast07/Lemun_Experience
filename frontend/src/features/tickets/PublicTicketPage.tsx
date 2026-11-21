import { useState } from "react";
import { useParams } from "react-router-dom";
import Icon from "../../components/Icon";
import Logo from "../../components/Logo";
import { ErrorState, Loading } from "../../components/ui";
import { api } from "../../core/api";
import { useAsync } from "../../core/hooks";
import type { PublicBoleto } from "../../core/types";
import TicketCard from "./TicketCard";

/** Página pública: el cliente abre su boleto desde el enlace, sin iniciar sesión. */
export default function PublicTicketPage() {
  const { token = "" } = useParams();
  const { data, loading, error, reload } = useAsync(
    () => api<PublicBoleto>(`/tickets/public/${encodeURIComponent(token)}`, { auth: false }),
    [token]
  );

  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const download = async () => {
    if (!data) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const { downloadTicket } = await import("./downloadTicket");
      await downloadTicket({
        eventName: data.evento_nombre,
        eventDate: data.fecha_evento,
        place: data.evento_lugar,
        clientName: data.cliente_nombre,
        type: data.tipo_boleto,
        code: data.codigo,
        status: data.estado,
      });
    } catch {
      setDownloadError("No se pudo descargar el boleto. Inténtalo de nuevo.");
    } finally {
      setDownloading(false);
    }
  };

  const notFound =error !== null && /no encontrado/i.test(error);

  return (
    <div className="public-screen">
      <Logo size="md" tagline />
      <div className="public-card">
        {loading && <Loading label="Cargando tu boleto…" />}
        {!loading && error && (
          <div className="card">
            <ErrorState message={notFound ? "Este enlace no corresponde a ningún boleto. Verifica que esté completo." : error} onRetry={notFound ? undefined : reload} />
          </div>
        )}
        {data && (
          <TicketCard
            eventName={data.evento_nombre}
            eventDate={data.fecha_evento}
            place={data.evento_lugar}
            mapsUrl={data.maps_url}
            clientName={data.cliente_nombre}
            type={data.tipo_boleto}
            code={data.codigo}
            status={data.estado}
          />
        )}
      </div>
      {data && (
        <button className="btn btn-primary" onClick={download} disabled={downloading}>
          <Icon name="download" size={16} /> {downloading ? "Generando…" : "Descargar boleto"}
        </button>
      )}
      {downloadError && <p className="muted" style={{ fontSize: "0.85rem" }}>{downloadError}</p>}
      {data && <p className="muted" style={{ maxWidth: 360, textAlign: "center", fontSize: "0.85rem" }}>Presenta este código QR en la entrada. Es personal e intransferible.</p>}
    </div>
  );
}
