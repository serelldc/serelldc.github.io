// =====================================================================
// Finds newly announced drops on SneakerFiles and ADDS them to the release
// calendar (data/releases.json). It never changes or deletes existing items.
// Used by scripts/fetch-releases.mjs (GitHub Actions, once a day: one page
// request, with a clear user agent; the site's robots.txt allows it).
// If the page cannot be read, nothing happens and the old calendar is kept.
// =====================================================================
const PAGE = 'https://www.sneakerfiles.com/release-dates/';
const UA = 'ZenkicksBot/1.0 (+https://serelldc.github.io/zenkicks/)';
const WINDOW_DAYS = 70;   // only drops in the next 10 weeks
const MAX_NEW = 40;       // at most this many new drops per run

const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };

const decode = (s) => String(s || '')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;|&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
// straight quotes, one space: matches the calendar's naming style  Air Jordan 4 "Light Army"
const tidy = (s) => decode(s).replace(/[“”„‟]/g, '"').replace(/[‘’‛]/g, "'").replace(/\s+/g, ' ').trim();

export function parseSneakerFiles(html) {
  const out = [], seen = new Set();
  for (const m of String(html).matchAll(/<article\b[\s\S]*?<\/article>/g)) {
    const a = m[0];
    const t = a.match(/<h3 class="entry-title"><a [^>]*>([\s\S]*?)<\/a>/);
    const d = a.match(/Release Date:\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
    if (!t || !d || !MONTHS[d[1].toLowerCase()]) continue;
    const name = tidy(t[1]);
    const date = `${d[3]}-${String(MONTHS[d[1].toLowerCase()]).padStart(2, '0')}-${String(d[2]).padStart(2, '0')}`;
    const key = name.toLowerCase() + '|' + date;
    if (!name || seen.has(key)) continue;
    seen.add(key);
    // one clear price only; "$120 / $90" or ranges are left as unknown
    const priceP = (a.match(/Price:\s*([^<]*)</) || [])[1] || '';
    const prices = priceP.match(/\$\s*\d+(?:\.\d+)?/g) || [];
    const retail = prices.length === 1 ? Math.round(parseFloat(prices[0].replace(/[^0-9.]/g, ''))) : null;
    const sku = tidy((a.match(/Style Code:\s*([^<]*)</i) || [])[1] || '');
    const colorway = tidy((a.match(/Color:\s*([^<]*)</i) || [])[1] || '');
    out.push({ date, name, retail_usd: retail > 0 && retail < 2000 ? retail : null, sku, colorway });
  }
  return out;
}

// real sneakers only: no slides, clogs, boots, apparel, kids sizes
const NOT_WANTED = /\b(slides?|clogs?|crocs|boots?|timberland|sandals?|slippers?|mules?|flip[- ]?flops?|ugg|birkenstock|jackets?|hoodies?|shirts?|tees?|pants|shorts|hats?|caps?|bags?|backpacks?|socks?|apparel|jerseys?|toddlers?|infants?|kids?|preschool|grade school|football|cleats?|soccer)\b|\((GS|PS|TD|BP)\)|\b(GS|PS|TD)\b/i;
const BRANDS = [
  [/\b(air jordan|jordan|aj\s?\d+)\b/i, 'Jordan'], [/\bnew balance\b/i, 'New Balance'], [/\b(adidas|yeezy)\b/i, 'adidas'],
  [/\basics\b/i, 'ASICS'], [/\bpuma\b/i, 'Puma'], [/\breebok\b/i, 'Reebok'], [/\bconverse\b/i, 'Converse'],
  [/\bvans\b/i, 'Vans'], [/\bsaucony\b/i, 'Saucony'], [/\bhoka\b/i, 'HOKA'], [/\bsalomon\b/i, 'Salomon'],
  [/\b(nike|dunk|kobe|lebron|air max|air force|foamposite|vomero|pegasus|zoom)\b/i, 'Nike'],
];
const brandOf = (name) => { for (const [re, b] of BRANDS) if (re.test(name)) return b; return undefined; };

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const words = (s) => clean(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(' ').filter((w) => w.length > 2 && !['nike', 'the', 'and', 'low', 'high', 'mid', 'retro', 'womens', 'mens', 'pack'].includes(w));
// same rule the weekly routine uses: every model number matches, then most key words
function sameShoe(wanted, found) {
  const nums = (t) => (clean(t).toLowerCase().match(/\b\d+\b/g) || []).filter((n) => n.length < 4);
  const fnums = new Set(nums(found));
  if (!nums(wanted).every((n) => fnums.has(n))) return false;
  const a = words(wanted), b = new Set(words(found));
  if (!a.length) return false;
  return a.filter((w) => b.has(w)).length / a.length >= 0.6;
}
const dayDiff = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;

// picks the drops to add (pure function: easy to test)
export function pickNew(found, existing, today) {
  const last = new Date(Date.parse(today) + WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
  const picked = [];
  for (const f of found.slice().sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.name < y.name ? -1 : 1))) {
    if (f.date < today || f.date > last) continue;
    if (NOT_WANTED.test(f.name)) continue;
    const near = (e) => e.date && dayDiff(e.date, f.date) <= 10 && (sameShoe(f.name, e.name) || sameShoe(e.name, f.name));
    if (existing.some(near) || picked.some(near)) continue;
    const item = { date: f.date, name: f.name, brand: brandOf(f.name), retail_usd: f.retail_usd, image: '', link: '' };
    if (!item.brand) delete item.brand;                    // StockX fills brand in later
    if (f.sku && /^[A-Z0-9][A-Z0-9\- ]{3,20}$/i.test(f.sku)) item.sku = f.sku;
    if (f.colorway) item.colorway = f.colorway;
    picked.push(item);
    if (picked.length >= MAX_NEW) break;
  }
  return picked;
}

// fetches the page and appends new drops to `items` (the calendar array). Returns how many were added.
export async function discoverDrops(items, today, fetchImpl = fetch) {
  const res = await fetchImpl(PAGE, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
  if (!res.ok) throw new Error('SneakerFiles HTTP ' + res.status);
  const html = await res.text();
  const found = parseSneakerFiles(html);
  if (found.length < 20) throw new Error('page looked different (' + found.length + ' drops parsed); skipped');
  const fresh = pickNew(found, items, today);
  items.push(...fresh);
  items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return fresh.length;
}
