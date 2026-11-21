import { QRCodeSVG } from "qrcode.react";
import Icon from "../../components/Icon";
import { Badge } from "../../components/ui";
import { formatLongDate, formatTime } from "../../core/format";
import type { EstadoBoleto } from "../../core/types";

interface Props {
  eventName: string;
  eventDate: string;
  place: string;
  mapsUrl?: string | null;
  clientName: string;
  type: string;
  code: string;
  status: EstadoBoleto;
  /** RP que hizo la venta; se omite cuando el rol no debe verlo (MANAGER) o el enlace es público */
  rpName?: string | null;
}

/** Boleto con QR. El QR es oscuro sobre marfil para máxima legibilidad al escanear. */
export default function TicketCard({ eventName, eventDate, place, mapsUrl, clientName, type, code, status, rpName }: Props) {
  const used = status === "USADO";
  return (
    <div className="ticket-card">
      <div className="ticket-top">
        <div className="eyebrow">Boleto · {type}</div>
        <div className="ticket-title">{eventName}</div>
        <div className="ticket-meta">
          {formatLongDate(eventDate)} · {formatTime(eventDate)} h
        </div>
        <div className="ticket-meta" style={{ marginTop: 2 }}>
          {mapsUrl ? (
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="pin" size={14} /> {place}
            </a>
          ) : (
            place
          )}
        </div>
      </div>
      <div className="ticket-tear" />
      <div className="ticket-bottom">
        <div className={`qr-frame${used ? " is-void" : ""}`}>
          <QRCodeSVG value={code} size={196} level="M" bgColor="#ffffff" fgColor="#16181c" marginSize={0} />
        </div>
        <div className="ticket-code">{code}</div>
        <div className="ticket-info">
          <div>
            <div className="k">A nombre de</div>
            <div className="v">{clientName}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="k">Estado</div>
            <div className="v">
              <Badge tone={used ? "danger" : "success"}>{used ? "Utilizado" : "Válido"}</Badge>
            </div>
          </div>
          {rpName && (
            <div style={{ gridColumn: "1 / -1" }}>
              <div className="k">Vendido por (RP)</div>
              <div className="v">{rpName}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
