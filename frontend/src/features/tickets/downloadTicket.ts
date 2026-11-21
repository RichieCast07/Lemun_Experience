import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";
import { formatLongDate, formatTime } from "../../core/format";
import type { EstadoBoleto } from "../../core/types";

export interface TicketImageData {
  eventName: string;
  eventDate: string;
  place: string;
  clientName: string;
  type: string;
  code: string;
  status: EstadoBoleto;
  rpName?: string | null;
}

const FONT = '"Inter Variable", Inter, "Segoe UI", system-ui, sans-serif';
const W = 720;
const PAD = 52;
const SCALE = 2;

function loadSvg(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo generar el código QR."));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const test = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Dibuja el boleto en un canvas (blanco y negro, igual que la app) y lo devuelve como PNG. */
export async function renderTicketPng(t: TicketImageData): Promise<Blob> {
  try {
    await Promise.all([document.fonts.load(`600 40px ${FONT}`), document.fonts.load(`400 16px ${FONT}`)]);
  } catch {
    /* si la fuente no carga se usa la de respaldo */
  }

  let qrSvg = renderToStaticMarkup(
    createElement(QRCodeSVG, { value: t.code, size: 360, level: "M", bgColor: "#ffffff", fgColor: "#0b0b0c", marginSize: 0 })
  );
  if (!qrSvg.includes("xmlns=")) qrSvg = qrSvg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  const qr = await loadSvg(qrSvg);
  // Foto de fondo del boleto; si no carga, el boleto sale en negro liso.
  const bg = await new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = "/ticket-bg.jpg";
  });

  const used = t.status === "USADO";
  const measure = document.createElement("canvas").getContext("2d")!;
  const textW = W - PAD * 2;

  measure.font = `600 44px ${FONT}`;
  const titleLines = wrap(measure, t.eventName, textW);
  measure.font = `400 20px ${FONT}`;
  const placeLines = wrap(measure, t.place, textW);
  measure.font = `500 26px ${FONT}`;
  const nameLines = wrap(measure, t.clientName, textW - 190);

  const HERO = 250; // espacio superior donde se luce la foto
  const topH = HERO + 52 + 18 + 22 + titleLines.length * 52 + 14 + 28 + placeLines.length * 28 + 44;
  const QR = 360;
  const bottomH = 40 + QR + 20 + 34 + 34 + 28 + nameLines.length * 34 + (t.rpName ? 76 : 0) + 80;
  const H = PAD / 2 + topH + bottomH;

  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = "alphabetic";

  // Fondo del archivo y tarjeta
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  const cx = 24;
  const cy = 24;
  const cw = W - 48;
  const ch = H - 48;
  roundRect(ctx, cx, cy, cw, ch, 28);
  ctx.fillStyle = "#0b0b0c";
  ctx.fill();

  // Foto de fondo (cubre la tarjeta, anclada arriba) con degradado oscuro para leer el texto
  ctx.save();
  roundRect(ctx, cx, cy, cw, ch, 28);
  ctx.clip();
  // La foto ocupa la parte superior (hasta la línea de corte) y se funde con el negro
  const photoH = topH + 14;
  if (bg) {
    const s = Math.max(cw / bg.width, photoH / bg.height);
    const iw = bg.width * s;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx, cy, cw, photoH);
    ctx.clip();
    ctx.drawImage(bg, cx + (cw - iw) / 2, cy, iw, bg.height * s);
    ctx.restore();
  }
  const shade = ctx.createLinearGradient(0, cy, 0, cy + photoH);
  shade.addColorStop(0, "rgba(11,11,12,0.04)");
  shade.addColorStop(0.42, "rgba(11,11,12,0.12)");
  shade.addColorStop(0.72, "rgba(11,11,12,0.82)");
  shade.addColorStop(1, "rgba(11,11,12,1)");
  ctx.fillStyle = shade;
  ctx.fillRect(cx, cy, cw, photoH);
  ctx.restore();

  // Parte superior
  let y = cy + 56 + HERO;
  const x = PAD;
  ctx.fillStyle = "#d4d4d8";
  ctx.font = `500 15px ${FONT}`;
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "3px";
  ctx.fillText(`BOLETO · ${t.type.toUpperCase()}`, x, y);
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "0px";

  y += 22 + 38;
  ctx.fillStyle = "#ffffff";
  ctx.font = `600 44px ${FONT}`;
  for (const line of titleLines) {
    ctx.fillText(line, x, y);
    y += 52;
  }

  y += 4;
  ctx.fillStyle = "#ececef";
  ctx.font = `400 20px ${FONT}`;
  ctx.fillText(`${formatLongDate(t.eventDate)} · ${formatTime(t.eventDate)} h`, x, y);
  y += 30;
  ctx.fillStyle = "#c4c4c8";
  for (const line of placeLines) {
    ctx.fillText(line, x, y);
    y += 28;
  }

  // Línea de corte con muescas
  const tearY = cy + topH - 10 + PAD / 2 - 12;
  ctx.save();
  ctx.setLineDash([8, 8]);
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx + 34, tearY);
  ctx.lineTo(cx + cw - 34, tearY);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = "#ffffff";
  for (const nx of [cx, cx + cw]) {
    ctx.beginPath();
    ctx.arc(nx, tearY, 17, 0, Math.PI * 2);
    ctx.fill();
  }

  // Panel blanco con el QR
  const panel = QR + 44;
  const px = (W - panel) / 2;
  const py = tearY + 34;
  roundRect(ctx, px, py, panel, panel, 22);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.globalAlpha = used ? 0.18 : 1;
  ctx.drawImage(qr, px + 22, py + 22, QR, QR);
  ctx.globalAlpha = 1;
  if (used) {
    ctx.save();
    ctx.translate(W / 2, py + panel / 2);
    ctx.rotate(-Math.PI / 10);
    ctx.fillStyle = "#0b0b0c";
    ctx.font = `700 54px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText("UTILIZADO", 0, 18);
    ctx.restore();
  }

  // Código
  y = py + panel + 38;
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = `500 22px ui-monospace, "Cascadia Mono", Consolas, monospace`;
  ctx.fillText(t.code, W / 2, y);
  ctx.textAlign = "left";

  // Datos del titular
  y += 44;
  ctx.fillStyle = "#a3a3a8";
  ctx.font = `500 13px ${FONT}`;
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "2.5px";
  ctx.fillText("A NOMBRE DE", x, y);
  ctx.textAlign = "right";
  ctx.fillText("ESTADO", W - PAD, y);
  ctx.textAlign = "left";
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "0px";

  y += 32;
  ctx.fillStyle = "#ffffff";
  ctx.font = `500 26px ${FONT}`;
  for (const line of nameLines) {
    ctx.fillText(line, x, y);
    y += 34;
  }

  // Insignia de estado
  const label = used ? "Utilizado" : "Válido";
  ctx.font = `600 16px ${FONT}`;
  const bw = ctx.measureText(label).width + 28;
  const bx = W - PAD - bw;
  const by = y - nameLines.length * 34 - 22;
  roundRect(ctx, bx, by, bw, 30, 15);
  ctx.fillStyle = used ? "rgba(255,255,255,0.14)" : "#ffffff";
  ctx.fill();
  ctx.fillStyle = used ? "#ffffff" : "#0b0b0c";
  ctx.fillText(label, bx + 14, by + 21);

  // RP que hizo la venta
  if (t.rpName) {
    y += 16;
    ctx.fillStyle = "#a3a3a8";
    ctx.font = `500 13px ${FONT}`;
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "2.5px";
    ctx.fillText("VENDIDO POR (RP)", x, y);
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "0px";
    ctx.fillStyle = "#ffffff";
    ctx.font = `500 22px ${FONT}`;
    ctx.fillText(t.rpName, x, y + 30);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo crear la imagen."))), "image/png");
  });
}

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

/** Genera el PNG y dispara la descarga en el navegador. */
export async function downloadTicket(t: TicketImageData): Promise<void> {
  const blob = await renderTicketPng(t);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `boleto-${slug(t.eventName) || "lumen"}-${slug(t.clientName) || t.code}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
