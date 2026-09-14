import { jsPDF } from 'jspdf';
import type { MailMessage } from './types';

function stripHtml(html: string): string {
  const d = document.createElement('div');
  d.innerHTML = html;
  return (d.textContent || d.innerText || '').slice(0, 20000);
}

export function exportMessagePdf(msg: MailMessage): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 48;
  let y = margin;
  const w = doc.internal.pageSize.getWidth() - margin * 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Roxera Mail — письмо', margin, y);
  y += 24;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const meta = [`From: ${msg.from}`, `To: ${msg.to}`, `Date: ${msg.createdAt}`, `Subject: ${msg.subject}`];
  for (const line of meta) {
    const parts = doc.splitTextToSize(line, w);
    doc.text(parts, margin, y);
    y += parts.length * 13;
  }
  y += 10;
  doc.setDrawColor(200);
  doc.line(margin, y, margin + w, y);
  y += 16;
  doc.setFontSize(11);
  const body = msg.text || (msg.html ? stripHtml(msg.html) : msg.encryptedPayload ? '[Зашифровано паролем]' : '(пусто)');
  const lines = doc.splitTextToSize(body, w);
  doc.text(lines, margin, y);
  doc.save(`roxera-${msg.id}.pdf`);
}

export function exportMailboxPdf(address: string, msgs: MailMessage[]): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 48;
  const w = doc.internal.pageSize.getWidth() - margin * 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`Roxera Mail — экспорт ящика ${address}`, margin, margin);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  let y = margin + 30;
  const addPage = () => { doc.addPage(); y = margin; };
  msgs.forEach((m, i) => {
    const head = `${i + 1}. [${m.direction}] ${m.createdAt} | ${m.from} → ${m.to} | ${m.subject}`;
    const body = (m.text || (m.html ? stripHtml(m.html) : '[шифр/пусто]')).slice(0, 2000);
    for (const chunk of doc.splitTextToSize(`${head}\n${body}\n`, w)) {
      if (y > doc.internal.pageSize.getHeight() - margin) addPage();
      doc.text(chunk, margin, y);
      y += 13;
    }
    y += 8;
    if (y > doc.internal.pageSize.getHeight() - margin) addPage();
  });
  doc.save(`roxera-${address}.pdf`);
}
