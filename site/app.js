// Page controller: import (file, drop or paste), the story player and sharing.
// Nothing here talks to a network; the page's CSP forbids it anyway.

import { buildSlides, cardFacts } from './lib/slides.js';
import { computeWrapped, defaultYear, yearsIn } from './lib/stats.js';
import { demoYear, DEMO_YEAR } from './lib/demo.js';
import { extractFromText, mergeResults } from './lib/parse.js';
import { readFile, ReadError, READ_ERRORS } from './lib/read.js';
import { cardBlob } from './lib/share.js';
import { todayDayNumber, formatDate } from './lib/dates.js';
import { num, kr, plural } from './lib/format.js';
import { BANKS } from './lib/banks.js';

const $ = (selector, root = document) => root.querySelector(selector);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : String(child));
  }
  return node;
}

// ------------------------------------------------------------------ import

const imported = [];
const state = { merged: null, year: null };
let pastes = 0;

function fileNote(entry) {
  if (entry.error) return entry.error;
  const { transactions, rowsWithDates, unreadable } = entry.result;
  const found = transactions.filter((t) => !t.refund).length;
  if (found) {
    const missed = unreadable ? ` ${plural(unreadable, 'rad', 'rader')} med Systembolaget gick inte att tolka.` : '';
    return `${plural(found, 'köp', 'köp')} hittade bland ${plural(rowsWithDates, 'rad', 'rader')}.${missed}`;
  }
  if (!rowsWithDates) return 'Vi hittade inga transaktioner alls. Är det rätt fil?';
  return `Inga köp på Systembolaget bland ${plural(rowsWithDates, 'rad', 'rader')}.`;
}

function renderResult() {
  const box = $('.result');
  const merged = mergeResults(imported.filter((f) => f.result).map((f) => f.result));
  const years = yearsIn(merged.transactions);
  state.merged = merged;
  if (!years.some((y) => y.year === state.year)) state.year = defaultYear(merged.transactions);

  const files = el('ul', { class: 'file-list' }, imported.map((f) => {
    let status = 'is-empty';
    if (f.error) status = 'is-error';
    else if (f.result.transactions.length) status = 'is-ok';
    return el('li', { class: status }, el('strong', { text: f.name }), ' ', fileNote(f));
  }));
  const again = el('div', { class: 'result-actions' },
    el('button', { type: 'button', class: 'btn btn-small btn-secondary', onclick: () => $('.file-input').click(), text: 'Lägg till en fil till' }),
    el('button', { type: 'button', class: 'btn btn-small btn-secondary', onclick: reset, text: 'Börja om' }));

  if (!merged.transactions.length) {
    box.replaceChildren(el('div', { class: 'result-card' },
      el('p', { class: 'result-title', text: 'Vi hittade inga köp på Systembolaget.' }),
      files,
      el('p', { text: 'Kolla att filen är rätt konto och rätt period, eller prova att klistra in raderna. Annars: grattis till ett nyktert år.' }),
      again));
    return;
  }

  const purchases = merged.transactions.filter((t) => !t.refund);
  const first = purchases[0].date;
  const last = purchases[purchases.length - 1].date;
  const picker = years.length > 1
    ? el('fieldset', { class: 'years' }, el('legend', { text: 'Vilket år vill du se?' }),
      years.map(({ year, visits }) => el('label', { class: 'year-chip' },
        el('input', { type: 'radio', name: 'year', value: year, checked: year === state.year, onchange: () => { state.year = year; } }),
        el('span', { text: String(year) }),
        el('small', { text: plural(visits, 'besök', 'besök') }))))
    : null;
  box.replaceChildren(el('div', { class: 'result-card' },
    el('p', { class: 'result-title', text: `${plural(purchases.length, 'köp', 'köp')} på Systembolaget, ${formatDate(first, { withYear: true })} – ${formatDate(last, { withYear: true })}.` }),
    files,
    picker,
    el('button', { type: 'button', class: 'btn btn-primary', onclick: startWrapped, text: 'Visa min Wrapped' }),
    again));
}

function reset() {
  imported.length = 0;
  pastes = 0;
  state.year = null;
  $('.result').replaceChildren();
  $('.paste-input').value = '';
}

