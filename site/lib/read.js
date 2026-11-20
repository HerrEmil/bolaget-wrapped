// File → parse result, in the browser. Spreadsheets get the lazy-loaded zip
// reader, HTML tables (some banks' ".xls") the browser's inert DOMParser, and
// everything else is decoded as text.

import { decodeBytes, extractFromRows, extractFromText } from './parse.js';

export class ReadError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const startsWith = (bytes, ...sig) => sig.every((b, i) => bytes[i] === b);

function htmlRows(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return [...doc.querySelectorAll('tr')].map((tr) => [...tr.querySelectorAll('th, td')]
    .map((cell) => cell.textContent.replace(/\s+/g, ' ').trim()));
}

export async function readFile(file, ctx) {
  const buffer = await file.arrayBuffer();
  const head = new Uint8Array(buffer, 0, Math.min(8, buffer.byteLength));
  if (startsWith(head, 0x50, 0x4b, 0x03, 0x04)) {
    const { readXlsx } = await import('./xlsx.js');
    let rows;
    try {
      rows = await readXlsx(buffer);
    } catch {
      throw new ReadError('spreadsheet');
    }
    return extractFromRows(rows, ctx);
  }
  if (startsWith(head, 0xd0, 0xcf, 0x11, 0xe0)) throw new ReadError('old-xls');
  if (startsWith(head, 0x25, 0x50, 0x44, 0x46)) throw new ReadError('pdf');
  const text = decodeBytes(buffer);
  if (/^\s*</.test(text) && /<table/i.test(text)) return extractFromRows(htmlRows(text), ctx);
  return extractFromText(text, ctx);
}

export const READ_ERRORS = {
  'old-xls': 'Det här är en gammal Excel-fil (.xls) som vi inte kan läsa. Öppna den i Excel eller Numbers och spara som CSV, eller kopiera raderna och klistra in dem nedan.',
  pdf: 'PDF-kontoutdrag går tyvärr inte att läsa. Välj Excel eller CSV när du exporterar, eller kopiera raderna och klistra in dem nedan.',
  spreadsheet: 'Kalkylarket gick inte att läsa. Spara det som CSV eller .xlsx och försök igen.',
};
