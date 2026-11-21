interface Props {
  size?: "sm" | "md" | "lg";
  tagline?: boolean;
  /** mostrar solo la marca (faro) sin texto */
  markOnly?: boolean;
}

/** Faro de línea fina: el emblema de la marca (aparece sobre la "N" del logotipo). */
export function LighthouseMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 48" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 42 12 19h8l2 23z" />
      <path d="M8.5 19h15" />
      <rect x="13" y="12" width="6" height="7" />
      <path d="m12 12 4-5 4 5z" />
      <path d="M16 7V4" />
      <path d="M10.6 28h10.8" />
      <path d="M10.1 35h11.8" />
      <path d="M7 42h18" />
      <path d="M9 14H5" opacity=".55" />
      <path d="M23 14h4" opacity=".55" />
      <path d="m9.5 9.5-3-2" opacity=".4" />
      <path d="m22.5 9.5 3-2" opacity=".4" />
    </svg>
  );
}

export default function Logo({ size = "md", tagline = false, markOnly = false }: Props) {
  return (
    <span className={`logo logo-${size}`}>
      <LighthouseMark className="logo-mark" />
      {!markOnly && (
        <span className="logo-text">
          <span className="logo-word">LUMEN</span>
          {tagline && <span className="logo-tag">— Light refined</span>}
        </span>
      )}
    </span>
  );
}