async function addFiles(files) {
  const ctx = { today: todayDayNumber() };
  for (const file of files) {
    try {
      imported.push({ name: file.name, result: await readFile(file, ctx) });
    } catch (err) {
      imported.push({ name: file.name, error: err instanceof ReadError ? READ_ERRORS[err.code] : 'Filen gick inte att läsa.' });
    }
  }
  renderResult();
  $('.result').scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'center' });
}

function addPaste() {
  const text = $('.paste-input').value;
  if (!text.trim()) return;
  pastes++;
  imported.push({ name: pastes === 1 ? 'Inklistrade rader' : `Inklistrade rader ${pastes}`, result: extractFromText(text, { today: todayDayNumber() }) });
  $('.paste-input').value = '';
  renderResult();
}

function startWrapped() {
  const stats = computeWrapped(state.merged.transactions, { year: state.year, coverage: state.merged.coverage });
  if (stats.visits) story.open(stats, { demo: false });
}

function startDemo() {
  const year = demoYear();
  story.open(computeWrapped(year.transactions, { year: DEMO_YEAR, coverage: year.coverage }), { demo: true });
}

// ------------------------------------------------------------------ slides

function speech(s) {
  const big = s.big ? (s.big.text ?? `${num(s.big.value)} ${s.big.unit ?? ''}`) : '';
  return [s.kicker, s.title, big, s.sub, ...(s.lines || [])].filter(Boolean).join('. ');
}

function bigValue(big) {
  if (big.text) return el('p', { class: `slide-big is-text${big.text.length > 11 ? ' is-long' : ''}`, text: big.text });
  const text = num(big.value);
  return el('p', { class: `slide-big${text.length > 4 ? ' is-wide' : ''}` },
    el('span', { class: 'count', 'data-to': big.value, 'aria-hidden': 'true', text }),
    el('span', { class: 'sr-only', text }),
    big.unit ? el('span', { class: 'unit', text: big.unit }) : null);
}

function chart({ label, bars, unit }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  const said = bars.map((b) => `${b.label} ${unit === 'kr' ? kr(b.value) : num(b.value)}`).join(', ');
  return el('div', { class: 'chart', role: 'img', 'aria-label': `${label}: ${said}` }, bars.map((b) => {
    const bar = el('span', { class: `bar${b.highlight ? ' is-top' : ''}${b.faded ? ' is-faded' : ''}` },
      el('span', { class: 'bar-track' }, el('span', { class: 'bar-fill' })),
      el('span', { class: 'bar-label', text: b.label }));
    bar.style.setProperty('--v', (b.value / max).toFixed(3));
    return bar;
  }));
}

function badges(list) {
  return el('ul', { class: 'badges' }, list.map((b) => el('li', { class: `badge is-${b.state}` },
    el('span', { class: 'badge-emoji', 'aria-hidden': 'true', text: b.emoji }),
    el('span', { class: 'badge-label', text: b.label }),
    b.note ? el('span', { class: 'badge-note', text: b.note }) : null)));
}

const art = () => el('div', { class: 'slide-art', 'aria-hidden': 'true' },
  el('span', { class: 'blob blob-1' }), el('span', { class: 'blob blob-2' }), el('span', { class: 'blob blob-3' }));

function renderSlide(s, i, count) {
  const body = el('div', { class: 'slide-body' },
    el('h2', { class: 'slide-kicker', text: s.kicker }),
    s.title ? el('p', { class: 'slide-title', text: s.title }) : null,
    s.big ? bigValue(s.big) : null,
    s.sub ? el('p', { class: 'slide-sub', text: s.sub }) : null,
    s.chart ? chart(s.chart) : null,
    s.badges ? badges(s.badges) : null,
    (s.lines || []).map((line) => el('p', { class: 'slide-line', text: line })),
    s.traits ? el('ul', { class: 'traits' }, s.traits.map((t) => el('li', { text: t }))) : null,
    s.aside ? el('p', { class: 'slide-aside', text: s.aside }) : null,
    s.footnote ? el('p', { class: 'slide-foot', text: s.footnote }) : null);
  [...body.children].forEach((child, k) => child.style.setProperty('--i', k));
  return el('section', { class: `slide theme-${s.theme}`, 'aria-roledescription': 'bild', 'aria-label': `${i + 1} av ${count}` }, art(), body);
}

const canShareFiles = () => {
  try {
    return Boolean(navigator.canShare?.({ files: [new File([''], 'x.png', { type: 'image/png' })] }));
  } catch {
    return false;
  }
};

