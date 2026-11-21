import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import Icon from "../../components/Icon";
import { Badge, ConfirmModal, EmptyState, ErrorState, Field, Loading, Modal, PageHeader, SectionTitle, Stat, useToast } from "../../components/ui";
import { api } from "../../core/api";
import { formatDateTime, formatInt, formatLongDate, formatMoney, formatTime, fromDatetimeLocal, toDatetimeLocal } from "../../core/format";
import { errorMessage, useAsync } from "../../core/hooks";
import type { EventoItem, Fase, PrecioTipo, TipoBoleto } from "../../core/types";
import EventForm from "./EventForm";

export default function EventDetailPage() {
  const { id } = useParams();
  const eventId = Number(id);
  const toast = useToast();

  const event = useAsync(() => api<EventoItem>(`/events/${eventId}`), [eventId]);
  const types = useAsync(() => api<TipoBoleto[]>(`/events/${eventId}/ticket-types`), [eventId]);
  const phases = useAsync(() => api<Fase[]>(`/events/${eventId}/phases`), [eventId]);

  const [editing, setEditing] = useState(false);
  const [phaseForm, setPhaseForm] = useState<{ phase?: Fase } | null>(null);
  const [typeForm, setTypeForm] = useState(false);
  const [deletingPhase, setDeletingPhase] = useState<Fase | null>(null);
  const [busy, setBusy] = useState(false);

  if (event.loading && !event.data) return <Loading />;
  if (event.error || !event.data) return <ErrorState message={event.error ?? "Evento no encontrado"} onRetry={event.reload} />;
  const ev = event.data;

  const reloadAll = () => {
    event.reload();
    phases.reload();
    types.reload();
  };

  const toggleEvent = async () => {
    try {
      await api(`/events/${ev.id}/toggle`, { method: "PATCH" });
      toast(ev.activo ? "Evento desactivado" : "Evento activado");
      event.reload();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const togglePhase = async (phase: Fase) => {
    try {
      await api(`/events/${ev.id}/phases/${phase.id}/toggle`, { method: "PATCH" });
      toast(phase.activa ? "Fase desactivada" : "Fase activada");
      reloadAll();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const deletePhase = async () => {
    if (!deletingPhase) return;
    setBusy(true);
    try {
      await api(`/events/${ev.id}/phases/${deletingPhase.id}`, { method: "DELETE" });
      toast("Fase eliminada");
      setDeletingPhase(null);
      reloadAll();
    } catch (err) {
      toast(errorMessage(err), "error");
      setDeletingPhase(null);
    } finally {
      setBusy(false);
    }
  };

  const toggleType = async (t: TipoBoleto) => {
    try {
      await api(`/events/${ev.id}/ticket-types/${t.id}`, { method: "PUT", body: { activo: !t.activo } });
      reloadAll();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <>
      <Link to="/admin/eventos" className="btn btn-quiet btn-sm" style={{ marginBottom: 18, marginLeft: -12 }}>
        <Icon name="back" size={16} /> Eventos
      </Link>

      <PageHeader
        eyebrow={ev.codigo_evento}
        title={ev.nombre}
        sub={
          <>
            {formatLongDate(ev.fecha_evento)} · {formatTime(ev.fecha_evento)} h — {ev.lugar}
          </>
        }
        actions={
          <>
            <Badge tone={ev.activo ? "success" : "neutral"}>{ev.activo ? "Activo" : "Inactivo"}</Badge>
            <button className="btn btn-ghost" onClick={() => setEditing(true)}>
              <Icon name="edit" size={16} /> Editar
            </button>
            <button className="btn btn-ghost" onClick={toggleEvent}>
              <Icon name="power" size={16} /> {ev.activo ? "Desactivar" : "Activar"}
            </button>
          </>
        }
      />

      <div className="grid grid-3">
        <Stat icon="ticket" label="Boletos vendidos" value={formatInt(ev.boletos_vendidos)} gold />
        <Stat icon="scan" label="Han ingresado" value={formatInt(ev.boletos_usados)} foot={`${formatInt(ev.boletos_vendidos - ev.boletos_usados)} pendientes`} />
        <Stat icon="calendar" label="Fase vigente" value={<span style={{ fontSize: "1.25rem" }}>{ev.fase_vigente?.nombre ?? "—"}</span>} foot={ev.fase_vigente ? `Hasta ${formatDateTime(ev.fase_vigente.fecha_fin)}` : "Los RPs no pueden vender hasta que haya una fase vigente"} />
      </div>

      {ev.descripcion && (
        <p className="muted" style={{ marginTop: 20, maxWidth: "70ch" }}>
          {ev.descripcion}
        </p>
      )}

      <SectionTitle
        actions={
          <button className="btn btn-ghost btn-sm" onClick={() => setTypeForm(true)}>
            <Icon name="plus" size={15} /> Tipo
          </button>
        }
      >
        Tipos de boleto
      </SectionTitle>
      <div className="chips">
        {(types.data ?? []).map((t) => (
          <span key={t.id} className={`chip${t.activo ? "" : " is-off"}`}>
            {t.nombre}
            {!t.activo && <span className="chip-note">Desactivado</span>}
            <button
              className={t.activo ? undefined : "chip-activate"}
              onClick={() => toggleType(t)}
              aria-label={t.activo ? `Desactivar ${t.nombre}` : `Activar ${t.nombre}`}
              title={t.activo ? "Desactivar este tipo (no se borra)" : "Activar este tipo"}
            >
              {t.activo ? <Icon name="x" size={13} /> : <><Icon name="check" size={13} /> Activar</>}
            </button>
          </span>
        ))}
      </div>

      <SectionTitle
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setPhaseForm({})}>
            <Icon name="plus" size={15} /> Nueva fase
          </button>
        }
      >
        Fases de venta
      </SectionTitle>

      {phases.loading && !phases.data ? (
        <Loading />
      ) : phases.error ? (
        <ErrorState message={phases.error} onRetry={phases.reload} />
      ) : (phases.data ?? []).length === 0 ? (
        <div className="card">
          <EmptyState icon="clock" title="Sin fases de venta" action={<button className="btn btn-primary" onClick={() => setPhaseForm({})}>Crear fase</button>}>
            Las fases (preventa, venta general…) definen el precio y el periodo en que los RPs pueden vender.
          </EmptyState>
        </div>
      ) : (
        <div className="stack">
          {(phases.data ?? []).map((phase) => (
            <PhaseCard
              key={phase.id}
              eventId={ev.id}
              phase={phase}
              onEdit={() => setPhaseForm({ phase })}
              onToggle={() => togglePhase(phase)}
              onDelete={() => setDeletingPhase(phase)}
              onPricesChanged={reloadAll}
            />
          ))}
        </div>
      )}

      {editing && (
        <EventForm
          event={ev}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            toast("Evento actualizado");
            event.reload();
          }}
        />
      )}
      {phaseForm && (
        <PhaseForm
          eventId={ev.id}
          phase={phaseForm.phase}
          onClose={() => setPhaseForm(null)}
          onSaved={() => {
            setPhaseForm(null);
            toast(phaseForm.phase ? "Fase actualizada" : "Fase creada");
            reloadAll();
          }}
        />
      )}
      {typeForm && (
        <TypeForm
          eventId={ev.id}
          onClose={() => setTypeForm(false)}
          onSaved={() => {
            setTypeForm(false);
            toast("Tipo de boleto creado");
            reloadAll();
          }}
        />
      )}
      {deletingPhase && (
        <ConfirmModal
          title="Eliminar fase"
          danger
          busy={busy}
          confirmLabel="Eliminar"
          message={`Se eliminará la fase "${deletingPhase.nombre}" y sus precios. Esta acción no se puede deshacer.`}
          onConfirm={deletePhase}
          onClose={() => setDeletingPhase(null)}
        />
      )}
    </>
  );
}

/* ── Tarjeta de fase ───────────────────────────────────── */
function phaseStatus(phase: Fase): { label: string; tone: "success" | "gold" | "neutral" } {
  if (!phase.activa) return { label: "Inactiva", tone: "neutral" };
  if (phase.vigente) return { label: "Vigente", tone: "success" };
  if (new Date(phase.fecha_inicio) > new Date()) return { label: "Programada", tone: "gold" };
  return { label: "Finalizada", tone: "neutral" };
}

function PhaseCard({
  eventId,
  phase,
  onEdit,
  onToggle,
  onDelete,
  onPricesChanged,
}: {
  eventId: number;
  phase: Fase;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onPricesChanged: () => void;
}) {
  const status = phaseStatus(phase);
  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="row-between" style={{ padding: "20px 22px", borderBottom: "1px solid var(--line)", alignItems: "flex-start" }}>
        <div>
          <div className="row" style={{ gap: 10 }}>
            <h3 style={{ fontSize: "1.05rem" }}>{phase.nombre}</h3>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <div className="muted" style={{ fontSize: "0.84rem", marginTop: 6 }}>
            {formatDateTime(phase.fecha_inicio)} → {formatDateTime(phase.fecha_fin)} · {formatInt(phase.boletos_vendidos ?? 0)} vendidos
          </div>
        </div>
        <div className="row" style={{ gap: 4 }}>
          <button className="btn btn-quiet btn-icon btn-sm" onClick={onEdit} aria-label="Editar fase" title="Editar">
            <Icon name="edit" size={16} />
          </button>
          <button className="btn btn-quiet btn-icon btn-sm" onClick={onToggle} aria-label={phase.activa ? "Desactivar fase" : "Activar fase"} title={phase.activa ? "Desactivar" : "Activar"}>
            <Icon name="power" size={16} />
          </button>
          <button className="btn btn-quiet btn-icon btn-sm" onClick={onDelete} aria-label="Eliminar fase" title="Eliminar">
            <Icon name="trash" size={16} />
          </button>
        </div>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Tipo de boleto</th>
              <th style={{ width: 200 }}>Precio</th>
              <th className="actions" style={{ width: 160 }} />
            </tr>
          </thead>
          <tbody>
            {phase.precios.map((p) => (
              <PriceRow key={p.tipo_boleto_id} eventId={eventId} phaseId={phase.id} basePrice={phase.precio} price={p} onChanged={onPricesChanged} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PriceRow({ eventId, phaseId, basePrice, price, onChanged }: { eventId: number; phaseId: number; basePrice: number; price: PrecioTipo; onChanged: () => void }) {
  const toast = useToast();
  const [value, setValue] = useState(String(price.precio));
  const [busy, setBusy] = useState(false);
  const dirty = Number(value) !== price.precio;
  const valid = value.trim() !== "" && Number(value) >= 0 && Number.isFinite(Number(value));

  const save = async () => {
    setBusy(true);
    try {
      await api(`/events/${eventId}/phases/${phaseId}/prices/${price.tipo_boleto_id}`, { method: "PUT", body: { precio: Number(value) } });
      toast("Precio actualizado");
      onChanged();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    try {
      await api(`/events/${eventId}/phases/${phaseId}/prices/${price.tipo_boleto_id}`, { method: "DELETE" });
      setValue(String(basePrice));
      toast("Precio restablecido al de la fase");
      onChanged();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr className={price.activo ? "" : "is-off"}>
      <td>
        <span className="cell-title">{price.nombre}</span>
        {!price.activo && <span className="cell-sub">Tipo desactivado</span>}
        {price.activo && price.personalizado && <span className="cell-sub">Precio personalizado · base {formatMoney(basePrice)}</span>}
      </td>
      <td>
        <input
          className="input mono"
          style={{ height: 36 }}
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && dirty && valid && void save()}
          aria-label={`Precio de ${price.nombre}`}
        />
      </td>
      <td className="actions">
        {dirty && (
          <button className="btn btn-primary btn-sm" onClick={save} disabled={busy || !valid}>
            Guardar
          </button>
        )}
        {!dirty && price.personalizado && (
          <button className="btn btn-quiet btn-sm" onClick={reset} disabled={busy}>
            Restablecer
          </button>
        )}
      </td>
    </tr>
  );
}

/* ── Formularios ───────────────────────────────────────── */
function PhaseForm({ eventId, phase, onClose, onSaved }: { eventId: number; phase?: Fase; onClose: () => void; onSaved: () => void }) {
  const [nombre, setNombre] = useState(phase?.nombre ?? "");
  const [precio, setPrecio] = useState(phase ? String(phase.precio) : "");
  const [inicio, setInicio] = useState(toDatetimeLocal(phase?.fecha_inicio ?? new Date()));
  const [fin, setFin] = useState(toDatetimeLocal(phase?.fecha_fin));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const body = { nombre, precio: Number(precio), fecha_inicio: fromDatetimeLocal(inicio), fecha_fin: fromDatetimeLocal(fin) };
      if (phase) await api(`/events/${eventId}/phases/${phase.id}`, { method: "PUT", body });
      else await api(`/events/${eventId}/phases`, { method: "POST", body });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal
      title={phase ? "Editar fase" : "Nueva fase"}
      eyebrow="Fase de venta"
      onClose={onClose}
      dismissable={!busy}
      footer={
        <>
          <button className="btn btn-quiet" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" form="phase-form" className="btn btn-primary" disabled={busy || !nombre || precio === "" || !inicio || !fin}>
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
    >
      <form id="phase-form" className="form-grid" onSubmit={submit}>
        {error && (
          <div className="alert alert-error span-2" role="alert">
            {error}
          </div>
        )}
        <Field label="Nombre" hint="Ej. Preventa, Venta general, Última hora">
          {(id) => <input id={id} className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} />}
        </Field>
        <Field label="Precio base (MXN)" hint="Aplica a los tipos sin precio propio">
          {(id) => <input id={id} className="input" type="number" min={0} step="0.01" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} />}
        </Field>
        <Field label="Inicio">
          {(id) => <input id={id} className="input" type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} />}
        </Field>
        <Field label="Fin">
          {(id) => <input id={id} className="input" type="datetime-local" value={fin} onChange={(e) => setFin(e.target.value)} />}
        </Field>
      </form>
    </Modal>
  );
}

function TypeForm({ eventId, onClose, onSaved }: { eventId: number; onClose: () => void; onSaved: () => void }) {
  const [nombre, setNombre] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api(`/events/${eventId}/ticket-types`, { method: "POST", body: { nombre } });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Nuevo tipo de boleto"
      eyebrow="Boletos"
      size="sm"
      onClose={onClose}
      dismissable={!busy}
      footer={
        <>
          <button className="btn btn-quiet" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" form="type-form" className="btn btn-primary" disabled={busy || !nombre.trim()}>
            {busy ? "Guardando…" : "Crear"}
          </button>
        </>
      }
    >
      <form id="type-form" className="stack" onSubmit={submit}>
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
        <Field label="Nombre" hint="Ej. VIP, Mesa, Cortesía. Se guarda en mayúsculas.">
          {(id) => <input id={id} className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={50} />}
        </Field>
        <p className="faint" style={{ fontSize: "0.82rem" }}>
          Nuevo tipo usa el precio base de cada fase hasta que le asignes uno propio.
        </p>
      </form>
    </Modal>
  );
}
