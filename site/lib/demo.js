// A made-up year for "Visa ett exempel": Friday-heavy, payday bumps, the big
// holidays, a half-hearted dry January and a July away. Seeded and pinned to a
// finished year, so the demo is the same for everyone on any date.

import { dayNumber, ymd, weekdayIndex, daysSincePayday, seasonWindows, closedDays } from './dates.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Picked by trying seeds until the demo showed off most slides: a Friday
// persona, every holiday, the biggest round the Thursday before midsommar.
export const DEMO_YEAR = 2025;
export const DEMO_SEED = 7132;

const PRICES = [24.9, 29.9, 34.9, 89, 99, 109, 119, 129, 139, 149, 159, 179, 199, 229, 249, 279, 299, 349, 399];
// Monday to Sunday; stores are closed on Sundays.
const WEEKDAY_ODDS = [0.04, 0.05, 0.07, 0.12, 0.36, 0.16, 0];

export function demoYear(year = DEMO_YEAR, until = Infinity, seed = DEMO_SEED) {
  const rand = mulberry32(seed + year);
  const closed = closedDays(year);
  const start = dayNumber(year, 1, 1);
  const end = Math.min(dayNumber(year, 12, 31), until);
  const windows = seasonWindows(year);
  const transactions = [];
  for (let n = start; n <= end; n++) {
    let odds = WEEKDAY_ODDS[weekdayIndex(n)];
    if (!odds || closed.has(n)) continue;
    const { m, d } = ymd(n);
    const season = windows.find((w) => n >= w.from && n <= w.to);
    if (daysSincePayday(n) <= 3) odds *= 1.9;
    if (season) odds *= season.key === 'kraftskiva' ? 1.6 : 3.2;
    if (m === 1 && d < 25) odds *= 0.25;
    if (m === 7 && d >= 6 && d <= 26) odds *= 0.4;
    if (rand() >= Math.min(odds, 0.9)) continue;
    let items = 1 + Math.floor(rand() * 3);
    if (season && season.key !== 'kraftskiva') items += 2 + Math.floor(rand() * 3);
    if (rand() < 0.03) items += 6;
    let kr = 0;
    for (let i = 0; i < items; i++) kr += PRICES[Math.floor(rand() * PRICES.length)];
    transactions.push({
      date: n,
      kr: Math.round(kr * 100) / 100,
      refund: false,
      store: rand() < 0.85 ? 'Systembolaget Storgatan' : 'Systembolaget Centrum',
      time: null,
    });
  }
  return { transactions, coverage: { from: start, to: end } };
}

// The example basket that goes with the example year: a Boxbaron who also
// buys a lot of beer, with an Amarone as the drink of the year.
export const DEMO_BASKET = {
  items: {
    rott: { count: 2, per: 'manad' },
    vitt: { count: 1, per: 'manad' },
    bubbel: { count: 5, per: 'ar' },
    box: { count: 12, per: 'ar' },
    ol: { count: 4, per: 'vecka' },
    ipa: { count: 2, per: 'manad' },
    glogg: { count: 3, per: 'ar' },
    alkfri: { count: 2, per: 'manad' },
  },
  favorite: 'Den där Amaronen',
};
