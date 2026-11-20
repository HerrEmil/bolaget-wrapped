// Stats → the slides of the story, in Swedish. Pure: each slide is plain data
// that app.js renders. A slide builder returns null when the year doesn't
// have what that slide needs. `stats` comes from a bank export and `basket`
// from what the visitor says they bought; either one can be missing.
// Persona titles carry soft hyphens (­) so long compounds break where
// Swedish breaks them.

import {
  WEEKDAYS, WEEKDAYS_SHORT, MONTHS, MONTHS_SHORT, dayNumber, weekdayIndex,
  seasonWindows, midsommarafton, formatDate,
} from './dates.js';
import { kr, krExact, num, pct, capitalise, ordinal, plural } from './format.js';
import { unitsText } from './basket.js';

export const PERSONAS = {
  // From the bank export: when and how you shop.
  fredag: {
    theme: 'pink',
    title: 'Fredags­ritualisten',
    text: 'För dig är fredag inte en veckodag. Det är en tradition, och traditioner ska man vårda.',
  },
  lonehelg: {
    theme: 'mint',
    title: 'Lönehelgs­firaren',
    text: 'Den 25:e är din högtidsdag. Lönen landar och du vet precis vart den ska.',
  },
  sasong: {
    theme: 'aperol',
    title: 'Högtids­firaren',
    text: 'Du handlar inte för att det är fredag. Du handlar för att det är påsk. Och midsommar. Och kräftskiva. Och jul.',
  },
  storhandlare: {
    theme: 'gin',
    title: 'Stor­handlaren',
    text: 'Du går sällan, men när du går, då går du. Korgen full, och sedan dröjer det.',
  },
  stamgast: {
    theme: 'glogg',
    title: 'Stamgästen',
    text: 'Personalen nickar igenkännande när du kliver in. Du hittar rätt hylla med slutna ögon.',
  },
  planerare: {
    theme: 'tonic',
    title: 'Planeraren',
    text: 'Du handlar i början av veckan, när kön är kort och hyllorna fulla. Det är du som har kylt vinet i tid.',
  },
  lordag: {
    theme: 'lime',
    title: 'Lördags­räddaren',
    text: 'Lördag, när alla andra redan har handlat. Du gillar att leva lite på kanten.',
  },
  enflaska: {
    theme: 'champagne',
    title: 'Enflaske­köparen',
    text: 'En flaska i taget, aldrig mer än du behöver. Du handlar på Bolaget som andra köper bröd.',
  },
  sallan: {
    theme: 'midnatt',
    title: 'Den sällsynta gästen',
    text: 'Du syns inte ofta på Bolaget. Men när du väl kommer är det något speciellt.',
  },
  // From the basket: what you buy.
  alkfri: {
    theme: 'tonic',
    title: 'Alkoholfria ambassadören',
    text: 'Du går till Bolaget och kommer hem med alkoholfritt. Det kräver karaktär, och den har du.',
  },
  boxbaron: {
    theme: 'blabar',
    title: 'Box­baronen',
    text: 'Varför bära hem flaskor när man kan bära hem en kartong? Du har förstått något som vi andra bara anar.',
  },
  bubbel: {
    theme: 'champagne',
    title: 'Bubbel­entusiasten',
    text: 'Hos dig behövs ingen anledning för att korka upp. En tisdag räcker gott.',
  },
  roseromantiker: {
    theme: 'rose',
    title: 'Rosé­romantikern',
    text: 'Du lever i en evig sommar, åtminstone i glaset.',
  },
  vittvin: {
    theme: 'lime',
    title: 'Vittvins­vännen',
    text: 'Friskt, kylt och gärna i solen. Du vet hur ett glas ska kännas.',
  },
  rodvin: {
    theme: 'glogg',
    title: 'Rödvins­klassikern',
    text: 'Ett glas rött till maten, och kanske ett till efteråt. Du håller traditionen vid liv.',
  },
  humle: {
    theme: 'mint',
    title: 'Humle­nörden',
    text: 'Du vet skillnaden på en NEIPA och en West Coast IPA, och du berättar gärna om den.',
  },
  olentusiast: {
    theme: 'lager',
    title: 'Öl­entusiasten',
    text: 'Ölen är din trogna följeslagare. Kall, enkel och alltid pålitlig.',
  },
  bartender: {
    theme: 'gin',
    title: 'Hemma­bartendern',
    text: 'Gin, rom och whisky i skåpet. Hos dig blir det drinkar, inte bara glas.',
  },
  glogg: {
    theme: 'midnatt',
    title: 'Glögg­mästaren',
    text: 'Jul är ingen högtid för dig. Det är en säsong, och den är lång.',
  },
  allatare: {
    theme: 'pink',
    title: 'Allätaren',
    text: 'Lite av allt och aldrig tråkigt. Din korg är en hel smakresa.',
  },
  lagom: {
    theme: 'aperol',
    title: 'Lagomisten',
    text: 'Inte för ofta, inte för sällan. Inte för dyrt, inte för billigt. Helt enkelt lagom. Väldigt svenskt av dig.',
  },
};

