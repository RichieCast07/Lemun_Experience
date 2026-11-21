import { useState, type FormEvent } from "react";
import { Field, Modal } from "../../components/ui";
import { api } from "../../core/api";
import { fromDatetimeLocal, toDatetimeLocal } from "../../core/format";
import { errorMessage } from "../../core/hooks";
import type { EventoItem } from "../../core/types";

/** Crear / editar evento. */
export default function EventForm({
  event,
  onClose,
  onSaved,
}: {
  event?: EventoItem;
  onClose: () => void;
  onSaved: (saved: EventoItem) => void;
}) {
  const [nombre, setNombre] = useState(event?.nombre ?? "");
  const [fecha, setFecha] = useState(toDatetimeLocal(event?.fecha_evento));
  const [lugar, setLugar] = useState(event?.lugar ?? "");
  const [mapsUrl, setMapsUrl] = useState(event?.maps_url ?? "");
  const [descripcion, setDescripcion] = useState(event?.descripcion ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const body = {
        nombre,
        fecha_evento: fecha ? fromDatetimeLocal(fecha) : "",
        lugar,
        maps_url: mapsUrl.trim(),
        descripcion: descripcion.trim() || null,
      };
      const saved = event
        ? await api<EventoItem>(`/events/${event.id}`, { method: "PUT", body })
        : await api<EventoItem>("/events", { method: "POST", body });
      onSaved(saved);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal
      title={event ? "Editar evento" : "Nuevo evento"}
      eyebrow="Evento"
      onClose={onClose}
      dismissable={!busy}
      footer={
        <>
          <button type="button" className="btn btn-quiet" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" form="event-form" className="btn btn-primary" disabled={busy || !nombre || !fecha || !lugar}>
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
    >
      <form id="event-form" className="form-grid" onSubmit={submit}>
        {error && (
          <div className="alert alert-error span-2" role="alert">
            {error}
          </div>
        )}
        <Field label="Nombre" className="span-2">
          {(id) => <input id={id} className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} />}
        </Field>
        <Field label="Fecha y hora">
          {(id) => <input id={id} className="input" type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} />}
        </Field>
        <Field label="Lugar">
          {(id) => <input id={id} className="input" value={lugar} onChange={(e) => setLugar(e.target.value)} maxLength={200} />}
        </Field>
        <Field label="Enlace de mapa" hint="Opcional · https://maps.google.com/…" className="span-2">
          {(id) => <input id={id} className="input" type="url" value={mapsUrl} onChange={(e) => setMapsUrl(e.target.value)} placeholder="https://" />}
        </Field>
        <Field label="Descripción" hint="Opcional" className="span-2">
          {(id) => <textarea id={id} className="textarea" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={2000} />}
        </Field>
      </form>
    </Modal>
  );
}
