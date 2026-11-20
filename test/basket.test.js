import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basketStats, emptyBasket, unitsText, CATEGORIES } from '../site/lib/basket.js';
import { buildSlides, cardFacts } from '../site/lib/slides.js';
import { computeWrapped } from '../site/lib/stats.js';
import { demoYear, DEMO_YEAR, DEMO_BASKET } from '../site/lib/demo.js';

const fill = (picks, favorite = '') => {
  const b = emptyBasket();
  for (const [key, count, per] of picks) b.items[key] = { count, per };
  b.favorite = favorite;
  return b;
};

test('an empty basket is nothing, a favourite alone is something', () => {
  assert.equal(basketStats(emptyBasket()), null);
  const onlyFavourite = basketStats(fill([], '  Amarone  '));
  assert.equal(onlyFavourite.units, 0);
  assert.equal(onlyFavourite.favorite, 'Amarone');
});

test('counts become yearly units, litres and an estimate', () => {
  // 2 bottles of red a month, a beer can a week, one 3-litre box a year.
  const b = basketStats(fill([['rott', 2, 'manad'], ['ol', 1, 'vecka'], ['box', 1, 'ar']]));
  assert.equal(b.units, 24 + 52 + 1);
  assert.equal(b.litres, 24 * 0.75 + 52 * 0.5 + 3);
  assert.deepEqual(b.top.map((r) => r.key), ['ol', 'rott', 'box']);
  assert.equal(b.wineLitres, 18 + 3);
  assert.equal(b.boxShare, 3 / 21);
  const kr = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.kr]));
  assert.equal(b.estimateKr, 24 * kr.rott + 52 * kr.ol + kr.box);
});

test('personas follow the basket', () => {
  assert.equal(basketStats(DEMO_BASKET).persona, 'boxbaron');
  assert.equal(basketStats(fill([['rott', 3, 'manad'], ['vitt', 1, 'ar']])).persona, 'rodvin');
  assert.equal(basketStats(fill([['ol', 6, 'vecka'], ['rott', 1, 'manad']])).persona, 'olentusiast');
  assert.equal(basketStats(fill([['alkfri', 4, 'manad'], ['rott', 1, 'manad']])).persona, 'alkfri');
  assert.equal(basketStats(fill([['gin', 2, 'ar'], ['rom', 1, 'ar'], ['whisky', 1, 'ar']])).persona, 'bartender');
  // Three bottles of red a year clears no bar at all.
  assert.equal(basketStats(fill([['rott', 3, 'ar']])).persona, 'lagom');
});

test('unitsText picks singular or plural', () => {
  const box = CATEGORIES.find((c) => c.key === 'box');
  assert.equal(unitsText(box, 1), '1 box');
  assert.equal(unitsText(box, 12), '12 boxar');
});

test('a basket alone makes a short story with its own card', () => {
  const b = basketStats(DEMO_BASKET);
  const slides = buildSlides({ basket: b, year: 2026 });
  assert.deepEqual(slides.map((s) => s.id), ['intro', 'haul', 'top', 'litres', 'wine', 'favorite', 'persona', 'summary']);
  assert.equal(slides[0].title, 'Ditt 2026 på Bolaget');
  const card = cardFacts({ basket: b, year: 2026 });
  assert.equal(card.persona, 'Boxbaronen');
  assert.deepEqual(card.rows.map(([k]) => k), ['Topp 1', 'Flaskor & burkar', 'Årets dryck', 'Liter', 'Mest vin', 'Ur box']);
});

test('basket and bank together add the reconciliation and keep both personas', () => {
  const year = demoYear();
  const stats = computeWrapped(year.transactions, { year: DEMO_YEAR, coverage: year.coverage });
  const b = basketStats(DEMO_BASKET);
  const slides = buildSlides({ stats, basket: b, year: DEMO_YEAR, demo: true });
  const ids = slides.map((s) => s.id);
  assert.ok(ids.includes('reconcile') && ids.includes('visits') && ids.includes('haul'));
  assert.ok(!ids.includes('store'));
  const persona = slides.find((s) => s.id === 'persona');
  assert.equal(persona.theme, 'blabar');
  assert.ok(persona.traits.includes('Bolagsvana: Fredagsritualisten'));
  const reconcile = slides.find((s) => s.id === 'reconcile');
  assert.equal(reconcile.big.value, Math.round((b.estimateKr / stats.totalKr) * 100));
  const text = JSON.stringify([slides, cardFacts({ stats, basket: b, year: DEMO_YEAR })]);
  assert.doesNotMatch(text, /NaN|undefined|null kr|Infinity/);
});
