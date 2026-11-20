// Everything the story shows, computed from purchases. Pure and clock-free:
// "today" only ever comes from the export's own dates.

import { dayNumber, ymd, weekdayIndex, daysSincePayday, seasonWindows } from './dates.js';

const round2 = (x) => Math.round(x * 100) / 100;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

// Calendar years present, newest first, with how many days had a purchase.
export function yearsIn(transactions) {
  const days = new Map();
  for (const t of transactions) {
    if (t.refund) continue;
    const { y } = ymd(t.date);
    if (!days.has(y)) days.set(y, new Set());
    days.get(y).add(t.date);
  }
  return [...days].map(([year, set]) => ({ year, visits: set.size })).sort((a, b) => b.year - a.year);
}

// The newest year with a real amount of data, so an export that starts on
// 28 December doesn't produce a wrap of three days.
export function defaultYear(transactions) {
  const years = yearsIn(transactions);
  if (!years.length) return null;
  const solid = years.find((y) => y.visits >= 5);
  if (solid) return solid.year;
  return [...years].sort((a, b) => b.visits - a.visits || b.year - a.year)[0].year;
}

function argmax(xs, tiebreak = xs) {
  let best = 0;
  for (let i = 1; i < xs.length; i++) {
    if (xs[i] > xs[best] || (xs[i] === xs[best] && tiebreak[i] > tiebreak[best])) best = i;
  }
  return best;
}

