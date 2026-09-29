/* =====================================================================
   ZENKICKS — app.js
   One-file single-page app. No build step: edit and push.
   Routes (hash): #/drops #/hot #/market #/l/<id> #/sell #/legit
                  #/c/<id> #/new-check #/me #/login
   ===================================================================== */
(function () {
  'use strict';

  var C = window.ZK_CONFIG || {};
  var sb = null;
  try {
    if (C.SUPABASE_URL && C.SUPABASE_ANON_KEY && window.supabase) {
      sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, { auth: { persistSession: true, detectSessionInUrl: true } });
    }
  } catch (e) { sb = null; }

  var app = document.getElementById('app');
  var ST = {
    session: null, me: null, contact: null,
    releases: null, hot: null, photos: {},
    hotTab: 'online', marketFilter: 'all', marketQ: '', legitTab: 'open',
    sell: freshSell(), newCheck: freshCheck(),
    replyTo: null, toast: '', modal: ''
  };
  function freshSell() { return { step: 1, photos: {}, f: { model: '', brand: '', size: '', condition: '', price: '', city: '', description: '', accept: true } }; }
  function freshCheck() { return { photos: [], f: { model: '', size: '', price: '', where: 'Group chat', question: '' } }; }

  // ------------------------------------------------------------------
  // helpers
  // ------------------------------------------------------------------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function aed(n) { return 'AED ' + Number(n || 0).toLocaleString('en-US'); }
  function usdToAed(n) { return n ? Math.round(n * 3.6725) : 0; }
  function ago(iso) {
    var s = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 1000));
    if (s < 60) return 'now'; if (s < 3600) return Math.floor(s / 60) + 'm'; if (s < 86400) return Math.floor(s / 3600) + 'h';
    return Math.floor(s / 86400) + 'd';
  }
  function store(key, val) { try { if (val === undefined) return JSON.parse(localStorage.getItem('zk.' + key) || 'null'); localStorage.setItem('zk.' + key, JSON.stringify(val)); } catch (e) { return null; } }
  function pub(bucket, path) { return sb ? sb.storage.from(bucket).getPublicUrl(path).data.publicUrl : ''; }
  function uid() { return ST.session && ST.session.user ? ST.session.user.id : null; }
  function isStaff() { return !!(ST.me && (ST.me.is_admin || ST.me.is_checker)); }
  function cleanQ(q) { return String(q).replace(/[%,()*\\]/g, ' ').trim().slice(0, 40); }
  function dubaiToday() { return new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 10); }
  function dayDiff(iso) { return Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(dubaiToday() + 'T00:00:00Z')) / 86400000); }
  function whenLabel(iso) { var n = dayDiff(iso); return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n > 1 ? 'In ' + n + ' days' : 'Released'; }
  var MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function norm(t) { return String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

  function compress(file) {
    return new Promise(function (res) {
      var img = new Image(); var url = URL.createObjectURL(file);
      img.onload = function () {
        var k = Math.min(1, 1600 / Math.max(img.width, img.height));
        var c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b) { URL.revokeObjectURL(url); res(b || file); }, 'image/jpeg', 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); res(file); };
      img.src = url;
    });
  }

  // ------------------------------------------------------------------
  // icons + logo
  // ------------------------------------------------------------------
  var Z = 'M-58.1 79.3 Q-59.0 79.8 -61.1 79.9 Q-63.2 80.1 -65.5 79.3 Q-67.9 78.4 -70.3 76.8 Q-72.7 75.2 -74.9 72.8 Q-77.1 70.5 -78.7 68.0 Q-80.2 65.6 -81.5 62.6 Q-82.7 59.5 -83.5 56.8 Q-84.4 54.0 -85.6 48.3 Q-86.8 42.7 -87.0 -9.7 Q-87.2 -62.0 -86.6 -65.2 Q-86.1 -68.4 -84.5 -72.0 Q-82.9 -75.6 -81.5 -77.2 Q-80.1 -78.8 -79.1 -79.3 Q-78.2 -79.8 -77.2 -80.0 Q-76.2 -80.2 -74.4 -80.2 Q-72.6 -80.1 -69.8 -79.5 Q-67.0 -78.8 -60.2 -76.2 Q-53.5 -73.6 -50.0 -72.5 Q-46.5 -71.4 -42.3 -70.8 Q-38.0 -70.2 -34.0 -70.5 Q-30.1 -70.8 -29.1 -70.7 Q-28.0 -70.5 -27.2 -70.0 Q-26.3 -69.6 -25.8 -69.1 Q-25.4 -68.6 -25.0 -67.7 Q-24.5 -66.8 -24.5 -65.8 Q-24.4 -64.8 -24.6 -63.8 Q-24.9 -62.7 -25.8 -60.8 Q-26.8 -58.9 -29.5 -54.6 Q-32.3 -50.4 -33.4 -47.4 Q-34.4 -44.3 -34.4 -41.5 Q-34.4 -38.6 -33.5 -36.3 Q-32.6 -34.0 -31.7 -32.9 Q-30.8 -31.7 -29.7 -30.9 Q-28.6 -30.0 -27.6 -29.5 Q-26.6 -29.0 -25.3 -28.7 Q-23.9 -28.4 -22.1 -28.5 Q-20.4 -28.5 -15.5 -29.8 Q-10.6 -31.1 -8.8 -31.3 Q-7.0 -31.4 -6.0 -31.3 Q-5.0 -31.1 -4.1 -30.7 Q-3.2 -30.3 -2.7 -29.8 Q-2.3 -29.4 -1.7 -27.8 Q-1.1 -26.2 -1.4 -24.9 Q-1.6 -23.6 -2.7 -22.2 Q-3.7 -20.8 -10.2 -15.7 Q-16.8 -10.5 -20.4 -6.9 Q-24.0 -3.4 -27.4 0.9 Q-30.8 5.1 -33.2 8.8 Q-35.6 12.4 -38.1 17.6 Q-40.7 22.8 -43.7 31.4 Q-46.7 39.9 -48.1 45.6 Q-49.5 51.2 -49.9 55.5 Q-50.4 59.8 -51.7 66.5 Q-53.0 73.3 -54.3 75.4 Q-55.5 77.5 -56.3 78.2 Q-57.1 78.9 -58.1 79.3Z';
  var LOGO = '<svg viewBox="-112 -112 224 224" aria-hidden="true"><rect x="-112" y="-112" width="224" height="224" fill="#0D0D0D"/><g fill="#E52C27"><path d="' + Z + '"/><path d="' + Z + '" transform="rotate(180)"/></g></svg>';
  function ic(p, w) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (w || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; }
  var I = {
    search: ic('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'),
    bell: ic('<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21a2 2 0 0 0 4 0"/>'),
    check: ic('<path d="M5 12l5 5L20 7"/>', 3),
    back: ic('<path d="M15 5l-7 7 7 7"/>', 2.2),
    close: ic('<path d="M6 6l12 12M18 6L6 18"/>', 2.2),
    heart: ic('<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>'),
    heartOn: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/></svg>',
    chat: ic('<path d="M4 5h16v11H9l-5 4z"/>'),
    shield: ic('<path d="M12 3l7 3v6c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6z"/><path d="M9 12l2 2 4-4"/>'),
    cal: ic('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
    flame: ic('<path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-3.5 2-5 1 1.5 1.5 2 2.5 2 0-2.5-.5-4.5.5-7z"/>'),
    bag: ic('<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>'),
    plus: ic('<path d="M12 5v14M5 12h14"/>', 2.5),
    camera: ic('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
    flag: ic('<path d="M5 21V4h11l-1.5 4L16 12H5"/>'),
    user: ic('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'),
    shoe: '<svg viewBox="0 0 200 110" aria-hidden="true"><path d="M14 80 Q12 62 24 55 L62 42 Q80 37 90 22 L98 16 Q106 13 112 22 Q124 44 152 52 L182 61 Q195 66 193 80 Z" fill="#F7F4EC" stroke="#0D0D0D" stroke-width="4" stroke-linejoin="round"/><path d="M8 80 L194 80 Q198 80 198 85 L198 90 Q198 96 192 96 L16 96 Q8 96 8 88 Z" fill="#FFFFFF" stroke="#0D0D0D" stroke-width="4" stroke-linejoin="round"/></svg>'
  };
  function photoBox(src, h, alt) {
    return src
      ? '<div class="tile" style="height:' + h + 'px;background:#fff"><img src="' + esc(src) + '" alt="' + esc(alt || '') + '" loading="lazy" style="width:100%;height:100%;object-fit:cover"></div>'
      : '<div class="tile" style="height:' + h + 'px;background:#E6DFD0">' + I.shoe + '</div>';
  }

  // ------------------------------------------------------------------
  // toast + modal
  // ------------------------------------------------------------------
  var toastTimer;
  function toast(msg) {
    var old = app.querySelector('.toast'); if (old) old.remove();
    var t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg; app.appendChild(t);
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.remove(); }, 2800);
  }
  function openModal(html) { closeModal(); var m = document.createElement('div'); m.className = 'modal-back'; m.innerHTML = '<div class="modal" role="dialog" aria-modal="true">' + html + '</div>'; app.appendChild(m); var f = m.querySelector('input,textarea,button'); if (f) f.focus(); }
  function closeModal() { var m = app.querySelector('.modal-back'); if (m) m.remove(); }
  function fail(e) { console.error(e); toast((e && e.message) ? e.message : 'Something went wrong. Try again.'); }

  // ------------------------------------------------------------------
  // routing
  // ------------------------------------------------------------------
  function route() {
    var h = (location.hash || '#/drops').replace(/^#\/?/, '').split('/');
    return { name: h[0] || 'drops', id: h[1] || null };
  }
  function go(path) { if (location.hash === '#/' + path) render(); else location.hash = '#/' + path; }
  window.addEventListener('hashchange', function () { render(); });

  // ------------------------------------------------------------------
  // shell
  // ------------------------------------------------------------------
  function header(r) {
    var back = { l: 'market', c: 'legit', 'new-check': 'legit', sell: 'drops', login: 'drops' }[r.name];
    var titles = { l: 'Listing', c: 'Legit check', 'new-check': 'New check', sell: 'Sell a pair', login: 'Sign in' };
    if (back) {
      return '<header class="hd"><button class="ibtn" data-go="' + back + '" aria-label="Back">' + (r.name === 'sell' || r.name === 'new-check' || r.name === 'login' ? I.close : I.back) + '</button><div class="hd-title">' + LOGO + esc(titles[r.name]) + '</div><span style="width:44px"></span></header>';
    }
    var me = uid()
      ? '<button class="avatar-btn" data-go="me" aria-label="My profile" style="background:var(--red)">' + esc((ST.me && ST.me.username || '?')[0].toUpperCase()) + '</button>'
      : '<button class="ibtn" data-go="login" aria-label="Sign in">' + I.user + '</button>';
    return '<header class="hd"><button class="brand" data-go="drops" aria-label="Zenkicks home">' + LOGO + '<span>ZENKICKS</span></button>' +
      '<button class="ibtn" data-go="market" aria-label="Search the market">' + I.search + '</button>' + me + '</header>';
  }
  function tabs(r) {
    if (['l', 'c', 'sell', 'new-check', 'login'].indexOf(r.name) > -1) return '';
    function t(v, label, icon) { var on = r.name === v; return '<button class="tab' + (on ? ' on' : '') + '" data-go="' + v + '"' + (on ? ' aria-current="page"' : '') + '>' + icon + label + '</button>'; }
    return '<nav class="tabs" aria-label="App">' + t('drops', 'Drops', I.cal) + t('hot', 'Hot', I.flame) +
      '<button class="tab sell" data-go="sell"><span class="plus">' + I.plus + '</span>Sell</button>' +
      t('market', 'Market', I.bag) + t('legit', 'Legit', I.shield) + '</nav>';
  }
  function setupBanner() {
    return ''; // no public setup banner
  }
  function needSb() {
    return '<div class="empty">' + I.shield + '<b>Opening soon</b><span>Buy, sell and legit checks are coming soon. Drops and What’s hot are live now.</span><button class="btn red" data-go="drops">See drops</button></div>';
  }
  function needLogin(what) {
    return '<div class="empty">' + I.user + '<b>Sign in to ' + esc(what) + '</b><span>It’s free. Use your email' + (C.GOOGLE_LOGIN ? ' or Google' : '') + '.</span><button class="btn red" data-go="login">Sign in</button></div>';
  }
  function skeleton() { return '<div class="pad"><div class="skeleton" style="height:160px"></div><div class="skeleton" style="height:70px"></div><div class="skeleton" style="height:70px"></div><div class="skeleton" style="height:70px"></div></div>'; }

  var renderSeq = 0;
  function render(keepScroll) {
    var r = route(); var seq = ++renderSeq;
    var oldMain = app.querySelector('.main'); var top = keepScroll && oldMain ? oldMain.scrollTop : 0;
    var bottom = (r.name === 'l' || r.name === 'c' || r.name === 'sell' || r.name === 'new-check') ? '<div id="bottombar"></div>' : tabs(r);
    app.innerHTML = header(r) + setupBanner() + '<main class="main" id="main">' + (keepScroll && oldMain ? oldMain.innerHTML : skeleton()) + '</main>' + bottom;
    var view = VIEWS[r.name] || VIEWS.drops;
    Promise.resolve().then(function () { return view(r); }).then(function (out) {
      if (seq !== renderSeq) return;
      if (typeof out === 'string') out = { html: out };
      var main = document.getElementById('main'); main.innerHTML = out.html; main.scrollTop = top;
      var bb = document.getElementById('bottombar'); if (bb) bb.outerHTML = out.bottom || '';
      if (out.after) out.after();
      fillAds();
    }).catch(function (e) {
      if (seq !== renderSeq) return;
      document.getElementById('main').innerHTML = '<div class="empty">' + I.flag + '<b>Couldn’t load this page</b><span>' + esc(e && e.message || 'Check your connection and try again.') + '</span><button class="btn dark" data-act="reload">Try again</button></div>';
    });
  }

  // ------------------------------------------------------------------
  // ads
  // ------------------------------------------------------------------
  function adSlot() {
    var A = C.ADS || {};
    if (!A.enabled) return '';
    if (A.adsenseClient && A.adsenseSlot) return '<div class="ad-slot"><span class="adlabel">Sponsored</span><ins class="adsbygoogle" style="display:block" data-ad-client="' + esc(A.adsenseClient) + '" data-ad-slot="' + esc(A.adsenseSlot) + '" data-ad-format="auto" data-full-width-responsive="true"></ins></div>';
    var s = A.sponsor || {};
    if (!s.name) return '';
    return '<a class="ad-slot" href="' + esc(s.link || '#') + '" target="_blank" rel="noopener sponsored"><span class="adlabel">Sponsored · ' + esc(s.name) + '</span>' + (s.image ? '<img src="' + esc(s.image) + '" alt="" style="width:100%;border-radius:10px">' : '') + '<span style="font-size:14px;font-weight:600">' + esc(s.text) + '</span></a>';
  }
  var adsLoaded = false;
  function fillAds() {
    var A = C.ADS || {}; if (!A.enabled || !A.adsenseClient) return;
    var slots = app.querySelectorAll('ins.adsbygoogle:not([data-done])'); if (!slots.length) return;
    if (!adsLoaded) { adsLoaded = true; var s = document.createElement('script'); s.async = true; s.crossOrigin = 'anonymous'; s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(A.adsenseClient); document.head.appendChild(s); }
    slots.forEach(function (el) { el.setAttribute('data-done', '1'); try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {} });
  }

  // ------------------------------------------------------------------
  // data: releases + hot (static JSON refreshed daily by GitHub Actions)
  // ------------------------------------------------------------------
  function loadFeeds() {
    if (ST.releases) return Promise.resolve();
    function j(u) { return fetch(u + '?v=' + dubaiToday(), { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }
    return Promise.all([j('data/releases.json'), j('data/hot.json'), j('data/photos.json')]).then(function (a) {
      ST.releases = a[0] || { items: [] }; ST.hot = a[1] || { online: [] }; ST.photos = a[2] || {};
      // Show only pairs that have a real photo; others appear once KicksDB or data/photos.json gives them one.
      ST.releases.items = (ST.releases.items || []).filter(function (d) { return !!releaseImg(d); });
      ST.hot.online = (ST.hot.online || []).filter(function (h) { return !!releaseImg(h); });
    });
  }
  function releaseImg(item) {
    var n = norm(item.name);
    for (var k in ST.photos) { var nk = norm(k); if (nk && (n.indexOf(nk) > -1 || nk.indexOf(n) > -1)) return ST.photos[k]; }
    return item.image || '';
  }
  function upcoming() {
    return (ST.releases.items || []).filter(function (d) { return d.date && dayDiff(d.date) >= 0; })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  }
  function priceLine(usd) { return usd ? 'AED ' + usdToAed(usd).toLocaleString('en-US') + ' <span style="opacity:.7">(US$' + usd + ')</span>' : 'Price TBA'; }
  function stamp() { return 'Updated ' + (ST.releases.updated || '—') + ' · auto-refreshes daily'; }

  // ------------------------------------------------------------------
  // data: listings
  // ------------------------------------------------------------------
  var LISTING_COLS = 'id,model,brand,size_eu,condition,price_aed,city,legit_checked,accept_bids,description,status,created_at,seller_id,seller:profiles!listings_seller_id_fkey(username,verified_level),photos:listing_photos(path,kind,position)';
  function firstPhoto(l) {
    var ps = (l.photos || []).slice().sort(function (a, b) { var o = { side: 0, tag: 1 }; return ((o[a.kind] != null ? o[a.kind] : 5) - (o[b.kind] != null ? o[b.kind] : 5)) || a.position - b.position; });
    return ps[0] ? pub('listing-photos', ps[0].path) : '';
  }
  function verifiedPill(level) {
    return level === 'id' ? '<span class="pill ok">✓ ID-verified</span>' : level === 'phone' ? '<span class="pill ok">✓ Phone-verified</span>' : '<span class="pill sample">Email only</span>';
  }
  function itemCard(l, stats) {
    stats = stats || {};
    return '<button class="item" data-go="l/' + l.id + '"><div class="tile" style="height:120px;background:#fff"><span class="pill white cond" style="z-index:1">' + esc(l.condition) + '</span>' +
      (l.legit_checked ? '<span class="pill dark chk" style="z-index:1">Checked</span>' : '') +
      (firstPhoto(l) ? '<img src="' + esc(firstPhoto(l)) + '" alt="" loading="lazy">' : I.shoe) + '</div>' +
      '<span class="t">' + esc(l.model) + '</span><span class="m">' + (l.size_eu ? 'EU ' + l.size_eu + ' · ' : '') + esc(l.city || 'UAE') + '</span>' +
      '<span class="between" style="align-items:center"><span class="money" style="font-size:15px">' + aed(l.price_aed) + '</span>' +
      (stats.bid_count ? '<span class="tiny">' + stats.bid_count + ' bid' + (stats.bid_count === 1 ? '' : 's') + '</span>' : '<span style="font-size:12px;font-weight:700;color:var(--green)">' + (l.seller && l.seller.verified_level !== 'email' ? '✓' : '') + '</span>') + '</span></button>';
  }
  function statsFor(ids) {
    if (!sb || !ids.length) return Promise.resolve({});
    return sb.rpc('listing_stats', { ids: ids }).then(function (r) { var m = {}; (r.data || []).forEach(function (s) { m[s.listing_id] = s; }); return m; });
  }

  // ------------------------------------------------------------------
  // VIEWS
  // ------------------------------------------------------------------
  var VIEWS = {};

  VIEWS.drops = function () {
    var fresh = sb ? sb.from('listings').select(LISTING_COLS).eq('status', 'active').order('created_at', { ascending: false }).limit(4) : Promise.resolve({ data: [] });
    return Promise.all([loadFeeds(), fresh]).then(function (a) {
      var listings = (a[1] && a[1].data) || [];
      var up = upcoming(); var next = up[0]; var rem = store('rem') || {};
      var rows = up.slice(0, 8).map(function (d) {
        var dt = new Date(d.date + 'T00:00:00Z'); var on = !!rem[d.name + d.date]; var im = releaseImg(d);
        return '<div class="card drop"><div class="date"><span>' + MON[dt.getUTCMonth()] + '</span><b>' + ('0' + dt.getUTCDate()).slice(-2) + '</b></div>' +
          (im ? '<img src="' + esc(im) + '" alt="" loading="lazy" style="width:64px;height:46px;object-fit:cover;border-radius:8px;flex-shrink:0;background:#fff">' : '') +
          '<div class="grow"><div class="t" style="font-size:14px;line-height:1.3">' + esc(d.name) + '</div><div class="m">' + DOW[dt.getUTCDay()] + ' · ' + whenLabel(d.date) + ' · ' + priceLine(d.retail_usd) + '</div></div>' +
          '<button class="round' + (on ? ' on' : '') + '" data-act="rem" data-key="' + esc(d.name + d.date) + '" aria-pressed="' + on + '" aria-label="' + (on ? 'Remove reminder for ' : 'Remind me about ') + esc(d.name) + '">' + (on ? I.check : I.bell) + '</button></div>';
      }).join('') || '<p class="sub">No upcoming drops in the feed right now.</p>';
      var hot = (ST.hot.online || []).slice(0, 5).map(function (h, i) {
        var im = releaseImg(h);
        return '<button class="card hotcard" data-go="hot"><div class="tile" style="height:90px;background:#fff"><span class="rank" style="z-index:1">' + (i + 1) + '</span>' + (im ? '<img src="' + esc(im) + '" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover">' : I.shoe) + '</div><span class="t" style="font-size:13px;line-height:1.3">' + esc(h.name) + '</span><span class="m">' + esc(h.why || '') + '</span></button>';
      }).join('');
      var nextCard = '';
      if (next) {
        var nd = new Date(next.date + 'T00:00:00Z'); var nim = releaseImg(next); var non = !!rem[next.name + next.date];
        nextCard = '<div class="next"><div class="between"><span class="eyebrow">Next drop</span><span class="mono" style="font-size:13px">' + whenLabel(next.date) + '</span></div>' +
          (nim ? '<img src="' + esc(nim) + '" alt="' + esc(next.name) + '" style="width:100%;aspect-ratio:3/2;object-fit:cover;border-radius:12px;background:#fff">' : '') +
          '<div><div style="font-family:var(--display);font-size:15px;line-height:1.25">' + esc(next.name) + '</div><div class="m" style="color:var(--sand)">' + DOW[nd.getUTCDay()] + ', ' + nd.getUTCDate() + ' ' + MON[nd.getUTCMonth()].charAt(0) + MON[nd.getUTCMonth()].slice(1).toLowerCase() + ' · ' + priceLine(next.retail_usd) + '</div></div>' +
          '<button class="btn ' + (non ? 'ghost' : 'red') + ' full" ' + (non ? 'style="color:var(--coral)" ' : '') + 'data-act="rem" data-key="' + esc(next.name + next.date) + '" aria-pressed="' + non + '">' + (non ? 'Reminder set' : 'Remind me') + '</button></div>';
      }
      var ids = listings.map(function (l) { return l.id; });
      return statsFor(ids).then(function (stats) {
        return '<section class="hero"><span class="eyebrow">Your Sneakerheadlines</span><h1>Hype drops.<br><span class="script">Zen deals.</span><br>Zero fakes.</h1>' + nextCard + '</section>' +
          '<div class="pad">' +
          '<section class="sec"><div class="between"><h2>Release calendar</h2><span class="pill ok" style="font-size:10px">AUTO</span></div><p class="sub" style="font-size:12px">' + esc(stamp()) + ' · AED from US retail at 3.6725; UAE store prices may differ</p>' + rows + '</section>' +
          (hot ? '<section class="sec"><div class="between"><h2>What’s hot</h2><button class="link" data-go="hot">See all</button></div><div class="scroller">' + hot + '</div></section>' : '') +
          adSlot() +
          '<section class="sec"><div class="between"><h2>Fresh pairs</h2><button class="link" data-go="market">Shop</button></div>' +
          (listings.length ? '<div class="grid">' + listings.map(function (l) { return itemCard(l, stats[l.id]); }).join('') + '</div>' : '<div class="card empty" style="padding:20px">' + I.bag + '<span>No pairs listed yet. Be the first.</span><button class="btn red" data-go="sell">Sell a pair</button></div>') + '</section>' +
          '<button class="safety" style="border:0;text-align:left;align-items:center" data-go="legit"><span style="color:var(--coral)">' + I.shield + '</span><span class="grow" style="display:flex;flex-direction:column;gap:2px"><b style="font-size:15px;color:var(--bone)">Legit or fake?</b><span>Post photos and let the community vote</span></span><span aria-hidden="true" style="font-size:20px;color:var(--bone)">›</span></button>' +
          sourcesNote() + '</div>';
      });
    });
  };
  function sourcesNote() {
    return '<p class="tiny" style="margin:0">Release data: ' + esc((ST.releases && ST.releases.source) || 'public release calendars') + '. Product images belong to their owners. Reminders are saved on this device.</p>';
  }

  VIEWS.hot = function () {
    return loadFeeds().then(function () {
      var seg = '<div class="seg" role="tablist" aria-label="Hot source"><button role="tab" class="' + (ST.hotTab === 'online' ? 'on' : '') + '" aria-selected="' + (ST.hotTab === 'online') + '" data-act="hottab" data-v="online">Online buzz</button><button role="tab" class="' + (ST.hotTab === 'market' ? 'on' : '') + '" aria-selected="' + (ST.hotTab === 'market') + '" data-act="hottab" data-v="market">On Zenkicks</button></div>';
      var head = '<div class="sec" style="gap:4px"><div class="row"><h1>What’s hot</h1><span class="pill ok" style="font-size:10px">AUTO</span></div><p class="sub">' + (ST.hotTab === 'online' ? 'Most-traded and most-hyped pairs right now, refreshed daily.' : 'Live from the Zenkicks market: bids and watchlist saves in the last 7 days.') + '</p></div>';
      if (ST.hotTab === 'online') {
        var list = (ST.hot.online || []).map(function (h, n) {
          var im = releaseImg(h);
          return '<div class="card hotrow"><span class="n">' + (n + 1) + '</span><div class="tile" style="width:72px;height:52px;flex-shrink:0;background:#fff">' + (im ? '<img src="' + esc(im) + '" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover">' : I.shoe) + '</div><div class="grow"><div class="t" style="font-size:14px;line-height:1.3">' + esc(h.name) + '</div><div class="m">' + esc(h.why || '') + '</div></div>' + (h.tag ? '<span class="trend">' + esc(h.tag) + '</span>' : '') + '</div>';
        }).join('') || '<p class="sub">Nothing in the feed yet.</p>';
        return '<div class="pad">' + head + seg + '<div class="list">' + list + '</div>' + adSlot() + sourcesNote() + '</div>';
      }
      if (!sb) return '<div class="pad">' + head + seg + needSb() + '</div>';
      return sb.rpc('hot_listings', { max_rows: 10 }).then(function (r) {
        if (r.error) throw r.error;
        var ids = (r.data || []).map(function (x) { return x.listing_id; });
        if (!ids.length) return '<div class="pad">' + head + seg + '<div class="empty">' + I.flame + '<span>No activity yet. Bids and saves will show up here.</span></div></div>';
        return Promise.all([sb.from('listings').select(LISTING_COLS).in('id', ids), statsFor(ids)]).then(function (b) {
          var byId = {}; (b[0].data || []).forEach(function (l) { byId[l.id] = l; });
          var rows = ids.filter(function (id) { return byId[id]; }).map(function (id, n) {
            var l = byId[id]; var s = b[1][id] || {};
            return '<button class="card hotrow" data-go="l/' + id + '"><span class="n">' + (n + 1) + '</span><div class="tile" style="width:72px;height:52px;flex-shrink:0;background:#fff">' + (firstPhoto(l) ? '<img src="' + esc(firstPhoto(l)) + '" alt="" style="width:100%;height:100%;object-fit:cover">' : I.shoe) + '</div><div class="grow"><div class="t" style="font-size:14px">' + esc(l.model) + '</div><div class="m">' + (s.bid_count || 0) + ' bids · ' + (s.watchers || 0) + ' watching · ' + aed(l.price_aed) + '</div></div></button>';
          }).join('');
          return '<div class="pad">' + head + seg + '<div class="list">' + rows + '</div></div>';
        });
      });
    });
  };

  VIEWS.market = function () {
    var chips = [['all', 'All'], ['new', 'New / DS'], ['used', 'Pre-owned'], ['checked', 'Legit-checked']].map(function (c) {
      return '<button class="chip' + (ST.marketFilter === c[0] ? ' on' : '') + '" aria-pressed="' + (ST.marketFilter === c[0]) + '" data-act="mfilter" data-v="' + c[0] + '">' + c[1] + '</button>';
    }).join('');
    var head = '<div class="row"><h1>Market</h1></div><label class="search" for="q">' + I.search + '<input id="q" type="search" placeholder="Model, brand or city" value="' + esc(ST.marketQ) + '" autocomplete="off"></label><div class="chips">' + chips + '</div>';
    if (!sb) return '<div class="pad">' + head + needSb() + '</div>';
    return marketGrid().then(function (grid) {
      return { html: '<div class="pad">' + head + '<div id="grid-wrap">' + grid + '</div>' + adSlot() + '</div>' };
    });
  };
  function marketGrid() {
    var q = sb.from('listings').select(LISTING_COLS).eq('status', 'active').order('created_at', { ascending: false }).limit(40);
    if (ST.marketFilter === 'new') q = q.eq('condition', 'New / DS');
    if (ST.marketFilter === 'used') q = q.neq('condition', 'New / DS');
    if (ST.marketFilter === 'checked') q = q.eq('legit_checked', true);
    var term = cleanQ(ST.marketQ);
    if (term) q = q.or('model.ilike.%' + term + '%,brand.ilike.%' + term + '%,city.ilike.%' + term + '%');
    return q.then(function (r) {
      if (r.error) throw r.error;
      var ls = r.data || [];
      if (!ls.length) return '<div class="empty">' + I.bag + '<b>' + (term || ST.marketFilter !== 'all' ? 'No pairs match' : 'No pairs listed yet') + '</b><span>' + (term ? 'Try another model or clear the filter.' : 'List yours and it shows up here.') + '</span><button class="btn red" data-go="sell">Sell a pair</button></div>';
      return statsFor(ls.map(function (l) { return l.id; })).then(function (st) {
        return '<p class="sub" style="font-size:13px;margin-bottom:10px">' + ls.length + ' pairs · bid and deal direct with the seller</p><div class="grid">' + ls.map(function (l) { return itemCard(l, st[l.id]); }).join('') + '</div>';
      });
    });
  }

  VIEWS.l = function (r) {
    if (!sb) return needSb();
    var me = uid();
    return sb.from('listings').select(LISTING_COLS).eq('id', r.id).maybeSingle().then(function (res) {
      if (res.error) throw res.error;
      var l = res.data; if (!l) return '<div class="empty">' + I.bag + '<b>This listing is gone</b><span>It may have been sold or removed.</span><button class="btn dark" data-go="market">Back to Market</button></div>';
      var mine = me && l.seller_id === me;
      var jobs = [statsFor([l.id]),
        me ? sb.from('watches').select('listing_id').eq('user_id', me).eq('listing_id', l.id) : Promise.resolve({ data: [] }),
        me ? sb.from('bids').select('id,amount_aed,status,created_at,bidder_id,bidder:profiles!bids_bidder_id_fkey(username,verified_level)').eq('listing_id', l.id).order('amount_aed', { ascending: false }) : Promise.resolve({ data: [] })];
      return Promise.all(jobs).then(function (a) {
        var s = a[0][l.id] || {}; var watching = (a[1].data || []).length > 0; var bids = a[2].data || [];
        var myBids = bids.filter(function (b) { return b.bidder_id === me && b.status !== 'withdrawn'; });
        var myBid = myBids[0];
        var photos = (l.photos || []).slice().sort(function (x, y) { return x.position - y.position; });
        ST.gallery = { photos: photos.map(function (p) { return { url: pub('listing-photos', p.path), kind: p.kind }; }), i: 0 };
        var gal = galleryHTML();
        var ownerPanel = '';
        if (mine) {
          var active = bids.filter(function (b) { return b.status === 'pending' || b.status === 'accepted'; });
          ownerPanel = '<div class="card" style="padding:14px;display:flex;flex-direction:column;gap:10px"><b>Bids on your pair</b>' +
            (active.length ? active.map(function (b) {
              return '<div class="kv" style="align-items:center"><span><b>' + aed(b.amount_aed) + '</b> · @' + esc(b.bidder && b.bidder.username) + ' <span class="tiny">' + ago(b.created_at) + '</span></span>' +
                (b.status === 'accepted' ? '<button class="btn dark" style="height:40px;font-size:13px" data-act="contact" data-id="' + b.id + '">Show contact</button>'
                  : '<span class="row" style="gap:6px"><button class="btn red" style="height:40px;padding:0 12px;font-size:13px" data-act="accept" data-id="' + b.id + '">Accept</button><button class="btn ghost" style="height:40px;padding:0 12px;font-size:13px" data-act="decline" data-id="' + b.id + '">Decline</button></span>') + '</div>';
            }).join('') : '<span class="sub">No bids yet. Share your listing to get more eyes on it.</span>') +
            '<div class="row" style="gap:8px"><button class="btn dark" style="flex:1" data-act="sold" data-id="' + l.id + '">Mark as sold</button><button class="btn ghost" style="flex:1" data-act="remove" data-id="' + l.id + '">Remove</button></div></div>';
        }
        var myBidPanel = '';
        if (myBid) {
          myBidPanel = '<div class="note" role="status" style="background:' + (myBid.status === 'accepted' ? 'var(--green);color:#fff' : 'var(--mint)') + '"><span style="width:18px">' + I.check + '</span><span>' +
            (myBid.status === 'accepted' ? '<b>The seller accepted your bid of ' + aed(myBid.amount_aed) + '.</b> Contact them to agree on payment and meet-up or delivery. <button class="link" style="color:#fff;text-decoration:underline" data-act="contact" data-id="' + myBid.id + '">Show seller contact</button>'
              : myBid.status === 'declined' ? '<b>Your bid of ' + aed(myBid.amount_aed) + ' was declined.</b> You can place a new one.'
                : '<b>Your bid: ' + aed(myBid.amount_aed) + '.</b> Waiting for the seller. <button class="link" style="padding:0" data-act="withdraw" data-id="' + myBid.id + '">Withdraw</button>') + '</span></div>';
        }
        var html = gal + '<div class="pad">' +
          '<div class="sec" style="gap:8px"><div class="chips-wrap">' + verifiedPill(l.seller && l.seller.verified_level) + (l.legit_checked ? '<span class="pill dark">Legit-checked</span>' : '') + '</div>' +
          '<h1 style="font-size:24px">' + esc(l.model) + '</h1><div class="sub">' + (l.size_eu ? 'EU ' + l.size_eu + ' · ' : '') + esc(l.condition) + ' · ' + esc(l.city || 'UAE') + '</div>' +
          '<div class="row" style="align-items:baseline;gap:8px"><span class="m">Asking</span><span class="money" style="font-size:26px">' + aed(l.price_aed) + '</span></div></div>' +
          '<div class="card between" style="padding:14px;align-items:center"><div><div class="m">Highest bid</div><div class="money" style="font-size:19px">' + (s.high_bid ? aed(s.high_bid) : '—') + '</div></div><span class="m">' + (s.bid_count || 0) + ' bids · ' + (s.watchers || 0) + ' watching</span></div>' +
          myBidPanel + ownerPanel +
          (l.description ? '<div class="card" style="padding:14px;display:flex;flex-direction:column;gap:6px"><b>Seller’s note</b><p class="sub" style="font-size:14px;white-space:pre-line">' + esc(l.description) + '</p></div>' : '') +
          '<div class="card row" style="padding:12px 14px"><div class="avatar">' + esc(((l.seller && l.seller.username) || '?')[0].toUpperCase()) + '</div><div class="grow"><div class="t">@' + esc(l.seller && l.seller.username) + '</div><div class="m">Listed ' + ago(l.created_at) + ' ago</div></div>' +
          (!mine ? '<button class="round" data-act="report" data-type="listing" data-id="' + l.id + '" aria-label="Report this listing">' + I.flag + '</button>' : '') + '</div>' +
          '<div class="safety"><span style="color:var(--coral)">' + I.shield + '</span><div><b style="font-size:14px">No payments through Zenkicks</b><br><span>When a bid is accepted, you get each other’s WhatsApp to agree on payment and delivery. Meet in a public place, check the pair before you pay, and never send money in advance to someone you can’t verify.</span></div></div>' +
          '</div>';
        var bottom = '';
        if (!mine && l.status === 'active') {
          if (!me) bottom = '<div class="actionbar"><button class="btn red" style="flex:1;height:52px" data-go="login">Sign in to bid</button></div>';
          else if (!l.accept_bids) bottom = '<div class="actionbar"><span class="grow" style="font-size:14px">Seller isn’t taking bids on this pair.</span><button class="btn ghost" data-act="watch" data-id="' + l.id + '" data-on="' + watching + '">' + (watching ? 'Saved' : 'Save') + '</button></div>';
          else bottom = '<div class="actionbar"><button class="ibtn' + (watching ? ' on' : '') + '" data-act="watch" data-id="' + l.id + '" data-on="' + watching + '" aria-pressed="' + watching + '" aria-label="Save to watchlist">' + (watching ? I.heartOn : I.heart) + '</button><label class="bidfield" for="amt">AED<input id="amt" type="number" inputmode="numeric" min="1" placeholder="Your bid"></label><button class="btn red" data-act="bid" data-id="' + l.id + '" style="height:52px">Bid</button></div>';
        }
        return { html: html, bottom: bottom };
      });
    });
  };
  function galleryHTML() {
    var g = ST.gallery; if (!g) return '';
    var cur = g.photos[g.i];
    var main = '<div class="tile gallery" style="height:300px;border-radius:0;background:#fff">' + (cur ? '<img src="' + esc(cur.url) + '" alt="' + esc(cur.kind || 'Photo') + '">' : I.shoe) + (cur && cur.kind ? '<span class="pill white" style="position:absolute;top:12px;left:12px;border:1px solid var(--line)">' + esc({ tag: 'Tag photo', side: 'Side', label: 'Size label', box: 'Box label', sole: 'Sole', insole: 'Insole' }[cur.kind] || 'Photo') + '</span>' : '') + '</div>';
    var strip = g.photos.length > 1 ? '<div class="thumbstrip" style="margin-top:10px">' + g.photos.map(function (p, i) { return '<button class="' + (i === g.i ? 'on' : '') + '" data-act="gal" data-i="' + i + '" aria-label="Photo ' + (i + 1) + '"><img src="' + esc(p.url) + '" alt=""></button>'; }).join('') + '</div>' : '';
    return '<div id="gallery">' + main + strip + '</div>';
  }

  // ------------------------------------------------------------------
  // SELL
  // ------------------------------------------------------------------
  var SELL_PHOTOS = [
    { key: 'side', label: 'Both sides', hint: 'Full side profile', req: true },
    { key: 'tag', label: 'Tag photo', hint: '@username + date on paper', req: true },
    { key: 'label', label: 'Size label', hint: 'SKU readable', req: true },
    { key: 'box', label: 'Box label', hint: 'SKU and size' },
    { key: 'sole', label: 'Sole', hint: 'Straight on' },
    { key: 'insole', label: 'Insole', hint: 'Print + stitching' }
  ];
  VIEWS.sell = function () {
    if (!sb) return needSb();
    if (!uid()) return needLogin('sell a pair');
    var S = ST.sell;
    var steps = ['Contact', 'Photos', 'Details'].map(function (s, i) { return '<li class="' + (S.step >= i + 1 ? 'on' : '') + '"><i></i>' + s + '</li>'; }).join('');
    var body = '';
    if (S.step === 1) {
      var lvl = ST.me && ST.me.verified_level;
      body = '<div class="sec" style="gap:4px"><h1>Before you list</h1><p class="sub">Buyers contact you on WhatsApp once you accept their bid. Your number stays hidden until then.</p></div>' +
        '<div class="card verify">' + I.shield + '<div class="grow"><div class="t">Your badge</div><div class="m">' + (lvl === 'phone' ? 'Phone-verified' : lvl === 'id' ? 'ID-verified' : 'Email only. Phone verification coming soon.') + '</div></div>' + verifiedPill(lvl) + '</div>' +
        '<label class="field" for="wa">WhatsApp number<input id="wa" type="tel" inputmode="tel" placeholder="+971 50 123 4567" value="' + esc(ST.contact && ST.contact.whatsapp || '') + '"></label>' +
        '<div class="note"><span style="color:var(--green)">' + I.shield + '</span><span>Only buyers whose bid you accept can see this number.</span></div>';
    } else if (S.step === 2) {
      body = '<div class="sec" style="gap:4px"><h1>Proof photos</h1><p class="sub">Side, tag photo and size label are required. Clear, bright, no filters.</p></div><div class="grid">' +
        SELL_PHOTOS.map(function (p) {
          var f = S.photos[p.key];
          return '<label class="slot' + (f ? ' done' : '') + '">' + (f ? '<img src="' + f.url + '" alt="' + p.label + '">' : I.camera) +
            '<span class="cap"><b style="font-size:14px">' + (f ? '✓ ' : '') + p.label + (p.req ? '' : ' <span style="font-weight:400">(optional)</span>') + '</b>' + (f ? '' : '<span class="m" style="font-size:11px">' + p.hint + '</span>') + '</span>' +
            '<input type="file" accept="image/*" data-sellphoto="' + p.key + '" aria-label="' + (f ? 'Replace ' : 'Add ') + p.label + '"></label>';
        }).join('') + '</div>';
    } else {
      var f = S.f;
      body = '<h1>Pair details</h1>' +
        '<label class="field" for="s-model">Model<input id="s-model" data-sf="model" type="text" maxlength="80" placeholder="e.g. Jordan 1 Retro High OG" value="' + esc(f.model) + '"></label>' +
        '<div class="two"><label class="field" for="s-brand">Brand<select id="s-brand" data-sf="brand">' + ['', 'Nike', 'Jordan', 'adidas', 'New Balance', 'ASICS', 'Puma', 'Converse', 'Vans', 'Other'].map(function (o) { return '<option value="' + o + '"' + (f.brand === o ? ' selected' : '') + '>' + (o || 'Select') + '</option>'; }).join('') + '</select></label>' +
        '<label class="field" for="s-size">Size (EU)<input id="s-size" data-sf="size" type="number" inputmode="decimal" step="0.5" min="30" max="52" placeholder="e.g. 43" value="' + esc(f.size) + '"></label></div>' +
        '<label class="field" for="s-cond">Condition<select id="s-cond" data-sf="condition">' + ['', 'New / DS', 'Pre-owned 9/10', 'Pre-owned 8/10', 'Pre-owned 7/10 or lower'].map(function (o) { return '<option value="' + o + '"' + (f.condition === o ? ' selected' : '') + '>' + (o || 'Select condition') + '</option>'; }).join('') + '</select></label>' +
        '<div class="two"><label class="field" for="s-price">Asking (AED)<input id="s-price" data-sf="price" type="number" inputmode="numeric" min="1" placeholder="e.g. 1150" value="' + esc(f.price) + '"></label>' +
        '<label class="field" for="s-city">Emirate<select id="s-city" data-sf="city">' + ['', 'Dubai', 'Sharjah', 'Abu Dhabi', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain', 'Al Ain'].map(function (o) { return '<option value="' + o + '"' + (f.city === o ? ' selected' : '') + '>' + (o || 'Select') + '</option>'; }).join('') + '</select></label></div>' +
        '<label class="field" for="s-desc">Notes for buyers<textarea id="s-desc" data-sf="description" maxlength="1000" placeholder="Wear, flaws, what’s included (box, laces, receipt)">' + esc(f.description) + '</textarea></label>' +
        '<label class="card row" for="s-bids" style="padding:12px 14px;font-size:13px;line-height:1.4"><input id="s-bids" data-sf="accept" type="checkbox"' + (f.accept ? ' checked' : '') + ' style="width:20px;height:20px;accent-color:var(--red)"><span><b>Accept bids.</b> Buyers can offer below your asking price.</span></label>';
    }
    return { html: '<div class="pad"><ol class="steps" aria-label="Progress">' + steps + '</ol>' + body + '<p class="err" id="sell-err" role="alert"></p></div>', bottom: sellBar() };
  };
  function sellBar() {
    var S = ST.sell;
    return '<div class="actionbar">' + (S.step > 1 ? '<button class="btn ghost" data-act="sback">Back</button>' : '') +
      '<button class="btn red" style="flex:1;height:52px" data-act="snext" id="snext">' + (S.step === 3 ? 'Publish listing' : 'Continue') + '</button></div>';
  }
  function sellNext(btn) {
    var S = ST.sell; var err = document.getElementById('sell-err'); err.textContent = '';
    if (S.step === 1) {
      var wa = (document.getElementById('wa').value || '').trim();
      if (!/^\+?[0-9 ]{7,20}$/.test(wa)) { err.textContent = 'Enter a valid WhatsApp number, e.g. +971 50 123 4567.'; return; }
      btn.disabled = true;
      sb.from('private_contacts').update({ whatsapp: wa }).eq('user_id', uid()).then(function (r) {
        if (r.error) { btn.disabled = false; return fail(r.error); }
        ST.contact = { whatsapp: wa }; S.step = 2; render();
      });
      return;
    }
    if (S.step === 2) {
      var missing = SELL_PHOTOS.filter(function (p) { return p.req && !S.photos[p.key]; });
      if (missing.length) { err.textContent = 'Add: ' + missing.map(function (p) { return p.label; }).join(', ') + '.'; return; }
      S.step = 3; render(); return;
    }
    var f = S.f;
    if (!f.model.trim() || f.model.trim().length < 2) { err.textContent = 'Enter the model name.'; return; }
    if (!f.condition) { err.textContent = 'Pick the condition.'; return; }
    var price = parseInt(f.price, 10); if (!(price > 0)) { err.textContent = 'Enter your asking price in AED.'; return; }
    btn.disabled = true; btn.textContent = 'Publishing…';
    var row = { seller_id: uid(), model: f.model.trim(), brand: f.brand || null, size_eu: f.size ? Number(f.size) : null, condition: f.condition, price_aed: price, city: f.city || null, description: f.description.trim() || null, accept_bids: !!f.accept };
    sb.from('listings').insert(row).select('id').single().then(function (r) {
      if (r.error) throw r.error;
      var id = r.data.id; var keys = Object.keys(S.photos);
      return Promise.all(keys.map(function (k, i) {
        var path = uid() + '/' + id + '/' + k + '-' + Date.now() + '.jpg';
        return sb.storage.from('listing-photos').upload(path, S.photos[k].blob, { contentType: 'image/jpeg', upsert: false }).then(function (u) {
          if (u.error) throw u.error;
          return sb.from('listing_photos').insert({ listing_id: id, path: path, kind: k, position: SELL_PHOTOS.findIndex(function (p) { return p.key === k; }) });
        });
      })).then(function () { ST.sell = freshSell(); toast('Listed! Your pair is live.'); go('l/' + id); });
    }).catch(function (e) { btn.disabled = false; btn.textContent = 'Publish listing'; fail(e); });
  }

  // ------------------------------------------------------------------
  // LEGIT OR FAKE
  // ------------------------------------------------------------------
  var CHECK_COLS = 'id,model,size,price_aed,found_where,question,verdict,verdict_note,created_at,author_id,author:profiles!checks_author_id_fkey(username,verified_level),photos:check_photos(path,position)';
  VIEWS.legit = function () {
    var tabsHtml = [['open', 'Open'], ['verdicts', 'Verdicts'], ['guides', 'Guides']].map(function (t) {
      return '<button role="tab" class="' + (ST.legitTab === t[0] ? 'on' : '') + '" aria-selected="' + (ST.legitTab === t[0]) + '" data-act="ltab" data-v="' + t[0] + '">' + t[1] + '</button>';
    }).join('');
    var head = '<div class="sec" style="gap:4px"><h1>Legit or <span class="script red">Fake?</span></h1><p class="sub">Post photos of a pair. The community votes and comments, then a verified checker makes the final call.</p></div>' +
      '<button class="card row" data-go="new-check" style="padding:12px 14px;text-align:left;border-style:dashed"><span class="round" style="border-color:var(--red);color:var(--red)">' + I.camera + '</span><span class="grow"><b style="font-size:15px">Post a legit check</b><br><span class="m">Upload photos, get votes and comments</span></span><span aria-hidden="true" style="font-size:20px">›</span></button>' +
      '<div class="seg" role="tablist" aria-label="Legit check feed">' + tabsHtml + '</div>';
    if (ST.legitTab === 'guides') {
      return '<div class="pad">' + head + '<div class="card" style="padding:8px 14px">' +
        [['Size tag', 'Compare font, spacing and the SKU with the box label. They must match.'], ['Stitching', 'Retail pairs have even, tight stitching. Loose or wavy lines are a warning sign.'], ['Box label', 'Check SKU, size and colorway name against the size tag and a retail photo.'], ['Sole and insole', 'Look at print sharpness, logo placement and the sole pattern.'], ['Price', 'A price far under resale is the biggest red flag of all.']].map(function (g) { return '<div class="guide" style="flex-direction:column;align-items:flex-start;padding:10px 0;gap:2px"><b>' + g[0] + '</b><span class="m" style="font-size:13px;font-weight:400">' + g[1] + '</span></div>'; }).join('') + '</div></div>';
    }
    if (!sb) return '<div class="pad">' + head + needSb() + '</div>';
    var q = sb.from('checks').select(CHECK_COLS).order('created_at', { ascending: false }).limit(30);
    q = ST.legitTab === 'open' ? q.is('verdict', null) : q.not('verdict', 'is', null);
    return q.then(function (r) {
      if (r.error) throw r.error;
      var cs = r.data || [];
      if (!cs.length) return '<div class="pad">' + head + '<div class="empty">' + I.shield + '<span>' + (ST.legitTab === 'open' ? 'No open checks. Post the first one.' : 'No verdicts yet.') + '</span></div></div>';
      return sb.rpc('check_stats', { ids: cs.map(function (c) { return c.id; }) }).then(function (s) {
        var st = {}; (s.data || []).forEach(function (x) { st[x.check_id] = x; });
        return '<div class="pad">' + head + cs.map(function (c, i) { return checkCard(c, st[c.id] || {}) + (i === 1 ? adSlot() : ''); }).join('') + '</div>';
      });
    });
  };
  function checkPhotos(c) { return (c.photos || []).slice().sort(function (a, b) { return a.position - b.position; }).map(function (p) { return pub('check-photos', p.path); }); }
  function statusPill(c) { return c.verdict === 'legit' ? '<span class="pill ok">✓ LEGIT</span>' : c.verdict === 'fake' ? '<span class="pill red">✕ FAKE</span>' : '<span class="pill dark">OPEN</span>'; }
  function checkCard(c, s) {
    var ps = checkPhotos(c); var total = (s.legit || 0) + (s.fake || 0) + (s.unsure || 0);
    return '<article class="card post"><div class="row"><div class="avatar" style="width:38px;height:38px;font-size:14px">' + esc(((c.author && c.author.username) || '?')[0].toUpperCase()) + '</div><div class="grow"><div class="t" style="font-size:14px">@' + esc(c.author && c.author.username) + '</div><div class="m">' + ago(c.created_at) + ' · ' + esc(c.model) + (c.size ? ' · ' + esc(c.size) : '') + '</div></div>' + statusPill(c) + '</div>' +
      '<button data-go="c/' + c.id + '" style="all:unset;cursor:pointer;display:flex;flex-direction:column;gap:10px">' + (c.question ? '<span style="font-size:14px;line-height:1.5">' + esc(c.question) + '</span>' : '') +
      '<span class="thumbs">' + ps.slice(0, 3).map(function (u) { return '<span class="ph" style="padding:0"><img src="' + esc(u) + '" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:10px"></span>'; }).join('') + '</span></button>' +
      (c.verdict ? '<div class="checker" style="background:' + (c.verdict === 'legit' ? 'var(--mint)' : '#F6DAD6') + '"><b style="color:' + (c.verdict === 'legit' ? 'var(--green)' : 'var(--red)') + '">Checker verdict:</b> ' + esc(c.verdict_note || '') + '</div>' : '') +
      '<button class="between" data-go="c/' + c.id + '" style="border:0;background:none;padding:6px 0 0;border-top:1px solid #EFEBE2;align-items:center;color:var(--ink)"><span class="m" style="font-weight:600">' + total + ' votes · ' + (s.comments || 0) + ' comments</span><span class="link" style="padding:0">Open thread ›</span></button></article>';
  }

  VIEWS['new-check'] = function () {
    if (!sb) return needSb();
    if (!uid()) return needLogin('post a legit check');
    var d = ST.newCheck;
    var tiles = d.photos.map(function (p, i) {
      return '<div style="position:relative"><div class="ph" style="height:104px;padding:0"><img src="' + p.url + '" alt="Photo ' + (i + 1) + '" style="width:100%;height:100%;object-fit:cover;border-radius:10px"></div><button data-act="rmphoto" data-i="' + i + '" aria-label="Remove photo ' + (i + 1) + '" style="position:absolute;top:4px;right:4px;width:32px;height:32px;border-radius:999px;border:0;background:rgba(13,13,13,.75);color:#fff;display:flex;align-items:center;justify-content:center"><span style="width:16px;height:16px;display:inline-flex">' + I.close + '</span></button></div>';
    }).join('');
    var add = d.photos.length < 8 ? '<label class="slot" style="height:104px;justify-content:center;align-items:center;text-align:center">' + I.camera + '<span class="cap" style="align-items:center"><b style="font-size:13px">Add photos</b><span class="m" style="font-size:11px">' + d.photos.length + ' / 8</span></span><input type="file" accept="image/*" multiple data-checkphoto="1" aria-label="Add photos"></label>' : '';
    var f = d.f;
    var html = '<div class="pad"><div class="sec" style="gap:4px"><h1>Post a legit check</h1><p class="sub">Clear photos get better answers: side, size tag, stitching, box label, sole, insole.</p></div>' +
      '<div class="thumbs">' + tiles + add + '</div>' +
      '<label class="field" for="n-model">Model<input id="n-model" data-cf="model" type="text" maxlength="80" placeholder="e.g. Dunk Low Panda" value="' + esc(f.model) + '"></label>' +
      '<div class="two"><label class="field" for="n-size">Size<input id="n-size" data-cf="size" type="text" maxlength="10" placeholder="e.g. EU 42" value="' + esc(f.size) + '"></label>' +
      '<label class="field" for="n-price">Offered at (AED)<input id="n-price" data-cf="price" type="number" inputmode="numeric" min="0" placeholder="e.g. 280" value="' + esc(f.price) + '"></label></div>' +
      '<label class="field" for="n-where">Where you found it<select id="n-where" data-cf="where">' + ['Group chat', 'Instagram', 'Marketplace app', 'In person', 'Other'].map(function (o) { return '<option' + (f.where === o ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select></label>' +
      '<label class="field" for="n-q">Your question<textarea id="n-q" data-cf="question" maxlength="600" placeholder="What looks off to you?">' + esc(f.question) + '</textarea></label>' +
      '<div class="note"><span style="color:var(--green)">' + I.shield + '</span><span>Your post is public. Crop out names, phone numbers and addresses first.</span></div><p class="err" id="check-err" role="alert"></p></div>';
    return { html: html, bottom: '<div class="actionbar"><button class="btn red" style="flex:1;height:52px" data-act="postcheck">Post for community vote</button></div>' };
  };
  function postCheck(btn) {
    var d = ST.newCheck; var err = document.getElementById('check-err'); err.textContent = '';
    if (!d.photos.length) { err.textContent = 'Add at least 1 photo.'; return; }
    if (d.f.model.trim().length < 2) { err.textContent = 'Enter the model name.'; return; }
    btn.disabled = true; btn.textContent = 'Posting…';
    sb.from('checks').insert({ author_id: uid(), model: d.f.model.trim(), size: d.f.size.trim() || null, price_aed: d.f.price ? parseInt(d.f.price, 10) : null, found_where: d.f.where, question: d.f.question.trim() || null }).select('id').single().then(function (r) {
      if (r.error) throw r.error;
      var id = r.data.id;
      return Promise.all(d.photos.map(function (p, i) {
        var path = uid() + '/' + id + '/' + i + '-' + Date.now() + '.jpg';
        return sb.storage.from('check-photos').upload(path, p.blob, { contentType: 'image/jpeg' }).then(function (u) {
          if (u.error) throw u.error;
          return sb.from('check_photos').insert({ check_id: id, path: path, position: i });
        });
      })).then(function () { ST.newCheck = freshCheck(); toast('Posted. The community can vote now.'); go('c/' + id); });
    }).catch(function (e) { btn.disabled = false; btn.textContent = 'Post for community vote'; fail(e); });
  }

  VIEWS.c = function (r) {
    if (!sb) return needSb();
    var me = uid();
    return Promise.all([
      sb.from('checks').select(CHECK_COLS).eq('id', r.id).maybeSingle(),
      sb.rpc('check_stats', { ids: [r.id] }),
      sb.from('comments').select('id,parent_id,body,created_at,author_id,author:profiles!comments_author_id_fkey(username,is_checker,is_admin)').eq('check_id', r.id).order('created_at'),
      sb.rpc('comment_like_counts', { chk_id: r.id }),
      me ? sb.from('check_votes').select('vote').eq('check_id', r.id).eq('user_id', me) : Promise.resolve({ data: [] }),
      me ? sb.from('comment_likes').select('comment_id').eq('user_id', me) : Promise.resolve({ data: [] })
    ]).then(function (a) {
      if (a[0].error) throw a[0].error;
      var c = a[0].data; if (!c) return '<div class="empty">' + I.shield + '<b>This check was removed</b><button class="btn dark" data-go="legit">Back</button></div>';
      var s = (a[1].data || [])[0] || {}; var comments = a[2].data || []; var likes = {}; (a[3].data || []).forEach(function (x) { likes[x.comment_id] = x.likes; });
      var myVote = ((a[4].data || [])[0] || {}).vote; var myLikes = {}; (a[5].data || []).forEach(function (x) { myLikes[x.comment_id] = true; });
      var total = (s.legit || 0) + (s.fake || 0) + (s.unsure || 0);
      function pct(k) { return total ? Math.round((s[k] || 0) * 100 / total) : 0; }
      var bars = ['fake', 'unsure', 'legit'].map(function (k) {
        var col = { legit: 'var(--green)', fake: 'var(--red)', unsure: 'var(--muted)' }[k];
        return '<div class="bar"><span style="width:72px">' + { legit: 'Legit', fake: 'Fake', unsure: 'More pics' }[k] + '</span><div class="track"><div class="fill" style="width:' + pct(k) + '%;background:' + col + '"></div></div><span style="width:36px;text-align:right">' + pct(k) + '%</span></div>';
      }).join('') + '<div class="m">' + total + ' votes</div>';
      var voteBtns = '<div class="votes">' + ['legit', 'fake', 'unsure'].map(function (k) {
        var col = { legit: 'var(--green)', fake: 'var(--red)', unsure: 'var(--muted)' }[k]; var on = myVote === k;
        return '<button data-act="vote" data-id="' + c.id + '" data-v="' + k + '" data-on="' + on + '" aria-pressed="' + on + '" style="border:1.5px solid ' + col + ';' + (on ? 'background:' + col + ';color:#fff' : 'color:' + col) + '">' + (on ? '✓ ' : '') + { legit: 'Legit', fake: 'Fake', unsure: 'More pics' }[k] + '</button>';
      }).join('') + '</div>';
      var ps = checkPhotos(c);
      var tops = comments.filter(function (m) { return !m.parent_id; });
      function cItem(m, isReply) {
        var au = m.author || {}; var badge = (au.is_checker || au.is_admin) ? ' <span class="pill ok" style="padding:1px 7px;font-size:10px">✓ Checker</span>' : (m.author_id === c.author_id ? ' <span class="pill dark" style="padding:1px 7px;font-size:10px">OP</span>' : '');
        var liked = !!myLikes[m.id];
        return '<div class="row" style="align-items:flex-start;gap:10px' + (isReply ? ';margin-left:40px' : '') + '"><div class="avatar" style="width:' + (isReply ? 28 : 34) + 'px;height:' + (isReply ? 28 : 34) + 'px;font-size:13px">' + esc((au.username || '?')[0].toUpperCase()) + '</div>' +
          '<div class="grow" style="display:flex;flex-direction:column;gap:4px"><div style="font-size:13px"><b>@' + esc(au.username) + '</b>' + badge + ' <span class="m">· ' + ago(m.created_at) + '</span></div>' +
          '<div style="font-size:14px;line-height:1.45;white-space:pre-line' + (au.is_checker ? ';padding:8px 10px;border-radius:10px;background:var(--mint)' : '') + '">' + esc(m.body) + '</div>' +
          '<div class="row" style="gap:2px"><button class="link" style="color:' + (liked ? 'var(--red)' : 'var(--muted)') + ';padding:6px 8px 6px 0;font-size:12px;display:inline-flex;align-items:center;gap:4px" data-act="like" data-id="' + m.id + '" data-on="' + liked + '" aria-pressed="' + liked + '"><span style="width:14px;height:14px;display:inline-flex">' + (liked ? I.heartOn : I.heart) + '</span>' + (likes[m.id] || 0) + '</button>' +
          '<button class="link" style="color:var(--muted);padding:6px 8px;font-size:12px" data-act="reply" data-id="' + (m.parent_id || m.id) + '" data-user="' + esc(au.username) + '">Reply</button>' +
          (m.author_id === me || isStaff() ? '<button class="link" style="color:var(--muted);padding:6px 8px;font-size:12px" data-act="delcomment" data-id="' + m.id + '">Delete</button>' : '<button class="link" style="color:var(--muted);padding:6px 8px;font-size:12px" data-act="report" data-type="comment" data-id="' + m.id + '">Report</button>') + '</div></div></div>';
      }
      var thread = tops.map(function (m) { return cItem(m, false) + comments.filter(function (x) { return x.parent_id === m.id; }).map(function (x) { return cItem(x, true); }).join(''); }).join('<div style="height:1px;background:#EFEBE2"></div>');
      var verdictForm = (!c.verdict && isStaff()) ? '<div class="card" style="padding:14px;display:flex;flex-direction:column;gap:8px"><b>Checker verdict</b><textarea id="vnote" maxlength="400" placeholder="Why? (shown to everyone)" style="padding:10px;border:1px solid var(--line);border-radius:10px;min-height:70px"></textarea><div class="row"><button class="btn" style="flex:1;background:var(--green);color:#fff" data-act="verdict" data-id="' + c.id + '" data-v="legit">Legit</button><button class="btn red" style="flex:1" data-act="verdict" data-id="' + c.id + '" data-v="fake">Fake</button></div></div>' : '';
      var html = '<div class="pad">' +
        '<div class="row"><div class="avatar">' + esc(((c.author && c.author.username) || '?')[0].toUpperCase()) + '</div><div class="grow"><div class="t">@' + esc(c.author && c.author.username) + '</div><div class="m">' + ago(c.created_at) + ' ago</div></div>' + statusPill(c) + '</div>' +
        '<div class="scroller" style="gap:8px">' + ps.map(function (u) { return '<a href="' + esc(u) + '" target="_blank" rel="noopener" style="width:200px;flex-shrink:0"><img src="' + esc(u) + '" alt="" style="width:200px;height:170px;object-fit:cover;border-radius:12px;background:#fff"></a>'; }).join('') + '</div>' +
        '<div class="sec" style="gap:6px"><h1 style="font-size:22px">' + esc(c.model) + '</h1>' + (c.question ? '<p style="margin:0;font-size:15px;line-height:1.5;white-space:pre-line">' + esc(c.question) + '</p>' : '') +
        '<div class="chips-wrap">' + (c.size ? '<span class="proof" style="background:#fff;border:1px solid var(--line)">' + esc(c.size) + '</span>' : '') + (c.price_aed ? '<span class="proof" style="background:#fff;border:1px solid var(--line)">Offered at ' + aed(c.price_aed) + '</span>' : '') + (c.found_where ? '<span class="proof" style="background:#fff;border:1px solid var(--line)">' + esc(c.found_where) + '</span>' : '') + '</div></div>' +
        (c.verdict ? '<div class="checker" style="background:' + (c.verdict === 'legit' ? 'var(--mint)' : '#F6DAD6') + '"><b style="color:' + (c.verdict === 'legit' ? 'var(--green)' : 'var(--red)') + '">Verdict: ' + c.verdict.toUpperCase() + '.</b> ' + esc(c.verdict_note || '') + '</div>' : '') +
        '<div class="card" style="padding:14px;display:flex;flex-direction:column;gap:10px"><b>' + (c.verdict ? 'Community vote' : 'Your vote') + '</b>' + (!c.verdict ? (me ? voteBtns : '<button class="btn dark" data-go="login">Sign in to vote</button>') : '') + ((myVote || c.verdict) ? bars : '<span class="m">Vote to see how the community voted.</span>') + '</div>' +
        verdictForm +
        '<section class="sec"><h2>Comments <span class="m" style="font-family:var(--body)">(' + comments.length + ')</span></h2>' + (thread ? '<div class="card" style="padding:14px;display:flex;flex-direction:column;gap:12px">' + thread + '</div>' : '<p class="sub">No comments yet. Start the conversation.</p>') +
        '<p class="m" style="margin:0">Be respectful. Call out the pair, not the person.</p></section>' +
        (c.author_id !== me ? '<button class="link" style="align-self:flex-start;color:var(--muted)" data-act="report" data-type="check" data-id="' + c.id + '">Report this post</button>' : '') + '</div>';
      var bottom = me
        ? '<div style="flex-shrink:0;display:flex;flex-direction:column;gap:6px;padding:10px 12px calc(16px + env(safe-area-inset-bottom,0px));background:var(--ink);border-top:1px solid var(--ink3)">' +
          (ST.replyTo ? '<div class="row" style="justify-content:space-between;font-size:12px;color:var(--sand);padding:0 4px"><span>Replying to @' + esc(ST.replyTo.user) + '</span><button class="link" style="color:var(--coral);padding:4px 0;font-size:12px" data-act="noreply">Cancel</button></div>' : '') +
          '<div class="row" style="gap:8px"><label class="bidfield" for="cmt" style="font-family:var(--body);font-weight:400"><input id="cmt" type="text" maxlength="1000" placeholder="' + (ST.replyTo ? 'Write a reply…' : 'Add a comment…') + '" autocomplete="off"></label><button class="btn red" style="height:52px;padding:0 18px" data-act="send" data-id="' + c.id + '">Send</button></div></div>'
        : '<div class="actionbar"><button class="btn red" style="flex:1;height:52px" data-go="login">Sign in to comment</button></div>';
      return { html: html, bottom: bottom };
    });
  };

  // ------------------------------------------------------------------
  // PROFILE + LOGIN
  // ------------------------------------------------------------------
  VIEWS.me = function () {
    if (!sb) return needSb();
    if (!uid()) return needLogin('see your profile');
    var me = ST.me || {};
    return Promise.all([
      sb.from('listings').select('id,model,price_aed,status,created_at').eq('seller_id', uid()).order('created_at', { ascending: false }).limit(30),
      sb.from('bids').select('id,amount_aed,status,created_at,listing:listings(id,model)').eq('bidder_id', uid()).order('created_at', { ascending: false }).limit(30),
      isStaff() ? sb.from('reports').select('id,target_type,target_id,reason,created_at,resolved').eq('resolved', false).order('created_at', { ascending: false }).limit(30) : Promise.resolve({ data: null })
    ]).then(function (a) {
      var ls = a[0].data || []; var bs = a[1].data || []; var reps = a[2].data;
      var cities = ['', 'Dubai', 'Sharjah', 'Abu Dhabi', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain', 'Al Ain'];
      return '<div class="pad"><div class="row"><div class="avatar" style="width:56px;height:56px;font-size:22px;background:var(--red)">' + esc((me.username || '?')[0].toUpperCase()) + '</div><div class="grow"><h1 style="font-size:22px">@' + esc(me.username) + '</h1><div class="m">' + esc(ST.session.user.email || ST.session.user.phone || '') + '</div></div>' + verifiedPill(me.verified_level) + '</div>' +
        '<div class="card" style="padding:14px;display:flex;flex-direction:column;gap:10px"><b>Profile</b>' +
        '<label class="field" for="p-user">Username<input id="p-user" type="text" maxlength="24" value="' + esc(me.username) + '" autocomplete="username"></label>' +
        '<label class="field" for="p-city">Emirate<select id="p-city">' + cities.map(function (o) { return '<option value="' + o + '"' + (me.city === o ? ' selected' : '') + '>' + (o || 'Select') + '</option>'; }).join('') + '</select></label>' +
        '<label class="field" for="p-wa">WhatsApp (private)<input id="p-wa" type="tel" placeholder="+971 50 123 4567" value="' + esc(ST.contact && ST.contact.whatsapp || '') + '"></label>' +
        '<p class="err" id="p-err" role="alert"></p><button class="btn dark" data-act="saveprofile">Save</button></div>' +
        '<section class="sec"><h2>My listings</h2>' + (ls.length ? '<div class="card" style="padding:4px 14px">' + ls.map(function (l) { return '<button class="kv" style="width:100%;background:none;border-left:0;border-right:0;border-top:0;text-align:left" data-go="l/' + l.id + '"><span>' + esc(l.model) + '</span><span class="m">' + aed(l.price_aed) + ' · ' + l.status + '</span></button>'; }).join('') + '</div>' : '<p class="sub">Nothing listed yet.</p>') + '</section>' +
        '<section class="sec"><h2>My bids</h2>' + (bs.length ? '<div class="card" style="padding:4px 14px">' + bs.map(function (b) { return '<button class="kv" style="width:100%;background:none;border-left:0;border-right:0;border-top:0;text-align:left" data-go="l/' + (b.listing && b.listing.id) + '"><span>' + esc(b.listing && b.listing.model) + '</span><span class="m">' + aed(b.amount_aed) + ' · ' + b.status + '</span></button>'; }).join('') + '</div>' : '<p class="sub">No bids yet.</p>') + '</section>' +
        (reps ? '<section class="sec"><h2>Open reports</h2>' + (reps.length ? '<div class="card" style="padding:4px 14px">' + reps.map(function (x) { return '<div class="kv" style="align-items:center"><span><b>' + x.target_type + '</b> · ' + esc(x.reason) + '<br><span class="tiny">' + x.target_id + '</span></span><button class="btn ghost" style="height:36px;padding:0 10px;font-size:12px" data-act="resolve" data-id="' + x.id + '">Resolve</button></div>'; }).join('') + '</div>' : '<p class="sub">No open reports.</p>') + '</section>' : '') +
        '<button class="btn ghost full" data-act="signout">Sign out</button>' +
        '<p class="tiny center"><a href="terms.html" style="text-decoration:underline">Terms</a> · <a href="privacy.html" style="text-decoration:underline">Privacy</a>' + (C.CONTACT_EMAIL ? ' · ' + esc(C.CONTACT_EMAIL) : '') + '</p></div>';
    });
  };

  VIEWS.login = function () {
    if (!sb) return needSb();
    if (uid()) { setTimeout(function () { go('me'); }, 0); return skeleton(); }
    return '<div class="pad"><div class="sec" style="gap:4px"><h1>Join the tambayan</h1><p class="sub">Free. Sign in to sell, bid, vote and comment.</p></div>' +
      '<div class="card" style="padding:14px;display:flex;flex-direction:column;gap:10px"><label class="field" for="l-email">Email<input id="l-email" type="email" autocomplete="email" placeholder="you@example.com"></label><button class="btn red" data-act="emaillink">Email me a sign-in link</button></div>' +
      (C.GOOGLE_LOGIN ? '<button class="btn dark full" data-act="google">Continue with Google</button>' : '') +
      (C.SMS_LOGIN ? '<div class="card" style="padding:14px;display:flex;flex-direction:column;gap:10px"><label class="field" for="l-phone">Phone<input id="l-phone" type="tel" autocomplete="tel" placeholder="+971 50 123 4567"></label><button class="btn dark" data-act="smscode">Text me a code</button><div id="otp-wrap" hidden><label class="field" for="l-otp">6-digit code<input id="l-otp" inputmode="numeric" maxlength="6"></label><button class="btn red full" data-act="smsverify">Verify</button></div></div>' : '') +
      '<p class="err" id="l-err" role="alert"></p><p class="tiny">By signing in you agree to the <a href="terms.html" style="text-decoration:underline">Terms</a> and <a href="privacy.html" style="text-decoration:underline">Privacy Policy</a>.</p></div>';
  };

  // ------------------------------------------------------------------
  // ACTIONS
  // ------------------------------------------------------------------
  function requireLogin() { if (!uid()) { go('login'); return false; } return true; }
  function reportModal(type, id) {
    if (!requireLogin()) return;
    openModal('<h2>Report</h2><p class="sub">Tell us what’s wrong. Our team reviews every report.</p><div class="chips-wrap">' + ['Fake or replica', 'Scam or suspicious', 'Offensive', 'Spam', 'Other'].map(function (r) { return '<button class="chip" data-act="rpick" data-v="' + r + '">' + r + '</button>'; }).join('') + '</div><textarea id="r-text" maxlength="500" placeholder="Add details (optional)" style="padding:10px;border:1px solid var(--line);border-radius:10px;min-height:80px"></textarea><div class="row"><button class="btn ghost" style="flex:1" data-act="mclose">Cancel</button><button class="btn red" style="flex:1" data-act="rsend" data-type="' + type + '" data-id="' + id + '">Send report</button></div>');
  }

  app.addEventListener('click', function (e) {
    var el = e.target.closest('[data-go],[data-act]'); if (!el) return;
    if (el.hasAttribute('data-go')) { e.preventDefault(); closeModal(); var g = el.getAttribute('data-go'); if (g === 'sell') ST.sell = ST.sell || freshSell(); go(g); return; }
    var a = el.getAttribute('data-act'), v = el.getAttribute('data-v'), id = el.getAttribute('data-id');
    var on = el.getAttribute('data-on') === 'true';
    switch (a) {
      case 'reload': render(); break;
      case 'rem': var rem = store('rem') || {}; var k = el.getAttribute('data-key'); rem[k] = !rem[k]; store('rem', rem); toast(rem[k] ? 'Reminder saved on this device' : 'Reminder removed'); render(true); break;
      case 'hottab': ST.hotTab = v; render(true); break;
      case 'mfilter': ST.marketFilter = v; render(true); break;
      case 'ltab': ST.legitTab = v; render(true); break;
      case 'gal': ST.gallery.i = +el.getAttribute('data-i'); document.getElementById('gallery').outerHTML = galleryHTML(); break;
      case 'watch':
        if (!requireLogin()) return;
        (on ? sb.from('watches').delete().eq('user_id', uid()).eq('listing_id', id) : sb.from('watches').insert({ user_id: uid(), listing_id: id }))
          .then(function (r) { if (r.error) return fail(r.error); toast(on ? 'Removed from watchlist' : 'Saved to your watchlist'); render(true); });
        break;
      case 'bid':
        if (!requireLogin()) return;
        var amt = parseInt((document.getElementById('amt') || {}).value, 10);
        if (!(amt > 0)) { toast('Enter your bid in AED'); return; }
        el.disabled = true;
        sb.from('bids').insert({ listing_id: id, bidder_id: uid(), amount_aed: amt }).then(function (r) { el.disabled = false; if (r.error) return fail(r.error); toast('Bid placed. The seller has been notified.'); render(true); });
        break;
      case 'withdraw': sb.rpc('withdraw_bid', { bid: id }).then(function (r) { if (r.error) return fail(r.error); toast('Bid withdrawn'); render(true); }); break;
      case 'accept': sb.rpc('accept_bid', { bid: id }).then(function (r) { if (r.error) return fail(r.error); toast('Bid accepted. Tap "Show contact" to reach the buyer.'); render(true); }); break;
      case 'decline': sb.rpc('decline_bid', { bid: id }).then(function (r) { if (r.error) return fail(r.error); toast('Bid declined'); render(true); }); break;
      case 'contact':
        sb.rpc('deal_contact', { bid: id }).then(function (r) {
          if (r.error) return fail(r.error);
          var c = (r.data || [])[0];
          if (!c || !c.whatsapp) { openModal('<h2>No WhatsApp yet</h2><p class="sub">@' + esc(c && c.username || 'This user') + ' hasn’t added a WhatsApp number yet.</p><button class="btn dark" data-act="mclose">OK</button>'); return; }
          var digits = c.whatsapp.replace(/\D/g, '');
          openModal('<h2>Contact @' + esc(c.username) + '</h2><p class="sub">Agree on payment and meet-up or delivery. Meet in a public place and check the pair before you pay.</p><div class="card" style="padding:14px;font-size:18px;font-weight:700;user-select:all">' + esc(c.whatsapp) + '</div><a class="btn red full" href="https://wa.me/' + digits + '" target="_blank" rel="noopener">Open WhatsApp</a><button class="btn ghost full" data-act="mclose">Close</button>');
        });
        break;
      case 'sold': case 'remove':
        sb.from('listings').update({ status: a === 'sold' ? 'sold' : 'removed' }).eq('id', id).then(function (r) { if (r.error) return fail(r.error); toast(a === 'sold' ? 'Marked as sold. Congrats!' : 'Listing removed'); go('me'); });
        break;
      case 'report': reportModal(el.getAttribute('data-type'), id); break;
      case 'rpick': var t = document.getElementById('r-text'); t.value = v + (t.value ? ': ' + t.value : ''); break;
      case 'rsend':
        var reason = (document.getElementById('r-text').value || '').trim();
        if (reason.length < 3) { toast('Pick a reason or add details'); return; }
        sb.from('reports').insert({ reporter_id: uid(), target_type: el.getAttribute('data-type'), target_id: id, reason: reason }).then(function (r) { if (r.error) return fail(r.error); closeModal(); toast('Thanks. We’ll review it.'); });
        break;
      case 'mclose': closeModal(); break;
      case 'resolve': sb.from('reports').update({ resolved: true }).eq('id', id).then(function (r) { if (r.error) return fail(r.error); render(true); }); break;
      case 'sback': ST.sell.step = Math.max(1, ST.sell.step - 1); render(); break;
      case 'snext': sellNext(el); break;
      case 'rmphoto': ST.newCheck.photos.splice(+el.getAttribute('data-i'), 1); render(true); break;
      case 'postcheck': postCheck(el); break;
      case 'vote':
        if (!requireLogin()) return;
        (on ? sb.from('check_votes').delete().eq('check_id', id).eq('user_id', uid()) : sb.from('check_votes').upsert({ check_id: id, user_id: uid(), vote: v }))
          .then(function (r) { if (r.error) return fail(r.error); render(true); });
        break;
      case 'like':
        if (!requireLogin()) return;
        (on ? sb.from('comment_likes').delete().eq('comment_id', id).eq('user_id', uid()) : sb.from('comment_likes').insert({ comment_id: id, user_id: uid() }))
          .then(function (r) { if (r.error) return fail(r.error); render(true); });
        break;
      case 'reply': ST.replyTo = { id: id, user: el.getAttribute('data-user') }; render(true); setTimeout(function () { var i = document.getElementById('cmt'); if (i) i.focus(); }, 300); break;
      case 'noreply': ST.replyTo = null; render(true); break;
      case 'send':
        var inp = document.getElementById('cmt'); var body = (inp.value || '').trim(); if (!body) return;
        el.disabled = true;
        sb.from('comments').insert({ check_id: id, author_id: uid(), body: body, parent_id: ST.replyTo ? ST.replyTo.id : null }).then(function (r) {
          el.disabled = false; if (r.error) return fail(r.error); ST.replyTo = null; toast('Comment posted'); render(true);
        });
        break;
      case 'delcomment': sb.from('comments').delete().eq('id', id).then(function (r) { if (r.error) return fail(r.error); render(true); }); break;
      case 'verdict':
        sb.rpc('set_verdict', { chk: id, v: v, note: (document.getElementById('vnote').value || '').trim() }).then(function (r) { if (r.error) return fail(r.error); toast('Verdict posted'); render(true); });
        break;
      case 'saveprofile':
        var un = (document.getElementById('p-user').value || '').trim().toLowerCase(); var city = document.getElementById('p-city').value || null; var wa = (document.getElementById('p-wa').value || '').trim();
        var perr = document.getElementById('p-err'); perr.textContent = '';
        if (!/^[a-z0-9._]{3,24}$/.test(un)) { perr.textContent = 'Username: 3–24 characters, letters, numbers, dot or underscore.'; return; }
        if (wa && !/^\+?[0-9 ]{7,20}$/.test(wa)) { perr.textContent = 'Enter a valid WhatsApp number.'; return; }
        Promise.all([sb.from('profiles').update({ username: un, city: city }).eq('id', uid()), sb.from('private_contacts').update({ whatsapp: wa || null }).eq('user_id', uid())]).then(function (r) {
          var er = r[0].error || r[1].error; if (er) { perr.textContent = /duplicate|unique/i.test(er.message) ? 'That username is taken.' : er.message; return; }
          return loadMe().then(function () { toast('Saved'); render(true); });
        });
        break;
      case 'signout': sb.auth.signOut().then(function () { ST.me = null; ST.contact = null; go('drops'); }); break;
      case 'emaillink':
        var em = (document.getElementById('l-email').value || '').trim(); var lerr = document.getElementById('l-err'); lerr.textContent = '';
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { lerr.textContent = 'Enter a valid email.'; return; }
        el.disabled = true;
        sb.auth.signInWithOtp({ email: em, options: { emailRedirectTo: location.origin + location.pathname } }).then(function (r) {
          el.disabled = false; if (r.error) { lerr.textContent = r.error.message; return; }
          openModal('<h2>Check your email</h2><p class="sub">We sent a sign-in link to <b>' + esc(em) + '</b>. Open it on this phone to continue.</p><button class="btn dark" data-act="mclose">OK</button>');
        });
        break;
      case 'google': sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } }); break;
      case 'smscode':
        var ph = (document.getElementById('l-phone').value || '').replace(/\s/g, '');
        sb.auth.signInWithOtp({ phone: ph }).then(function (r) { if (r.error) return fail(r.error); document.getElementById('otp-wrap').hidden = false; toast('Code sent'); });
        break;
      case 'smsverify':
        sb.auth.verifyOtp({ phone: (document.getElementById('l-phone').value || '').replace(/\s/g, ''), token: document.getElementById('l-otp').value, type: 'sms' }).then(function (r) { if (r.error) return fail(r.error); });
        break;
    }
  });

  app.addEventListener('input', function (e) {
    var t = e.target;
    if (t.id === 'q') { ST.marketQ = t.value; clearTimeout(ST.qTimer); ST.qTimer = setTimeout(function () { var w = document.getElementById('grid-wrap'); if (!w) return; marketGrid().then(function (h) { w.innerHTML = h; }).catch(fail); }, 350); return; }
    if (t.getAttribute('data-sf')) { ST.sell.f[t.getAttribute('data-sf')] = t.type === 'checkbox' ? t.checked : t.value; return; }
    if (t.getAttribute('data-cf')) { ST.newCheck.f[t.getAttribute('data-cf')] = t.value; return; }
  });
  app.addEventListener('change', function (e) {
    var t = e.target;
    if (t.getAttribute('data-sf')) { ST.sell.f[t.getAttribute('data-sf')] = t.type === 'checkbox' ? t.checked : t.value; return; }
    if (t.getAttribute('data-cf')) { ST.newCheck.f[t.getAttribute('data-cf')] = t.value; return; }
    var k = t.getAttribute('data-sellphoto');
    if (k && t.files && t.files[0]) { compress(t.files[0]).then(function (b) { ST.sell.photos[k] = { blob: b, url: URL.createObjectURL(b) }; render(true); }); return; }
    if (t.getAttribute('data-checkphoto') && t.files) {
      var files = Array.prototype.slice.call(t.files, 0, 8 - ST.newCheck.photos.length);
      Promise.all(files.map(compress)).then(function (bs) { bs.forEach(function (b) { ST.newCheck.photos.push({ blob: b, url: URL.createObjectURL(b) }); }); render(true); });
    }
  });
  app.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    if (e.target.id === 'cmt') { e.preventDefault(); var b = app.querySelector('[data-act="send"]'); if (b) b.click(); }
    if (e.target.id === 'amt') { e.preventDefault(); var b2 = app.querySelector('[data-act="bid"]'); if (b2) b2.click(); }
    if (e.target.id === 'l-email') { e.preventDefault(); var b3 = app.querySelector('[data-act="emaillink"]'); if (b3) b3.click(); }
  });

  // ------------------------------------------------------------------
  // boot
  // ------------------------------------------------------------------
  function loadMe() {
    if (!sb || !uid()) { ST.me = null; ST.contact = null; return Promise.resolve(); }
    return Promise.all([sb.from('profiles').select('*').eq('id', uid()).maybeSingle(), sb.from('private_contacts').select('whatsapp').eq('user_id', uid()).maybeSingle()])
      .then(function (a) { ST.me = a[0].data; ST.contact = a[1].data; });
  }
  if (sb) {
    sb.auth.getSession().then(function (r) { ST.session = r.data.session; return loadMe(); }).then(function () { render(); });
    sb.auth.onAuthStateChange(function (evt, session) {
      var was = uid(); ST.session = session;
      if ((session && session.user && session.user.id) !== was) loadMe().then(function () { if (evt === 'SIGNED_IN' && route().name === 'login') go('drops'); else render(true); });
    });
  } else {
    render();
  }
})();
