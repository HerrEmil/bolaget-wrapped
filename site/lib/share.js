// The share card: a 1080×1920 PNG (story format) drawn on a canvas, so it can
// go straight into Slack, Instagram or a group chat.

const W = 1080;
const H = 1920;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const C = {
  bg: '#1f120c',
  panel: '#2f1d14',
  fg: '#fff4e6',
  amber: '#ffb400',
  rose: '#ff7a9c',
  indigo: '#4d49d6',
};

function circle(ctx, x, y, r, color) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function panel(ctx, x, y, w, h, r, color) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fill();
}

// Largest font size up to `size` at which `text` fits in `width`.
function fit(ctx, text, width, size, weight) {
  let s = size;
  for (; s > 24; s -= 2) {
    ctx.font = `${weight} ${s}px ${FONT}`;
    if (ctx.measureText(text).width <= width) break;
  }
  ctx.font = `${weight} ${s}px ${FONT}`;
  return s;
}

function text(ctx, value, x, y, { size, weight = 700, color = C.fg, width = W - 2 * x, spacing = '0px' }) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = spacing;
  fit(ctx, value, width, size, weight);
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

export function drawCard(canvas, facts, { host = '', demo = false } = {}) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  // Corners only, clear of the text.
  circle(ctx, 1010, 120, 250, C.amber);
  circle(ctx, 0, 0, 120, C.indigo);
  circle(ctx, 1080, 1920, 220, C.rose);

  text(ctx, 'BOLAGET WRAPPED', 90, 200, { size: 42, weight: 800, color: C.amber, spacing: '6px', width: 640 });
  if (demo) {
    panel(ctx, 90, 232, 230, 64, 32, C.rose);
    text(ctx, 'EXEMPEL', 120, 277, { size: 34, weight: 800, color: '#2e0715', spacing: '3px', width: 180 });
  }
  text(ctx, String(facts.year), 76, 560, { size: 300, weight: 900 });
  text(ctx, 'Min Bolagsprofil', 90, 670, { size: 40, weight: 700, color: C.amber });
  text(ctx, facts.persona, 90, 776, { size: 104, weight: 900 });

  const colW = 435;
  const rowH = 260;
  facts.rows.forEach(([label, value], i) => {
    const x = 90 + (i % 2) * (colW + 30);
    const y = 850 + Math.floor(i / 2) * (rowH + 30);
    panel(ctx, x, y, colW, rowH, 36, C.panel);
    text(ctx, label, x + 36, y + 76, { size: 36, weight: 700, color: C.amber, width: colW - 72 });
    text(ctx, value, x + 36, y + 190, { size: 80, weight: 900, width: colW - 72 });
  });

  text(ctx, 'Inofficiellt och på skoj. Inte kopplat till Systembolaget.', 90, 1790, { size: 30, weight: 500, width: 760 });
  text(ctx, host || 'Bolaget Wrapped', 90, 1846, { size: 38, weight: 800, width: 760 });
}

export function cardBlob(facts, options) {
  const canvas = document.createElement('canvas');
  drawCard(canvas, facts, options);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/png');
  });
}
