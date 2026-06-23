import jsPDF from 'jspdf';

export interface SalePDFData {
  cliente: { nombre: string; tipo: string };
  rollo: { consecutivo: string; referencia: string; color: string; ancho: number; metros: number };
  precio: { precioMetro: number; descuento: number; subtotal: number; total: number };
  venta: { fecha: string; hora: string; movimientoId: number; registradoPor: string };
}

function formatCOP(n: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(n);
}

const PAGE_W = 80;
const MARGIN = 6;
const LINE_H = 5.5;

export function generateSalePDF(data: SalePDFData): void {
  const doc = new jsPDF({ unit: 'mm', format: [PAGE_W, 200], orientation: 'portrait' });
  let y = MARGIN;

  function hRule() {
    doc.setDrawColor(160);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 3;
  }

  function row(label: string, value: string, opts?: { valueBold?: boolean; valueSize?: number }) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80);
    doc.text(label, MARGIN, y);
    doc.setFont('helvetica', opts?.valueBold ? 'bold' : 'normal');
    doc.setFontSize(opts?.valueSize ?? 9);
    doc.setTextColor(0);
    doc.text(value, PAGE_W - MARGIN, y, { align: 'right' });
    y += LINE_H;
  }

  function heading(text: string) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100);
    doc.text(text, MARGIN, y);
    y += LINE_H;
  }

  // ── Header ──────────────────────────────────────────────────────
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text('DISA TEXTILES', PAGE_W / 2, y, { align: 'center' });
  y += LINE_H;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text('Distribuidora de Telas para Cortinas', PAGE_W / 2, y, { align: 'center' });
  y += LINE_H + 1;

  hRule();

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text('SALIDA DE INVENTARIO', PAGE_W / 2, y, { align: 'center' });
  y += LINE_H;

  row('Fecha:', data.venta.fecha);
  row('Hora:', data.venta.hora);

  hRule();

  // ── Cliente ─────────────────────────────────────────────────────
  heading('CLIENTE');
  row('Nombre:', data.cliente.nombre);
  row('Tipo:', (data.cliente.tipo === 'DISTRIBUTOR' || data.cliente.tipo === 'FIXED') ? 'Cliente Fijo' : 'Cliente Ocasional');

  hRule();

  // ── Rollo ───────────────────────────────────────────────────────
  heading('DETALLE DEL ROLLO');
  row('Consecutivo:', data.rollo.consecutivo);
  row('Referencia:', data.rollo.referencia);
  row('Color:', data.rollo.color);
  row('Ancho:', `${data.rollo.ancho} cm`);
  row('Metros:', `${data.rollo.metros} m`);

  hRule();

  // ── Precio ──────────────────────────────────────────────────────
  heading('PRECIO');
  row('Precio/m:', formatCOP(data.precio.precioMetro));

  if (data.precio.descuento > 0) {
    row('Descuento:', `${data.precio.descuento}%`);
    row('Subtotal:', formatCOP(data.precio.subtotal));
    const dtoAmount = data.precio.subtotal - data.precio.total;
    row('Descuento (–):', formatCOP(dtoAmount));
  }

  y += 1;
  doc.setDrawColor(0);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 3;

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text('TOTAL:', MARGIN, y);
  doc.text(formatCOP(data.precio.total), PAGE_W - MARGIN, y, { align: 'right' });
  y += LINE_H + 2;

  hRule();

  // ── Footer ──────────────────────────────────────────────────────
  row('Registrado por:', data.venta.registradoPor);
  row('Mov. N°:', String(data.venta.movimientoId));

  y += 3;
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(130);
  doc.text('Gracias por su compra', PAGE_W / 2, y, { align: 'center' });

  const safeFecha = data.venta.fecha.replace(/\//g, '-');
  doc.save(`DISA-Salida-${data.rollo.consecutivo}-${safeFecha}.pdf`);
}