const plainTitle = (key) => PERSONAS[key].title.replace(/­/g, '');

// Systembolaget's own figures, checked 2026-11-20:
// - 128 million store visits and an average purchase of 304 kr in 2025
//   (omsystembolaget.se/foretagsfakta/systembolaget-i-siffror/)
// - 1 095 713 customers on Thursday 19 June 2025, the day before midsommarafton
//   (omsystembolaget.se/globalassets/pdf/forsaljningsstatistik/midsommar2025.pdf)
// - an average week in 2024 had about 700 000 customers on the Friday, far
//   more than on any other day (same PDF, and the påsk 2025 one)
// - stores are closed every Sunday
const VISITS_2025 = '128 miljoner';
const AVG_PURCHASE_2025 = 304;
const MIDSOMMAR_THURSDAY_2025 = 1095713;

const WEEKDAY_LINES = [
  'Måndag. Antingen är du väldigt planerad, eller så var helgen väldigt lång.',
  'Tisdag. Kort kö och fulla hyllor. Du har knäckt koden.',
  'Onsdag. Lillördag, och du tar det bokstavligt.',
  'Torsdag. Smart drag: du slår fredagsrusningen med ett dygn.',
  'Fredag. Såklart. Du och typ hela Sverige.',
  'Lördag. Du gillar att leva lite på kanten.',
  'Söndag? Bolaget har ju stängt då. Din bank har nog bokfört köpen några dagar sent.',
];

const MONTH_LINES = [
  'Januari. Så mycket för torrjanuari.',
  'Februari. Årets mörkaste månad behövde tydligen förstärkning.',
  'Mars. Våren kom, och det gjorde du också.',
  'April. Påsk och valborg i samma månad. Det förklarar saken.',
  'Maj. Grillsäsongen är officiellt öppnad.',
  'Juni. Midsommar, studenter och ljusa nätter. Helt förståeligt.',
  'Juli. Semester, och det märktes.',
  'Augusti. Kräftorna ska ju simma.',
  'September. Höstmörkret kom, men du var förberedd.',
  'Oktober. Mysig höst, eller hur?',
  'November. Ingen vet riktigt varför, men okej.',
  'December. Glögg, julbord och nyår. Klassiker.',
];

const TOP_LINES = {
  rott: 'Rött vin i topp. Klassiskt, och lite fredagsmys.',
  vitt: 'Vitt vin i topp. Friskt och somrigt, året runt.',
  rose: 'Rosé i topp. Du lever i en evig sommar.',
  bubbel: 'Bubbel i topp. Hos dig behövs ingen anledning.',
  box: 'Boxen i topp. Praktiskt, prisvärt och alltid till hands.',
  ol: 'Ölen i topp. Kall, enkel och pålitlig.',
  ipa: 'Hantverksöl i topp. Du vet vad en humlesort heter.',
  cider: 'Cider i topp. Sött, fruktigt och lite nostalgiskt.',
  whisky: 'Whisky i topp. Rökigt, eller hur?',
  gin: 'Gin i topp. Tonicen tackar.',
  vodka: 'Vodka och snaps i topp. Någon planerar en kräftskiva.',
  rom: 'Rom i topp. Yo-ho-ho.',
  likor: 'Likör i topp. Efterrätt i flytande form.',
  glogg: 'Glögg i topp. Det är jul hela året hos dig.',
  alkfri: 'Alkoholfritt i topp. Bolaget är till för alla, och du bevisar det.',
};

