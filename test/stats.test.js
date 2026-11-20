import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeWrapped, defaultYear } from '../site/lib/stats.js';
import { buildSlides, cardFacts } from '../site/lib/slides.js';
import { demoYear, DEMO_YEAR } from '../site/lib/demo.js';
import { dayNumber, toISO, payday } from '../site/lib/dates.js';

const tx = (m, d, kr, refund = false) => ({ date: dayNumber(2026, m, d), kr, refund, store: 'Systembolaget 1404', time: null });

// Expectations below are worked out by hand from these rows.
const YEAR = [
  tx(1, 9, 300), tx(1, 16, 200), tx(3, 6, 400),
  tx(6, 18, 1000), tx(6, 26, 500), tx(6, 27, 100, true),
  tx(8, 1, 250), tx(8, 7, 150), tx(8, 7, 50),
];
const COVERAGE = { from: dayNumber(2026, 1, 1), to: dayNumber(2026, 11, 19) };

test('payday moves to the Friday before a weekend 25th', () => {
  assert.equal(toISO(payday(2026, 1)), '2026-01-23');
  assert.equal(toISO(payday(2026, 6)), '2026-06-25');
  assert.equal(toISO(payday(2026, 7)), '2026-07-24');
});

test('computeWrapped counts visits as days and nets refunds', () => {
  const s = computeWrapped(YEAR, { year: 2026, coverage: COVERAGE });
  assert.equal(s.visits, 7);
  assert.equal(s.purchases, 8);
  assert.equal(s.totalKr, 2750);
  assert.equal(s.refundKr, 100);
  assert.equal(s.topWeekday, 4);
  assert.equal(s.topMonth, 5);
  assert.equal(toISO(s.biggest.date), '2026-06-18');
  assert.equal(s.period.daysCovered, 323);
});

test('computeWrapped finds the pause, the rush and the streak', () => {
  const s = computeWrapped(YEAR, { year: 2026, coverage: COVERAGE });
  assert.deepEqual([s.pause.days, toISO(s.pause.from), toISO(s.pause.to)], [103, '2026-03-07', '2026-06-17']);
  assert.deepEqual([s.rush.visits, toISO(s.rush.from)], [2, '2026-08-01']);
  assert.equal(s.weekStreak, 2);
});

test('computeWrapped: payday share, holidays and dry January', () => {
  const s = computeWrapped(YEAR, { year: 2026, coverage: COVERAGE });
  assert.equal(s.paydayKr, 500);
  assert.ok(Math.abs(s.paydayShare - 500 / 2850) < 1e-9);
  assert.deepEqual(Object.fromEntries(s.seasons.map((x) => [x.key, x.state])), {
    pask: 'missed', valborg: 'missed', midsommar: 'earned', kraftskiva: 'earned', jul: 'upcoming', nyar: 'upcoming',
  });
  assert.equal(s.january, 2);
  assert.equal(s.persona, 'fredag');
});

test('an export that starts mid-year says nothing about what came before', () => {
  const since = (m, d) => YEAR.filter((t) => t.date >= dayNumber(2026, m, d));
  const march = computeWrapped(since(3, 1), { year: 2026, coverage: { from: dayNumber(2026, 3, 1), to: dayNumber(2026, 11, 19) } });
  assert.equal(march.january, null);
  assert.equal(march.seasons.find((x) => x.key === 'pask').state, 'missed');
  const june = computeWrapped(since(6, 1), { year: 2026, coverage: { from: dayNumber(2026, 6, 1), to: dayNumber(2026, 11, 19) } });
  assert.equal(june.seasons.find((x) => x.key === 'valborg').state, 'unknown');
  assert.equal(june.period.daysCovered, 172);
});

test('defaultYear skips a thin new year', () => {
  const rows = [...YEAR, { ...tx(1, 2, 99), date: dayNumber(2027, 1, 2) }];
  assert.equal(defaultYear(rows), 2026);
});

test('every slide reads cleanly for the sample year and the demo', () => {
  const demo = demoYear();
  const years = [
    computeWrapped(YEAR, { year: 2026, coverage: COVERAGE }),
    computeWrapped(demo.transactions, { year: DEMO_YEAR, coverage: demo.coverage }),
  ];
  for (const s of years) {
    const slides = buildSlides({ stats: s, year: s.year });
    assert.equal(slides.at(-1).id, 'summary');
    const text = JSON.stringify([slides, cardFacts({ stats: s, year: s.year })]);
    assert.doesNotMatch(text, /NaN|undefined|null kr|Infinity/);
  }
});

test('the demo year keeps the shape the seed was picked for', () => {
  const demo = demoYear();
  const s = computeWrapped(demo.transactions, { year: DEMO_YEAR, coverage: demo.coverage });
  assert.equal(s.persona, 'fredag');
  assert.ok(s.seasons.every((x) => x.state === 'earned'));
  assert.equal(toISO(s.biggest.date), '2025-06-19');
});