export function computeWrapped(transactions, { year, coverage = {} }) {
  const inYear = transactions.filter((t) => ymd(t.date).y === year);
  const purchases = inYear.filter((t) => !t.refund);
  const refundKr = round2(sum(inYear.filter((t) => t.refund).map((t) => t.kr)));

  const byDay = new Map();
  for (const t of purchases) {
    const day = byDay.get(t.date) || { date: t.date, kr: 0, count: 0 };
    day.kr = round2(day.kr + t.kr);
    day.count++;
    byDay.set(t.date, day);
  }
  const days = [...byDay.values()].sort((a, b) => a.date - b.date);
  const visits = days.length;
  if (!visits) return { year, visits: 0 };

  const grossKr = round2(sum(purchases.map((t) => t.kr)));
  const totalKr = round2(grossKr - refundKr);

  // The stretch of the year the export actually covers.
  const yearStart = dayNumber(year, 1, 1);
  const yearEnd = dayNumber(year, 12, 31);
  const from = Math.max(yearStart, Math.min(coverage.from ?? days[0].date, days[0].date));
  const to = Math.min(yearEnd, Math.max(coverage.to ?? days[visits - 1].date, days[visits - 1].date));
  const daysCovered = to - from + 1;
  const covers = (a, b) => from <= a && to >= b;

  const visitsByWeekday = Array(7).fill(0);
  const krByWeekday = Array(7).fill(0);
  const visitsByMonth = Array(12).fill(0);
  const krByMonth = Array(12).fill(0);
  for (const d of days) {
    const wd = weekdayIndex(d.date);
    const m = ymd(d.date).m - 1;
    visitsByWeekday[wd]++;
    krByWeekday[wd] = round2(krByWeekday[wd] + d.kr);
    visitsByMonth[m]++;
    krByMonth[m] = round2(krByMonth[m] + d.kr);
  }
  const topWeekday = argmax(visitsByWeekday, krByWeekday);
  const topMonth = argmax(krByMonth, visitsByMonth);

  const biggest = days.reduce((a, b) => (b.kr > a.kr ? b : a));
  const smallest = days.reduce((a, b) => (b.kr < a.kr ? b : a));
  const sortedKr = days.map((d) => d.kr).sort((a, b) => a - b);
  const medianKr = visits % 2 ? sortedKr[(visits - 1) / 2] : round2((sortedKr[visits / 2 - 1] + sortedKr[visits / 2]) / 2);

  // Longest stretch without a visit, between two visits.
  let pause = null;
  for (let i = 1; i < visits; i++) {
    const length = days[i].date - days[i - 1].date - 1;
    if (!pause || length > pause.days) pause = { days: length, from: days[i - 1].date + 1, to: days[i].date - 1 };
  }

  // Most visits inside any seven-day window.
  let rush = { visits: 0, from: days[0].date };
  for (let lo = 0, hi = 0; hi < visits; hi++) {
    while (days[hi].date - days[lo].date > 6) lo++;
    if (hi - lo + 1 > rush.visits) rush = { visits: hi - lo + 1, from: days[lo].date, to: days[hi].date };
  }

  // Longest run of consecutive Monday-to-Sunday weeks with a visit.
  const weeks = [...new Set(days.map((d) => Math.floor((d.date + 3) / 7)))].sort((a, b) => a - b);
  let streak = 1;
  let run = 1;
  for (let i = 1; i < weeks.length; i++) {
    run = weeks[i] === weeks[i - 1] + 1 ? run + 1 : 1;
    streak = Math.max(streak, run);
  }

  // Share of kronor spent on payday and the three days after it.
  const paydayKr = round2(sum(days.filter((d) => daysSincePayday(d.date) <= 3).map((d) => d.kr)));
  const paydayShare = grossKr ? paydayKr / grossKr : 0;

  const seasons = seasonWindows(year).map((w) => {
    const hit = days.filter((d) => d.date >= w.from && d.date <= w.to);
    let state = 'unknown';
    if (hit.length) state = 'earned';
    else if (covers(w.from, w.to)) state = 'missed';
    else if (w.from > to) state = 'upcoming';
    return { key: w.key, label: w.label, emoji: w.emoji, state, visits: hit.length, kr: round2(sum(hit.map((d) => d.kr))) };
  });
  const seasonKr = round2(sum(seasons.map((s) => s.kr)));

  const january = covers(yearStart, dayNumber(year, 1, 31)) ? visitsByMonth[0] : null;

  const stores = new Map();
  for (const t of purchases) stores.set(t.store, (stores.get(t.store) || 0) + 1);
  const storeList = [...stores].sort((a, b) => b[1] - a[1]);
  // "Systembolaget" alone, or the company name, says nothing about a store.
  const named = storeList.filter(([name]) => name.includes(' ') && !/^Systembolaget (AB|Se)$/i.test(name));
  const unnamed = purchases.length - named.reduce((n, [, count]) => n + count, 0);
  const topStore = named.length ? { name: named[0][0], visits: named[0][1], storeCount: named.length, unnamed } : null;

  const timed = purchases.filter((t) => t.time);
  let topHour = null;
  if (timed.length >= Math.max(3, purchases.length / 2)) {
    const hours = Array(24).fill(0);
    for (const t of timed) hours[Number(t.time.slice(0, 2))]++;
    topHour = argmax(hours);
  }

  const stats = {
    year,
    visits,
    purchases: purchases.length,
    totalKr,
    refundKr,
    avgKr: round2(totalKr / visits),
    avgPurchaseKr: round2(totalKr / purchases.length),
    medianKr,
    perDayKr: round2(totalKr / daysCovered),
    period: { from, to, daysCovered, fullYear: from === yearStart && to >= dayNumber(year, 12, 20) },
    visitsByWeekday,
    krByWeekday,
    topWeekday,
    weekdayShare: visitsByWeekday[topWeekday] / visits,
    fridayShare: visitsByWeekday[4] / visits,
    saturdayShare: visitsByWeekday[5] / visits,
    earlyWeekShare: (visitsByWeekday[0] + visitsByWeekday[1] + visitsByWeekday[2]) / visits,
    sundayVisits: visitsByWeekday[6],
    visitsByMonth,
    krByMonth,
    topMonth,
    biggest,
    smallest,
    first: days[0],
    last: days[visits - 1],
    pause,
    rush,
    weekStreak: streak,
    paydayKr,
    paydayShare,
    seasons,
    seasonShare: grossKr ? seasonKr / grossKr : 0,
    january,
    topStore,
    topHour,
  };
  stats.persona = persona(stats);
  return stats;
}

// Each persona scores how far past its own bar the year goes; the strongest
// wins, and "Lagomisten" takes whoever clears none.
const PERSONAS = [
  { key: 'sallan', score: (s) => (s.visits <= 6 ? 2 : 0) },
  { key: 'fredag', score: (s) => s.fridayShare / 0.4 },
  { key: 'lonehelg', score: (s) => s.paydayShare / 0.3 },
  { key: 'sasong', score: (s) => s.seasonShare / 0.35 },
  { key: 'storhandlare', score: (s) => (s.visits <= 30 ? s.avgKr / 600 : 0) },
  { key: 'stamgast', score: (s) => s.visits / (s.period.daysCovered / 7) / 1.5 },
  { key: 'planerare', score: (s) => s.earlyWeekShare / 0.45 },
  { key: 'lordag', score: (s) => s.saturdayShare / 0.35 },
  { key: 'enflaska', score: (s) => (s.visits >= 12 ? 150 / Math.max(s.avgKr, 1) : 0) },
];

export function persona(stats) {
  let best = { key: 'lagom', score: 0 };
  for (const p of PERSONAS) {
    const score = p.score(stats);
    if (score >= 1 && score > best.score) best = { key: p.key, score };
  }
  return best.key;
}