function renderSummary(s, i, count, stats, ctx) {
  const facts = cardFacts(stats);
  const status = el('p', { class: 'summary-status', 'aria-live': 'polite' });
  const say = (text) => { status.textContent = text; };
  const fileName = `bolaget-wrapped-${stats.year}.png`;
  const img = el('img', {
    class: 'card-preview',
    width: 1080,
    height: 1920,
    alt: `Delningsbild: Bolaget Wrapped ${stats.year}, ${facts.persona}. ${facts.rows.map(([k, v]) => `${k}: ${v}`).join(', ')}.`,
  });
  story.card.then((blob) => { img.src = story.cardUrl || (story.cardUrl = URL.createObjectURL(blob)); });

  const share = async () => {
    const file = new File([await story.card], fileName, { type: 'image/png' });
    try {
      await navigator.share({ files: [file], title: 'Bolaget Wrapped', text: `Mitt Bolaget Wrapped ${stats.year}` });
    } catch (err) {
      if (err.name !== 'AbortError') say('Delningen gick inte. Spara bilden istället.');
    }
  };
  const save = async () => {
    await story.card;
    const a = el('a', { href: story.cardUrl, download: fileName });
    document.body.append(a);
    a.click();
    a.remove();
    say('Bilden är sparad.');
  };
  const copy = async () => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': story.card })]);
      say('Bilden är kopierad. Klistra in den i Slack!');
    } catch {
      say('Kopieringen gick inte. Spara bilden istället.');
    }
  };

  const body = el('div', { class: 'slide-body summary' },
    el('h2', { class: 'slide-kicker', text: ctx.demo ? 'Så kan det se ut' : 'Det var ditt år på Bolaget' }),
    img,
    el('div', { class: 'summary-actions' },
      canShareFiles() ? el('button', { type: 'button', class: 'btn btn-primary', onclick: share, text: 'Dela' }) : null,
      el('button', { type: 'button', class: `btn ${canShareFiles() ? 'btn-secondary' : 'btn-primary'}`, onclick: save, text: 'Spara bild' }),
      'ClipboardItem' in window && navigator.clipboard?.write
        ? el('button', { type: 'button', class: 'btn btn-secondary', onclick: copy, text: 'Kopiera bild' }) : null,
      el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => story.go(0), text: 'Se igen' }),
      ctx.demo
        ? el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => { story.close(); $('.file-input').click(); }, text: 'Testa med din egen fil' })
        : null),
    status,
    el('p', { class: 'slide-foot', text: 'Drick lagom. Alkoholhjälpen svarar på 020-84 44 48, gratis och anonymt.' }));
  return el('section', { class: `slide theme-${s.theme}`, 'aria-roledescription': 'bild', 'aria-label': `${i + 1} av ${count}` }, body);
}

function runCounts(node, token) {
  for (const c of node.querySelectorAll('.count')) {
    const to = Number(c.dataset.to);
    if (reducedMotion.matches || to < 3) {
      c.textContent = num(to);
      continue;
    }
    const t0 = performance.now();
    const step = (t) => {
      if (token !== story.token) return;
      const p = Math.min(1, (t - t0) / 1100);
      c.textContent = num(Math.round(to * (1 - (1 - p) ** 3)));
      if (p < 1) requestAnimationFrame(step);
    };
    c.textContent = '0';
    requestAnimationFrame(step);
  }
}

// ------------------------------------------------------------------ story

