// @ts-nocheck
// =====================================================================
// ZENKICKS — "push" Edge Function: drop-day phone notifications
//   POST {"action":"key"}                -> {"publicKey": "..."} (makes the sending keys the first time)
//   POST {"action":"test","endpoint":".."} -> sends "alerts are on" to that phone
//   POST {"action":"run"}                -> sends today's drop reminders (pg_cron calls this at 8 AM UAE)
//   POST {"action":"grails"}             -> sends grail alerts for newly listed matches (pg_cron, every 15 min)
//   POST {"action":"weekly"}             -> "drops this week" digest (pg_cron, Mondays; max once per 6 days)
//   POST {"action":"mentions"}           -> "@someone mentioned you" chat alerts (pg_cron, every minute)
// Standard Web Push (VAPID + aes128gcm), built on Web Crypto only: no extra packages.
// Uses the project's own SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (provided by Supabase).
// =====================================================================

const APP_URL = 'https://serelldc.github.io/zenkicks/';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const enc = new TextEncoder();

// ---------- small helpers ----------
export function b64u(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function unb64u(str) {
  const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

// ---------- VAPID keys ----------
export async function makeKeys() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  return { publicKey: b64u(pub), privateJwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d } };
}

async function vapidHeader(endpoint, keys) {
  const aud = new URL(endpoint).origin;
  const header = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: APP_URL })));
  const signKey = await crypto.subtle.importKey('jwk', { ...keys.privateJwk, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signKey, enc.encode(header + '.' + claims)));
  return 'vapid t=' + header + '.' + claims + '.' + b64u(sig) + ', k=' + keys.publicKey;
}

// ---------- message encryption (RFC 8291, aes128gcm) ----------
export async function encryptPayload(text, p256dh, authSecret) {
  const uaPublic = unb64u(p256dh);
  const auth = unb64u(authSecret);
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));

  const prkKey = await hmac(auth, shared);
  const ikm = await hmac(prkKey, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1])));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);

  const plain = concat(enc.encode(text), new Uint8Array([2]));
  const aes = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, plain));

  const rs = new Uint8Array([0, 0, 16, 0]); // record size 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