const WINE_LINES = {
  rott: 'Rött vinner. Klassiskt, och lite fredagsmys.',
  vitt: 'Vitt vinner. Friskt, kylt och gärna i solen.',
  rose: 'Rosé vinner. Du lever i en evig sommar.',
  bubbel: 'Bubbel vinner. Varje dag är en fest hos dig.',
  box: 'Boxen vinner. Praktiskt, prisvärt och alltid till hands.',
};
const WINE_SHORT = { rott: 'rött', vitt: 'vitt', rose: 'rosé', bubbel: 'bubbel', box: 'box' };
const WINE_BIG = { rott: 'Rött', vitt: 'Vitt', rose: 'Rosé', bubbel: 'Bubbel', box: 'Boxvin' };

const SEASON_LINES = {
  pask: 'Påskveckan. Påskmust räcker uppenbarligen inte till alla.',
  valborg: 'Valborgsveckan. Våren firar inte sig själv.',
  kraftskiva: 'Kräftskivetider. Kräftorna ska ju simma.',
  jul: 'Julveckan. Glöggen köper inte sig själv.',
  nyar: 'Mellandagarna. Nyårsafton förbereder sig inte själv.',
};

function intro(s, b, ctx) {
  let line = 'Vi har packat upp korgen du fyllde i. Ingen annan har sett den.';
  if (s) line = 'Vi har gått igenom dina kvitton. Eller, din webbläsare har. Ingen annan har sett något.';
  if (ctx.demo) line = 'Det här är ett påhittat exempel. Fyll din egen korg för att se ditt riktiga år.';
  return {
    id: 'intro',
    theme: 'porter',
    kicker: 'Dags att packa upp',
    title: `Ditt ${ctx.year} på Bolaget`,
    lines: [line],
    footnote: s && !s.period.fullYear ? `Kontoutdraget gäller köp ${formatDate(s.period.from)} – ${formatDate(s.period.to)}.` : null,
    duration: 6000,
  };
}

function haul(b) {
  const perWeek = b.units / 52;
  let line = 'Mindre än en i veckan. Du tar det i lagom takt.';
  if (perWeek >= 7) line = 'Mer än en om dagen. Vi hoppas att du bjuder ofta.';
  else if (perWeek >= 3) line = 'Flera i veckan. Du har uppenbarligen många vänner.';
  else if (perWeek >= 1) line = 'Ett par i veckan. Helt rimligt, tycker vi.';
  return {
    id: 'haul',
    theme: 'lager',
    kicker: 'I år bar du hem',
    big: { value: b.units, unit: b.count('box') ? 'flaskor, burkar och boxar' : 'flaskor och burkar' },
    lines: [line],
    aside: 'Allt enligt dig själv, förstås.',
  };
}

function topList(b) {
  return {
    id: 'top',
    theme: 'gin',
    kicker: 'Din topplista',
    list: b.top.slice(0, 5).map((r) => ({ emoji: r.emoji, label: r.label, note: unitsText(r) })),
    lines: [TOP_LINES[b.top[0].key]],
    duration: 9000,
  };
}

function litres(b) {
  if (b.litres < 1) return null;
  const parts = [];
  if (b.wineLitres >= 1) parts.push(`Vin: ${num(b.wineLitres)} liter.`);
  if (b.beerLitres >= 1) parts.push(`Öl och cider: ${num(b.beerLitres)} liter.`);
  return {
    id: 'litres',
    theme: 'tonic',
    kicker: 'Omräknat i liter',
    big: { value: Math.round(b.litres), unit: 'liter' },
    lines: [`Lika mycket som ${num(b.litres)} mjölkpaket. Om du inte bjöd någon, förstås.`],
    aside: parts.join(' ') || null,
  };
}