const story = {
  dialog: $('.story'),
  frame: $('.story-frame'),
  slidesEl: $('.slides'),
  progress: $('.progress'),
  live: $('.story-live'),
  pauseButton: $('[data-action="pause"]'),
  slides: [],
  nodes: [],
  segments: [],
  index: 0,
  token: 0,
  paused: false,
  card: null,
  cardUrl: null,

  open(stats, ctx) {
    this.clearCard();
    const host = /^https?:$/.test(location.protocol) && !/^(localhost|127\.|\[::1\])/.test(location.host) ? location.host : '';
    this.card = cardBlob(cardFacts(stats), { host, demo: ctx.demo });
    this.slides = buildSlides(stats, ctx);
    const count = this.slides.length;
    this.nodes = this.slides.map((s, i) => (s.final ? renderSummary(s, i, count, stats, ctx) : renderSlide(s, i, count)));
    this.slidesEl.replaceChildren(...this.nodes);
    this.segments = this.slides.map(() => el('span', { class: 'seg' }, el('i')));
    this.progress.replaceChildren(...this.segments);
    $('.story-year').textContent = String(stats.year);
    $('.demo-chip').hidden = !ctx.demo;
    this.setPaused(false);
    document.documentElement.classList.add('is-locked');
    if (!this.dialog.open) this.dialog.showModal();
    this.go(0);
  },

  go(i) {
    this.index = Math.max(0, Math.min(i, this.slides.length - 1));
    const token = ++this.token;
    const slide = this.slides[this.index];
    this.nodes.forEach((node, k) => {
      node.classList.toggle('is-active', k === this.index);
      node.inert = k !== this.index;
    });
    this.frame.className = `story-frame theme-${slide.theme}${slide.final ? ' is-final' : ''}${this.paused ? ' is-paused' : ''}`;
    this.segments.forEach((seg, k) => {
      seg.className = 'seg';
      if (k < this.index) seg.classList.add('is-done');
    });
    const current = this.segments[this.index];
    current.style.setProperty('--dur', `${slide.duration}ms`);
    void current.offsetWidth;
    current.classList.add('is-current');
    this.live.textContent = slide.final ? 'Sammanfattning. Spara eller dela bilden.' : speech(slide);
    runCounts(this.nodes[this.index], token);
  },

  next() {
    if (this.index < this.slides.length - 1) this.go(this.index + 1);
  },

  prev() {
    this.go(this.index - 1);
  },

  setPaused(on) {
    this.paused = on;
    this.frame.classList.toggle('is-paused', on);
    this.pauseButton.setAttribute('aria-pressed', String(on));
    this.pauseButton.setAttribute('aria-label', on ? 'Spela' : 'Pausa');
  },

  close() {
    if (this.dialog.open) this.dialog.close();
  },

  clearCard() {
    if (this.cardUrl) URL.revokeObjectURL(this.cardUrl);
    this.cardUrl = null;
  },
};

story.progress.addEventListener('animationend', (e) => {
  if (e.target.parentElement === story.segments[story.index] && !story.paused) story.next();
});

story.dialog.addEventListener('close', () => {
  story.token++;
  document.documentElement.classList.remove('is-locked');
  if (location.hash === '#exempel') history.replaceState(null, '', location.pathname + location.search);
});

story.dialog.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === 'PageDown') story.next();
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') story.prev();
  else if (e.key === 'k' || e.key === 'p') story.setPaused(!story.paused);
  else return;
  e.preventDefault();
});

// A short tap moves; holding pauses until you let go, like the apps.
let holdTimer = null;
let held = false;
story.frame.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('.tap')) return;
  held = false;
  holdTimer = setTimeout(() => {
    held = true;
    story.frame.classList.add('is-held');
  }, 250);
});
const release = () => {
  clearTimeout(holdTimer);
  story.frame.classList.remove('is-held');
};
for (const type of ['pointerup', 'pointercancel', 'pointerleave']) story.frame.addEventListener(type, release);

story.frame.addEventListener('click', (e) => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'next' || action === 'prev') {
    if (held) {
      held = false;
      return;
    }
    story[action]();
  } else if (action === 'pause') story.setPaused(!story.paused);
  else if (action === 'close') story.close();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && story.dialog.open) story.setPaused(true);
});

// ------------------------------------------------------------------ landing

function renderBanks() {
  $('.bank-list').replaceChildren(...BANKS.map((bank) => el('details', { class: 'bank' },
    el('summary', { text: bank.name }),
    el('p', { text: bank.how }))));
}

function wireLanding() {
  const input = $('.file-input');
  const drop = $('.drop');
  input.addEventListener('change', () => {
    if (input.files.length) addFiles([...input.files]);
    input.value = '';
  });
  document.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'choose') input.click();
    else if (action === 'demo') startDemo();
    else if (action === 'paste') addPaste();
  });
  $('.paste-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addPaste();
  });
  // Dropping anywhere on the page counts, so a near miss doesn't open the file.
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('is-over');
  });
  document.addEventListener('dragleave', (e) => {
    if (!e.relatedTarget) drop.classList.remove('is-over');
  });
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('is-over');
    if (e.dataTransfer?.files.length) addFiles([...e.dataTransfer.files]);
  });
}

renderBanks();
wireLanding();
if (location.hash === '#exempel') startDemo();
