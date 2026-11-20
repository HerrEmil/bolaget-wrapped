// Calendar helpers. A date is a "day number": whole days since 1970-01-01 in
// UTC. Bank exports carry calendar dates without a time zone, so doing all
// arithmetic in UTC means no time zone or DST change can move a purchase to
// another day.

export const WEEKDAYS = ['måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag', 'söndag'];
export const WEEKDAYS_SHORT = ['mån', 'tis', 'ons', 'tor', 'fre', 'lör', 'sön'];
export const MONTHS = [
  'januari', 'februari', 'mars', 'april', 'maj', 'juni',
  'juli', 'augusti', 'september', 'oktober', 'november', 'december',
];
export const MONTHS_SHORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

const DAY_MS = 86400000;

export function dayNumber(y, m, d) {
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function isValidYMD(y, m, d) {
  return Number.isInteger(y) && Number.isInteger(m) && Number.isInteger(d)
    && y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

export function ymd(n) {
  const dt = new Date(n * DAY_MS);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

export function toISO(n) {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function fromISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return dayNumber(y, m, d);
}

// 0 = måndag … 6 = söndag. Day 0 (1970-01-01) was a Thursday.
export function weekdayIndex(n) {
  return (((n + 3) % 7) + 7) % 7;
}

export function todayDayNumber(now = new Date()) {
  return dayNumber(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

// Easter Sunday, anonymous Gregorian algorithm (Meeus/Jones/Butcher).
export function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return dayNumber(year, month, day);
}

// Midsommarafton is the Friday between 19 and 25 June.
export function midsommarafton(year) {
  for (let d = 19; d <= 25; d++) {
    const n = dayNumber(year, 6, d);
    if (weekdayIndex(n) === 4) return n;
  }
  throw new Error(`no midsommarafton in ${year}`);
}

// Payday: the 25th, or the Friday before when the 25th is a weekend.
export function payday(year, month) {
  const n = dayNumber(year, month, 25);
  const wd = weekdayIndex(n);
  if (wd === 5) return n - 1;
  if (wd === 6) return n - 2;
  return n;
}

// Days since the most recent payday on or before `n`.
export function daysSincePayday(n) {
  const { y, m } = ymd(n);
  const thisMonth = payday(y, m);
  if (thisMonth <= n) return n - thisMonth;
  const prev = m === 1 ? payday(y - 1, 12) : payday(y, m - 1);
  return n - prev;
}

// Public holidays plus the eves Systembolaget keeps closed (midsommarafton,
// julafton). Påskafton and nyårsafton are open. Only the demo uses this, to
// keep its made-up purchases on days a store is open.
export function closedDays(year) {
  const easter = easterSunday(year);
  const midsommar = midsommarafton(year);
  let allaHelgon = dayNumber(year, 10, 31);
  while (weekdayIndex(allaHelgon) !== 5) allaHelgon++;
  return new Set([
    dayNumber(year, 1, 1), dayNumber(year, 1, 6),
    easter - 2, easter, easter + 1, easter + 39,
    dayNumber(year, 5, 1), dayNumber(year, 6, 6),
    midsommar, midsommar + 1, allaHelgon,
    dayNumber(year, 12, 24), dayNumber(year, 12, 25), dayNumber(year, 12, 26),
  ]);
}

// The big shopping windows of the Swedish year, inclusive day ranges.
export function seasonWindows(year) {
  const easter = easterSunday(year);
  const midsommar = midsommarafton(year);
  return [
    { key: 'pask', label: 'Påsk', emoji: '🐣', from: easter - 6, to: easter - 1 },
    { key: 'valborg', label: 'Valborg', emoji: '🔥', from: dayNumber(year, 4, 26), to: dayNumber(year, 4, 30) },
    { key: 'midsommar', label: 'Midsommar', emoji: '🌼', from: midsommar - 4, to: midsommar },
    { key: 'kraftskiva', label: 'Kräftskiva', emoji: '🦞', from: dayNumber(year, 8, 1), to: dayNumber(year, 8, 31) },
    { key: 'jul', label: 'Jul', emoji: '🎄', from: dayNumber(year, 12, 16), to: dayNumber(year, 12, 24) },
    { key: 'nyar', label: 'Nyår', emoji: '🎆', from: dayNumber(year, 12, 27), to: dayNumber(year, 12, 31) },
  ];
}

export function formatDate(n, { withYear = false } = {}) {
  const { y, m, d } = ymd(n);
  return `${d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ''}`;
}
