// A minimal .xlsx reader: just enough to get cell text out of a bank export.
// An .xlsx file is a zip of XML parts; DecompressionStream inflates them, so
// no library is needed. Loaded only when someone drops a spreadsheet.

import { toISO } from './dates.js';

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

function unzip(bytes) {
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (u32(bytes, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a zip file');
  const entries = new Map();
  const count = u16(bytes, eocd + 10);
  let p = u32(bytes, eocd + 16);
  const names = new TextDecoder();
  for (let n = 0; n < count && u32(bytes, p) === 0x02014b50; n++) {
    const method = u16(bytes, p + 10);
    const size = u32(bytes, p + 20);
    const nameLength = u16(bytes, p + 28);
    const extraLength = u16(bytes, p + 30);
    const commentLength = u16(bytes, p + 32);
    const local = u32(bytes, p + 42);
    const name = names.decode(bytes.subarray(p + 46, p + 46 + nameLength));
    const start = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28);
    entries.set(name, { method, data: bytes.subarray(start, start + size) });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflate({ method, data }) {
  if (method === 0) return data;
  if (method !== 8) throw new Error(`unsupported zip method ${method}`);
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescapeXml = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) => {
  if (e[0] !== '#') return ENTITIES[e.toLowerCase()];
  return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
});

const textOf = (xml) => [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
  .map((m) => unescapeXml(m[1])).join('');

const attr = (attrs, name) => {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs);
  return m ? m[1] : null;
};

// Built-in number formats that are dates: 14–22, 27–36, 45–47, 50–58.
const BUILTIN_DATES = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

function dateStyles(xml) {
  const styles = new Set();
  if (!xml) return styles;
  const custom = new Map();
  for (const m of xml.matchAll(/<numFmt\b([^>]*)\/?>/g)) {
    const code = (attr(m[1], 'formatCode') || '').replace(/"[^"]*"|\[[^\]]*\]|\\./g, '');
    custom.set(Number(attr(m[1], 'numFmtId')), /[dmy]/i.test(code));
  }
  const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
  if (!xfs) return styles;
  [...xfs[1].matchAll(/<xf\b([^>]*)>/g)].forEach((m, i) => {
    const id = Number(attr(m[1], 'numFmtId') || 0);
    if (BUILTIN_DATES.has(id) || custom.get(id)) styles.add(i);
  });
  return styles;
}

function column(ref) {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}

// Excel's day 0 is 1899-12-30; 25569 days later is 1970-01-01.
function serialToISO(serial) {
  const day = Math.floor(serial);
  const minutes = Math.round((serial - day) * 1440);
  const date = toISO(day - 25569);
  if (!minutes) return date;
  return `${date} ${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function sheetRows(xml, shared, dates) {
  const rows = [];
  for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const inner = c[2] || '';
      const ref = attr(attrs, 'r');
      const index = ref ? column(ref) : row.length;
      const type = attr(attrs, 't');
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner);
      let value = '';
      if (type === 's') value = shared[Number(v?.[1])] ?? '';
      else if (type === 'inlineStr') value = textOf(inner);
      else if (v) value = unescapeXml(v[1]);
      if (!type || type === 'n') {
        const n = Number(value);
        if (value !== '' && Number.isFinite(n) && dates.has(Number(attr(attrs, 's'))) && n > 30000 && n < 80000) value = serialToISO(n);
      }
      while (row.length < index) row.push('');
      row[index] = String(value).trim();
    }
    rows.push(row);
  }
  return rows;
}

export async function readXlsx(buffer) {
  const zip = unzip(new Uint8Array(buffer));
  const read = async (name) => (zip.has(name) ? new TextDecoder().decode(await inflate(zip.get(name))) : null);
  const sharedXml = await read('xl/sharedStrings.xml');
  const shared = sharedXml ? [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1])) : [];
  const dates = dateStyles(await read('xl/styles.xml'));
  const sheets = [...zip.keys()]
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  const rows = [];
  for (const name of sheets) rows.push(...sheetRows(await read(name), shared, dates), []);
  return rows;
}