export async function sendPush(sub, payload, keys, fetchImpl = fetch) {
  const body = await encryptPayload(JSON.stringify(payload), sub.p256dh, sub.auth);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetchImpl(sub.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': await vapidHeader(sub.endpoint, keys),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        'TTL': '43200',
        'Urgency': 'high',
      },
      body,
      signal: ctl.signal,
    });
    const status = r.status;
    try { await r.text(); } catch (_) { /* ignore */ }
    return status;
  } catch (_) {
    return 0;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- database (service role, through PostgREST) ----------
function env(name) {
  // deno-lint-ignore no-explicit-any
  const g = globalThis;
  return g.Deno ? g.Deno.env.get(name) : g.process?.env?.[name];
}
function serviceKey() {
  const k = env('SUPABASE_SERVICE_ROLE_KEY');
  if (k) return k;
  try { const all = JSON.parse(env('SUPABASE_SECRET_KEYS') || '{}'); return all.default || Object.values(all)[0]; } catch (_) { return ''; }
}
async function rpc(fn, args = {}) {
  const url = env('SUPABASE_URL'), key = serviceKey();
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  if (!/^sb_/.test(key)) headers.Authorization = 'Bearer ' + key; // legacy JWT keys also go in Authorization
  const r = await fetch(url + '/rest/v1/rpc/' + fn, {
    method: 'POST',
    headers,
    body: JSON.stringify(args),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(fn + ' failed: ' + r.status + ' ' + txt.slice(0, 200));
  return txt ? JSON.parse(txt) : null;
}
async function getKeys() {
  let rows = await rpc('push_keys');
  if (!rows || !rows.length) {
    const k = await makeKeys();
    await rpc('push_init_keys', { p_public: k.publicKey, p_private: k.privateJwk });
    rows = await rpc('push_keys');
  }
  return { publicKey: rows[0].public_key, privateJwk: rows[0].private_jwk };
}

// ---------- what the notification says ----------
function aed(usd) { return usd ? 'AED ' + Math.round(Number(usd) * 3.6725).toLocaleString('en-US') : ''; }
export function dropMessage(items) {
  if (items.length === 1) {
    const d = items[0];
    return {
      title: '🔥 Drop day: ' + d.name,
      body: 'Releases today' + (d.usd ? ' · ' + aed(d.usd) : '') + '. Tap for details and where to cop.',
      image: d.image || undefined,
      tag: 'drop-' + d.key,
      url: './#/drops',
    };
  }
  const names = items.map((d) => d.name).join(' · ');
  return {
    title: '🔥 ' + items.length + ' drops today',
    body: names.length > 170 ? names.slice(0, 167) + '…' : names,
    image: (items.find((d) => d.image) || {}).image || undefined,
    tag: 'drops-today',
    url: './#/drops',
  };
}

async function runDue() {
  const keys = await getKeys();
  const due = (await rpc('push_due')) || [];
  let sent = 0, gone = 0, failed = 0;
  for (let i = 0; i < due.length; i += 10) {
    await Promise.all(due.slice(i, i + 10).map(async (row) => {
      const items = row.items || [];
      const status = await sendPush(row, dropMessage(items), keys);
      await rpc('push_done', { p_endpoint: row.endpoint, p_status: status, p_keys: items.map((d) => d.key) });
      if (status >= 200 && status < 300) sent++; else if (status === 404 || status === 410) gone++; else failed++;
    }));
  }
  return { phones: due.length, sent, gone, failed };
}

// ---------- grail alerts (every 15 min) ----------
export function grailMessage(items, photoBase) {
  const sz = (s) => (s ? ' · EU ' + Number(s) : '');
  if (items.length === 1) {
    const l = items[0];
    return {
      title: '⭐ Grail alert: ' + l.model,
      body: 'Just listed on Zenkicks' + sz(l.size) + ' · AED ' + Number(l.price).toLocaleString('en-US') + '. Tap to bid before someone else does.',
      image: l.photo ? photoBase + l.photo : undefined,
      tag: 'grail-' + l.id,
      url: './#/l/' + l.id,
    };
  }
  const names = items.map((l) => l.model + sz(l.size)).join(' · ');
  return {
    title: '⭐ ' + items.length + ' of your grails just got listed',
    body: names.length > 170 ? names.slice(0, 167) + '…' : names,
    image: (items.find((l) => l.photo) || {}).photo ? photoBase + items.find((l) => l.photo).photo : undefined,
    tag: 'grails',
    url: './#/grails',
  };
}
async function runGrails() {
  const due = (await rpc('push_grail_due')) || [];
  const photoBase = env('SUPABASE_URL') + '/storage/v1/object/public/listing-photos/';
  let sent = 0, failed = 0;
  const users = new Set();
  if (due.length) {
    const keys = await getKeys();
    for (let i = 0; i < due.length; i += 10) {
      await Promise.all(due.slice(i, i + 10).map(async (row) => {
        const status = await sendPush(row, grailMessage(row.items || [], photoBase), keys);
        await rpc('push_done', { p_endpoint: row.endpoint, p_status: status, p_keys: [] });
        if (status >= 200 && status < 300) sent++; else failed++;
        users.add(row.user_id);
      }));
    }
  }
  for (const u of users) await rpc('push_grail_done', { p_user: u });
  await rpc('push_grail_done', {}); // members with no phone alerts: just clear their queue
  return { phones: due.length, members: users.size, sent, failed };
}

// ---------- weekly "drops this week" digest (Mondays) ----------
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function weeklyMessage(drops) {
  const list = drops.map((d) => DOW[new Date(d.date + 'T00:00:00Z').getUTCDay()] + ' · ' + d.name.replace(/"/g, '')).join(', ');
  return {
    title: '🗓️ ' + drops.length + ' drop' + (drops.length > 1 ? 's' : '') + ' this week',
    body: list.length > 170 ? list.slice(0, 167) + '…' : list,
    image: (drops.find((d) => d.image) || {}).image || undefined,
    tag: 'weekly-drops',
    url: './#/drops',
  };
}
export function dropsThisWeek(items, now = Date.now()) {
  const day = (ms) => new Date(ms + 4 * 3600e3).toISOString().slice(0, 10); // UAE date
  const from = day(now), to = day(now + 6 * 86400e3);
  return (items || []).filter((d) => d.date >= from && d.date <= to && d.image).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
async function runWeekly() {
  const r = await fetch(APP_URL + 'data/releases.json?t=' + Date.now());
  if (!r.ok) return { error: 'calendar ' + r.status };
  const drops = dropsThisWeek((await r.json()).items);
  if (!drops.length) return { drops: 0 };
  if (!(await rpc('push_weekly_claim'))) return { skipped: 'already sent this week' };
  const targets = (await rpc('push_weekly_targets')) || [];
  const keys = await getKeys();
  const msg = weeklyMessage(drops);
  let sent = 0, failed = 0;
  for (let i = 0; i < targets.length; i += 10) {
    await Promise.all(targets.slice(i, i + 10).map(async (row) => {
      const status = await sendPush(row, msg, keys);
      await rpc('push_done', { p_endpoint: row.endpoint, p_status: status, p_keys: [] });
      if (status >= 200 && status < 300) sent++; else failed++;
    }));
  }
  return { drops: drops.length, phones: targets.length, sent, failed };
}

// ---------- chat @mentions ----------
export function mentionMessage(items) {
  const n = items.length, first = items[0] || {};
  const clip = (t) => (t.length > 170 ? t.slice(0, 167) + '…' : t);
  return {
    title: n > 1 ? '💬 ' + n + ' people mentioned you in chat' : '💬 @' + first.author + ' mentioned you',
    body: clip(n > 1 ? items.slice(0, 3).map((i) => '@' + i.author + ': ' + i.snippet).join(' · ') : first.snippet || ''),
    tag: 'chat-mentions',
    url: './#/chat',
  };
}
async function runMentions() {
  const due = (await rpc('push_mention_due')) || [];
  let sent = 0, failed = 0;
  const users = new Set();
  if (due.length) {
    const keys = await getKeys();
    for (let i = 0; i < due.length; i += 10) {
      await Promise.all(due.slice(i, i + 10).map(async (row) => {
        const status = await sendPush(row, mentionMessage(row.items || []), keys);
        await rpc('push_done', { p_endpoint: row.endpoint, p_status: status, p_keys: [] });
        if (status >= 200 && status < 300) sent++; else failed++;
        users.add(row.user_id);
      }));
    }
  }
  for (const u of users) await rpc('push_mention_done', { p_user: u });
  await rpc('push_mention_done', {}); // members with no phone alerts: just clear their queue
  return { phones: due.length, members: users.size, sent, failed };
}

async function runTest(endpoint) {
  if (!endpoint || !/^https:\/\//.test(endpoint)) return { ok: false, error: 'bad endpoint' };
  const rows = await rpc('push_test_target', { p_endpoint: endpoint });
  if (!rows || !rows.length) return { ok: false, error: 'not found or too soon' };
  const keys = await getKeys();
  const status = await sendPush({ endpoint, p256dh: rows[0].p256dh, auth: rows[0].auth }, {
    title: 'Zenkicks alerts are on ✅',
    body: 'We’ll ping you at 8 AM (UAE time) on drop day for every pair you tap Remind me on.',
    tag: 'zk-test',
    url: './#/drops',
  }, keys);
  await rpc('push_done', { p_endpoint: endpoint, p_status: status, p_keys: [] });
  return { ok: status >= 200 && status < 300, status };
}

export async function handle(req) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const action = body.action || new URL(req.url).searchParams.get('action') || 'key';
    if (action === 'key') return json({ publicKey: (await getKeys()).publicKey });
    if (action === 'test') return json(await runTest(body.endpoint));
    if (action === 'run') return json(await runDue());
    if (action === 'grails') return json(await runGrails());
    if (action === 'weekly') return json(await runWeekly());
    if (action === 'mentions') return json(await runMentions());
    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 500);
  }
}

// deno-lint-ignore no-explicit-any
const D = globalThis.Deno;
if (D && D.serve) D.serve(handle);