function wine(b) {
  if (b.wineLitres < 3 || b.wine.length < 2) return null;
  const top = [...b.wine].sort((x, y) => y.litres - x.litres)[0];
  const bars = Object.keys(WINE_SHORT).map((key) => {
    const w = b.wine.find((x) => x.key === key);
    return { label: WINE_SHORT[key], value: w ? Math.round(w.litres * 10) / 10 : 0, highlight: w === top };
  });
  let box = 'Inte en enda box. Du har principer.';
  if (b.boxShare >= 0.5) box = `${capitalise(pct(b.boxShare))} av vinet kom ur en box. Varför bära flaskor?`;
  else if (b.boxShare >= 0.2) box = `${capitalise(pct(b.boxShare))} av vinet kom ur en box. En sund blandning.`;
  else if (b.boxShare > 0) box = 'Mest flaskor, men en box här och där.';
  return {
    id: 'wine',
    theme: 'rose',
    kicker: 'Ditt vin',
    big: { text: WINE_BIG[top.key] },
    sub: `${pct(top.share)} av vinet, räknat i liter`,
    chart: { label: 'Vin i liter', bars, unit: 'liter' },
    lines: [WINE_LINES[top.key]],
    aside: box,
  };
}

function favorite(b) {
  return {
    id: 'favorite',
    theme: 'champagne',
    kicker: 'Årets dryck',
    big: { text: b.favorite },
    lines: ['Enligt dig själv, och vi har ingen anledning att tvivla.'],
    duration: 6000,
  };
}

// The basket priced at rough typical prices, against the bank's real total.
function reconcile(s, b) {
  const share = b.estimateKr / s.totalKr;
  let line = 'Du har glömt en hel del, eller så handlar du dyrt. Vi frågar inte.';
  if (share > 1.2) line = 'Korgen är dyrare än kontoutdraget. Antingen betalade någon annan, eller så minns du generöst.';
  else if (share >= 0.8) line = 'Det stämmer förvånansvärt bra. Du har koll på läget.';
  else if (share >= 0.5) line = 'Resten? Vi frågar inte.';
  return {
    id: 'reconcile',
    theme: 'lime',
    kicker: 'Korgen mot kontot',
    big: { value: Math.round(share * 100), unit: '%' },
    sub: `av dina ${kr(s.totalKr)} på Bolaget förklaras av korgen`,
    lines: [line],
    footnote: 'Uppskattat med ungefärliga typpriser, till exempel 129 kr för en flaska rött och 19 kr för en burk öl.',
  };
}

function visits(s) {
  const perWeek = s.visits / (s.period.daysCovered / 7);
  const every = Math.max(1, Math.round(s.period.daysCovered / s.visits));
  let rhythm = `Ett besök var ${ordinal(every)} dag.`;
  if (every === 1) rhythm = 'Ett besök om dagen. Varje dag.';
  if (every === 2) rhythm = 'Ett besök varannan dag.';
  let line = 'Inte så ofta. Bolaget undrar säkert vart du tog vägen.';
  if (perWeek >= 2) line = 'Mer än två gånger i veckan. Personalen har säkert ett smeknamn på dig.';
  else if (perWeek >= 0.9) line = 'Ungefär en gång i veckan. Som ett gymkort, fast du faktiskt använde det.';
  else if (perWeek >= 0.45) line = 'Ungefär varannan vecka. Lagom är bäst, som man säger.';
  else if (perWeek >= 0.2) line = 'Ungefär en gång i månaden. Du vet vad du vill ha.';
  return {
    id: 'visits',
    theme: 'lager',
    kicker: 'I år gick du till Bolaget',
    big: { value: s.visits, unit: s.visits === 1 ? 'gång' : 'gånger' },
    lines: [line, rhythm],
    aside: s.year === 2025
      ? `Hela Sverige gjorde ${VISITS_2025} besök på Bolaget under 2025. ${num(s.visits)} av dem var dina.`
      : `Hela Sverige gjorde ${VISITS_2025} besök på Bolaget under 2025. Du gör ditt för statistiken.`,
  };
}

function total(s) {
  const pizzas = Math.round(s.totalKr / 130);
  const lines = [`Det blir ${kr(s.perDayKr)} om dagen, eller ${kr(s.perDayKr * 7)} i veckan.`];
  if (pizzas >= 2) lines.push(`Eller ${num(pizzas)} kebabpizzor, om vi räknar 130 kr styck.`);
  return {
    id: 'total',
    theme: 'rose',
    kicker: 'Totalt lämnade du',
    big: { value: Math.round(s.totalKr), unit: 'kr' },
    lines,
    aside: `Ditt snittköp: ${kr(s.avgPurchaseKr)}. Sveriges snitt 2025: ${kr(AVG_PURCHASE_2025)}.`,
    footnote: s.refundKr > 0 ? `Returer på ${krExact(s.refundKr)} är redan avdragna.` : null,
  };
}

