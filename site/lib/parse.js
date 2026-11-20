// Finds Systembolaget purchases in a bank export. Pure: no DOM, no network.
//
// Input is text (a CSV/TSV file, or rows copied from an internet bank) or rows
// already read from a spreadsheet. Exports differ per bank, so the parser
// leans on a header row when there is one and falls back to recognising
// dates and amounts by their shape when there isn't.

import { dayNumber, isValidYMD, ymd } from './dates.js';

export const MATCH = /systembolag/i;

// ---------------------------------------------------------------- decoding

// Swedish banks still ship Windows-1252 CSVs, and Excel's "Unicode text" is
// UTF-16. Valid UTF-8 never fails a fatal decode, so try that first.
export function decodeBytes(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder('utf-16le').decode(u8.subarray(2));
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder('utf-16be').decode(u8.subarray(2));
  try {
    return stripBom(new TextDecoder('utf-8', { fatal: true }).decode(u8));
  } catch {
    return new TextDecoder('windows-1252').decode(u8);
  }
}

const stripBom = (s) => s.replace(/^\uFEFF/, '');

// ---------------------------------------------------------------- rows

const DELIMITERS = [';', '\t', ',', '|'];

export function splitRows(text) {
  const lines = stripBom(text).replace(/\r\n?/g, '\n').split('\n');
  const sample = lines.filter((l) => l.trim() !== '').slice(0, 300);
  const delimiter = pickDelimiter(sample);
  if (delimiter) return lines.map((line) => splitLine(line, delimiter));
  // Free text: tabs or runs of spaces are the only field breaks left.
  return lines.map((line) => line.split(/\t| {2,}/).map((c) => c.trim()));
}

function countOutsideQuotes(line, delimiter) {
  let count = 0;
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === delimiter && !quoted) count++;
  }
  return count;
}

// "-389,00" in an unquoted paste looks like a comma-separated file.
function commasAreDecimals(lines) {
  let commas = 0;
  let decimals = 0;
  for (const line of lines) {
    const bare = line.replace(/"[^"]*"/g, '');
    commas += (bare.match(/,/g) || []).length;
    decimals += (bare.match(/\d,\d{2}(?!\d)/g) || []).length;
  }
  return commas > 0 && decimals / commas > 0.4;
}

function pickDelimiter(lines) {
  let best = null;
  let bestScore = 0;
  for (const delimiter of DELIMITERS) {
    const hits = new Map();
    for (const line of lines) {
      const c = countOutsideQuotes(line, delimiter);
      if (c > 0) hits.set(c, (hits.get(c) || 0) + 1);
    }
    let score = 0;
    for (const n of hits.values()) score = Math.max(score, n);
    if (!score) continue;
    if (delimiter === ',' && commasAreDecimals(lines)) continue;
    if (score > bestScore) {
      best = delimiter;
      bestScore = score;
    }
  }
  return bestScore >= Math.min(2, lines.length) ? best : null;
}

// One line at a time: a stray quote in a description must not swallow the
// rest of the file, and bank exports don't put line breaks inside fields.
function splitLine(line, delimiter) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
    } else if (ch === delimiter) {
      cells.push(cell.trim());
      cell = '';
    } else cell += ch;
  }
  cells.push(cell.trim());
  return cells;
}

// ---------------------------------------------------------------- values

const MONTH_WORDS = {
  jan: 1, feb: 2, mar: 3, apr: 4, maj: 5, may: 5, jun: 6, jul: 7,
  aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, dec: 12,
};

