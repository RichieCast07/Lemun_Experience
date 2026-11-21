import jsQR from "jsqr";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Icon from "../../components/Icon";
import { Modal, PageHeader, Stat } from "../../components/ui";
import { api, ApiError } from "../../core/api";
import { formatDateTime, formatInt, formatTime } from "../../core/format";
import { errorMessage, useAsync } from "../../core/hooks";
import type { AccessSummary, Boleto, EventoItem } from "../../core/types";

type CameraState = "idle" | "starting" | "scanning" | "error";

interface Result {
  kind: "ok" | "fail";
  title: string;
  detail: string;
  ticket?: Boleto;
}

interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>>;
}
type BarcodeDetectorCtor = new (opts: { formats: string[] }) => BarcodeDetectorLike;

const SCAN_INTERVAL_MS = 350;
const DUPLICATE_COOLDOWN_MS = 4000;
const SUCCESS_AUTOCLOSE_MS = 2200;

function cameraErrorMessage(error: unknown): string {
  const name = (error as { name?: string })?.name;
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "Permiso de cámara denegado. Actívalo desde el candado del navegador y recarga.";
    case "NotReadableError":
    case "TrackStartError":
      return "La cámara está en uso por otra app o pestaña. Ciérrala e inténtalo de nuevo.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No se detectó ninguna cámara en este dispositivo.";
    case "SecurityError":
      return "El navegador bloqueó la cámara por seguridad. Usa HTTPS o localhost.";
    default:
      return "No se pudo abrir la cámara. Revisa los permisos del navegador y del sistema.";
  }
}

