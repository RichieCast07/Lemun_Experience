import { useState } from "react";
import Icon from "../../components/Icon";
import { Modal, useToast } from "../../components/ui";
import { formatDateTime, formatMoney } from "../../core/format";
import type { Boleto } from "../../core/types";
import TicketCard from "./TicketCard";

// Prefijo de país para armar el enlace de WhatsApp con teléfonos de 10 dígitos.
const COUNTRY_CODE = "52";

function whatsappLink(ticket: Boleto): string | null {
  const digits = ticket.cliente_telefono.replace(/\D/g, "");
  if (!digits) return null;
  const phone = digits.length === 10 ? `${COUNTRY_CODE}${digits}` : digits;
  const text = `Hola ${ticket.cliente_nombre.split(" ")[0]}, este es tu boleto para ${ticket.evento_nombre}: ${ticket.url_publica}`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

export default function TicketModal({
  ticket,
  onClose,
  showMoney = true,
  title = "Tu boleto",
}: {
  ticket: Boleto;
  onClose: () => void;
  /** el MANAGER no debe ver montos */
  showMoney?: boolean;
  title?: string;
}) {
  const toast = useToast();
  const wa = whatsappLink(ticket);

  const [downloading, setDownloading] = useState(false);
  const download = async () => {
    setDownloading(true);
    try {
      const { downloadTicket } = await import("./downloadTicket");
      await downloadTicket({
        eventName: ticket.evento_nombre,
        eventDate: ticket.fecha_evento,
        place: ticket.evento_lugar,
        clientName: ticket.cliente_nombre,
        type: ticket.tipo_boleto,
        code: ticket.codigo,
        status: ticket.estado,
        rpName: showMoney ? ticket.rp_nombre : null,
      });
    } catch {
      toast("No se pudo descargar el boleto. Inténtalo de nuevo.", "error");
    } finally {
      setDownloading(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ticket.url_publica);
      toast("Enlace copiado");
    } catch {
      toast("No se pudo copiar. Selecciona y copia el enlace manualmente.", "error");
    }
  };

  return (
    <Modal
      title={title}
      eyebrow="Boleto"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={download} disabled={downloading}>
            <Icon name="download" size={16} /> {downloading ? "Generando…" : "Descargar"}
          </button>
          <button className="btn btn-ghost" onClick={copy}>
            <Icon name="copy" size={16} /> Copiar enlace
          </button>
          {wa && (
            <a className="btn btn-primary" href={wa} target="_blank" rel="noopener noreferrer">
              <Icon name="send" size={16} /> Enviar por WhatsApp
            </a>
          )}
        </>
      }
    >
      <div className="stack">
        <TicketCard
          eventName={ticket.evento_nombre}
          eventDate={ticket.fecha_evento}
          place={ticket.evento_lugar}
          mapsUrl={ticket.maps_url}
          clientName={ticket.cliente_nombre}
          type={ticket.tipo_boleto}
          code={ticket.codigo}
          status={ticket.estado}
          rpName={showMoney ? ticket.rp_nombre : null}
        />
        <dl className="kv">
          <dt>Cliente</dt>
          <dd>
            {ticket.cliente_nombre}
            {ticket.cliente_telefono && <span className="muted"> · {ticket.cliente_telefono}</span>}
          </dd>
          <dt>Fase</dt>
          <dd>{ticket.fase_nombre}</dd>
          {showMoney && ticket.rp_nombre && (
            <>
              <dt>RP</dt>
              <dd>{ticket.rp_nombre}</dd>
            </>
          )}
          {showMoney && (
            <>
              <dt>Precio</dt>
              <dd className="mono">{formatMoney(ticket.precio)}</dd>
            </>
          )}
          <dt>Vendido</dt>
          <dd>{formatDateTime(ticket.vendido_en)}</dd>
          {ticket.usado_en && (
            <>
              <dt>Acceso</dt>
              <dd>
                {formatDateTime(ticket.usado_en)}
                {ticket.usado_por_nombre && <span className="muted"> · {ticket.usado_por_nombre}</span>}
              </dd>
            </>
          )}
        </dl>
      </div>
    </Modal>
  );
}