function weekday(s) {
  const bars = s.visitsByWeekday
    .map((value, i) => ({ label: WEEKDAYS_SHORT[i], value, highlight: i === s.topWeekday }))
    .filter((bar, i) => i < 6 || bar.value > 0);
  return {
    id: 'weekday',
    theme: 'gin',
    kicker: 'Din Bolagsdag',
    big: { text: capitalise(WEEKDAYS[s.topWeekday]) },
    sub: `${pct(s.weekdayShare)} av dina besök`,
    chart: { label: 'Besök per veckodag', bars },
    lines: [WEEKDAY_LINES[s.topWeekday]],
    aside: s.topWeekday === 4
      ? 'En vanlig vecka 2024 handlade runt 700\u00a0000 personer på Bolaget på fredagen. Betydligt fler än någon annan dag.'
      : null,
    footnote: s.sundayVisits && s.topWeekday !== 6
      ? 'Söndagsköpen är bankens bokföringsdagar, inte dina. Bolaget har stängt på söndagar.'
      : null,
  };
}

function month(s) {
  const first = new Date(s.period.from * 86400000).getUTCMonth();
  const last = new Date(s.period.to * 86400000).getUTCMonth();
  const bars = s.krByMonth.map((value, i) => ({
    label: MONTHS_SHORT[i],
    value,
    highlight: i === s.topMonth,
    faded: i < first || i > last,
  }));
  return {
    id: 'month',
    theme: 'glogg',
    kicker: 'Din största månad',
    big: { text: capitalise(MONTHS[s.topMonth]) },
    sub: `${kr(s.krByMonth[s.topMonth])} på ${plural(s.visitsByMonth[s.topMonth], 'besök', 'besök')}`,
    chart: { label: 'Kronor per månad', bars, unit: 'kr' },
    lines: [MONTH_LINES[s.topMonth]],
  };
}

function biggest(s) {
  const b = s.biggest;
  const wd = WEEKDAYS[weekdayIndex(b.date)];
  const season = seasonWindows(s.year).find((w) => b.date >= w.from && b.date <= w.to);
  let line = `En helt vanlig ${wd}. Vi har bara en fråga: vad firade du?`;
  if (b.kr >= 1000) line = `En helt vanlig ${wd}. Någon hade fest, och vi hoppas att du var bjuden.`;
  if (season?.key === 'midsommar') {
    const n = midsommarafton(s.year) - b.date;
    if (n <= 0) line = 'Midsommarafton. Vi säger inget mer.';
    else if (n === 1) line = `Dagen före midsommarafton, Bolagets kanske största dag. 2025 kom ${num(MIDSOMMAR_THURSDAY_2025)} kunder då.`;
    else line = `${capitalise(num(n))} dagar före midsommarafton. Vi behöver inte säga mer.`;
  } else if (season) line = SEASON_LINES[season.key];
  let small = 'Även ditt minsta köp var ett riktigt köp.';
  if (s.smallest.kr < 40) small = 'En ensam lättöl?';
  else if (s.smallest.kr < 120) small = 'In och ut på fem minuter.';
  return {
    id: 'biggest',
    theme: 'champagne',
    kicker: 'Din största Bolagsrunda',
    big: { value: Math.round(b.kr), unit: 'kr' },
    sub: `${capitalise(wd)} ${formatDate(b.date)}${b.count > 1 ? `, ${plural(b.count, 'köp', 'köp')}` : ''}`,
    lines: [line],
    aside: s.visits > 1 ? `Minsta köpet: ${krExact(s.smallest.kr)}. ${small}` : null,
  };
}

function overlap(a, b, from, to) {
  return Math.max(0, Math.min(b, to) - Math.max(a, from) + 1);
}

