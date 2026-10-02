// =====================================================================
// Daily refresh of data/releases.json and data/hot.json from KicksDB.
// Runs in GitHub Actions (.github/workflows/zenkicks-refresh.yml).
// Needs the repository secret KICKSDB_API_KEY.
//
// Free KicksDB plan: release dates are hidden, so the release calendar
// (names, dates, prices) lives in data/releases.json and you add new drops
// there. This script then:
//   1. removes drops that already happened,
//   2. finds a StockX photo for any drop that has no photo yet,
//   3. rebuilds What's hot from the best-selling sneakers on StockX,
//   4. deal meter: finds the StockX price of pairs listed on the Zenkicks
//      market (data/prices.json; each model is re-checked once a week).
// About 1-10 requests per run (free plan = 1,000/month).
// If anything fails, the old files are kept, so the app never breaks.
// =====================================================================
import { readFile, writeFile } from 'node:fs/promises';

const KEY = process.env.KICKSDB_API_KEY;
const API = 'https://api.kicks.dev/v3';
const today = new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 10); // Dubai date
const MAX_PHOTO_LOOKUPS = 15;
const MAX_PRICE_LOOKUPS = 8;   // deal meter: new models looked up per run
const daysSince = (ymd) => (Date.parse(today) - Date.parse(ymd)) / 86400000;

if (!KEY) { console.log('No KICKSDB_API_KEY set; keeping current data.'); process.exit(0); }

async function get(path, params) {
  const url = API + path + '?' + new URLSearchParams(params).toString();
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + KEY } });
  const text = await res.text();
  if (!res.ok) { console.log(`  ${path} -> HTTP ${res.status}: ${text.slice(0, 160)}`); return []; }
  let j; try { j = JSON.parse(text); } catch { return []; }
  return Array.isArray(j) ? j : Array.isArray(j.data) ? j.data : [];
}