const DATE_PATTERNS = [
  // 2026-11-14, 2026/11/14, 2026.11.14, optionally with a time after it
  { re: /(^|\D)(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/g, ymd: (m) => [m[2], m[3], m[4]] },
  // 20261114
  { re: /(^|\D)(20\d{2})(\d{2})(\d{2})(?!\d)/g, ymd: (m) => [m[2], m[3], m[4]] },
  // 14.11.2026, 14-11-2026
  { re: /(^|\D)(\d{1,2})[.-](\d{1,2})[.-](20\d{2})(?!\d)/g, ymd: (m) => [m[4], m[3], m[2]] },
  // 14/11/2026, or 11/14/2026 in files that write the month first (Amex)
  { re: /(^|\D)(\d{1,2})\/(\d{1,2})\/(20\d{2})(?!\d)/g, ymd: (m, ctx) => (ctx.monthFirst ? [m[4], m[2], m[3]] : [m[4], m[3], m[2]]) },
  // 26-11-14, the short Swedish form
  { re: /(^|\D)(\d{2})-(\d{2})-(\d{2})(?!\d)/g, ymd: (m) => [`20${m[2]}`, m[3], m[4]] },
];

// Amex writes 11/20/2024. Decide per file: a first number above 12 means
// day first, a second number above 12 means month first.
export function slashOrder(rows) {
  let dayFirst = false;
  let monthFirst = false;
  for (const row of rows.slice(0, 2000)) {
    for (const cell of row) {
      for (const m of String(cell).matchAll(/(?:^|\D)(\d{1,2})\/(\d{1,2})\/20\d{2}(?!\d)/g)) {
        if (Number(m[1]) > 12) dayFirst = true;
        if (Number(m[2]) > 12) monthFirst = true;
      }
    }
  }
  return monthFirst && !dayFirst;
}

// Only the month's own spelling may follow the abbreviation, or "1 MARIEBERG"
// would read as the first of March.
const TEXT_DATE = /(^|[^\dA-Za-zÅÄÖåäö])(\d{1,2})\.?\s*(jan(?:uari|uary)?|feb(?:ruari|ruary)?|mar(?:s|ch)?|apr(?:il)?|maj|may|jun(?:i|e)?|jul(?:i|y)?|aug(?:usti|ust)?|sep(?:tember|t)?|okt(?:ober)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?(?:\s+(20\d{2}))?(?![A-Za-zÅÄÖåäö])/gi;

const TIME = /^[\sT]*([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?/;

// Every date in a piece of text, with its position so callers can blank it
// out before looking for amounts.
export function findDates(text, ctx = {}) {
  const s = String(text ?? '');
  const found = [];
  const taken = [];
  const overlaps = (a, b) => taken.some(([x, y]) => a < y && b > x);
  for (const { re, ymd: pick } of DATE_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(s))) {
      const start = m.index + m[1].length;
      const end = m.index + m[0].length;
      const [y, mo, d] = pick(m, ctx).map(Number);
      if (isValidYMD(y, mo, d) && !overlaps(start, end)) {
        taken.push([start, end]);
        found.push({ n: dayNumber(y, mo, d), start, end, time: timeAfter(s, end) });
      }
      re.lastIndex = m.index + 1;
    }
  }
  TEXT_DATE.lastIndex = 0;
  let m;
  while ((m = TEXT_DATE.exec(s))) {
    const start = m.index + m[1].length;
    const end = m.index + m[0].length;
    const d = Number(m[2]);
    const mo = MONTH_WORDS[m[3].slice(0, 3).toLowerCase()];
    const n = textDate(d, mo, m[4] ? Number(m[4]) : null, ctx);
    if (n != null && !overlaps(start, end)) {
      taken.push([start, end]);
      found.push({ n, start, end, time: null });
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

function timeAfter(s, end) {
  const m = TIME.exec(s.slice(end, end + 12));
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

// "14 nov" has no year: assume the latest one that doesn't put it in the future.
function textDate(d, mo, y, ctx) {
  if (y != null) return isValidYMD(y, mo, d) ? dayNumber(y, mo, d) : null;
  const today = ctx.today ?? null;
  const year = today != null ? ymd(today).y : new Date().getFullYear();
  if (!isValidYMD(year, mo, d)) return null;
  const n = dayNumber(year, mo, d);
  if (today != null && n > today && isValidYMD(year - 1, mo, d)) return dayNumber(year - 1, mo, d);
  return n;
}

// "-1 234,50", "−389,00 kr", "1,234.50", "(389.00)", "389,00-" → number.
export function parseAmount(raw) {
  if (raw == null) return null;
  let s = String(raw).replace(/&nbsp;|[\u00a0\u202f\u2009]/gi, ' ').trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/\s*(kr|sek|:-)\.?$/i, '').replace(/^(sek|kr)\s*/i, '').trim();
  if (/^[-−–]/.test(s)) {
    negative = true;
    s = s.slice(1).trim();
  } else if (s.startsWith('+')) s = s.slice(1).trim();
  if (s.endsWith('-')) {
    negative = true;
    s = s.slice(0, -1).trim();
  }
  if (!/^\d[\d .,']*$/.test(s)) return null;
  if (/ /.test(s) && !/^\d{1,3}( \d{3})+([.,]\d+)?$/.test(s)) return null;
  s = s.replace(/[ ']/g, '');
  const comma = s.lastIndexOf(',');
  const dot = s.lastIndexOf('.');
  let value;
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? ',' : '.';
    const thousands = decimal === ',' ? '.' : ',';
    value = Number(s.split(thousands).join('').replace(decimal, '.'));
  } else if (comma >= 0 || dot >= 0) {
    // A lone separator is a decimal one, even with three digits after it:
    // SEB writes -62.400 for −62,40 kr.
    const sep = comma >= 0 ? ',' : '.';
    const count = s.split(sep).length - 1;
    value = count === 1 ? Number(s.replace(sep, '.')) : Number(s.split(sep).join(''));
  } else value = Number(s);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

// Amounts inside free text, in order. `strong` ones have decimals, a currency
// or a sign; a bare integer could just as well be a store number.
const AMOUNT_IN_TEXT = /(^|[\s(])([-−–+]?\s?(?:\d{1,3}(?:[ .,\u00a0\u202f]\d{3})+|\d+)(?:[.,]\d{1,2})?(?:\s?(?:kr|sek|:-))?-?)(?=$|[\s);])/gi;

export function findAmounts(text) {
  const s = String(text ?? '');
  const out = [];
  AMOUNT_IN_TEXT.lastIndex = 0;
  let m;
  while ((m = AMOUNT_IN_TEXT.exec(s))) {
    const token = m[2];
    const value = parseAmount(token);
    if (value == null) continue;
    const strong = /[.,]\d{1,3}(?:\s?(?:kr|sek|:-))?-?$/i.test(token) || /kr|sek|:-/i.test(token) || /^[-−–+]/.test(token);
    out.push({ value, strong });
  }
  return out;
}

// Card rows often carry the real purchase date in the text, e.g. Nordea's
// "Kortköp 261114 SYSTEMBOLAGET" or SEB's "SYSTEMBOLAGE/26-11-14", while the
// date column is the booking date. Only trust it when it lands just before
// the booking date.
export function embeddedPurchaseDate(text, bookedOn) {
  const s = String(text ?? '');
  const re = /(^|\D)(?:20)?(\d{2})[-.]?(\d{2})[-.]?(\d{2})(?=\D|$)/g;
  let m;
  while ((m = re.exec(s))) {
    const y = 2000 + Number(m[2]);
    const mo = Number(m[3]);
    const d = Number(m[4]);
    if (isValidYMD(y, mo, d)) {
      const n = dayNumber(y, mo, d);
      if (n <= bookedOn && bookedOn - n <= 10) return n;
    }
    re.lastIndex = m.index + 1;
  }
  return null;
}

// ---------------------------------------------------------------- headers

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');

// Column names seen in Swedish bank exports, normalised by `norm`. Value
// dates (Valutadag) are left out on purpose: they are neither the purchase
// nor the booking date.
const HEADERS = {
  txDate: ['transaktionsdag', 'transaktionsdatum', 'kopdatum', 'kopdag', 'inkopsdatum', 'transactiondate', 'starteddate', 'startdatum', 'purchasedate', 'datumforkop'],
  date: ['datum', 'date', 'dag'],
  bookDate: ['bokforingsdag', 'bokforingsdatum', 'bokfordag', 'bokforddatum', 'bokfort', 'bokford', 'bokfdatum', 'reskontradatum', 'completeddate', 'bookingdate', 'bookdate', 'posteddate', 'postingdate'],
  amount: ['belopp', 'beloppsek', 'beloppkr', 'beloppisek', 'beloppkronor', 'amount', 'amountsek', 'summa', 'sek', 'kronor', 'transaktionsbelopp', 'totalbelopp'],
  out: ['uttag', 'debet', 'debit', 'utgift', 'utgifter', 'utbetalning', 'paidout', 'moneyout'],
  in: ['insattning', 'kredit', 'credit', 'inbetalning', 'inkomst', 'paidin', 'moneyin'],
  desc: ['text', 'beskrivning', 'meddelande', 'rubrik', 'specifikation', 'avsandare', 'mottagare', 'namn', 'description', 'merchant', 'transaktion', 'referens', 'information', 'detaljer', 'handelse', 'transaktionstext', 'betalningsmottagare', 'transaktionsbeskrivning', 'motpart', 'payee', 'name', 'details', 'reference'],
  time: ['tid', 'time', 'klockslag'],
  state: ['state', 'status'],
};
const DATE_RANK = { txDate: 3, date: 2, bookDate: 1 };
const HEADER_LOOKUP = new Map(Object.entries(HEADERS).flatMap(([group, names]) => names.map((n) => [n, group])));
// Longest first, so "transaktionsdatum" wins over "transaktion".
const HEADER_PREFIXES = [...HEADER_LOOKUP].filter(([name]) => name.length >= 5).sort((a, b) => b[0].length - a[0].length);
// Balances, foreign amounts, fees, currencies, value dates and id columns.
const IGNORED_HEADER = /saldo|balance|tillganglig|disponib|utlbelopp|avgift|^fee|kurs|valuta|currency|nummer/;

// Skandia's header cells can carry a second line ("Belopp\n(SEK)"), so a
// known name at the start of the cell counts too.
function headerGroup(cell) {
  const key = norm(cell);
  if (!key || IGNORED_HEADER.test(key)) return null;
  if (HEADER_LOOKUP.has(key)) return HEADER_LOOKUP.get(key);
  return HEADER_PREFIXES.find(([name]) => key.startsWith(name))?.[1] ?? null;
}

export function headerMapping(row) {
  const map = { dates: [], amount: -1, out: -1, in: -1, desc: [], time: -1, state: -1, width: 0 };
  row.forEach((cell, i) => {
    if (cell) map.width = i + 1;
    const group = headerGroup(cell);
    if (!group) return;
    if (group in DATE_RANK) map.dates.push({ i, rank: DATE_RANK[group] });
    else if (group === 'desc') map.desc.push(i);
    else if (map[group] === -1) map[group] = i;
  });
  map.dates.sort((a, b) => b.rank - a.rank);
  const hasAmount = map.amount >= 0 || map.out >= 0 || map.in >= 0;
  return map.dates.length && hasAmount ? map : null;
}

// ---------------------------------------------------------------- extraction

const SKIPPED_STATE = /reverted|declined|failed|cancel|avbruten|nekad|makulerad|återförd|aterford|avvisad/i;
const BALANCE_WORDS = /saldo|balance|disponib/i;

// Pending card rows (Nordea's "Reserverat") have no date in the date column,
// but the text still says "Kortköp 261114 …".
export function cardTextDate(text) {
  const m = /(?:kortk[öo]p|[åa]terk[öo]p)\s+(\d{2})(\d{2})(\d{2})(?!\d)/i.exec(String(text ?? ''));
  if (!m) return null;
  const [y, mo, d] = [2000 + Number(m[1]), Number(m[2]), Number(m[3])];
  return isValidYMD(y, mo, d) ? dayNumber(y, mo, d) : null;
}

// A date column read from a spreadsheet without a date style is a bare
// Excel serial number: day 0 is 1899-12-30, 25569 days before 1970-01-01.
function dateCell(value, ctx) {
  const [first] = findDates(value, ctx);
  if (first) return first;
  const serial = /^\d{5}(\.\d+)?$/.test(String(value ?? '').trim()) ? Number(value) : NaN;
  return serial > 30000 && serial < 80000 ? { n: Math.floor(serial) - 25569, time: null } : null;
}

function fromHeader(row, map, ctx) {
  let date = null;
  let time = null;
  let booked = null;
  let hasTxDate = false;
  for (const { i, rank } of map.dates) {
    const first = dateCell(row[i], ctx);
    if (!first) continue;
    if (date == null) {
      date = first.n;
      time = first.time;
      hasTxDate = rank >= 2;
    }
    if (rank <= 1) booked = Math.max(booked ?? -Infinity, first.n);
  }
  if (map.time >= 0) time = TIME.exec(row[map.time] ?? '') ? timeAfter(row[map.time], 0) : time;

  let amount = null;
  if (map.amount >= 0) amount = parseAmount(row[map.amount]);
  else {
    const out = parseAmount(row[map.out]);
    const inn = parseAmount(row[map.in]);
    if (out != null || inn != null) amount = (inn ?? 0) - Math.abs(out ?? 0);
  }

  const desc = (map.desc.length ? map.desc.map((i) => row[i]).filter(Boolean).join(' ') : '') || row.join(' ');
  if (date != null && !hasTxDate) {
    const purchase = embeddedPurchaseDate(desc, booked ?? date);
    if (purchase != null) date = purchase;
  }
  if (date == null) date = cardTextDate(desc);
  if (date == null || amount == null || amount === 0) return null;
  return { date, amount, desc: pickDescription(row, desc), time };
}

function fromShapes(row, ctx) {
  let date = null;
  let time = null;
  const strong = [];
  const weak = [];
  for (const cell of row) {
    if (!cell) continue;
    const dates = findDates(cell, ctx);
    let rest = cell;
    for (const d of dates) {
      if (date == null || d.n < date) {
        date = d.n;
        time = d.time;
      }
      rest = rest.slice(0, d.start) + ' '.repeat(d.end - d.start) + rest.slice(d.end);
    }
    if (BALANCE_WORDS.test(rest)) rest = rest.split(BALANCE_WORDS)[0];
    for (const a of findAmounts(rest)) (a.strong ? strong : weak).push(a.value);
  }
  const amount = strong.find((v) => v < 0) ?? strong[0] ?? (weak.length === 1 ? weak[0] : null);
  if (date == null) date = cardTextDate(row.join(' '));
  if (date == null || amount == null || amount === 0) return { date, amount: amount || null };
  const desc = pickDescription(row, row.join(' '));
  const purchase = embeddedPurchaseDate(desc.replace(/(^|\D)20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}/g, ' '), date);
  return { date: purchase ?? date, amount, desc, time };
}

function pickDescription(row, fallback) {
  return row.find((c) => MATCH.test(c)) || fallback;
}

// Records spread over several lines, as when copying from a bank's app:
// the date sits above the merchant and the amount right below it.
function fromNeighbours(rows, i, ctx) {
  const text = (j) => (rows[j] || []).join(' ');
  const usable = (j) => j === i || !MATCH.test(text(j));
  let date = null;
  for (const j of [i, i - 1, i - 2, i - 3, i - 4, i - 5, i - 6, i - 7, i - 8, i + 1, i + 2, i + 3]) {
    if (j < 0 || j >= rows.length || !usable(j)) continue;
    const dates = findDates(text(j), ctx);
    if (dates.length) {
      date = Math.min(...dates.map((d) => d.n));
      break;
    }
  }
  let amount = null;
  for (const j of [i, i + 1, i + 2, i + 3, i - 1, i - 2]) {
    if (j < 0 || j >= rows.length || !usable(j)) continue;
    let line = text(j);
    for (const d of findDates(line, ctx)) line = line.slice(0, d.start) + ' '.repeat(d.end - d.start) + line.slice(d.end);
    if (BALANCE_WORDS.test(line)) line = line.split(BALANCE_WORDS)[0];
    const found = findAmounts(line).filter((a) => a.strong);
    if (found.length) {
      amount = (found.find((a) => a.value < 0) ?? found[0]).value;
      break;
    }
  }
  if (date == null || amount == null || amount === 0) return null;
  return { date, amount, desc: text(i), time: null };
}

// A description with an unquoted delimiter shifts every column after it, so
// only trust the header's column positions when nothing spills past them.
// Shorter rows are fine: spreadsheets drop empty trailing cells.
function fits(row, map) {
  return row.slice(map.width).every((c) => c === '');
}

// rows → { transactions, coverage, rowsWithDates, matchedRows, unreadable }
export function extractFromRows(rows, options = {}) {
  const ctx = { ...options, monthFirst: slashOrder(rows) };
  let map = null;
  const found = [];
  const coverage = { from: null, to: null };
  let rowsWithDates = 0;
  let matchedRows = 0;
  let unreadable = 0;
  const leftovers = [];

  rows.forEach((row, i) => {
    if (!row.some((c) => c !== '')) return;
    const header = headerMapping(row);
    if (header) {
      map = header;
      return;
    }
    const firstDate = map
      ? map.dates.map(({ i: col }) => dateCell(row[col], ctx)).find(Boolean)
      : findDates(row.join(' '), ctx)[0];
    if (firstDate) {
      rowsWithDates++;
      if (coverage.from == null || firstDate.n < coverage.from) coverage.from = firstDate.n;
      if (coverage.to == null || firstDate.n > coverage.to) coverage.to = firstDate.n;
    }
    if (!row.some((c) => MATCH.test(c))) return;
    matchedRows++;
    if (map && map.state >= 0 && SKIPPED_STATE.test(row[map.state] ?? '')) return;
    const tx = (map && fits(row, map) && fromHeader(row, map, ctx)) || fromShapes(row, ctx);
    if (tx && tx.date != null && tx.amount != null && tx.desc) found.push(tx);
    else if (map) unreadable++;
    else leftovers.push(i);
  });

  // Free text only: in a file with columns, a neighbour's date belongs to
  // another purchase.
  for (const i of leftovers) {
    const tx = fromNeighbours(rows, i, ctx);
    if (tx) {
      found.push(tx);
      if (coverage.from == null || tx.date < coverage.from) coverage.from = tx.date;
      if (coverage.to == null || tx.date > coverage.to) coverage.to = tx.date;
    } else unreadable++;
  }

  return { transactions: normaliseSigns(found), coverage, rowsWithDates, matchedRows, unreadable };
}

// Purchases are negative on an account and positive on a card statement.
// Whichever sign most Systembolaget rows have is "purchase"; the other is a
// refund.
function normaliseSigns(found) {
  const negative = found.filter((t) => t.amount < 0).length;
  const purchaseSign = negative >= found.length - negative ? -1 : 1;
  return found
    .map((t) => ({
      date: t.date,
      kr: Math.round(Math.abs(t.amount) * 100) / 100,
      refund: Math.sign(t.amount) !== purchaseSign,
      store: storeLabel(t.desc),
      time: t.time || null,
    }))
    .sort((a, b) => a.date - b.date);
}

export function extractFromText(text, ctx = {}) {
  return extractFromRows(splitRows(text), ctx);
}

// ---------------------------------------------------------------- stores

const titleCase = (w) => (/^\d/.test(w) || w.length <= 2 ? w : w[0] + w.slice(1).toLowerCase());

// "Kortköp 261114 SYSTEMBOLAGET 1404 MALMÖ" → "Systembolaget 1404 Malmö".
// Banks cut names short (SEB: "SYSTEMBOLAGE/26-11-14", Swedbank: 16
// characters), so anything after the name that is too short to be a store
// number or a place is dropped.
export function storeLabel(desc) {
  const words = String(desc ?? '')
    // Länsförsäkringar writes Ö as "Oe": "Systembolaget,MALMOe,SE".
    .replace(/(^|[^a-zåäö])Oe(?![a-zåäö])/g, '$1Ö')
    .replace(/(^|[^a-zåäö])Ae(?![a-zåäö])/g, '$1Ä')
    .toUpperCase()
    .replace(/^.*?(?=SYSTEMBOLAG)/, '')
    .replace(/[/,;:|()]+/g, ' ')
    .replace(/\d{4}[-.]\d{2}[-.]\d{2}/g, ' ')
    .replace(/(^|\s)\d{2}[-.]?\d{2}[-.]?\d{2}(?=\s|$)/g, ' ')
    .replace(/[*X]{3,}\d*/g, ' ')
    .replace(/[-−–+]?\d{1,3}(?:[ \u00a0]\d{3})*[.,]\d{2,3}/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const place = words.slice(1)
    .filter((w) => w !== 'SE' && w !== 'SEK' && w !== 'KR' && (w.length >= 3 || /^\d{3,}$/.test(w)))
    .slice(0, 2);
  return ['Systembolaget', ...place.map(titleCase)].join(' ');
}

// ---------------------------------------------------------------- merging

// Overlapping exports of one account repeat the same purchase, so count each
// (day, amount, store) as many times as the file that has it most often:
// two identical purchases on one day in one export are both real.
export function mergeResults(results) {
  const best = new Map();
  for (const r of results) {
    const perFile = new Map();
    for (const t of r.transactions) {
      const key = `${t.date}|${t.kr}|${t.refund}|${t.store}`;
      if (!perFile.has(key)) perFile.set(key, []);
      perFile.get(key).push(t);
    }
    for (const [key, list] of perFile) {
      if (!best.has(key) || best.get(key).length < list.length) best.set(key, list);
    }
  }
  const transactions = [...best.values()].flat().sort((a, b) => a.date - b.date);
  const coverage = { from: null, to: null };
  for (const r of results) {
    if (r.coverage.from != null && (coverage.from == null || r.coverage.from < coverage.from)) coverage.from = r.coverage.from;
    if (r.coverage.to != null && (coverage.to == null || r.coverage.to > coverage.to)) coverage.to = r.coverage.to;
  }
  return { transactions, coverage };
}