function pause(s) {
  const p = s.pause;
  if (!p || p.days < 3) return null;
  const january = overlap(p.from, p.to, dayNumber(s.year, 1, 1), dayNumber(s.year, 1, 31));
  const july = overlap(p.from, p.to, dayNumber(s.year, 7, 1), dayNumber(s.year, 7, 31));
  let line = 'Inte så länge. Du är konsekvent, det ska du ha.';
  if (january >= 31) line = 'Hela januari utan Bolaget. Torrjanuari: klarad. Imponerande.';
  else if (january >= 18) line = 'Torrjanuari? Nästan, i alla fall. Det räknas.';
  else if (july >= 18) line = 'Mitt i sommaren. Semester, eller bara långt från närmaste Bolag?';
  else if (p.days >= 60) line = 'Över två månader. Bolaget hann sakna dig.';
  else if (p.days >= 30) line = 'Mer än en månad utan Bolaget. Respekt.';
  else if (p.days >= 14) line = 'Två veckor utan påfyllning. Inte illa.';
  const extras = [];
  if (s.weekStreak >= 3) extras.push(`Längsta svit: ${s.weekStreak} veckor i rad med minst ett besök.`);
  if (s.rush.visits >= 3) extras.push(`Tätaste veckan: ${s.rush.visits} besök på sju dagar, från ${formatDate(s.rush.from)}.`);
  return {
    id: 'pause',
    theme: 'tonic',
    kicker: 'Din längsta paus',
    big: { value: p.days, unit: p.days === 1 ? 'dag' : 'dagar' },
    sub: `${formatDate(p.from)} – ${formatDate(p.to)}`,
    lines: [line],
    aside: extras.join(' ') || null,
  };
}

function payday(s) {
  if (s.visits < 4) return null;
  let line = 'Du handlar jämnt över månaden. En ekonom någonstans fäller en glädjetår.';
  if (s.paydayShare >= 0.3) line = 'Lönen kommer, lönen går. En rätt stor del av den hit, verkar det som.';
  else if (s.paydayShare >= 0.18) line = 'Lönehelgen syns, men du håller dig någorlunda.';
  return {
    id: 'payday',
    theme: 'aperol',
    kicker: 'Lönehelgen',
    big: { value: Math.round(s.paydayShare * 100), unit: '%' },
    sub: 'av dina Bolagskronor gick åt inom tre dagar efter lönen',
    lines: [line, `Helt jämnt utspritt hade det varit runt ${pct(4 / 30.4)}.`],
    footnote: 'Vi räknar med lön den 25:e, eller fredagen innan om den 25:e är en lördag eller söndag.',
  };
}

function seasons(s) {
  const known = s.seasons.filter((x) => x.state === 'earned' || x.state === 'missed');
  if (!known.length) return null;
  const earned = known.filter((x) => x.state === 'earned').length;
  const notes = { earned: null, missed: 'Missad', upcoming: 'Inte än', unknown: 'Ingen data' };
  const badges = s.seasons.map((x) => ({
    emoji: x.emoji,
    label: x.label,
    state: x.state,
    note: x.state === 'earned' ? plural(x.visits, 'besök', 'besök') : notes[x.state],
  }));
  if (s.january === 0) badges.unshift({ emoji: '🧊', label: 'Torrjanuari', state: 'earned', note: 'Klarad!' });
  let line = 'Du väljer dina högtider med omsorg.';
  if (earned === known.length) line = 'Du missar inte en högtid. En riktig traditionsbärare.';
  else if (!earned) line = 'Du firar på ditt eget sätt. Eller inte alls. Båda är okej.';
  return {
    id: 'seasons',
    theme: 'midnatt',
    kicker: 'Högtiderna',
    title: `${earned} av ${known.length} högtider prickade`,
    badges,
    lines: [line],
    duration: 9000,
  };
}

function store(s) {
  const t = s.topStore;
  if (!t) return null;
  const others = t.storeCount - 1;
  let line = 'Trogen in i det sista. En butik, hela året.';
  if (!others && t.unnamed) line = 'Din favorit, i alla fall bland köpen där banken skrev ut butiken.';
  if (others === 1) line = 'Fast du var otrogen med en annan butik också. Vi säger inget.';
  if (others > 1) line = `Men du har också varit i ${num(others)} andra butiker. En riktig Bolagsturist.`;
  return {
    id: 'store',
    theme: 'blabar',
    kicker: 'Din stambutik',
    big: { text: t.name },
    sub: `${plural(t.visits, 'köp', 'köp')} här`,
    lines: [line],
    duration: 6000,
  };
}

