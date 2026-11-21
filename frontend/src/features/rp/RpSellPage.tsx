import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { EmptyState, ErrorState, Field, Loading, PageHeader, useToast } from "../../components/ui";
import { api, ApiError } from "../../core/api";
import { useAuth } from "../../core/auth";
import { formatDateTime, formatMoney, onlyDigits } from "../../core/format";
import { errorMessage, useAsync } from "../../core/hooks";
import type { Boleto, Cliente, EventoItem, SaleOptions } from "../../core/types";
import TicketModal from "../tickets/TicketModal";

export default function RpSellPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const selectedId = eventId ? Number(eventId) : null;

  const events = useAsync(() => api<EventoItem[]>("/events"), []);
  const options = useAsync(
    () => (selectedId ? api<SaleOptions>(`/events/${selectedId}/sale-options`) : Promise.resolve(null)),
    [selectedId]
  );

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [lookupNote, setLookupNote] = useState<{ tone: "ok" | "new"; text: string } | null>(null);
  const [nameLocked, setNameLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Boleto | null>(null);

  // Mantener un tipo de boleto válido seleccionado cuando cambian las opciones
  useEffect(() => {
    const tipos = options.data?.tipos ?? [];
    if (tipos.length > 0 && !tipos.some((t) => t.nombre === type)) setType(tipos[0]!.nombre);
  }, [options.data, type]);

  const selectedEvent = (events.data ?? []).find((e) => e.id === selectedId);
  const selectedType = options.data?.tipos.find((t) => t.nombre === type);
  const commission = selectedType ? (selectedType.precio * (user?.comision_porcentaje ?? 0)) / 100 : 0;
  const phoneDigits = onlyDigits(phone);
  const canSubmit = !!selectedType && name.trim().length >= 2 && phoneDigits.length >= 10 && phoneDigits.length <= 15 && !busy;

  const lookup = async () => {
    if (phoneDigits.length < 10) return;
    try {
      const client = await api<Cliente>("/clients/search", { query: { telefono: phoneDigits } });
      setName(client.nombre_completo);
      setNameLocked(true);
      setLookupNote({ tone: "ok", text: "Cliente registrado: nombre autocompletado." });
    } catch (err) {
      setNameLocked(false);
      if (err instanceof ApiError && err.status === 404) setLookupNote({ tone: "new", text: "Cliente nuevo: escribe su nombre para registrarlo." });
      else setLookupNote(null);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedId || !canSubmit) return;
    setError(null);
    setBusy(true);
    try {
      const ticket = await api<Boleto>("/tickets", {
        method: "POST",
        body: { evento_id: selectedId, cliente_nombre: name.trim(), cliente_telefono: phoneDigits, tipo_boleto: type },
      });
      setCreated(ticket);
      setPhone("");
      setName("");
      setNameLocked(false);
      setLookupNote(null);
      toast("Boleto generado");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow="Venta" title="Generar boleto" sub="Registra al cliente y genera su boleto con código QR." />

      <div className="card" style={{ marginBottom: 20 }}>
        <Field label="Evento">
          {(id) => (
            <select id={id} className="select" value={selectedId ?? ""} onChange={(e) => navigate(e.target.value ? `/rp/vender/${e.target.value}` : "/rp/vender")}>
              <option value="">Selecciona un evento…</option>
              {(events.data ?? []).map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.nombre} — {formatDateTime(ev.fecha_evento)}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      {!selectedId ? (
        <div className="card">
          <EmptyState icon="ticket" title="Selecciona un evento">
            Elige arriba el evento para el que vas a vender.
          </EmptyState>
        </div>
      ) : options.loading && !options.data ? (
        <Loading />
      ) : options.error ? (
        <ErrorState message={options.error} onRetry={options.reload} />
      ) : !options.data?.fase ? (
        <div className="card">
          <EmptyState icon="clock" title="Venta no disponible">
            {selectedEvent?.nombre ?? "Este evento"} no tiene una fase de venta vigente. Pide al administrador que configure una.
          </EmptyState>
        </div>
      ) : (
        <form className="card stack" onSubmit={submit} noValidate style={{ gap: 20 }}>
          <div className="row-between">
            <div>
              <div className="eyebrow">Fase vigente</div>
              <h3 style={{ marginTop: 4 }}>{options.data.fase.nombre}</h3>
            </div>
            <span className="muted" style={{ fontSize: "0.82rem" }}>
              hasta {formatDateTime(options.data.fase.fecha_fin)}
            </span>
          </div>

          {error && (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          )}

          <div className="form-grid">
            <Field label="Teléfono del cliente" hint="10 dígitos">
              {(id) => (
                <input
                  id={id}
                  className="input mono"
                  inputMode="tel"
                  autoComplete="off"
                  placeholder="55 1234 5678"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setLookupNote(null);
                    setNameLocked(false);
                  }}
                  onBlur={lookup}
                />
              )}
            </Field>
            <Field label="Nombre del cliente" hint={lookupNote?.text}>
              {(id) => <input id={id} className="input" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} readOnly={nameLocked} maxLength={120} />}
            </Field>
            <Field label="Tipo de boleto" className="span-2">
              {(id) => (
                <select id={id} className="select" value={type} onChange={(e) => setType(e.target.value)}>
                  {options.data!.tipos.map((t) => (
                    <option key={t.tipo_boleto_id} value={t.nombre}>
                      {t.nombre} — {formatMoney(t.precio)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>

          <div className="row-between" style={{ borderTop: "1px solid var(--line)", paddingTop: 20 }}>
            <div>
              <div className="stat">
                <span className="label">Total</span>
                <span className="value gold mono">{formatMoney(selectedType?.precio ?? 0)}</span>
              </div>
              {user && user.comision_porcentaje > 0 && (
                <div className="faint" style={{ fontSize: "0.8rem", marginTop: 8 }}>
                  Tu comisión: {formatMoney(commission)} ({user.comision_porcentaje}%)
                </div>
              )}
            </div>
            <button className="btn btn-primary" type="submit" disabled={!canSubmit}>
              {busy ? "Generando…" : "Generar boleto"}
            </button>
          </div>
        </form>
      )}

      {created && <TicketModal ticket={created} title="Boleto generado" onClose={() => setCreated(null)} />}
    </>
  );
}
