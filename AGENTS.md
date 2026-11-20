# Agent instructions

Bolaget Wrapped: an unofficial, Spotify-Wrapped-style recap of a year at Systembolaget, in Swedish. Static site in `site/`, no build step, vanilla ES modules.

## Privacy is the product

- Everything runs in the visitor's browser. `site/index.html` sets a CSP that only allows the page's own origin (`connect-src 'self'`; `'none'` also blocks Lighthouse's robots.txt fetch and fails the SEO gate), so nothing can reach another site. Keep it that way: no analytics, no fonts or scripts from other hosts.
- Never commit a real bank export. Fixtures in `test/fixtures/` are synthetic copies of each bank's format.

## Layout

- `site/lib/parse.js`: bank export → Systembolaget purchases (header mapping first, value shapes as fallback). Format facts per bank are in the test names in `test/parse.test.js`.
- `site/lib/stats.js`: purchases → year stats. Pure and clock-free.
- `site/lib/basket.js`: the "fill your basket" categories (our own container sizes and rough typical prices) and the basket personas. Systembolaget doesn't link store purchases to people, so what was bought can only come from the visitor.
- `site/lib/slides.js`: stats and basket → slide copy. Systembolaget figures quoted there carry their source in a comment; don't add a figure without one.
- `site/lib/demo.js`: the seeded example year (`DEMO_YEAR`, `DEMO_SEED`); `test/stats.test.js` pins its shape.
- `site/lib/xlsx.js`: minimal .xlsx reader on `DecompressionStream`, lazy-loaded.
- `site/app.js`: DOM, story player, share card.

## Checks

- `npm test` (node --test, zero dependencies).
- `npm run dev` serves `site/` on port 8080.
- The perf gate is `HerrEmil/perf-config` v1 with this repo's `lighthouserc.json` (`staticDistDir: ./site`). `unminified-javascript` is off because the site ships unbuilt modules; performance must still score >= 0.92.
- Deploy: push to main runs `.github/workflows/deploy.yml`, which syncs `site/` only to the project's own bucket and invalidates CloudFront. Live at https://bolaget-wrapped.herremil.com. If you change `deploy.yml`, it must still sync `site/` only.
- Never run AWS locally; deploys go through GitHub Actions.
