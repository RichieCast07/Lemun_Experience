import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Icon, { type IconName } from "./Icon";

/* ── Cabecera de página ─────────────────────────────────── */
export function PageHeader({
  eyebrow,
  title,
  sub,
  actions,
}: {
  eyebrow?: string;
  title: string;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header hero on-ink">
      <div className="hero-text">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

export function SectionTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="section-title">
      <h2>{children}</h2>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

/* ── Stat ───────────────────────────────────────────────── */
export function Stat({ label, value, foot, gold, icon }: { label: string; value: ReactNode; foot?: ReactNode; gold?: boolean; icon?: IconName }) {
  return (
    <div className={`card stat${gold ? " on-ink" : ""}`}>
      <div className="stat-top">
        <span className="label">{label}</span>
        {icon && (
          <span className="stat-icon" aria-hidden="true">
            <Icon name={icon} size={17} />
          </span>
        )}
      </div>
      <span className="value mono">{value}</span>
      {foot && <span className="foot">{foot}</span>}
    </div>
  );
}

/* ── Badge ──────────────────────────────────────────────── */
export function Badge({ tone = "neutral", children, plain }: { tone?: "neutral" | "gold" | "success" | "danger"; children: ReactNode; plain?: boolean }) {
  const toneClass = tone === "neutral" ? "" : ` badge-${tone}`;
  return <span className={`badge${toneClass}${plain ? " badge-plain" : ""}`}>{children}</span>;
}

/* ── Estados ────────────────────────────────────────────── */
export function Loading({ label = "Cargando…" }: { label?: string }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <div className="spinner" />
      <p>{label}</p>
    </div>
  );
}

export function EmptyState({ icon = "sparkle", title, children, action }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="state">
      <Icon name={icon} size={34} className="state-icon" strokeWidth={1.2} />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state">
      <Icon name="alert" size={34} className="state-icon" strokeWidth={1.2} />
      <h3>No se pudo cargar</h3>
      <p>{message}</p>
      {onRetry && (
        <button className="btn btn-ghost btn-sm" onClick={onRetry}>
          Reintentar
        </button>
      )}
    </div>
  );
}

/* ── Campo de formulario ────────────────────────────────── */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  /** recibe el id generado para enlazar label ↔ control */
  children: (id: string) => ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={`field${className ? ` ${className}` : ""}`}>
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {error ? <span className="error-text">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

/* ── Modal ──────────────────────────────────────────────── */
export function Modal({
  title,
  eyebrow,
  onClose,
  children,
  footer,
  size = "md",
  dismissable = true,
}: {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  dismissable?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissable) onClose();
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    // enfocar el primer control (o el diálogo)
    const firstField = dialogRef.current?.querySelector<HTMLElement>("input, select, textarea");
    (firstField ?? dialogRef.current)?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previouslyFocused?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && dismissable && onClose()}>
      <div
        ref={dialogRef}
        className={`modal${size === "sm" ? " modal-sm" : size === "lg" ? " modal-lg" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="modal-head">
          <div>
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            <h2 id={titleId}>{title}</h2>
          </div>
          <button className="btn btn-quiet btn-icon btn-sm" onClick={onClose} aria-label="Cerrar">
            <Icon name="x" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmModal({
  title,
  message,
  confirmLabel = "Confirmar",
  danger,
  busy,
  onConfirm,
  onClose,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-quiet" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className={`btn ${danger ? "btn-danger" : "btn-primary"}`} onClick={onConfirm} disabled={busy}>
            {busy ? "Procesando…" : confirmLabel}
          </button>
        </>
      }
    >
      <p className="muted">{message}</p>
    </Modal>
  );
}

/* ── Toasts ─────────────────────────────────────────────── */
interface Toast {
  id: number;
  tone: "success" | "error" | "info";
  text: string;
}
const ToastContext = createContext<{ push: (text: string, tone?: Toast["tone"]) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const push = useCallback((text: string, tone: Toast["tone"] = "success") => {
    const id = ++counter.current;
    setToasts((list) => [...list, { id, tone, text }]);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), tone === "error" ? 6000 : 3500);
  }, []);

  const value = useMemo(() => ({ push }), [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return ctx.push;
}

/* ── Gráfico de barras minimalista ──────────────────────── */
export function BarChart({ points }: { points: { label: string; value: number; tip: string }[] }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  return (
    <div>
      <div className="bars" role="img" aria-label="Ventas por día">
        {points.map((p) => (
          <div key={p.label} className={`bar${p.value === 0 ? " is-zero" : ""}`} data-tip={p.tip}>
            <span style={{ height: `${Math.max((p.value / max) * 100, p.value === 0 ? 1.5 : 4)}%` }} />
          </div>
        ))}
      </div>
      <div className="bars-axis">
        <span>{points[0]?.label}</span>
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </div>
  );
}
