import jsPDF from 'jspdf';

export interface ReturnPDFData {
  consecutivo: string;
  referencia: string;
  color: string;
  anchoStr: string;
  metrosDevueltos: number;
  metrosNuevos: number;
  metrosIniciales: number;
  razon: string;
  fecha: string;
  hora: string;
  registradoPor: string;
}

const PAGE_W = 80;
const MARGIN = 6;
const LINE_H = 5.5;

export function generateReturnPDF(data: ReturnPDFData): void {
  const doc = new jsPDF({ unit: 'mm', format: [PAGE_W, 200], orientation: 'portrait' });
  let y = MARGIN;

  function hRule() {
    doc.setDrawColor(160);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 3;
  }

  function row(label: string, value: string, opts?: { valueBold?: boolean }) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80);
    doc.text(label, MARGIN, y);
    doc.setFont('helvetica', opts?.valueBold ? 'bold' : 'normal');
    doc.setTextColor(0);
    doc.text(value, PAGE_W - MARGIN, y, { align: 'right' });
    y += LINE_H;
  }

  // ── Header ──────────────────────────────────────────────────────────────
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
  doc.text('NOTA DE DEVOLUCIÓN', PAGE_W / 2, y, { align: 'center' });
  y += LINE_H + 2;

  hRule();

  // ── Date / operator ──────────────────────────────────────────────────────
  row('Fecha:', `${data.fecha}  ${data.hora}`);
  row('Registrado por:', data.registradoPor);
  y += 1;
  hRule();

  // ── Roll info ────────────────────────────────────────────────────────────
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100);
  doc.text('ROLLO', MARGIN, y);
  y += LINE_H;

  row('Consecutivo:', data.consecutivo);
  row('Referencia:', data.referencia);
  row('Color:', data.color);
  row('Ancho:', data.anchoStr);
  y += 1;
  hRule();

  // ── Meters ───────────────────────────────────────────────────────────────
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100);
  doc.text('METROS', MARGIN, y);
  y += LINE_H;

  row('Metros devueltos:', `${data.metrosDevueltos} m`, { valueBold: true });
  row('Metros nuevos:', `${data.metrosNuevos} m / ${data.metrosIniciales} m`);
  y += 1;
  hRule();

  // ── Reason / notes ───────────────────────────────────────────────────────
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100);
  doc.text('MOTIVO', MARGIN, y);
  y += LINE_H;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0);
  const lines = doc.splitTextToSize(data.razon || '—', PAGE_W - MARGIN * 2) as string[];
  lines.forEach((line: string) => { doc.text(line, MARGIN, y); y += LINE_H; });
  y += 2;

  hRule();

  // ── Footer ───────────────────────────────────────────────────────────────
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120);
  doc.text('Documento generado por DISA Inventory', PAGE_W / 2, y, { align: 'center' });

  const safeFecha = data.fecha.replace(/\//g, '-');
  doc.save(`DISA-Devolucion-${data.consecutivo}-${safeFecha}.pdf`);
}
