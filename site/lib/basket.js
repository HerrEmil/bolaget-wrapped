// The basket: what someone says they bought this year, per category, and
// what it adds up to. Container sizes are the usual ones. Prices are our own
// rough typical prices, used only to estimate how much of a bank total the
// basket explains, and always shown as an estimate.

export const PER = { vecka: 52, manad: 12, ar: 1 };
export const PER_LABEL = { vecka: 'i veckan', manad: 'i månaden', ar: 'om året' };

const bottle = { one: 'flaska', many: 'flaskor' };
const can = { one: 'burk', many: 'burkar' };

export const CATEGORIES = [
  { key: 'rott', label: 'Rött vin', size: 'flaska 75 cl', litres: 0.75, kr: 129, emoji: '🍷', family: 'vin', per: 'manad', ...bottle },
  { key: 'vitt', label: 'Vitt vin', size: 'flaska 75 cl', litres: 0.75, kr: 119, emoji: '🥂', family: 'vin', per: 'manad', ...bottle },
  { key: 'rose', label: 'Rosé', size: 'flaska 75 cl', litres: 0.75, kr: 109, emoji: '🌸', family: 'vin', per: 'ar', ...bottle },
  { key: 'bubbel', label: 'Bubbel', size: 'flaska 75 cl', litres: 0.75, kr: 139, emoji: '🍾', family: 'vin', per: 'ar', ...bottle },
  { key: 'box', label: 'Bag-in-box', size: 'box 3 liter', litres: 3, kr: 299, emoji: '🧃', family: 'vin', per: 'ar', one: 'box', many: 'boxar' },
  { key: 'ol', label: 'Öl', size: 'burk 50 cl', litres: 0.5, kr: 19, emoji: '🍺', family: 'ol', per: 'vecka', ...can },
  { key: 'ipa', label: 'Hantverksöl', size: 'flaska 33 cl', litres: 0.33, kr: 32, emoji: '🍻', family: 'ol', per: 'manad', ...bottle },
  { key: 'cider', label: 'Cider', size: 'burk 33 cl', litres: 0.33, kr: 22, emoji: '🍏', family: 'ol', per: 'manad', ...can },
  { key: 'whisky', label: 'Whisky', size: 'flaska 70 cl', litres: 0.7, kr: 449, emoji: '🥃', family: 'sprit', per: 'ar', ...bottle },
  { key: 'gin', label: 'Gin', size: 'flaska 70 cl', litres: 0.7, kr: 349, emoji: '🍸', family: 'sprit', per: 'ar', ...bottle },
  { key: 'vodka', label: 'Vodka och snaps', size: 'flaska 70 cl', litres: 0.7, kr: 249, emoji: '🧊', family: 'sprit', per: 'ar', ...bottle },
  { key: 'rom', label: 'Rom', size: 'flaska 70 cl', litres: 0.7, kr: 329, emoji: '🏴‍☠️', family: 'sprit', per: 'ar', ...bottle },
  { key: 'likor', label: 'Likör', size: 'flaska 50 cl', litres: 0.5, kr: 249, emoji: '🍫', family: 'sprit', per: 'ar', ...bottle },
  { key: 'glogg', label: 'Glögg', size: 'flaska 75 cl', litres: 0.75, kr: 99, emoji: '⭐', family: 'glogg', per: 'ar', ...bottle },
  { key: 'alkfri', label: 'Alkoholfritt', size: 'flaska eller burk', litres: 0.5, kr: 39, emoji: '🫧', family: 'alkfri', per: 'manad', one: 'st', many: 'st' },
];

export const emptyBasket = () => ({
  items: Object.fromEntries(CATEGORIES.map((c) => [c.key, { count: 0, per: c.per }])),
  favorite: '',
});

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

export function basketStats(basket) {
  const rows = CATEGORIES.map((c) => {
    const pick = basket.items[c.key] ?? { count: 0, per: c.per };
    const units = Math.max(0, Math.round(pick.count)) * PER[pick.per];
    return { ...c, unitLitres: c.litres, units, litres: units * c.litres, estimateKr: units * c.kr };
  }).filter((r) => r.units > 0);
  const favorite = String(basket.favorite ?? '').trim().slice(0, 40);
  if (!rows.length) return favorite ? { rows, units: 0, favorite } : null;

  const units = sum(rows.map((r) => r.units));
  const litres = sum(rows.map((r) => r.litres));
  const top = [...rows].sort((a, b) => b.units - a.units || b.litres - a.litres);
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  const family = (f) => rows.filter((r) => r.family === f);
  const wine = family('vin');
  const wineLitres = sum(wine.map((r) => r.litres));

  const stats = {
    rows,
    units,
    litres,
    top,
    favorite,
    estimateKr: sum(rows.map((r) => r.estimateKr)),
    wine: wine.map((r) => ({ key: r.key, label: r.label, litres: r.litres, share: r.litres / wineLitres })),
    wineLitres,
    beerLitres: sum(family('ol').map((r) => r.litres)),
    spiritKinds: family('sprit').length,
    boxShare: wineLitres ? (byKey.box?.litres ?? 0) / wineLitres : 0,
    // Wine personas only count fully when wine is a real part of the basket.
    wineWeight: Math.min(1, wineLitres / (0.25 * litres)),
    unitShare: (key) => (byKey[key]?.units ?? 0) / units,
    wineShare: (key) => (wineLitres ? (byKey[key]?.litres ?? 0) / wineLitres : 0),
    familyUnits: (f) => sum(family(f).map((r) => r.units)),
    count: (key) => byKey[key]?.units ?? 0,
  };
  stats.persona = basketPersona(stats);
  return stats;
}

// Same rule as the bank personas: each scores how far past its own bar the
// basket goes, the strongest wins, and Lagomisten takes whoever clears none.
const BASKET_PERSONAS = [
  { key: 'alkfri', score: (b) => b.unitShare('alkfri') / 0.4 },
  { key: 'boxbaron', score: (b) => (b.wineLitres >= 6 ? (b.boxShare / 0.4) * b.wineWeight : 0) },
  { key: 'bubbel', score: (b) => (b.count('bubbel') >= 4 ? (b.wineShare('bubbel') / 0.25) * b.wineWeight : 0) },
  { key: 'roseromantiker', score: (b) => (b.count('rose') >= 4 ? (b.wineShare('rose') / 0.3) * b.wineWeight : 0) },
  { key: 'vittvin', score: (b) => (b.count('vitt') >= 6 ? (b.wineShare('vitt') / 0.5) * b.wineWeight : 0) },
  { key: 'rodvin', score: (b) => (b.count('rott') >= 6 ? (b.wineShare('rott') / 0.6) * b.wineWeight : 0) },
  { key: 'humle', score: (b) => (b.count('ipa') >= 12 ? (b.count('ipa') / (b.count('ol') + b.count('ipa'))) / 0.5 : 0) },
  { key: 'olentusiast', score: (b) => b.familyUnits('ol') / b.units / 0.7 },
  { key: 'bartender', score: (b) => b.spiritKinds / 3 },
  { key: 'glogg', score: (b) => b.count('glogg') / 6 },
  { key: 'allatare', score: (b) => b.rows.length / 7 },
];

export function basketPersona(b) {
  let best = { key: 'lagom', score: 0 };
  for (const p of BASKET_PERSONAS) {
    const score = p.score(b);
    if (score >= 1 && score > best.score) best = { key: p.key, score };
  }
  return best.key;
}

// "24 burkar", "1 box", "12 st"
export function unitsText(row, units = row.units) {
  return `${Math.round(units).toLocaleString('sv-SE')} ${units === 1 ? row.one : row.many}`;
}