function hour(s) {
  if (s.topHour == null) return null;
  const h = s.topHour;
  let line = 'I sista stund. Du lever gärna på marginalen.';
  if (h < 12) line = 'Förmiddag. Du hinner före alla andra.';
  else if (h < 15) line = 'Lunchrunda? Snyggt, ingen kö.';
  else if (h < 17) line = 'Direkt efter jobbet, precis före rusningen.';
  return {
    id: 'hour',
    theme: 'lime',
    kicker: 'Din gyllene timme',
    big: { text: `${h}–${h + 1}` },
    sub: 'Då handlade du oftast',
    lines: [line],
    duration: 6000,
  };
}

function personaSlide(s, b) {
  let key = 'lagom';
  if (s) key = s.persona;
  if (b?.units) key = b.persona;
  const p = PERSONAS[key];
  const traits = [];
  if (b?.units) traits.push(`Topp 1: ${b.top[0].label.toLowerCase()}`, `${num(b.litres)} liter`);
  if (s && b?.units && s.persona !== 'lagom') traits.push(`Bolagsvana: ${plainTitle(s.persona)}`);
  if (s) traits.push(`Bolagsdag: ${WEEKDAYS[s.topWeekday]}`);
  if (s && !b?.units) traits.push(`Snittköp: ${kr(s.avgKr)}`, `Bästa månad: ${MONTHS[s.topMonth]}`);
  return {
    id: 'persona',
    theme: p.theme,
    kicker: 'Din Bolagsprofil',
    big: { text: p.title },
    lines: [p.text],
    traits: traits.slice(0, 4),
    duration: 9000,
  };
}

function summary(ctx) {
  return { id: 'summary', theme: 'summary', kicker: `Bolaget Wrapped ${ctx.year}`, demo: ctx.demo, final: true };
}

// stats: from a bank export (or null); basket: from basketStats (or null).
export function buildSlides({ stats = null, basket = null, year, demo = false }) {
  const s = stats?.visits ? stats : null;
  const b = basket?.units || basket?.favorite ? basket : null;
  const ctx = { year: s?.year ?? year, demo };
  const has = b?.units > 0;
  return [
    intro(s, b, ctx),
    has && haul(b),
    has && topList(b),
    has && litres(b),
    has && wine(b),
    s && visits(s),
    s && total(s),
    s && has && reconcile(s, b),
    s && weekday(s),
    s && month(s),
    s && biggest(s),
    s && pause(s),
    s && payday(s),
    s && seasons(s),
    s && !has && store(s),
    s && hour(s),
    b?.favorite && favorite(b),
    personaSlide(s, b),
    summary(ctx),
  ]
    .filter(Boolean)
    .map((slide) => ({ duration: 8000, ...slide }));
}

const shorten = (text, max = 22) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

// The share card: the persona plus the six most telling facts available.
export function cardFacts({ stats = null, basket = null, year }) {
  const s = stats?.visits ? stats : null;
  const b = basket?.units ? basket : null;
  let persona = 'lagom';
  if (s) persona = s.persona;
  if (b) persona = b.persona;
  const topWine = b && b.wineLitres >= 3 && b.wine.length >= 2 ? [...b.wine].sort((x, y) => y.litres - x.litres)[0] : null;
  const rows = [
    b && ['Topp 1', b.top[0].label],
    b && ['Flaskor & burkar', num(b.units)],
    s && ['Besök', num(s.visits)],
    s && ['Totalt', kr(s.totalKr)],
    basket?.favorite && ['Årets dryck', shorten(basket.favorite)],
    s && ['Bolagsdag', capitalise(WEEKDAYS[s.topWeekday])],
    b && b.litres >= 1 && ['Liter', num(b.litres)],
    s && ['Bästa månad', capitalise(MONTHS[s.topMonth])],
    s && ['Största runda', kr(s.biggest.kr)],
    s && s.pause && ['Längsta paus', plural(s.pause.days, 'dag', 'dagar')],
    topWine && ['Mest vin', WINE_BIG[topWine.key]],
    b && b.wineLitres >= 3 && b.boxShare > 0 && ['Ur box', pct(b.boxShare)],
    b && ['Sorter', num(b.rows.length)],
  ].filter(Boolean);
  return { year: s?.year ?? year, persona: plainTitle(persona), rows: rows.slice(0, 6) };
}
