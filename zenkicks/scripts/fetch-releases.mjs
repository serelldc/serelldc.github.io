// =====================================================================
// Daily refresh of data/releases.json and data/hot.json from KicksDB.
// Runs in GitHub Actions (.github/workflows/refresh-data.yml).
// Needs the repository secret KICKSDB_API_KEY.
// Uses about 4-6 API requests per run (~150/month, free plan = 1,000).
// If anything fails, the old files are kept, so the app never breaks.
// =====================================================================
import { readFile, writeFile } from 'node:fs/promises';

const KEY = process.env.KICKSDB_API_KEY;
const BASE = 'https://api.kicks.dev/v3/stockx/products';
const today = new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 10); // Dubai date
const in45 = new Date(Date.now() + 49 * 86400 * 1000).toISOString().slice(0, 10);

if (!KEY) { console.log('No KICKSDB_API_KEY set; keeping current data.'); process.exit(0); }

async function get(params) {
  const url = BASE + '?' + new URLSearchParams(params).toString();
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + KEY } });
  if (!res.ok) throw new Error(`KicksDB ${res.status}: ${(await res.text()).slice(0, 200)}`);
  console.log('quota used this month:', res.headers.get('x-quota-current'));
  return res.json();
}
const list = (j) => Array.isArray(j) ? j : (j.data || j.results || j.products || []);
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
function pick(p) {
  const date = clean(p.release_date || p.releaseDate || (p.traits && p.traits.release_date)).slice(0, 10);
  const retail = Number(p.retail_price || p.retailPrice || (p.traits && p.traits.retail_price) || 0) || null;
  return {
    date,
    name: clean(p.title || p.name),
    brand: clean(p.brand),
    retail_usd: retail,
    image: p.image || (Array.isArray(p.gallery) && p.gallery[0]) || '',
    sku: clean(p.sku),
    link: p.link || ''
  };
}

async function main() {
  // 1) upcoming releases: sneakers with a release date in the next ~7 weeks
  const filters = `product_type = "sneakers" AND release_date >= "${today}" AND release_date <= "${in45}"`;
  let items = [];
  for (let page = 1; page <= 3; page++) {
    const j = await get({ filters, limit: '50', page: String(page) });
    const batch = list(j).map(pick).filter((x) => x.name && /^\d{4}-\d{2}-\d{2}$/.test(x.date));
    items = items.concat(batch);
    if (batch.length < 50) break;
  }
  const seen = new Set();
  items = items.filter((x) => { const k = x.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 60);

  // 2) what's hot: most traded sneakers right now (results come ordered by popularity)
  const hj = await get({ filters: 'product_type = "sneakers"', limit: '20' });
  const hotRaw = list(hj).map((p) => ({ ...pick(p), weekly: Number(p.weekly_orders || 0) }))
    .filter((x) => x.name).sort((a, b) => b.weekly - a.weekly).slice(0, 10);
  const online = hotRaw.map((x) => ({
    name: x.name,
    why: x.weekly ? `${x.weekly.toLocaleString('en-US')} orders on StockX this week` : 'Trending on StockX',
    tag: 'Resale', image: x.image, link: x.link
  }));

  if (items.length < 3) throw new Error(`Only ${items.length} releases returned; keeping old file.`);
  const stamp = today;
  await writeFile('data/releases.json', JSON.stringify({ updated: stamp, source: 'KicksDB (StockX catalog)', items }, null, 2) + '\n');
  if (online.length) await writeFile('data/hot.json', JSON.stringify({ updated: stamp, source: 'KicksDB (StockX weekly orders)', online }, null, 2) + '\n');
  console.log(`Saved ${items.length} releases and ${online.length} hot pairs.`);
}

main().catch(async (e) => {
  console.error('Refresh failed:', e.message);
  try { await readFile('data/releases.json'); } catch { /* nothing to keep */ }
  process.exit(0); // do not fail the workflow; old data stays live
});