async function openCamera(): Promise<MediaStream> {
  const attempts: MediaStreamConstraints[] = [
    { video: { facingMode: { exact: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
    { video: { facingMode: { ideal: "environment" } }, audio: false },
    { video: true, audio: false },
  ];
  let last: unknown;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      last = err;
      // si el usuario negó el permiso no tiene caso seguir probando
      if ((err as { name?: string })?.name === "NotAllowedError") break;
    }
  }
  throw last;
}

export default function ScannerPage() {
  const events = useAsync(() => api<EventoItem[]>("/events"), []);
  const [eventId, setEventId] = useState<number | null>(null);
  const [summary, setSummary] = useState<AccessSummary | null>(null);

  const [camera, setCamera] = useState<CameraState>("idle");
  const [cameraMsg, setCameraMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [manual, setManual] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const busyRef = useRef(false);
  const pausedRef = useRef(false);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  // Evento por defecto: el primero de la lista (ya viene ordenado por fecha)
  useEffect(() => {
    const list = events.data ?? [];
    if (eventId === null && list.length > 0) {
      const now = Date.now();
      const current = list.find((e) => e.activo && new Date(e.fecha_evento).getTime() > now - 12 * 3600 * 1000) ?? list[0]!;
      setEventId(current.id);
    }
  }, [events.data, eventId]);

  const loadSummary = useCallback(async () => {
    if (eventId === null) return;
    try {
      setSummary(await api<AccessSummary>(`/tickets/access/${eventId}`));
    } catch {
      /* el resumen es informativo: no interrumpe el escaneo */
    }
  }, [eventId]);

  useEffect(() => {
    setSummary(null);
    void loadSummary();
    const id = window.setInterval(() => void loadSummary(), 15_000);
    return () => window.clearInterval(id);
  }, [loadSummary]);

  const stopCamera = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamera("idle");
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  /** Valida el boleto sin consumirlo hasta confirmar que es del evento correcto. */
  const validate = async (raw: string) => {
    const code = raw.trim().toUpperCase();
    if (!code || busyRef.current) return;
    const last = lastRef.current;
    if (last.code === code && Date.now() - last.at < DUPLICATE_COOLDOWN_MS) return;

    busyRef.current = true;
    pausedRef.current = true;
    setBusy(true);
    let outcome: Result;
    try {
      const ticket = await api<Boleto>(`/tickets/code/${encodeURIComponent(code)}`);
      if (eventId !== null && ticket.evento_id !== eventId) {
        outcome = {
          kind: "fail",
          title: "Boleto de otro evento",
          detail: `Este boleto es para «${ticket.evento_nombre}», no para el evento seleccionado.`,
          ticket,
        };
      } else {
        const used = await api<Boleto>(`/tickets/code/${encodeURIComponent(code)}/use`, { method: "PATCH" });
        outcome = { kind: "ok", title: "Acceso permitido", detail: used.cliente_nombre, ticket: used };
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const prev = (err.details as { ticket?: Boleto } | undefined)?.ticket;
        outcome = {
          kind: "fail",
          title: "Boleto ya utilizado",
          detail: prev?.usado_en ? `Ingresó el ${formatDateTime(prev.usado_en)}.` : err.message,
          ticket: prev,
        };
      } else if (err instanceof ApiError && err.status === 404) {
        outcome = { kind: "fail", title: "Boleto no válido", detail: "El código no corresponde a ningún boleto." };
      } else {
        outcome = { kind: "fail", title: "No se pudo validar", detail: errorMessage(err) };
      }
    } finally {
      lastRef.current = { code, at: Date.now() };
      busyRef.current = false;
      setBusy(false);
    }

    try {
      navigator.vibrate?.(outcome.kind === "ok" ? 80 : [120, 60, 120]);
    } catch {
      /* vibración no disponible */
    }
    setResult(outcome);
    void loadSummary();
  };

  const closeResult = useCallback(() => {
    setResult(null);
    pausedRef.current = false;
  }, []);

  // Los accesos correctos se cierran solos para no frenar la fila
  useEffect(() => {
    if (result?.kind !== "ok") return;
    const id = window.setTimeout(closeResult, SUCCESS_AUTOCLOSE_MS);
    return () => window.clearTimeout(id);
  }, [result, closeResult]);

  const validateRef = useRef(validate);
  validateRef.current = validate;

  const scanFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!video || pausedRef.current || busyRef.current || video.readyState < 2) return;
    try {
      let value: string | null = null;
      if (detectorRef.current) {
        const found = await detectorRef.current.detect(video);
        value = found[0]?.rawValue ?? null;
      } else {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d", { willReadFrequently: true });
        if (!canvas || !ctx || !video.videoWidth) return;
        // Reducir el cuadro acelera jsQR sin afectar la lectura de un QR cercano
        const scale = Math.min(1, 640 / video.videoWidth);
        const w = Math.round(video.videoWidth * scale);
        const h = Math.round(video.videoHeight * scale);
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        ctx.drawImage(video, 0, 0, w, h);
        const img = ctx.getImageData(0, 0, w, h);
        value = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" })?.data ?? null;
      }
      if (value) await validateRef.current(value);
    } catch {
      /* un cuadro ilegible no es un error: se reintenta en el siguiente */
    }
  }, []);

  const startCamera = async () => {
    if (camera === "starting" || camera === "scanning") return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera("error");
      setCameraMsg("Este navegador no permite acceder a la cámara. Usa el ingreso manual del código.");
      return;
    }
    setCamera("starting");
    setCameraMsg("");
    try {
      const stream = await openCamera();
      streamRef.current = stream;
      const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
      detectorRef.current = Detector ? new Detector({ formats: ["qr_code"] }) : null;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      pausedRef.current = false;
      setCamera("scanning");
      timerRef.current = window.setInterval(() => void scanFrame(), SCAN_INTERVAL_MS);
    } catch (err) {
      stopCamera();
      setCamera("error");
      setCameraMsg(cameraErrorMessage(err));
    }
  };

  const submitManual = (e: FormEvent) => {
    e.preventDefault();
    const code = manual;
    setManual("");
    void validate(code);
  };

  const total = summary?.total ?? 0;
  const pct = total > 0 ? Math.round(((summary?.usados ?? 0) / total) * 100) : 0;

  return (
    <>
      <PageHeader eyebrow="Operación" title="Control de acceso" sub="Escanea el QR de cada boleto para registrar la entrada." />

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="field">
          <label htmlFor="scan-event">Evento</label>
          <select id="scan-event" className="select" value={eventId ?? ""} onChange={(e) => setEventId(e.target.value ? Number(e.target.value) : null)}>
            {(events.data ?? []).length === 0 && <option value="">No hay eventos</option>}
            {(events.data ?? []).map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.nombre} — {formatDateTime(ev.fecha_evento)}
                {ev.activo ? "" : " (inactivo)"}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="scanner-layout">
        <div className="stack">
          <div className="camera-frame">
            <video ref={videoRef} playsInline muted style={{ visibility: camera === "scanning" ? "visible" : "hidden" }} />
            <canvas ref={canvasRef} style={{ display: "none" }} />
            {camera === "scanning" ? (
              <>
                <div className="reticle" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <div className="scan-line" aria-hidden="true" />
              </>
            ) : (
              <div className="camera-idle">
                <Icon name="camera" size={40} strokeWidth={1.2} />
                <p style={{ maxWidth: 280, fontSize: "0.9rem" }}>
                  {camera === "starting" ? "Abriendo cámara…" : camera === "error" ? cameraMsg : "Activa la cámara para empezar a escanear."}
                </p>
              </div>
            )}
          </div>

          <div className="row">
            {camera === "scanning" ? (
              <button className="btn btn-ghost" onClick={stopCamera}>
                Detener cámara
              </button>
            ) : (
              <button className="btn btn-primary" onClick={startCamera} disabled={camera === "starting" || eventId === null}>
                <Icon name="scan" size={16} /> {camera === "error" ? "Reintentar cámara" : "Iniciar cámara"}
              </button>
            )}
            {busy && <span className="muted">Validando…</span>}
          </div>

          <form className="card" onSubmit={submitManual}>
            <div className="field">
              <label htmlFor="manual-code">Código manual</label>
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <input id="manual-code" className="input mono" placeholder="EVT-XXXXXXXX-XXXXXXXXXX" value={manual} onChange={(e) => setManual(e.target.value)} autoCapitalize="characters" autoComplete="off" spellCheck={false} />
                <button className="btn btn-ghost" type="submit" disabled={!manual.trim() || busy || eventId === null}>
                  Validar
                </button>
              </div>
              <span className="hint">Úsalo si el QR no se puede leer.</span>
            </div>
          </form>
        </div>

        <div className="stack">
          <div className="grid grid-2">
            <Stat icon="check" label="Ingresaron" value={formatInt(summary?.usados ?? 0)} gold />
            <Stat icon="clock" label="Pendientes" value={formatInt(summary?.pendientes ?? 0)} foot={`${formatInt(total)} boletos en total`} />
          </div>
          <div className="card">
            <div className="row-between faint" style={{ fontSize: "0.78rem", marginBottom: 10 }}>
              <span>Asistencia</span>
              <span>{pct}%</span>
            </div>
            <div className="progress">
              <span style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="card">
            <div className="eyebrow" style={{ marginBottom: 12 }}>
              Últimos accesos
            </div>
            {(summary?.ultimos ?? []).length === 0 ? (
              <p className="muted" style={{ fontSize: "0.88rem" }}>
                Aún no se registra ningún ingreso.
              </p>
            ) : (
              <div>
                {summary!.ultimos.map((u) => (
                  <div key={u.codigo} className="row-between" style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                    <div>
                      <div style={{ color: "var(--text)" }}>{u.cliente_nombre}</div>
                      <div className="faint" style={{ fontSize: "0.76rem" }}>
                        {u.tipo_boleto}
                      </div>
                    </div>
                    <span className="muted mono" style={{ fontSize: "0.82rem" }}>
                      {formatTime(u.usado_en)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {result && (
        <Modal
          title={result.title}
          eyebrow={result.kind === "ok" ? "Validación" : "Atención"}
          size="sm"
          onClose={closeResult}
          footer={
            <button className="btn btn-primary" onClick={closeResult}>
              {result.kind === "ok" ? "Siguiente" : "Entendido"}
            </button>
          }
        >
          <div className="result-hero">
            <div className={`result-icon ${result.kind}`}>
              <Icon name={result.kind === "ok" ? "check" : "x"} size={32} strokeWidth={1.8} />
            </div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem", letterSpacing: "0.04em" }}>{result.kind === "ok" ? result.detail : result.title}</div>
            {result.kind === "fail" && <p className="muted">{result.detail}</p>}
          </div>
          {result.ticket && (
            <dl className="kv" style={{ marginTop: 18 }}>
              {result.kind === "fail" && result.ticket.cliente_nombre && (
                <>
                  <dt>Cliente</dt>
                  <dd>{result.ticket.cliente_nombre}</dd>
                </>
              )}
              <dt>Evento</dt>
              <dd>{result.ticket.evento_nombre}</dd>
              <dt>Tipo</dt>
              <dd>{result.ticket.tipo_boleto}</dd>
              <dt>Código</dt>
              <dd className="mono" style={{ fontSize: "0.82rem" }}>
                {result.ticket.codigo}
              </dd>
            </dl>
          )}
        </Modal>
      )}
    </>
  );
}
