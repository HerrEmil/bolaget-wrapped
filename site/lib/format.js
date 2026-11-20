// Swedish number formatting. NBSP before units keeps "389 kr" on one line.

const whole = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const num = (x) => whole.format(Math.round(x));
export const kr = (x) => `${num(x)}\u00a0kr`;
export const krExact = (x) => (Math.abs(x - Math.round(x)) < 0.005 ? kr(x) : `${cents.format(x)}\u00a0kr`);
export const pct = (share) => `${Math.round(share * 100)}\u00a0%`;
export const capitalise = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// 1:a, 2:a, 3:e … 11:e, 12:e … 21:a, 22:a
export function ordinal(n) {
  const one = n % 10;
  const two = n % 100;
  return `${n}:${(one === 1 || one === 2) && two !== 11 && two !== 12 ? 'a' : 'e'}`;
}

export const plural = (n, one, many) => `${num(n)}\u00a0${n === 1 ? one : many}`;
