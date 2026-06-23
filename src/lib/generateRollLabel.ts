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
const COL2 = W / 2 + 2;

export function generateRollLabel(data: RollLabelData): void {
  const doc = new jsPDF({ unit: 'mm', format: [W, H], orientation: 'portrait' });

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
  y += 4;

  // Consecutivo (large) + Estado (right)
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text(data.consecutivo, M, y);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(60);
  doc.text(data.estado.toUpperCase(), W - M, y, { align: 'right' });
  y += 6.5;

  doc.setDrawColor(220);
  doc.setLineWidth(0.15);
  doc.line(M, y, W - M, y);
  y += 4;

  // Field rows
  function field(label: string, value: string, x: number, col: boolean = false) {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(label, x, y);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    const labelW = doc.getTextWidth(label) + 1;
    const maxW = col ? (W / 2 - M - 3) : (W - M * 2 - labelW);
    const text = doc.splitTextToSize(value, maxW)[0] ?? value;
    doc.text(text, x + labelW, y);
  }

  // Row: Ref | Color
  field('Ref:', data.referencia, M);
  field('Color:', data.color, COL2);
  y += 4.5;

  // Row: Ancho | Metros
  field('Ancho:', data.anchoStr, M);
  field('Metros:', `${data.metrosActuales} m / ${data.metrosIniciales} m`, COL2);
  y += 5;

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
