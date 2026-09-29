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
//   3. rebuilds What's hot from the best-selling sneakers on StockX.
// About 1-10 requests per run (free plan = 1,000/month).
// If anything fails, the old files are kept, so the app never breaks.
// =====================================================================
import { readFile, writeFile } from 'node:fs/promises';

const KEY = process.env.KICKSDB_API_KEY;
const API = 'https://api.kicks.dev/v3';
const today = new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 10); // Dubai date
const MAX_PHOTO_LOOKUPS = 15;

if (!KEY) { console.log('No KICKSDB_API_KEY set; keeping current data.'); process.exit(0); }

async function get(path, params) {
  const url = API + path + '?' + new URLSearchParams(params).toString();
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + KEY } });
  const text = await res.text();
  if (!res.ok) { console.log(`  ${path} -> HTTP ${res.status}: ${text.slice(0, 160)}`); return []; }
  let j; try { j = JSON.parse(text); } catch { return []; }
  return Array.isArray(j) ? j : Array.isArray(j.data) ? j.data : [];
}

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
  for (const d of file.items) {
    if (d.image || hasOwn(d.name) || looked >= MAX_PHOTO_LOOKUPS) continue;
    looked++;
    const r = await get('/stockx/products', { query: d.name, limit: '3' });
    const hit = r.find((p) => p.image && sameShoe(d.name, p.title));
    if (hit) { d.image = big(hit.image); d.link = d.link || hit.link || ''; found++; console.log(`  photo: ${d.name} <- ${hit.title}`); }
    else console.log(`  no StockX match yet: ${d.name}`);
  }
  file.updated = today;
  await writeFile('data/releases.json', JSON.stringify(file, null, 2) + '\n');
  console.log(`Calendar: ${file.items.length} upcoming (${before - file.items.length} past removed), ${found}/${looked} new photos.`);
}

// StockX files slides, clogs and boots under "sneakers" too; What's hot shows real sneakers only
const NOT_SNEAKER = /\b(slides?|clogs?|crocs|boots?|timberland|sandals?|slippers?|mules?|flip[- ]?flops?|ugg|birkenstock|foam ?runner|ys-?0\d|adilette|benassi|offcourt|victori one)\b/i;

async function hot() {
  const r = await get('/stockx/products', { filters: 'product_type = "sneakers"', limit: '40' });
  const online = r.filter((p) => p.title && p.image && !NOT_SNEAKER.test(p.title)).slice(0, 10).map((p, i) => ({
    name: clean(p.title),
    why: Number(p.weekly_orders) ? `${Number(p.weekly_orders).toLocaleString('en-US')} orders on StockX this week` : `#${i + 1} best seller on StockX`,
    tag: 'Resale',
    image: big(p.image),
    link: p.link || ''
  }));
  if (online.length < 3) { console.log(`Hot: only ${online.length}; keeping old file.`); return; }
  await writeFile('data/hot.json', JSON.stringify({ updated: today, source: 'KicksDB (StockX best sellers)', online }, null, 2) + '\n');
  console.log(`Hot: saved ${online.length} pairs.`);
}

try { await releases(); } catch (e) { console.log('Calendar step failed:', e.message); }
try { await hot(); } catch (e) { console.log('Hot step failed:', e.message); }
