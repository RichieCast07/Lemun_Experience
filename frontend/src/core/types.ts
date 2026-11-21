export type Rol = "ADMIN" | "RP" | "MANAGER";
export type EstadoBoleto = "ACTIVO" | "USADO";

export interface User {
  id: number;
  nombre_completo: string;
  telefono: string;
  username: string;
  rol: Rol;
  comision_porcentaje: number;
  activo: boolean;
  creado_en: string;
}

export interface FaseResumen {
  id: number;
  nombre: string;
  precio: number;
  fecha_inicio: string;
  fecha_fin: string;
}

export interface EventoItem {
  id: number;
  nombre: string;
  codigo_evento: string;
  descripcion: string | null;
  fecha_evento: string;
  lugar: string;
  maps_url: string | null;
  activo: boolean;
  creado_en: string;
  boletos_vendidos: number;
  boletos_usados: number;
  fase_vigente: FaseResumen | null;
}

export interface TipoBoleto {
  id: number;
  evento_id: number;
  nombre: string;
  activo: boolean;
}

export interface PrecioTipo {
  tipo_boleto_id: number;
  nombre: string;
  activo: boolean;
  precio: number;
  personalizado: boolean;
}

export interface Fase {
  id: number;
  evento_id: number;
  nombre: string;
  precio: number;
  fecha_inicio: string;
  fecha_fin: string;
  activa: boolean;
  vigente?: boolean;
  boletos_vendidos?: number;
  precios: PrecioTipo[];
}

export interface SaleOptions {
  fase: FaseResumen | null;
  tipos: PrecioTipo[];
}

export interface Boleto {
  id: number;
  codigo: string;
  token_publico: string;
  cliente_id: number;
  cliente_nombre: string;
  cliente_telefono: string;
  rp_id: number;
  rp_nombre: string;
  evento_id: number;
  evento_nombre: string;
  codigo_evento: string;
  fecha_evento: string;
  evento_lugar: string;
  maps_url: string | null;
  fase_id: number;
  fase_nombre: string;
  tipo_boleto: string;
  precio: number;
  comision_rp: number;
  estado: EstadoBoleto;
  vendido_en: string;
  usado_en: string | null;
  usado_por_nombre: string | null;
  url_publica: string;
}

export interface PublicBoleto {
  codigo: string;
  cliente_nombre: string;
  evento_nombre: string;
  fecha_evento: string;
  evento_lugar: string;
  maps_url: string | null;
  tipo_boleto: string;
  estado: EstadoBoleto;
}

export interface Cliente {
  id: number;
  nombre_completo: string;
  telefono: string;
  creado_en: string;
  boletos?: number;
  total_gastado?: number;
  ultima_compra?: string | null;
}

export interface ClienteBoleto {
  codigo: string;
  evento_nombre: string;
  tipo_boleto: string;
  precio: number;
  estado: EstadoBoleto;
  vendido_en: string;
  rp_nombre: string;
}

export interface ClienteDetalle {
  id: number;
  nombre_completo: string;
  telefono: string;
  creado_en: string;
  boletos: ClienteBoleto[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
}

export interface Summary {
  boletos: number;
  ingresos: number;
  comisiones: number;
  usados: number;
  clientes: number;
  eventos_activos: number;
  rps_activos: number;
}

export interface RpMetric {
  id: number;
  nombre_completo: string;
  username: string;
  activo: boolean;
  comision_porcentaje: number;
  boletos: number;
  ingresos: number;
  comision: number;
  usados: number;
  /** Ventas agrupadas por tipo de boleto, fase y evento. */
  desglose: { tipo: string; fase: string; evento: string; boletos: number; ingresos: number }[];
}

export interface EventMetrics {
  resumen: { boletos: number; ingresos: number; comisiones: number; usados: number };
  por_fase: { id: number; nombre: string; precio: number; activa: boolean; boletos: number; ingresos: number }[];
  por_tipo: { nombre: string; boletos: number; ingresos: number }[];
}

export interface DayPoint {
  dia: string;
  boletos: number;
  ingresos: number;
}

export interface MyMetrics {
  resumen: { boletos: number; ingresos: number; comision: number; usados: number };
  por_evento: { id: number; nombre: string; boletos: number; ingresos: number; comision: number }[];
  comision_porcentaje: number;
}

export interface AccessSummary {
  total: number;
  usados: number;
  pendientes: number;
  ultimos: { codigo: string; cliente_nombre: string; tipo_boleto: string; usado_en: string }[];
}
