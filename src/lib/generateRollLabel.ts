import jsPDF from 'jspdf';

export interface RollLabelData {
  consecutivo: string;
  referencia: string;
  color: string;
  anchoStr: string;
  metrosActuales: number;
  metrosIniciales: number;
  estado: string;
  actualizadoEn: string;
}

const W = 100;
const H = 62;
const M = 5;
const TAB = M + 18; // fixed tab stop: labels left, values at 23mm

export function generateRollLabel(data: RollLabelData): void {
  const doc = new jsPDF({ unit: 'mm', format: [W, H], orientation: 'portrait' });
  const valueMaxW = W - M - TAB; // 77mm available for values — no overflow possible

  let y = M;

  // Header
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text('DISA TEXTILES', W / 2, y, { align: 'center' });
  y += 4.5;

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text('ETIQUETA DE ROLLO', W / 2, y, { align: 'center' });
  y += 4;

  doc.setDrawColor(160);
  doc.setLineWidth(0.2);
  doc.line(M, y, W - M, y);
  y += 4.5;

  // Consecutivo (large) + Estado same row
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text(data.consecutivo, M, y);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(60);
  doc.text(data.estado.toUpperCase(), W - M, y, { align: 'right' });
  y += 7;

  doc.setDrawColor(220);
  doc.setLineWidth(0.15);
  doc.line(M, y, W - M, y);
  y += 4;

  // Single-column field rows — label left, value at fixed TAB
  function field(label: string, value: string) {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(label, M, y);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    const truncated = doc.splitTextToSize(value, valueMaxW)[0] ?? value;
    doc.text(truncated, TAB, y);
    y += 4;
  }

  field('Ref:', data.referencia);
  field('Color:', data.color);
  field('Ancho:', data.anchoStr);
  field('Metros:', `${data.metrosActuales} m / ${data.metrosIniciales} m`);
  y += 1;

  doc.setDrawColor(220);
  doc.setLineWidth(0.15);
  doc.line(M, y, W - M, y);
  y += 4;

  // Footer
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120);
  doc.text(`Actualizado: ${data.actualizadoEn}`, M, y);

  const safeFecha = data.actualizadoEn.replace(/\//g, '-');
  doc.save(`DISA-Etiqueta-${data.consecutivo}-${safeFecha}.pdf`);
}
