// =====================================================================
// Daily refresh of data/releases.json and data/hot.json from KicksDB.
// Runs in GitHub Actions (.github/workflows/zenkicks-refresh.yml).
// Needs the repository secret KICKSDB_API_KEY.
// Uses about 6-10 API requests per run (~300/month, free plan = 1,000).
// If anything fails, the old files are kept, so the app never breaks.
// =====================================================================
import { writeFile } from 'node:fs/promises';

const KEY = process.env.KICKSDB_API_KEY;
const API = 'https://api.kicks.dev/v3';
const DAY = 86400 * 1000;
const dubai = (ms) => new Date(ms + 4 * 3600 * 1000).toISOString().slice(0, 10);
const today = dubai(Date.now());
const until = dubai(Date.now() + 49 * DAY); // ~7 weeks ahead

if (!KEY) { console.log('No KICKSDB_API_KEY set; keeping current data.'); process.exit(0); }

async function get(path, params) {
  const url = API + path + '?' + new URLSearchParams(params).toString();
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + KEY } });
  const text = await res.text();
  if (!res.ok) { console.log(`  ${path} ${JSON.stringify(params)} -> HTTP ${res.status}: ${text.slice(0, 200)}`); return []; }
  let j; try { j = JSON.parse(text); } catch { console.log('  not JSON:', text.slice(0, 200)); return []; }
  const arr = Array.isArray(j) ? j : Array.isArray(j.data) ? j.data : (j.data && (j.data.products || j.data.items)) || j.results || j.products || [];
  console.log(`  ${path} ${JSON.stringify(params)} -> ${arr.length} results`);
  return arr;
}

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);
const inWindow = (d) => isDay(d) && d >= today && d <= until;
const trait = (p, re) => { const t = (p.traits || []).find((x) => re.test(x.trait || '')); return t ? t.value : ''; };

function fromStockx(p) {
  const raw = clean(p.release_date || trait(p, /release/i));
  const retail = Number(String(p.retail_price || trait(p, /retail/i)).replace(/[^0-9.]/g, '')) || null;
  return {
    date: raw.slice(0, 10),
    name: clean(p.title || [p.primary_title, p.secondary_title].filter(Boolean).join(' ')),
    brand: clean(p.brand),
    retail_usd: retail,
    image: p.image || (Array.isArray(p.gallery) && p.gallery[0]) || '',
    sku: clean(p.sku),
    link: p.link || ''
  };
}

function fromSnkrs(p) {
  const starts = (p.launches || []).map((l) => l && l.start_date).filter(Boolean).sort();
  const raw = clean(starts[0] || p.commerce_start_date);
  const sub = clean(p.subtitle);
  const title = clean(p.title);
  const name = sub && !/shoe|sneaker/i.test(sub) && !title.toLowerCase().includes(sub.toLowerCase()) ? `${title} "${sub}"` : title;
  return {
    date: raw ? dubai(Date.parse(raw)) : '',
    name,
    brand: /jordan/i.test(title) ? 'Jordan' : 'Nike',
    retail_usd: Number(p.msrp || p.price) || null,
    image: (Array.isArray(p.images) && p.images[0]) || '',
    sku: clean((p.skus || [])[0]),
    link: p.slug ? `https://www.nike.com/launch/t/${p.slug}` : ''
  };
}

async function main() {
  let items = [];
  const add = (arr, map, label) => {
    const got = arr.map(map).filter((x) => x.name && x.image && inWindow(x.date));
    console.log(`  ${label}: ${got.length} upcoming with photo`);
    if (arr[0]) console.log('  sample:', JSON.stringify(map(arr[0])).slice(0, 300));
    items = items.concat(got);
  };

  console.log(`Window: ${today} to ${until}`);

  // 1) StockX upcoming releases. The date filter format is tried several ways;
  //    the first one that returns upcoming pairs wins.
  const t0 = Math.floor(Date.parse(today + 'T00:00:00Z') / 1000);
  const t1 = Math.floor(Date.parse(until + 'T23:59:59Z') / 1000);
  const tries = [
    { filters: `product_type = "sneakers" AND release_date >= ${t0} AND release_date <= ${t1}`, limit: '100' },
    { filters: `product_type = "sneakers" AND release_date >= "${today}T00:00:00Z" AND release_date <= "${until}T23:59:59Z"`, limit: '100' },
    { filters: `product_type = "sneakers" AND release_date >= "${today}" AND release_date <= "${until}"`, limit: '100' },
    { filters: 'product_type = "sneakers"', sort: 'release_date', limit: '20' }
  ];
  for (const params of tries) {
    const arr = await get('/stockx/products', params);
    add(arr, fromStockx, 'StockX try');
    if (items.length >= 3) break;
  }

  // 2) SNKRS launch calendar (needs a paid KicksDB plan; skipped quietly on the free plan)
  const snk = await get('/snkrs/products', { filters: 'country_code = "US" AND product_type = "FOOTWEAR"', sort: 'id:desc', limit: '100' });
  if (snk.length) add(snk, fromSnkrs, 'SNKRS US');

  // de-duplicate by name, earliest date wins
  const seen = new Map();
  for (const x of items.sort((a, b) => a.date.localeCompare(b.date))) {
    const k = x.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!seen.has(k)) seen.set(k, x);
  }
  items = [...seen.values()].slice(0, 60);

  // 3) What's hot: most-traded sneakers right now (default sort = StockX rank)
  const hj = await get('/stockx/products', { filters: 'product_type = "sneakers"', limit: '20' });
  if (hj[0]) console.log('  release_date format example:', JSON.stringify(hj[0].release_date));
  const online = hj.map((p) => ({ ...fromStockx(p), weekly: Number(p.weekly_orders || 0) }))
    .filter((x) => x.name && x.image)
    .sort((a, b) => b.weekly - a.weekly).slice(0, 10)
    .map((x) => ({
      name: x.name,
      why: x.weekly ? `${x.weekly.toLocaleString('en-US')} orders on StockX this week` : 'Top seller on StockX',
      tag: 'Resale', image: x.image, link: x.link
    }));

  if (online.length >= 3) {
    await writeFile('data/hot.json', JSON.stringify({ updated: today, source: 'KicksDB (StockX weekly orders)', online }, null, 2) + '\n');
    console.log(`Saved ${online.length} hot pairs.`);
  } else console.log(`Hot: only ${online.length}; keeping old file.`);

  if (items.length >= 3) {
    await writeFile('data/releases.json', JSON.stringify({ updated: today, source: 'KicksDB (StockX + SNKRS)', items }, null, 2) + '\n');
    console.log(`Saved ${items.length} releases.`);
  } else console.log(`Releases: only ${items.length}; keeping old file.`);
}

main().catch((e) => { console.error('Refresh failed:', e.message); process.exit(0); });