// StockX shows a grey 'X' placeholder when a product has no photo yet; never use it
const realImg = (u) => !!u && !/placeholder/i.test(u);
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
// bigger, sharper StockX photo than the 140px thumbnail the API returns
const big = (u) => String(u || '').replace(/([?&])w=\d+/, '$1w=600').replace(/([?&])h=\d+/, '$1h=430');
const words = (s) => clean(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(' ').filter((w) => w.length > 2 && !['nike', 'the', 'and', 'low', 'high', 'mid', 'retro', 'womens', 'mens'].includes(w));
function sameShoe(wanted, found) {
  // every model number must match (stops "Jordan 14" matching an "Air Force 1"), then most key words
  const nums = (t) => (clean(t).toLowerCase().match(/\b\d+\b/g) || []).filter((n) => n.length < 4); // skip years like 2026
  const fnums = new Set(nums(found));
  if (!nums(wanted).every((n) => fnums.has(n))) return false;
  const a = words(wanted), b = new Set(words(found));
  if (!a.length) return false;
  const hit = a.filter((w) => b.has(w)).length;
  return hit / a.length >= 0.6;
}

async function releases() {
  let file;
  try { file = JSON.parse(await readFile('data/releases.json', 'utf8')); } catch { console.log('No releases.json; skipping calendar.'); return; }
  const before = file.items.length;
  file.items = (file.items || []).filter((d) => d.date && d.date >= today);
  let own = {};
  try { own = JSON.parse(await readFile('data/photos.json', 'utf8')); } catch { /* no own photos */ }
  const hasOwn = (name) => Object.keys(own).some((k) => k.toLowerCase() === name.toLowerCase());
  let looked = 0, found = 0;
  for (const d of file.items) if (d.image && !realImg(d.image)) { delete d.image; console.log(`  removed placeholder photo: ${d.name}`); }
  for (const d of file.items) {
    if (d.image || hasOwn(d.name) || looked >= MAX_PHOTO_LOOKUPS) continue;
    if (d.tried && daysSince(d.tried) < 2) continue; // StockX rarely adds a photo overnight; saves free-plan requests
    looked++; d.tried = today;
    const r = await get('/stockx/products', { query: d.name, limit: '3' });
    const hit = r.find((p) => realImg(p.image) && sameShoe(d.name, p.title));
    if (hit) { delete d.tried; d.image = big(hit.image); d.link = d.link || hit.link || ''; const x = details(hit); ['brand', 'sku', 'colorway'].forEach((k) => { if (x[k] && !d[k]) d[k] = x[k]; }); found++; console.log(`  photo: ${d.name} <- ${hit.title}`); }
    else console.log(`  no StockX match yet: ${d.name}`);
  }
  file.updated = today;
  await writeFile('data/releases.json', JSON.stringify(file, null, 2) + '\n');
  console.log(`Calendar: ${file.items.length} upcoming (${before - file.items.length} past removed), ${found}/${looked} new photos.`);
}

// StockX files slides, clogs and boots under "sneakers" too; What's hot shows real sneakers only
const NOT_SNEAKER = /\b(slides?|clogs?|crocs|boots?|timberland|sandals?|slippers?|mules?|flip[- ]?flops?|ugg|birkenstock|foam ?runner|ys-?0\d|adilette|benassi|offcourt|victori one)\b/i;

// extra details for the press-and-hold preview (only kept when StockX has them)
const trait = (p, name) => { const t = (p.traits || []).find((x) => String(x.trait || x.name || '').toLowerCase() === name); return t ? clean(t.value) : ''; };
const usd = (v) => { const n = Math.round(Number(String(v || '').replace(/[^0-9.]/g, ''))); return n > 0 && n < 100000 ? n : undefined; };
function details(p) {
  const out = {
    brand: clean(p.brand) || undefined,
    sku: clean(p.sku) || undefined,
    colorway: trait(p, 'colorway') || undefined,
    retail_usd: usd(trait(p, 'retail price')),
    released: trait(p, 'release date') || undefined,
    price_usd: usd(p.min_price) || usd(p.avg_price)
  };
  Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
  return out;
}

async function hot() {
  const r = await get('/stockx/products', { filters: 'product_type = "sneakers"', limit: '40' });
  const online = r.filter((p) => p.title && realImg(p.image) && !NOT_SNEAKER.test(p.title)).slice(0, 10).map((p, i) => ({
    name: clean(p.title),
    why: Number(p.weekly_orders) ? `${Number(p.weekly_orders).toLocaleString('en-US')} orders on StockX this week` : `#${i + 1} best seller on StockX`,
    tag: 'Resale',
    image: big(p.image),
    link: p.link || '',
    ...details(p)
  }));
  if (online.length < 3) { console.log(`Hot: only ${online.length}; keeping old file.`); return; }
  await writeFile('data/hot.json', JSON.stringify({ updated: today, source: 'KicksDB (StockX best sellers)', online }, null, 2) + '\n');
  console.log(`Hot: saved ${online.length} pairs.`);
}

// ---------- deal meter: StockX price for each model listed on the market ----------
export const priceKey = (s) => clean(String(s || '').replace(/[“”"]/g, '')).toLowerCase();
async function activeListings() {
  const cfg = await readFile('config.js', 'utf8');
  const url = (cfg.match(/SUPABASE_URL:\s*'([^']+)'/) || [])[1];
  const key = (cfg.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/) || [])[1]; // public key, same one the app uses
  if (!url || !key) return [];
  const res = await fetch(url + '/rest/v1/listings?select=model,brand&status=eq.active&limit=1000', { headers: { apikey: key, Authorization: 'Bearer ' + key } });
  if (!res.ok) { console.log('  listings -> HTTP ' + res.status); return []; }
  return res.json();
}
// stricter than sameShoe: a price is only useful for the exact pair, so vague names ("Jordan 4", "Kobe") get none
export function priceMatch(wanted, found) {
  const w = words(wanted);
  if (w.length < 2 || !sameShoe(wanted, found)) return false;
  const kids = /\((gs|ps|td)\)|\b(gs|ps|td|kids|toddler|preschool|grade school)\b/i;
  if (kids.test(found) && !kids.test(wanted)) return false;
  const f = words(found).filter((x) => !/^(19|20)\d\d$/.test(x));
  const ws = new Set(w);
  return f.length > 0 && f.filter((x) => ws.has(x)).length / f.length >= 0.5;
}
async function prices() {
  let file = { items: {} };
  try { file = JSON.parse(await readFile('data/prices.json', 'utf8')); } catch { /* first run */ }
  file.items = file.items || {};
  const ls = await activeListings();
  const models = new Map();
  for (const l of ls) { const k = priceKey(l.model); if (k && !models.has(k)) models.set(k, l); }
  let looked = 0, found = 0;
  for (const [k, l] of models) {
    const have = file.items[k];
    if (have && daysSince(have.at) < (have.none ? 3 : 7)) continue;
    if (looked >= MAX_PRICE_LOOKUPS) break;
    looked++;
    const name = clean(l.model);
    const q = l.brand && !name.toLowerCase().includes(String(l.brand).toLowerCase()) ? l.brand + ' ' + name : name;
    const r = await get('/stockx/products', { query: q, limit: '5' });
    const hit = r.find((p) => p.title && priceMatch(name, p.title) && (usd(p.min_price) || usd(p.avg_price)));
    if (hit) {
      file.items[k] = { title: clean(hit.title), usd: usd(hit.min_price) || usd(hit.avg_price), avg_usd: usd(hit.avg_price), link: hit.link || '', at: today };
      found++; console.log(`  price: ${name} <- ${hit.title} US$${file.items[k].usd}`);
    } else { file.items[k] = { none: true, at: today }; console.log(`  no StockX price: ${name}`); }
  }
  // forget models no longer for sale after a month
  for (const k of Object.keys(file.items)) if (!models.has(k) && daysSince(file.items[k].at) > 30) delete file.items[k];
  file.updated = today; file.source = 'KicksDB (StockX lowest ask, all sizes)';
  await writeFile('data/prices.json', JSON.stringify(file, null, 2) + '\n');
  console.log(`Deal meter: ${models.size} models on the market, ${found}/${looked} new prices.`);
}

try { await releases(); } catch (e) { console.log('Calendar step failed:', e.message); }
try { await hot(); } catch (e) { console.log('Hot step failed:', e.message); }
try { await prices(); } catch (e) { console.log('Price step failed:', e.message); }
