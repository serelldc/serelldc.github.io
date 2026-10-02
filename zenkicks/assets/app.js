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
    hotTab: 'online', marketFilter: 'all', marketQ: '', legitTab: 'open', cod: {}, codAt: {}, sizeOnly: false,
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
  // Men's US <-> EU (Nike / Jordan size chart). Listings store EU; the app always shows both.
  var SIZES = [[3.5, 35.5], [4, 36], [4.5, 36.5], [5, 37.5], [5.5, 38], [6, 38.5], [6.5, 39], [7, 40], [7.5, 40.5], [8, 41], [8.5, 42], [9, 42.5], [9.5, 43], [10, 44], [10.5, 44.5], [11, 45], [11.5, 45.5], [12, 46], [12.5, 47], [13, 47.5], [14, 48.5], [15, 49.5]];
  function euToUs(eu) { eu = Number(eu); if (!eu) return null; var best = null, d = 9; SIZES.forEach(function (x) { var k = Math.abs(x[1] - eu); if (k < d) { d = k; best = x[0]; } }); return d <= 0.5 ? best : null; }
  function sizeLabel(eu) { if (!eu) return ''; var us = euToUs(eu); return (us ? 'US ' + us + ' · ' : '') + 'EU ' + Number(eu); }
  function sizeOptions(sel, blank) {
    var v = sel ? Number(sel) : null, found = false;
    var o = '<option value="">' + (blank || 'Select size') + '</option>' + SIZES.map(function (x) { var on = v === x[1]; if (on) found = true; return '<option value="' + x[1] + '"' + (on ? ' selected' : '') + '>US ' + x[0] + ' · EU ' + x[1] + '</option>'; }).join('');
    return o + (v && !found ? '<option value="' + v + '" selected>' + esc(sizeLabel(v)) + '</option>' : '');
  }
  function mySize() { var x = (ST.me && ST.me.size_eu) || store('mysize'); return x ? Number(x) : null; }
  function ago(iso) {
    var s = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 1000));
    if (s < 60) return 'now'; if (s < 3600) return Math.floor(s / 60) + 'm'; if (s < 86400) return Math.floor(s / 3600) + 'h';
    return Math.floor(s / 86400) + 'd';
  }
  function store(key, val) { try { if (val === undefined) return JSON.parse(localStorage.getItem('zk.' + key) || 'null'); localStorage.setItem('zk.' + key, JSON.stringify(val)); } catch (e) { return null; } }
  function pub(bucket, path) { return sb ? sb.storage.from(bucket).getPublicUrl(path).data.publicUrl : ''; }
  function uid() { return ST.session && ST.session.user ? ST.session.user.id : null; }
  function isStaff() { return !!(ST.me && !ST.me.is_banned && (ST.me.is_admin || ST.me.is_checker || ST.me.is_owner)); }
  function isAdmin() { return !!(ST.me && !ST.me.is_banned && (ST.me.is_admin || ST.me.is_owner)); }
  function isOwner() { return !!(ST.me && ST.me.is_owner); }
  function suspendedUntil(p) { p = p || ST.me; return p && p.banned_until && new Date(p.banned_until) > new Date() ? new Date(p.banned_until) : null; }
  function isBlocked() { return !!(ST.me && (ST.me.is_banned || suspendedUntil())); }
  function fmtDay(d) { return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }
  function blockedNote(what) {
    var u = suspendedUntil();
    return '<div class="empty">' + I.shield + '<b>' + (ST.me && ST.me.is_banned ? 'Your account is banned' : 'Your account is on hold') + '</b><span>' +
      (u ? 'You can ' + esc(what) + ' again after ' + esc(fmtDay(u)) + '.' : 'You can’t ' + esc(what) + '. Contact the Zenkicks team if you think this is a mistake.') +
      '</span><button class="btn dark" data-go="drops">Back to drops</button></div>';
  }
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
    google: '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>',
    tag: ic('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="7.5" r="1.5"/>'),
    star: ic('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.5 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'),
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
    share: ic('<path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>'),
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
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.remove(); }, Math.max(2800, msg.length * 55));
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
  // after sign-in, send people back to what they were doing (a listing, Sell, a legit check)
  function rememberAfter() {
    var p = (location.hash || '').replace(/^#\/?/, '');
    if (p && !/^(login|me)(\/|$)/.test(p)) store('after', { p: p, t: Date.now() });
  }
  function takeAfter() {
    var a = store('after'); store('after', null);
    return a && a.p && Date.now() - a.t < 3600e3 ? a.p : null;
  }
  // catch typos like yahoo.coms / gmial.com before we send a code to an address that doesn't exist
  var MAIL_DOMAINS = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'live.com', 'ymail.com', 'msn.com', 'aol.com', 'me.com', 'proton.me', 'protonmail.com', 'yahoo.co.uk', 'hotmail.co.uk', 'googlemail.com', 'eim.ae', 'emirates.net.ae'];
  function lev(a, b) { var m = [], i, j; for (i = 0; i <= a.length; i++) m[i] = [i]; for (j = 0; j <= b.length; j++) m[0][j] = j; for (i = 1; i <= a.length; i++) for (j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return m[a.length][b.length]; }
  function emailFix(em) {
    var at = em.lastIndexOf('@'), d = em.slice(at + 1); if (at < 1 || MAIL_DOMAINS.indexOf(d) > -1) return null;
    var best = null, bd = 3; MAIL_DOMAINS.forEach(function (c) { var x = lev(d, c); if (x < bd) { bd = x; best = c; } });
    return best ? em.slice(0, at + 1) + best : null;
  }
  function inAppBrowser() { return installEnv().inApp; } // Google blocks sign-in inside Messenger/Instagram

  // ------------------------------------------------------------------
  // shell
  // ------------------------------------------------------------------
  function header(r) {
    var back = { grails: 'me', l: 'market', c: 'legit', 'new-check': 'legit', sell: 'drops', login: 'drops', join: 'drops', install: 'drops', u: 'market', admin: 'me' }[r.name];
    var titles = { grails: 'My grails', l: 'Listing', c: 'Legit check', 'new-check': 'New check', sell: 'Sell a pair', login: 'Sign in', join: 'Join Zenkicks', install: 'Install the app', u: 'Member', admin: 'Admin panel' };
    if (back) {
      return '<header class="hd"><button class="ibtn" data-go="' + back + '" aria-label="Back">' + (r.name === 'sell' || r.name === 'new-check' || r.name === 'login' || r.name === 'join' ? I.close : I.back) + '</button><div class="hd-title">' + LOGO + esc(titles[r.name]) + '</div><span style="width:44px"></span></header>';
    }
    var me = uid()
      ? '<button class="avatar-btn" data-go="me" aria-label="My profile" style="background:var(--red)">' + esc((ST.me && ST.me.username || '?')[0].toUpperCase()) + '</button>'
      : '<button class="ibtn" data-go="login" aria-label="Sign in">' + I.user + '</button>';
    return '<header class="hd"><button class="brand" data-go="drops" aria-label="Zenkicks home">' + LOGO + '<span>ZENKICKS</span></button>' +
      '<button class="ibtn" data-go="market" aria-label="Search the market">' + I.search + '</button>' + me + '</header>';
  }
  function tabs(r) {
    if (['l', 'c', 'sell', 'new-check', 'login', 'join', 'install'].indexOf(r.name) > -1) return '';
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


  // ------------------------------------------------------------------
  // HERO: street-poster look (brush type, Dubai skyline, next drop on a slab)
  // ------------------------------------------------------------------
  var SKYLINE = '<svg class="hx-sky" viewBox="0 0 460 220" preserveAspectRatio="xMaxYMax slice" aria-hidden="true"><g fill="currentColor">' +
    '<polygon points="300,220 300,120 306,120 306,70 311,70 311,30 314,4 317,30 317,70 322,70 322,120 328,120 328,220"/>' +
    '<rect x="250" y="120" width="30" height="100"/><rect x="256" y="104" width="18" height="16"/>' +
    '<rect x="338" y="96" width="26" height="124"/><rect x="368" y="130" width="22" height="90"/>' +
    '<path d="M398 220 L398 88 Q430 110 432 220 Z"/><rect x="396" y="80" width="3" height="140"/>' +
    '<rect x="208" y="140" width="34" height="80"/><rect x="214" y="126" width="6" height="14"/>' +
    '<rect x="170" y="160" width="30" height="60"/><rect x="438" y="150" width="22" height="70"/>' +
    '<rect x="120" y="176" width="44" height="44"/><rect x="60" y="188" width="54" height="32"/>' +
    '</g></svg>';
  var CROWN = '<svg class="hx-crown" viewBox="0 0 40 26" aria-hidden="true"><path d="M3 22 L6 6 L14 15 L20 3 L26 15 L34 6 L37 22 Z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  function ogLeft() { return typeof ST.ogCount === 'number' ? Math.max(0, 100 - ST.ogCount) : null; }
  function ogHook(dark) {
    var left = ogLeft(); if (left === null || left <= 0) return '';
    return '<div class="oghook' + (dark ? ' dark' : '') + '"><span class="ogmark">OG</span><span><b>First 100 members get the OG badge</b><br>' + left + ' spot' + (left === 1 ? '' : 's') + ' left. It stays on your profile forever.</span></div>';
  }
  function heroSection(next, dropCount, rem) {
    var stage = '', info = '';
    if (next) {
      var nd = new Date(next.date + 'T00:00:00Z'), nim = releaseImg(next), non = !!rem[next.name + next.date];
      var tag = 'Next drop · ' + whenLabel(next.date);
      stage = '<div class="hx-stage">' +
        '<div class="hx-slab" aria-hidden="true"></div>' +
        (nim ? '<figure class="hx-poster" data-peek="r|' + esc(next.name + next.date) + '"><img draggable="false" src="' + esc(nim) + '" alt="' + esc(next.name) + '"></figure>' : '<figure class="hx-poster hx-noimg">' + I.shoe + '</figure>') +
        '<span class="hx-tag">' + esc(tag) + '</span>' +
        '<div class="hx-badge" aria-label="' + dropCount + ' upcoming drops"><small>Upcoming</small><b>' + dropCount + '</b><small>drops</small></div>' +
        '</div>';
      info = '<div class="hx-next"><div class="grow"><div class="hx-name">' + esc(next.name) + '</div><div class="hx-meta">' + DOW[nd.getUTCDay()] + ', ' + nd.getUTCDate() + ' ' + MON[nd.getUTCMonth()].charAt(0) + MON[nd.getUTCMonth()].slice(1).toLowerCase() + ' · ' + priceLine(next.retail_usd) + '</div>' + codBtns(next.name + next.date) + '</div>' +
        '<button class="btn ' + (non ? 'ghost' : 'red') + ' hx-rem" ' + (non ? 'style="color:var(--coral)" ' : '') + 'data-act="rem" data-key="' + esc(next.name + next.date) + '" aria-pressed="' + non + '">' + (non ? I.check + 'Set' : I.bell + 'Remind me') + '</button></div>';
    }
    var trust = [[I.shield, 'Legit checks'], [I.tag, 'Prices in AED'], [I.star, 'Vouched sellers'], [I.heart, '100% free']].map(function (t) {
      return '<span class="hx-trust-i">' + t[0] + '<b>' + t[1] + '</b></span>';
    }).join('');
    return '<section class="hx">' + SKYLINE + '<span class="hx-scrawl" aria-hidden="true">Cop smart.<br>Wear <u>loud.</u></span>' +
      '<div class="hx-top">' + CROWN + '<span>Your sneakerheadlines</span><i></i></div>' +
      '<h1 class="hx-h"><span class="hx-big">Hype</span><span class="hx-red">Drops.</span></h1>' +
      '<div class="hx-band"><span>Zen deals. Zero fakes.</span></div>' +
      '<p class="hx-sub">The UAE sneaker tambayan. Drops in <b>AED</b>, buy and sell direct, and <b>community legit checks</b>.</p>' +
      stage + info +
      '<div class="hx-cta"><button class="btn hx-shop" data-go="market">' + I.bag + 'Shop pairs</button><button class="btn hx-sell" data-go="sell">Sell a pair</button></div>' +
      (!uid() && ogLeft() ? '<button class="oghook dark" data-go="login" style="border:0;text-align:left;width:100%"><span class="ogmark">OG</span><span><b>Claim your OG badge</b><br>Only ' + ogLeft() + ' of 100 spots left. Join free.</span><span aria-hidden="true" style="margin-left:auto;font-size:20px">›</span></button>' : '') +
      '</section>' +
      '<div class="hx-trust">' + trust + '<button class="hx-cop" data-go="market"><span>Bid. Deal.<br>Cop.</span></button></div>';
  }

  var renderSeq = 0;
  function render(keepScroll) {
    var r = route(); var seq = ++renderSeq;
    var oldMain = app.querySelector('.main'); var top = keepScroll && oldMain ? oldMain.scrollTop : 0;
    var bottom = (r.name === 'l' || r.name === 'c' || r.name === 'sell' || r.name === 'new-check') ? '<div id="bottombar"></div>' : tabs(r);
    app.setAttribute('data-view', r.name); if (/^<nav/.test(bottom)) app.setAttribute('data-nav', ''); else app.removeAttribute('data-nav');
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
    if (ST.feedsP) return ST.feedsP;
    function j(u) { return fetch(u + '?v=' + dubaiToday(), { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }
    return (ST.feedsP = Promise.all([j('data/releases.json'), j('data/hot.json'), j('data/photos.json')]).then(function (a) {
      ST.releases = a[0] || { items: [] }; ST.hot = a[1] || { online: [] }; ST.photos = a[2] || {};
      // Show only pairs that have a real photo; others appear once KicksDB or data/photos.json gives them one.
      ST.releases.items = (ST.releases.items || []).filter(function (d) { return !!releaseImg(d); });
      ST.hot.online = (ST.hot.online || []).filter(function (h) { return !!releaseImg(h); });
    }));
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
  // ---- "Paano i-install" guide (#/install) ----
  function installLink() { return installEnv().standalone ? '' : '<button class="card between ilink" data-go="install"><span class="invhead"><span class="ji">' + I.plus + '</span><span><b>I-install ang app</b><br><span class="m">Paano ilagay ang Zenkicks sa Android o iPhone</span></span></span><span aria-hidden="true" style="font-size:20px">›</span></button>'; }

  // ---- invite links: serelldc.github.io/zenkicks/join?ref=username ----
  var JOIN_URL = 'https://serelldc.github.io/zenkicks/join';
  (function captureRef() {
    var m = (location.search || '').match(/[?&]ref=([A-Za-z0-9_.\-]{2,30})/);
    if (!m) return;
    store('ref', { u: m[1], t: Date.now() });
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* keep the URL */ }
  })();
  function pendingRef() { var r = store('ref'); return r && r.u && Date.now() - r.t < 14 * 864e5 ? r.u : null; }
  // after sign-in: tell the database who invited this new member (only works once, within 3 days of joining)
  function applyRef() {
    var r = pendingRef(); if (!r || !uid() || !sb) return;
    sb.rpc('set_referrer', { p_ref: r }).then(function (x) {
      if (x.error || x.data === 'noprofile' || x.data === 'signin') return;
      store('ref', null);
      if (x.data === 'ok') setTimeout(function () { toast('You joined with @' + r + '’s invite'); }, 2600);
    });
  }
  function inviteLink(main) { var u = !main && ST.me && ST.me.username; return JOIN_URL + (u ? '?ref=' + encodeURIComponent(u) : ''); }
  function inviteCard(n) {
    var left = ogLeft();
    return '<div class="card invitecard"><div class="between" style="align-items:center"><b class="invhead"><span class="ji">' + I.share + '</span>Invite friends</b>' + (n ? '<span class="pill ok">' + n + ' joined</span>' : '') + '</div>' +
      '<span class="m">Send your link. Friends who sign up with it show up here.' + (left ? ' Only ' + left + ' OG spots left!' : '') + '</span>' +
      '<div class="invlink">' + esc(inviteLink().replace(/^https:\/\//, '')) + '</div>' +
      '<div class="chips-wrap"><button class="chip" data-act="invcopy">Copy link</button><button class="chip" data-act="invshare">' + I.share + ' Share</button><button class="chip" data-act="invqr">QR code</button><button class="chip" data-act="invstory">Story image</button></div>' +
      (isOwner() ? '<div class="chips-wrap"><span class="m" style="width:100%">Main sign-up link (no invite tag), for posters and the Zenkicks page:</span><button class="chip" data-act="invqr" data-v="main">Main QR</button><button class="chip" data-act="invstory" data-v="main">Main Story</button><button class="chip" data-act="invcopy" data-v="main">Copy main link</button></div>' : '') +
      '</div>';
  }
  // QR codes are drawn on this phone (assets/qr.js, loaded only when needed)
  var qrP = null;
  function loadQR() {
    if (window.qrcode) return Promise.resolve(window.qrcode);
    return qrP || (qrP = new Promise(function (res, rej) { var s = document.createElement('script'); s.src = 'assets/qr.js?v=1'; s.onload = function () { res(window.qrcode); }; s.onerror = function () { qrP = null; rej(new Error('qr')); }; document.head.appendChild(s); }));
  }
  function qrCanvas(text, scale) {
    return loadQR().then(function (q) {
      var qr = q(0, 'Q'); qr.addData(text); qr.make();
      var n = qr.getModuleCount(), quiet = 4, s = scale || 12, size = (n + quiet * 2) * s;
      var cv = document.createElement('canvas'); cv.width = cv.height = size; var x = cv.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, size, size); x.fillStyle = '#0D0D0D';
      for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (qr.isDark(r, c)) x.fillRect((c + quiet) * s, (r + quiet) * s, s, s);
      // Zenkicks mark in the middle (QR level Q still reads with the center covered)
      var b = Math.round(n * s * 0.2), o = (size - b) / 2;
      x.fillStyle = '#fff'; rrect(x, o - s * 0.6, o - s * 0.6, b + s * 1.2, b + s * 1.2, b * 0.24); x.fill();
      x.fillStyle = '#E52C27'; rrect(x, o, o, b, b, b * 0.2); x.fill();
      x.save(); x.translate(size / 2, size / 2); x.scale(b * 0.78 / 224, b * 0.78 / 224); x.fillStyle = '#fff'; var p = new Path2D(Z); x.fill(p); x.rotate(Math.PI); x.fill(p); x.restore();
      return cv;
    });
  }
  function inviteQR(main) {
    var link = inviteLink(main);
    openModal('<div class="peek-top"><b>' + (main ? 'Zenkicks sign-up QR' : 'Your invite QR') + '</b><button class="round" data-act="mclose" aria-label="Close">✕</button></div><div class="qrwrap"><div class="skeleton" style="height:100%"></div></div><p class="tiny center" style="margin:0;word-break:break-all">' + esc(link.replace(/^https:\/\//, '')) + '</p>');
    qrCanvas(link, 14).then(function (cv) {
      var w = app.querySelector('.qrwrap'); if (!w) return;
      var url = cv.toDataURL('image/png');
      w.innerHTML = '<img src="' + url + '" alt="QR code for ' + esc(link) + '">';
      w.insertAdjacentHTML('afterend', '<div class="row" style="gap:8px"><a class="btn red" style="flex:1" href="' + url + '" download="zenkicks-' + (main ? 'signup' : 'invite') + '-qr.png">Save QR</a><button class="btn ghost" style="flex:1;color:var(--ink)" data-act="invstory"' + (main ? ' data-v="main"' : '') + '>Story image</button></div><p class="tiny center" style="margin:0">Friends scan it with their phone camera to sign up.</p>');
    }).catch(function () { toast('Couldn’t make the QR. Check your connection.'); });
  }

  // ---- drop-day phone alerts (Web Push) ----
  // "Remind me" saves the pair on this phone AND (when the phone allows) sends a notification at 8 AM UAE on drop day.
  // The phone's push address + its reminder list live in Supabase (push_save); the "push" Edge Function sends.
  function pushEnv() {
    var env = installEnv();
    var can = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!sb;
    return { can: can, ios: env.ios, standalone: env.standalone, perm: can ? Notification.permission : 'unsupported' };
  }
  function b64uBytes(s) { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); var bin = atob(s + '==='.slice((s.length + 3) % 4)); var out = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
  function pushKey() {
    var k = store('pushkey'); if (k) return Promise.resolve(k);
    if (!sb) return Promise.resolve(null);
    return sb.rpc('push_public_key').then(function (r) {
      if (r.data) { store('pushkey', r.data); return r.data; }
      return sb.functions.invoke('push', { body: { action: 'key' } }).then(function (f) { var key = f.data && f.data.publicKey; if (key) store('pushkey', key); return key || null; });
    }).catch(function () { return null; });
  }
  function swReady() { return Promise.race([navigator.serviceWorker.ready, new Promise(function (_, rej) { setTimeout(function () { rej(new Error('no sw')); }, 6000); })]); }
  function currentSub() { if (!pushEnv().can) return Promise.resolve(null); return swReady().then(function (r) { return r.pushManager.getSubscription(); }).catch(function () { return null; }); }
  function remItems() {
    var rem = store('rem') || {}; var all = (ST.releases && ST.releases.items) || [];
    return all.filter(function (d) { return rem[d.name + d.date] && dayDiff(d.date) >= 0; }).map(function (d) {
      return { key: d.name + d.date, name: d.name, date: d.date, image: releaseImg(d) || '', usd: d.retail_usd || null };
    });
  }
  function pushSync(sub) {
    var j = sub.toJSON ? sub.toJSON() : sub;
    return loadFeeds().then(function () {
      return sb.rpc('push_save', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_items: remItems() });
    }).then(function (r) { if (r.error) throw r.error; store('pushon', j.endpoint); store('pushsync', Date.now()); return r.data; });
  }
  // Must be called straight from a tap (phones only show the permission prompt for a tap).
  // Resolves to: 'on' | 'ios-home' | 'unsupported' | 'blocked' | 'declined' | 'error'
  function pushOn() {
    var e = pushEnv();
    if (!e.can) return Promise.resolve(e.ios && !e.standalone ? 'ios-home' : 'unsupported');
    if (Notification.permission === 'denied') return Promise.resolve('blocked');
    var keyP = pushKey();
    var permP = Notification.permission === 'granted' ? Promise.resolve('granted') : new Promise(function (res) { var p = Notification.requestPermission(res); if (p && p.then) p.then(res); });
    return Promise.all([permP, keyP]).then(function (a) {
      if (a[0] !== 'granted') return a[0] === 'denied' ? 'blocked' : 'declined';
      if (!a[1]) return 'error';
      return swReady().then(function (r) {
        return r.pushManager.getSubscription().then(function (s) { return s || r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uBytes(a[1]) }); });
      }).then(function (sub) {
        var first = !store('pushon'); store('pushoff', null);
        return pushSync(sub).then(function () {
          if (first) sb.functions.invoke('push', { body: { action: 'test', endpoint: sub.endpoint } }).catch(function () {});
          return 'on';
        });
      });
    }).catch(function () { return 'error'; });
  }
  function pushOff() {
    store('pushoff', true);
    return currentSub().then(function (s) {
      var ep = (s && s.endpoint) || store('pushon'); store('pushon', null);
      return Promise.all([ep ? sb.rpc('push_off', { p_endpoint: ep }) : null, s ? s.unsubscribe().catch(function () {}) : null]);
    });
  }
  // after any reminder change: keep the server list in step (only when alerts are on)
  function pushResync() { if (!store('pushon') || store('pushoff')) return; currentSub().then(function (s) { if (s) pushSync(s).catch(function () {}); }); }
  function iosPushHelp() {
    openModal('<h2>Get drop alerts on iPhone</h2><p class="sub" style="margin:6px 0 12px">iPhone only sends notifications to apps on your Home Screen. It takes 10 seconds:</p>' +
      '<ol style="margin:0 0 14px;padding-left:20px;line-height:1.7"><li>Tap <b>Share</b> (square with arrow) in Safari</li><li>Tap <b>Add to Home Screen</b></li><li>Open Zenkicks from the new icon</li><li>Tap <b>Remind me</b> again and <b>Allow</b></li></ol>' +
      '<p class="tiny" style="margin:0 0 12px">Your reminder is already saved.</p><button class="btn red" style="width:100%" data-act="mclose">Got it</button>');
  }
  var PUSH_MSG = {
    on: '🔔 Reminder on. We’ll notify you at 8 AM (UAE) on drop day.',
    unsupported: 'Reminder saved. This browser can’t show notifications.',
    blocked: 'Reminder saved. Notifications are blocked for Zenkicks in your settings.',
    declined: 'Reminder saved in the app only (notifications not allowed).',
    error: 'Reminder saved. Couldn’t turn on phone alerts, try again later.'
  };
  // the bell on a drop: flip it, then turn on phone alerts if we can
  function toggleRem(k, after) {
    var rem = store('rem') || {}; var on = !rem[k]; if (on) rem[k] = true; else delete rem[k]; store('rem', rem);
    if (after) after(on);
    if (!on) { toast('Reminder removed'); pushResync(); return; }
    if (store('pushoff')) { toast('Reminder saved. Drop alerts are off (turn them on in Me).'); return; }
    if (store('pushon') && pushEnv().perm === 'granted') { toast(PUSH_MSG.on); pushResync(); return; }
    pushOn().then(function (res) {
      if (res === 'ios-home') { if (!store('ioshelp')) { store('ioshelp', true); iosPushHelp(); } else toast('Reminder saved. Add Zenkicks to your Home Screen for phone alerts.'); return; }
      toast(PUSH_MSG[res] || PUSH_MSG.error);
      if (route().name === 'me') render(true);
    });
  }
  // status for the Me page card
  function pushState() {
    var e = pushEnv();
    if (!e.can) return Promise.resolve({ s: e.ios && !e.standalone ? 'ios-home' : 'unsupported' });
    if (e.perm === 'denied') return Promise.resolve({ s: 'blocked' });
    return currentSub().then(function (sub) { return { s: sub && store('pushon') && !store('pushoff') && e.perm === 'granted' ? 'on' : 'off' }; });
  }
  function pushCard(st) {
    var n = Object.keys(store('rem') || {}).length, body, btn = '';
    if (st.s === 'on') { body = 'On for this phone. 8 AM (UAE) on drop day' + (n ? ' · ' + n + ' reminder' + (n > 1 ? 's' : '') : '. Tap 🔔 on any drop.'); btn = '<button class="chip" data-act="pushtest">Send test</button><button class="chip" data-act="pushoff">Turn off</button>'; }
    else if (st.s === 'off') { body = 'Get a phone notification on the morning of every drop you tap 🔔 on.'; btn = '<button class="btn red" style="height:38px;padding:0 14px;font-size:13px" data-act="pushon">Turn on</button>'; }
    else if (st.s === 'ios-home') { body = 'On iPhone, add Zenkicks to your Home Screen first (Share → Add to Home Screen), then open it from the icon and turn alerts on here.'; }
    else if (st.s === 'blocked') { body = 'Notifications are blocked for Zenkicks. Allow them in your phone or browser settings, then come back here.'; }
    else { body = 'This browser can’t show notifications. Open Zenkicks in Chrome or from your Home Screen app.'; }
    return '<div class="card pushcard" style="padding:14px;display:flex;flex-direction:column;gap:8px"><div class="between" style="align-items:center"><b>🔔 Drop alerts</b>' + (st.s === 'on' ? '<span class="pill ok">ON</span>' : '') + '</div><span class="m">' + body + '</span>' + (btn ? '<div class="row" style="gap:8px;flex-wrap:wrap">' + btn + '</div>' : '') + '</div>';
  }
  // on start: refresh this phone's list once a day, or re-subscribe if the phone dropped the old address
  function pushBoot() {
    if (!pushEnv().can || Notification.permission !== 'granted' || !store('pushon') || store('pushoff')) return;
    currentSub().then(function (s) {
      if (!s) return pushOn();
      if (s.endpoint !== store('pushon') || Date.now() - (store('pushsync') || 0) > 20 * 3600e3) return pushSync(s);
    }).catch(function () {});
  }

  // ---- install as an app (home-screen icon) ----
  var deferredInstall = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredInstall = e; var c = document.getElementById('installcard'); if (c && route().name === 'drops') render(true); });
  window.addEventListener('appinstalled', function () { store('noinstall', true); toast('Zenkicks is on your home screen'); });
  function installEnv() {
    var ua = navigator.userAgent || '';
    var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
    return { standalone: standalone, inApp: /FBAN|FBAV|FB_IAB|FBIOS|Messenger|Instagram|Line\/|TikTok|Snapchat/i.test(ua), ios: /iPhone|iPad|iPod/i.test(ua), android: /Android/i.test(ua) };
  }
  function installCard() {
    var env = installEnv();
    if (env.standalone || store('noinstall')) return '';
    var body, btn = '';
    if (env.inApp) {
      body = env.ios ? 'You’re inside Messenger/Instagram. Tap <b>•••</b> then <b>Open in Safari</b>, then <b>Share → Add to Home Screen</b>.' : 'You’re inside Messenger/Instagram. Open Zenkicks in Chrome to install the app icon.';
      if (env.android) btn = '<a class="btn red" style="height:40px;padding:0 14px;font-size:13px" href="intent://' + location.host + location.pathname + '#Intent;scheme=https;package=com.android.chrome;end">Open in Chrome</a>';
    } else if (deferredInstall) {
      body = 'Get the Zenkicks icon on your home screen. Opens like an app, no app store needed.';
      btn = '<button class="btn red" style="height:40px;padding:0 14px;font-size:13px" data-act="install">Install app</button>';
    } else if (env.ios) {
      body = 'Add Zenkicks to your home screen: tap <b>Share</b> (square with arrow) then <b>Add to Home Screen</b>.';
    } else {
      body = 'Add Zenkicks to your home screen: open the browser menu <b>⋮</b> then <b>Install app</b> or <b>Add to Home screen</b>.';
    }
    return '<div class="card installcard" id="installcard"><img src="icons/icon-192.png" alt="" width="44" height="44"><div class="grow"><b>Get the app</b><div class="m">' + body + '</div></div><div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">' + btn + '<button class="link" style="font-size:12px;padding:2px 0;font-weight:700" data-go="install">Paano?</button><button class="link" style="color:var(--muted);font-size:12px;padding:2px 0" data-act="hideinstall">Hide</button></div></div>';
  }
  function installApp() {
    if (!deferredInstall) { toast('Use your browser menu: Add to Home screen'); return; }
    deferredInstall.prompt();
    deferredInstall.userChoice.then(function () { deferredInstall = null; render(true); });
  }

  // ---- vouches (1-5 star ratings between members) ----
  function starBadge(v, dark) {
    if (!v || !v.total) return '<span class="vbadge new' + (dark ? ' dark' : '') + '">New member</span>';
    return '<span class="vbadge' + (dark ? ' dark' : '') + '" title="' + v.total + ' vouches">★ ' + Number(v.avg_stars).toFixed(1) + ' <span>(' + v.total + ')</span></span>' + trustedPill(v);
  }
  function vouchMap(ids) {
    ids = (ids || []).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
    if (!sb || !ids.length) return Promise.resolve({});
    return sb.rpc('vouch_summary', { ids: ids }).then(function (r) { var m = {}; (r.data || []).forEach(function (x) { m[x.user_id] = x; }); return m; }).catch(function () { return {}; });
  }
  function vouchModal(target, user, ref, kind) {
    if (!requireLogin()) return;
    ST.vstars = 0;
    var intro = kind === 'deal' ? 'How was your deal with @' + esc(user) + '? Your rating shows on their profile.' : 'Did @' + esc(user) + ' help you check this pair? Vouch for them.';
    openModal('<h2>Vouch for @' + esc(user) + '</h2><p class="sub">' + intro + '</p>' +
      '<div class="stars" role="radiogroup" aria-label="Rating">' + [1, 2, 3, 4, 5].map(function (i) { return '<button role="radio" aria-checked="false" aria-label="' + i + ' star' + (i > 1 ? 's' : '') + '" data-act="vstar" data-v="' + i + '">★</button>'; }).join('') + '</div>' +
      '<textarea id="v-note" maxlength="280" placeholder="' + (kind === 'deal' ? 'e.g. Legit pair, smooth meet-up in Sharjah' : 'e.g. Spotted the fake tag fast, thanks!') + '" style="padding:10px;border:1px solid var(--line);border-radius:10px;min-height:70px"></textarea>' +
      '<p class="err" id="v-err" role="alert"></p><div class="row"><button class="btn ghost" style="flex:1" data-act="mclose">Cancel</button><button class="btn red" style="flex:1" data-act="vsend" data-target="' + target + '" data-ref="' + ref + '" data-kind="' + kind + '">Send vouch</button></div>');
  }

  // ---- OG badge (gold shield: OG / member number / Zenkicks logo) ----
  var OG_TPL = "<svg viewBox=\"0 0 300 290\" class=\"ogbadge\" role=\"img\" aria-label=\"OG member number @N\"> <defs> <linearGradient id=\"rim@U\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#FFF4BF\"/><stop offset=\".18\" stop-color=\"#E8C15A\"/><stop offset=\".45\" stop-color=\"#B8862A\"/><stop offset=\".7\" stop-color=\"#F2D27A\"/><stop offset=\"1\" stop-color=\"#8A6212\"/></linearGradient> <linearGradient id=\"rim2@U\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#FFF6CF\"/><stop offset=\".35\" stop-color=\"#D9AE4C\"/><stop offset=\".7\" stop-color=\"#A57A1C\"/><stop offset=\"1\" stop-color=\"#E9C766\"/></linearGradient> <linearGradient id=\"cap@U\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#F7E3A4\"/><stop offset=\".55\" stop-color=\"#D9B25A\"/><stop offset=\"1\" stop-color=\"#B98C32\"/></linearGradient> <linearGradient id=\"dark@U\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#3a3a3a\"/><stop offset=\".5\" stop-color=\"#232323\"/><stop offset=\"1\" stop-color=\"#141414\"/></linearGradient> <linearGradient id=\"band@U\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#454545\"/><stop offset=\".5\" stop-color=\"#2a2a2a\"/><stop offset=\"1\" stop-color=\"#1c1c1c\"/></linearGradient> <linearGradient id=\"hi@U\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\" stop-opacity=\".55\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\"0\"/></linearGradient> <linearGradient id=\"num@U\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#FFF4BF\"/><stop offset=\".45\" stop-color=\"#F2C94C\"/><stop offset=\".75\" stop-color=\"#C9962A\"/><stop offset=\"1\" stop-color=\"#F5D77E\"/></linearGradient> <filter id=\"nsh@U\"><feDropShadow dx=\"0\" dy=\"1.5\" stdDeviation=\".6\" flood-color=\"#000\" flood-opacity=\".8\"/></filter> <path id=\"arc@U\" d=\"M90 88 Q150 36 210 88\"/> <filter id=\"sh@U\" x=\"-20%\" y=\"-20%\" width=\"140%\" height=\"140%\"><feDropShadow dx=\"0\" dy=\"6\" stdDeviation=\"6\" flood-color=\"#000\" flood-opacity=\".45\"/></filter> <filter id=\"emb@U\"><feDropShadow dx=\"0\" dy=\"1.2\" stdDeviation=\".4\" flood-color=\"#fff\" flood-opacity=\".45\"/></filter> </defs> <g filter=\"url(#sh@U)\"> <path d=\"M34 112 L10 139 L34 166 Z\" fill=\"url(#rim@U)\"/><path d=\"M266 112 L290 139 L266 166 Z\" fill=\"url(#rim@U)\"/> <path d=\"M34 120 L20 139 L34 158 Z\" fill=\"#2a2a2a\"/><path d=\"M266 120 L280 139 L266 158 Z\" fill=\"#2a2a2a\"/> <path d=\"M58 60 Q58 34 84 29 Q150 4 216 29 Q242 34 242 60 V198 Q242 209 233 215 L163 264 Q150 273 137 264 L67 215 Q58 209 58 198 Z\" fill=\"url(#rim@U)\"/> <path d=\"M68 62 Q68 42 88 38 Q150 16 212 38 Q232 42 232 62 V196 Q232 203 226 207 L159 254 Q150 260 141 254 L74 207 Q68 203 68 196 Z\" fill=\"url(#dark@U)\"/> <path d=\"M76 64 Q76 48 92 45 Q150 25 208 45 Q224 48 224 64 V104 H76 Z\" fill=\"url(#rim2@U)\"/> <path d=\"M81 65 Q81 52 95 49.5 Q150 31 205 49.5 Q219 52 219 65 V100 H81 Z\" fill=\"url(#cap@U)\"/> <path d=\"M81 65 Q81 52 95 49.5 Q150 31 205 49.5 Q219 52 219 65 V74 H81 Z\" fill=\"url(#hi@U)\" opacity=\".5\"/> <text font-family=\"Oxanium\" font-weight=\"800\" font-size=\"10\" letter-spacing=\"1.8\" fill=\"#2a1d05\"><textPath href=\"#arc@U\" startOffset=\"50%\" text-anchor=\"middle\">FOUNDING MEMBER</textPath></text> <text x=\"150\" y=\"98\" text-anchor=\"middle\" font-family=\"Audiowide\" font-size=\"30\" fill=\"#1d1406\" filter=\"url(#emb@U)\">OG</text> <path d=\"M104 88 l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7z\" fill=\"#2a1d05\"/> <path d=\"M196 88 l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7z\" fill=\"#2a1d05\"/> <rect x=\"30\" y=\"108\" width=\"240\" height=\"62\" rx=\"9\" fill=\"url(#rim@U)\"/> <rect x=\"37\" y=\"115\" width=\"226\" height=\"48\" rx=\"6\" fill=\"url(#band@U)\"/> <rect x=\"37\" y=\"115\" width=\"226\" height=\"16\" rx=\"6\" fill=\"#fff\" opacity=\".07\"/> <text x=\"150\" y=\"153\" text-anchor=\"middle\" font-family=\"Oxanium\" font-weight=\"800\" font-size=\"@F\" letter-spacing=\"1\" fill=\"url(#num@U)\" stroke=\"#6b4a08\" stroke-width=\".6\" filter=\"url(#nsh@U)\">#@N</text> <g transform=\"translate(150 212) scale(.27)\"><use href=\"#zkmark\"/></g> <path d=\"M112 188 l1.6 3.2 3.5.5-2.5 2.5.6 3.5-3.2-1.7-3.2 1.7.6-3.5-2.5-2.5 3.5-.5z\" fill=\"#C9A24A\"/> <path d=\"M188 188 l1.6 3.2 3.5.5-2.5 2.5.6 3.5-3.2-1.7-3.2 1.7.6-3.5-2.5-2.5 3.5-.5z\" fill=\"#C9A24A\"/> <path d=\"M84 29 Q150 4 216 29\" fill=\"none\" stroke=\"#fff\" stroke-opacity=\".6\" stroke-width=\"2\"/> </g></svg>";
  var ogSeq = 0;
  // gold shield artwork (img/og-badge.webp) with the member's own number engraved on the bottom plate
  function ogBadge(n) { var t = '#' + n; return '<span class="ogb" role="img" aria-label="OG member number ' + n + '"><img src="img/og-badge.webp?v=2" alt="" draggable="false"><span class="ogn' + (t.length > 3 ? ' s' : '') + '">' + t + '</span></span>'; }
  var OG_MINI = '<img class="ogmini" src="img/og-mini.webp?v=2" alt="" aria-hidden="true">';
  function ogPill(n) { return '<span class="pill og" title="OG #' + n + ': one of the first 100 members">' + OG_MINI + 'OG #' + n + '</span>'; }
  (function () { // shared Zenkicks mark used inside the badge
    if (document.getElementById('zkmark')) return;
    var d = document.createElement('div'); d.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    d.innerHTML = '<svg width="0" height="0" aria-hidden="true"><defs><g id="zkmark" fill="#E52C27">' + "<path d=\"M-58.1 79.3 Q-59.0 79.8 -61.1 79.9 Q-63.2 80.1 -65.5 79.3 Q-67.9 78.4 -70.3 76.8 Q-72.7 75.2 -74.9 72.8 Q-77.1 70.5 -78.7 68.0 Q-80.2 65.6 -81.5 62.6 Q-82.7 59.5 -83.5 56.8 Q-84.4 54.0 -85.6 48.3 Q-86.8 42.7 -87.0 -9.7 Q-87.2 -62.0 -86.6 -65.2 Q-86.1 -68.4 -84.5 -72.0 Q-82.9 -75.6 -81.5 -77.2 Q-80.1 -78.8 -79.1 -79.3 Q-78.2 -79.8 -77.2 -80.0 Q-76.2 -80.2 -74.4 -80.2 Q-72.6 -80.1 -69.8 -79.5 Q-67.0 -78.8 -60.2 -76.2 Q-53.5 -73.6 -50.0 -72.5 Q-46.5 -71.4 -42.3 -70.8 Q-38.0 -70.2 -34.0 -70.5 Q-30.1 -70.8 -29.1 -70.7 Q-28.0 -70.5 -27.2 -70.0 Q-26.3 -69.6 -25.8 -69.1 Q-25.4 -68.6 -25.0 -67.7 Q-24.5 -66.8 -24.5 -65.8 Q-24.4 -64.8 -24.6 -63.8 Q-24.9 -62.7 -25.8 -60.8 Q-26.8 -58.9 -29.5 -54.6 Q-32.3 -50.4 -33.4 -47.4 Q-34.4 -44.3 -34.4 -41.5 Q-34.4 -38.6 -33.5 -36.3 Q-32.6 -34.0 -31.7 -32.9 Q-30.8 -31.7 -29.7 -30.9 Q-28.6 -30.0 -27.6 -29.5 Q-26.6 -29.0 -25.3 -28.7 Q-23.9 -28.4 -22.1 -28.5 Q-20.4 -28.5 -15.5 -29.8 Q-10.6 -31.1 -8.8 -31.3 Q-7.0 -31.4 -6.0 -31.3 Q-5.0 -31.1 -4.1 -30.7 Q-3.2 -30.3 -2.7 -29.8 Q-2.3 -29.4 -1.7 -27.8 Q-1.1 -26.2 -1.4 -24.9 Q-1.6 -23.6 -2.7 -22.2 Q-3.7 -20.8 -10.2 -15.7 Q-16.8 -10.5 -20.4 -6.9 Q-24.0 -3.4 -27.4 0.9 Q-30.8 5.1 -33.2 8.8 Q-35.6 12.4 -38.1 17.6 Q-40.7 22.8 -43.7 31.4 Q-46.7 39.9 -48.1 45.6 Q-49.5 51.2 -49.9 55.5 Q-50.4 59.8 -51.7 66.5 Q-53.0 73.3 -54.3 75.4 Q-55.5 77.5 -56.3 78.2 Q-57.1 78.9 -58.1 79.3Z\"/><path d=\"M-58.1 79.3 Q-59.0 79.8 -61.1 79.9 Q-63.2 80.1 -65.5 79.3 Q-67.9 78.4 -70.3 76.8 Q-72.7 75.2 -74.9 72.8 Q-77.1 70.5 -78.7 68.0 Q-80.2 65.6 -81.5 62.6 Q-82.7 59.5 -83.5 56.8 Q-84.4 54.0 -85.6 48.3 Q-86.8 42.7 -87.0 -9.7 Q-87.2 -62.0 -86.6 -65.2 Q-86.1 -68.4 -84.5 -72.0 Q-82.9 -75.6 -81.5 -77.2 Q-80.1 -78.8 -79.1 -79.3 Q-78.2 -79.8 -77.2 -80.0 Q-76.2 -80.2 -74.4 -80.2 Q-72.6 -80.1 -69.8 -79.5 Q-67.0 -78.8 -60.2 -76.2 Q-53.5 -73.6 -50.0 -72.5 Q-46.5 -71.4 -42.3 -70.8 Q-38.0 -70.2 -34.0 -70.5 Q-30.1 -70.8 -29.1 -70.7 Q-28.0 -70.5 -27.2 -70.0 Q-26.3 -69.6 -25.8 -69.1 Q-25.4 -68.6 -25.0 -67.7 Q-24.5 -66.8 -24.5 -65.8 Q-24.4 -64.8 -24.6 -63.8 Q-24.9 -62.7 -25.8 -60.8 Q-26.8 -58.9 -29.5 -54.6 Q-32.3 -50.4 -33.4 -47.4 Q-34.4 -44.3 -34.4 -41.5 Q-34.4 -38.6 -33.5 -36.3 Q-32.6 -34.0 -31.7 -32.9 Q-30.8 -31.7 -29.7 -30.9 Q-28.6 -30.0 -27.6 -29.5 Q-26.6 -29.0 -25.3 -28.7 Q-23.9 -28.4 -22.1 -28.5 Q-20.4 -28.5 -15.5 -29.8 Q-10.6 -31.1 -8.8 -31.3 Q-7.0 -31.4 -6.0 -31.3 Q-5.0 -31.1 -4.1 -30.7 Q-3.2 -30.3 -2.7 -29.8 Q-2.3 -29.4 -1.7 -27.8 Q-1.1 -26.2 -1.4 -24.9 Q-1.6 -23.6 -2.7 -22.2 Q-3.7 -20.8 -10.2 -15.7 Q-16.8 -10.5 -20.4 -6.9 Q-24.0 -3.4 -27.4 0.9 Q-30.8 5.1 -33.2 8.8 Q-35.6 12.4 -38.1 17.6 Q-40.7 22.8 -43.7 31.4 Q-46.7 39.9 -48.1 45.6 Q-49.5 51.2 -49.9 55.5 Q-50.4 59.8 -51.7 66.5 Q-53.0 73.3 -54.3 75.4 Q-55.5 77.5 -56.3 78.2 Q-57.1 78.9 -58.1 79.3Z\" transform=\"rotate(180)\"/>" + '</g></defs></svg>';
    document.body.appendChild(d);
  })();

  function modModal(kind, id, user) {
    var t = { warn: ['Warn @' + user, 'They’ll see this message the next time they open Zenkicks. Nothing else changes.', 'Send warning', 'e.g. Please use real photos of the pair you’re selling.'],
      suspend: ['Suspend @' + user, 'They can still browse, but can’t sell, bid, vote or comment until the hold ends.', 'Suspend', 'e.g. Second warning for fake-looking photos.'],
      ban: ['Ban @' + user, 'Permanent. Their pairs for sale are taken down. Use this for scams or repeat offenders.', 'Ban member', 'e.g. Took payment and didn’t deliver.'] }[kind];
    openModal('<h2>' + esc(t[0]) + '</h2><p class="sub">' + t[1] + '</p>' +
      (kind === 'suspend' ? '<div class="chips-wrap" role="group" aria-label="How long">' + [1, 3, 7, 30].map(function (d) { var on = (ST.modDays || 7) === d; return '<button class="chip' + (on ? ' on' : '') + '" data-act="adays" data-v="' + d + '" aria-pressed="' + on + '">' + d + ' day' + (d > 1 ? 's' : '') + '</button>'; }).join('') + '</div>' : '') +
      '<textarea id="mod-why" maxlength="300" placeholder="' + esc(t[3]) + '" style="padding:10px;border:1px solid var(--line);border-radius:10px;min-height:80px"></textarea>' +
      '<p class="err" id="mod-err" role="alert"></p><div class="row"><button class="btn ghost" style="flex:1" data-act="mclose">Cancel</button><button class="btn ' + (kind === 'warn' ? 'dark' : 'red') + '" style="flex:1" data-act="amodsend" data-kind="' + kind + '" data-id="' + id + '">' + t[2] + '</button></div>');
  }
  function founderPill(id) {
    return (ST.owners && ST.owners[id] ? ' <span class="pill founder">★ Founder</span>' : '') +
      (ST.og && ST.og[id] ? ' ' + ogPill(ST.og[id]) : '');
  }
  function trustedPill(v) { return v && v.trusted ? ' <span class="pill trusted" title="5+ deals rated 4.5★ or higher">✓ Trusted seller</span>' : ''; }
  function userLink(id, name) { return '<button class="link ulink" data-go="u/' + id + '">@' + esc(name) + '</button>' + founderPill(id); }
  function verifiedPill(level) {
    return level === 'id' ? '<span class="pill ok">✓ ID-verified</span>' : level === 'phone' ? '<span class="pill ok">✓ Phone-verified</span>' : '<span class="pill sample">Email only</span>';
  }
  function itemCard(l, stats) {
    stats = stats || {};
    return '<button class="item" data-go="l/' + l.id + '"><div class="tile" style="height:120px;background:#fff"><span class="pill white cond" style="z-index:1">' + esc(l.condition) + '</span>' +
      (l.legit_checked ? '<span class="pill dark chk" style="z-index:1">Checked</span>' : '') +
      (firstPhoto(l) ? '<img src="' + esc(firstPhoto(l)) + '" alt="" loading="lazy">' : I.shoe) + '</div>' +
      '<span class="t">' + esc(l.model) + '</span><span class="m">' + (l.size_eu ? sizeLabel(l.size_eu) + ' · ' : '') + esc(l.city || 'UAE') + '</span>' +
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

  // someone who asked for a code but never typed it: remind them when they come back (this device only)
  function pendingSignup() {
    var p = store('pending');
    if (!p || !p.email) return null;
    if (uid() || Date.now() - p.t > 30 * 864e5) { store('pending', null); return null; }
    return p;
  }
  function pendingBanner() {
    var p = pendingSignup(); if (!p) return '';
    return '<div class="pad" style="padding-bottom:0"><div class="card pendbox"><div><b>You’re almost in!</b><br><span class="m">Finish signing up with the 6-digit code we emailed to <b>' + esc(p.email) + '</b>. Check Spam or Promotions if you can’t see it.</span></div>' +
      '<div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn red" style="height:40px;padding:0 16px;font-size:13px" data-act="pendcode">Enter my code</button><button class="btn ghost" style="height:40px;padding:0 14px;font-size:13px;color:var(--ink)" data-act="pendnew">Send a new code</button><button class="link" style="font-size:12px" data-act="pendforget">Not me</button></div></div></div>';
  }

  // ---- Cop or Drop (community vote on each release) ----
  function codFor(keys) {
    if (!sb || !keys.length) return Promise.resolve();
    var now = Date.now(), need = keys.filter(function (k) { return !ST.cod[k] || now - (ST.codAt[k] || 0) > 60000; });
    if (!need.length) return Promise.resolve();
    return sb.rpc('drop_vote_stats', { keys: need }).then(function (r) {
      (r.data || []).forEach(function (x) { ST.cod[x.release_key] = { c: x.cops || 0, d: x.drops || 0, mine: x.mine || 0 }; ST.codAt[x.release_key] = now; });
    }).catch(function () {});
  }
  function codBtns(k, big) {
    var s = ST.cod[k] || { c: 0, d: 0, mine: 0 }, t = s.c + s.d, pc = t ? Math.round(s.c * 100 / t) : 0;
    return '<span class="cod' + (big ? ' big' : '') + '" data-k="' + esc(k) + '">' +
      '<button class="cop' + (s.mine === 1 ? ' on' : '') + '" data-act="cod" data-key="' + esc(k) + '" data-v="1" aria-pressed="' + (s.mine === 1) + '" aria-label="Cop">🔥 ' + (t ? pc + '%' : 'Cop') + '</button>' +
      '<button class="drp' + (s.mine === -1 ? ' on' : '') + '" data-act="cod" data-key="' + esc(k) + '" data-v="-1" aria-pressed="' + (s.mine === -1) + '" aria-label="Drop">🧊 ' + (t ? (100 - pc) + '%' : 'Drop') + '</button>' +
      (big ? '<span class="codbar"><i style="width:' + (t ? pc : 50) + '%"></i></span><span class="codn">' + (t ? t + ' vote' + (t > 1 ? 's' : '') + ' · Cop or drop?' : 'Be the first to vote. Cop or drop?') + '</span>' : '') + '</span>';
  }
  function codVote(k, v) {
    if (!requireLogin()) return;
    if (isBlocked()) { toast('Your account is on hold, so you can’t vote right now.'); return; }
    var s = ST.cod[k] || { c: 0, d: 0, mine: 0 }, prev = s.mine, next = prev === v ? 0 : v;
    if (prev === 1) s.c--; if (prev === -1) s.d--; if (next === 1) s.c++; if (next === -1) s.d++;
    s.mine = next; ST.cod[k] = s; ST.codAt[k] = Date.now(); paintCod(k);
    var q = next ? sb.from('drop_votes').upsert({ release_key: k, user_id: uid(), vote: next }, { onConflict: 'release_key,user_id' }) : sb.from('drop_votes').delete().eq('release_key', k).eq('user_id', uid());
    q.then(function (r) { if (r.error) { toast('Couldn’t save your vote. Try again.'); delete ST.codAt[k]; } });
  }
  function paintCod(k) { app.querySelectorAll('.cod').forEach(function (el) { if (el.getAttribute('data-k') === k) el.outerHTML = codBtns(k, el.classList.contains('big')); }); }

  // ---- Grails (pairs a member is hunting) ----
  function loadGrailHits(force) {
    if (!sb || !uid()) { ST.grailHits = []; return Promise.resolve([]); }
    if (!force && ST.grailHits && Date.now() - (ST.grailAt || 0) < 120000) return Promise.resolve(ST.grailHits);
    return sb.rpc('my_grail_matches').then(function (r) { ST.grailHits = r.error ? [] : (r.data || []); ST.grailAt = Date.now(); return ST.grailHits; }).catch(function () { ST.grailHits = []; return []; });
  }
  function grailNew() { var seen = store('grailseen') || {}, u = {}; (ST.grailHits || []).forEach(function (h) { if (!seen[h.listing_id]) u[h.listing_id] = 1; }); return Object.keys(u); }
  function markGrailsSeen() { var seen = store('grailseen') || {}; (ST.grailHits || []).forEach(function (h) { seen[h.listing_id] = 1; }); store('grailseen', seen); }
  function grailBanner() {
    var n = uid() ? grailNew().length : 0; if (!n) return '';
    return '<div class="pad" style="padding-bottom:0"><button class="card grailbox" data-go="grails"><span class="gb-ico">🔔</span><span class="grow"><b>Grail alert!</b><br><span class="m">' + n + ' pair' + (n > 1 ? 's' : '') + ' you’re hunting just got listed on the Market.</span></span><span aria-hidden="true" style="font-size:20px">›</span></button></div>';
  }

  VIEWS.drops = function () {
    var hc = ST.homeCache && Date.now() - ST.homeCache.t < 30000 ? ST.homeCache : null;
    var fresh = hc ? Promise.resolve({ data: hc.listings }) : sb ? sb.from('listings').select(LISTING_COLS).eq('status', 'active').order('created_at', { ascending: false }).limit(4) : Promise.resolve({ data: [] });
    if (uid() && (!ST.grailHits || Date.now() - (ST.grailAt || 0) > 120000)) loadGrailHits().then(function () { if (route().name === 'drops' && grailNew().length && !app.querySelector('.grailbox')) render(true); });
    return Promise.all([loadFeeds(), fresh]).then(function (a) { return codFor(upcoming().slice(0, 9).map(function (d) { return d.name + d.date; })).then(function () { return a; }); }).then(function (a) {
      var listings = (a[1] && a[1].data) || [];
      var up = upcoming(); var next = up[0]; var rem = store('rem') || {};
      var rows = up.slice(0, 8).map(function (d) {
        var dt = new Date(d.date + 'T00:00:00Z'); var on = !!rem[d.name + d.date]; var im = releaseImg(d);
        return '<div class="card drop" data-peek="r|' + esc(d.name + d.date) + '"><div class="date"><span>' + MON[dt.getUTCMonth()] + '</span><b>' + ('0' + dt.getUTCDate()).slice(-2) + '</b></div>' +
          (im ? '<img draggable="false" src="' + esc(im) + '" alt="" loading="lazy" style="width:64px;height:46px;object-fit:cover;border-radius:8px;flex-shrink:0;background:#fff">' : '') +
          '<div class="grow"><div class="t" style="font-size:14px;line-height:1.3">' + esc(d.name) + '</div><div class="m">' + DOW[dt.getUTCDay()] + ' · ' + whenLabel(d.date) + ' · ' + priceLine(d.retail_usd) + '</div>' + codBtns(d.name + d.date) + '</div>' +
          '<button class="round' + (on ? ' on' : '') + '" data-act="rem" data-key="' + esc(d.name + d.date) + '" aria-pressed="' + on + '" aria-label="' + (on ? 'Remove reminder for ' : 'Remind me about ') + esc(d.name) + '">' + (on ? I.check : I.bell) + '</button></div>';
      }).join('') || '<p class="sub">No upcoming drops in the feed right now.</p>';
      var hot = (ST.hot.online || []).slice(0, 5).map(function (h, i) {
        var im = releaseImg(h);
        return '<button class="card hotcard" data-go="hot" data-peek="h|' + i + '"><div class="tile" style="height:90px;background:#fff"><span class="rank" style="z-index:1">' + (i + 1) + '</span>' + (im ? '<img src="' + esc(im) + '" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover">' : I.shoe) + '</div><span class="t" style="font-size:13px;line-height:1.3">' + esc(h.name) + '</span><span class="m">' + esc(h.why || '') + '</span></button>';
      }).join('');
      var heroHtml = heroSection(next, up.length, rem);
      var ids = listings.map(function (l) { return l.id; });
      return (hc ? Promise.resolve(hc.stats) : statsFor(ids)).then(function (stats) {
        ST.homeCache = { t: hc ? hc.t : Date.now(), listings: listings, stats: stats };
        return installCard() + pendingBanner() + grailBanner() + heroHtml +
          '<div class="pad">' +
          '<section class="sec"><div class="between"><h2>Release calendar</h2><span class="pill ok" style="font-size:10px">AUTO</span></div><p class="sub" style="font-size:12px">' + esc(stamp()) + ' · AED from US retail at 3.6725; UAE store prices may differ · <b>Press and hold a pair for details</b></p><div class="droplist">' + rows + '</div></section>' +
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
    return '<p class="tiny" style="margin:0">Release data: ' + esc((ST.releases && ST.releases.source) || 'public release calendars') + '. Product images belong to their owners. Reminders send a phone notification at 8 AM (UAE) on drop day when alerts are allowed.</p>';
  }

  VIEWS.hot = function () {
    return loadFeeds().then(function () {
      var seg = '<div class="seg" role="tablist" aria-label="Hot source"><button role="tab" class="' + (ST.hotTab === 'online' ? 'on' : '') + '" aria-selected="' + (ST.hotTab === 'online') + '" data-act="hottab" data-v="online">Online buzz</button><button role="tab" class="' + (ST.hotTab === 'market' ? 'on' : '') + '" aria-selected="' + (ST.hotTab === 'market') + '" data-act="hottab" data-v="market">On Zenkicks</button></div>';
      var head = '<div class="sec" style="gap:4px"><div class="row"><h1>What’s hot</h1><span class="pill ok" style="font-size:10px">AUTO</span></div><p class="sub">' + (ST.hotTab === 'online' ? 'Most-traded and most-hyped pairs right now, refreshed daily. Press and hold a pair for details.' : 'Live from the Zenkicks market: bids and watchlist saves in the last 7 days.') + '</p></div>';
      if (ST.hotTab === 'online') {
        var list = (ST.hot.online || []).map(function (h, n) {
          var im = releaseImg(h);
          return '<div class="card hotrow" data-peek="h|' + n + '"><span class="n">' + (n + 1) + '</span><div class="tile" style="width:72px;height:52px;flex-shrink:0;background:#fff">' + (im ? '<img src="' + esc(im) + '" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover">' : I.shoe) + '</div><div class="grow"><div class="t" style="font-size:14px;line-height:1.3">' + esc(h.name) + '</div><div class="m">' + esc(h.why || '') + '</div></div>' + (h.tag ? '<span class="trend">' + esc(h.tag) + '</span>' : '') + '</div>';
        }).join('') || '<p class="sub">Nothing in the feed yet.</p>';
        return '<div class="pad">' + head + seg + '<div class="list hotlist">' + list + '</div>' + adSlot() + sourcesNote() + '</div>';
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
          return '<div class="pad">' + head + seg + '<div class="list hotlist">' + rows + '</div></div>';
        });
      });
    });
  };

  VIEWS.grails = function () {
    if (!sb) return needSb();
    if (!uid()) return needLogin('save your grails');
    var dr = ST.grailDraft || {}; ST.grailDraft = null;
    return Promise.all([sb.from('grails').select('id,model,size_eu,created_at').order('created_at', { ascending: false }), loadGrailHits(true)]).then(function (a) {
      if (a[0].error) throw a[0].error;
      var gs = a[0].data || [], hits = ST.grailHits || [], fresh = {};
      grailNew().forEach(function (id) { fresh[id] = 1; });
      var ids = []; hits.forEach(function (h) { if (ids.indexOf(h.listing_id) < 0) ids.push(h.listing_id); });
      return (ids.length ? Promise.all([sb.from('listings').select(LISTING_COLS).in('id', ids), statsFor(ids)]) : Promise.resolve([{ data: [] }, {}])).then(function (b) {
        var byId = {}; (b[0].data || []).forEach(function (l) { byId[l.id] = l; });
        markGrailsSeen();
        var count = {}; hits.forEach(function (h) { count[h.grail_id] = (count[h.grail_id] || 0) + 1; });
        var list = gs.map(function (g) {
          var n = count[g.id] || 0;
          return '<div class="kv" style="align-items:center"><span><b>' + esc(g.model) + '</b><br><span class="m">' + (g.size_eu ? esc(sizeLabel(g.size_eu)) : 'Any size') + ' · ' + (n ? '<b style="color:var(--green)">' + n + ' on the Market</b>' : 'Watching') + '</span></span><button class="round" data-act="delgrail" data-id="' + g.id + '" aria-label="Remove ' + esc(g.model) + '">✕</button></div>';
        }).join('');
        var found = ids.filter(function (id) { return byId[id]; });
        return '<div class="pad"><div class="sec" style="gap:4px"><h1>My grails ⭐</h1><p class="sub">Add the pairs you’re hunting. When someone lists one in your size, it shows up here and on your home screen.</p></div>' +
          '<div class="card" style="padding:14px;display:flex;flex-direction:column;gap:10px">' +
          '<label class="field" for="g-model">Pair<input id="g-model" type="text" maxlength="80" placeholder="e.g. Jordan 4 Bred" value="' + esc(dr.model || '') + '"></label>' +
          '<label class="field" for="g-size">Size<select id="g-size">' + sizeOptions(dr.size || mySize(), 'Any size') + '</select></label>' +
          '<p class="err" id="g-err" role="alert"></p><button class="btn red" data-act="addgrail">⭐ Add to my grails</button>' +
          '<p class="tiny" style="margin:0">Tip: keep it short, like “Dunk Low Panda”. Every word must be in the listing.</p></div>' +
          (gs.length ? '<section class="sec"><h2>Hunting (' + gs.length + '/20)</h2><div class="card" style="padding:4px 14px">' + list + '</div></section>' : '') +
          '<section class="sec"><h2>On the Market now</h2>' + (found.length ? '<div class="grid">' + found.map(function (id) { return (fresh[id] ? '<div class="newwrap"><span class="pill red newtag">NEW</span>' : '<div class="newwrap">') + itemCard(byId[id], b[1][id]) + '</div>'; }).join('') + '</div>' : '<div class="empty" style="padding:20px">' + I.bag + '<span>' + (gs.length ? 'No matches yet. We’ll show them here the moment one gets listed.' : 'Add your first grail above.') + '</span></div>') + '</section></div>';
      });
    });
  };

  // ---- Share cards (1080x1920 image for IG / WhatsApp Story) ----
  function loadImg(src) { return new Promise(function (res) { if (!src) return res(null); var im = new Image(); im.crossOrigin = 'anonymous'; im.onload = function () { res(im); }; im.onerror = function () { res(null); }; im.src = src; }); }
  function rrect(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
  function wrapText(x, text, cx, y, maxW, lh, maxLines) {
    var words = String(text).split(/\s+/), lines = [], cur = '';
    words.forEach(function (w) { var t = cur ? cur + ' ' + w : w; if (x.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
    if (cur) lines.push(cur);
    if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] += '…'; }
    lines.forEach(function (l, i) { x.fillText(l, cx, y + i * lh); });
    return y + lines.length * lh;
  }
  function fitImg(x, im, a, b, w, h) { var r = Math.min(w / im.width, h / im.height), iw = im.width * r, ih = im.height * r; x.drawImage(im, a + (w - iw) / 2, b + (h - ih) / 2, iw, ih); }
  function cardBase(x, W, H, noUrl) {
    x.fillStyle = '#0D0D0D'; x.fillRect(0, 0, W, H);
    var g = x.createRadialGradient(W * .8, 260, 40, W * .8, 260, 900); g.addColorStop(0, 'rgba(229,44,39,.35)'); g.addColorStop(1, 'rgba(229,44,39,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.save(); x.translate(80 + 55, 90 + 55); x.scale(110 / 224, 110 / 224); x.fillStyle = '#E52C27'; var p = new Path2D(Z); x.fill(p); x.rotate(Math.PI); x.fill(p); x.restore();
    x.fillStyle = '#F4F1EA'; x.textAlign = 'left'; x.textBaseline = 'middle'; x.font = '64px Audiowide, Arial Black, sans-serif'; x.fillText('ZENKICKS', 220, 147);
    x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    x.fillStyle = '#CFCABD'; x.font = '600 38px Oxanium, sans-serif'; x.fillText('UAE sneaker drops · market · legit checks', W / 2, noUrl ? H - 100 : H - 140);
    if (!noUrl) { x.fillStyle = '#F4F1EA'; x.font = '700 44px Oxanium, sans-serif'; x.fillText('serelldc.github.io/zenkicks', W / 2, H - 80); } // the invite card already shows its own link under the QR
  }
  function pill(x, text, cx, y, bg, fg, font) { x.font = font; var w = x.measureText(text).width + 70; x.fillStyle = bg; rrect(x, cx - w / 2, y - 52, w, 80, 40); x.fill(); x.fillStyle = fg; x.textAlign = 'center'; x.fillText(text, cx, y); }
  function drawShare(kind, photo, noPhoto) {
    var W = 1080, H = 1920, cv = document.createElement('canvas'); cv.width = W; cv.height = H; var x = cv.getContext('2d');
    cardBase(x, W, H, kind === 'invite');
    if (kind === 'listing') {
      var l = ST.shareListing;
      x.fillStyle = '#fff'; rrect(x, 80, 280, 920, 920, 36); x.fill();
      if (photo && !noPhoto) { x.save(); rrect(x, 80, 280, 920, 920, 36); x.clip(); fitImg(x, photo, 100, 300, 880, 880); x.restore(); }
      pill(x, l.condition, 300, 380, '#0D0D0D', '#F4F1EA', '700 36px Oxanium, sans-serif');
      if (l.legit_checked) pill(x, '✓ Legit-checked', 780, 380, '#0B6E4F', '#fff', '700 36px Oxanium, sans-serif');
      x.fillStyle = '#F4F1EA'; x.font = '62px Audiowide, Arial Black, sans-serif';
      var y = wrapText(x, l.model, W / 2, 1310, 920, 76, 2);
      x.fillStyle = '#CFCABD'; x.font = '600 42px Oxanium, sans-serif'; x.fillText([sizeLabel(l.size_eu), l.city || 'UAE'].filter(Boolean).join('  ·  '), W / 2, y + 30);
      x.fillStyle = '#E52C27'; x.font = '120px Audiowide, Arial Black, sans-serif'; x.fillText(aed(l.price_aed), W / 2, y + 190);
      pill(x, 'Bid on Zenkicks  →', W / 2, 1700, '#E52C27', '#fff', '700 46px Oxanium, sans-serif');
    } else if (kind === 'invite') {
      var who = !ST.inviteMain && ST.me && ST.me.username;
      pill(x, who ? 'INVITED BY @' + who.toUpperCase() : 'UAE SNEAKER TAMBAYAN', W / 2, 360, '#E52C27', '#fff', '700 42px Oxanium, sans-serif');
      x.fillStyle = '#F4F1EA'; x.font = '104px Audiowide, Arial Black, sans-serif'; x.fillText('JOIN THE', W / 2, 520);
      x.fillStyle = '#E52C27'; x.fillText('TAMBAYAN', W / 2, 640);
      x.fillStyle = '#fff'; rrect(x, 200, 720, 680, 680, 44); x.fill();
      if (photo) x.drawImage(photo, 220, 740, 640, 640);
      x.fillStyle = '#F4F1EA'; x.font = '700 50px Oxanium, sans-serif'; x.fillText('Scan to sign up · it’s free', W / 2, 1490);
      var ol = ogLeft(); if (ol) { x.fillStyle = '#F2D27A'; x.font = '700 46px Oxanium, sans-serif'; x.fillText('ONLY ' + ol + ' OG SPOTS LEFT', W / 2, 1600); }
    } else if (kind === 'og') {
      var n = ST.og[uid()], bw = 620, bh = bw * 432 / 380, bx = (W - bw) / 2, by = 300;
      if (photo) { x.save(); x.shadowColor = 'rgba(242,201,76,.35)'; x.shadowBlur = 90; x.drawImage(photo, bx, by, bw, bh); x.restore(); }
      x.fillStyle = '#16100a'; x.font = Math.round(bw * (String(n).length > 2 ? .155 : .195)) + 'px "Russo One", Audiowide, sans-serif'; x.textBaseline = 'middle'; x.fillText('#' + n, W / 2, by + bh * .784); x.textBaseline = 'alphabetic';
      x.fillStyle = '#F2D27A'; x.font = '110px Audiowide, Arial Black, sans-serif'; x.fillText('OG #' + n, W / 2, by + bh + 150);
      x.fillStyle = '#F4F1EA'; x.font = '600 60px Oxanium, sans-serif'; x.fillText('@' + ((ST.me && ST.me.username) || ''), W / 2, by + bh + 240);
      x.fillStyle = '#CFCABD'; x.font = '44px "Instrument Sans", sans-serif'; wrapText(x, 'Founding member of Zenkicks. One of the first 100 sneakerheads in the UAE.', W / 2, by + bh + 330, 860, 58, 2);
      var left = ogLeft(); pill(x, left ? 'Claim yours · ' + left + ' spots left' : 'Join Zenkicks', W / 2, 1700, '#E52C27', '#fff', '700 46px Oxanium, sans-serif');
    } else {
      var c = ST.shareCheck, legit = c.verdict === 'legit';
      x.fillStyle = '#fff'; rrect(x, 80, 280, 920, 920, 36); x.fill();
      if (photo && !noPhoto) { x.save(); rrect(x, 80, 280, 920, 920, 36); x.clip(); fitImg(x, photo, 80, 280, 920, 920); x.restore(); }
      x.save(); x.translate(W / 2, 740); x.rotate(-0.18); x.strokeStyle = legit ? '#0B6E4F' : '#C8211F'; x.fillStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 16;
      rrect(x, -330, -110, 660, 220, 26); x.fill(); x.stroke(); x.fillStyle = legit ? '#0B6E4F' : '#C8211F'; x.font = '150px Audiowide, Arial Black, sans-serif'; x.textBaseline = 'middle'; x.fillText(legit ? 'LEGIT ✓' : 'FAKE ✕', 0, 8); x.restore(); x.textBaseline = 'alphabetic';
      x.fillStyle = '#F4F1EA'; x.font = '62px Audiowide, Arial Black, sans-serif'; var y2 = wrapText(x, c.model, W / 2, 1310, 920, 76, 2);
      x.fillStyle = '#CFCABD'; x.font = '44px "Instrument Sans", sans-serif'; wrapText(x, 'Checked by the Zenkicks community and a verified checker.', W / 2, y2 + 40, 880, 58, 2);
      pill(x, 'Post your legit check  →', W / 2, 1700, '#E52C27', '#fff', '700 46px Oxanium, sans-serif');
    }
    return cv;
  }
  function openShare(kind) {
    var src = kind === 'listing' ? (ST.shareListing && firstPhoto(ST.shareListing)) : kind === 'og' ? 'img/og-badge.webp?v=2' : (ST.shareCheck && checkPhotos(ST.shareCheck)[0]);
    openModal('<div class="peek-top"><b>Share to your Story</b><button class="round" data-act="mclose" aria-label="Close">✕</button></div><div class="sharewrap"><div class="skeleton" style="height:100%"></div></div>');
    var fonts = ['64px Audiowide', '600 40px Oxanium', '700 40px Oxanium', '40px "Instrument Sans"', '100px "Russo One"'].map(function (f) { return document.fonts && document.fonts.load ? document.fonts.load(f).catch(function () {}) : null; });
    var srcP = kind === 'invite' ? qrCanvas(inviteLink(ST.inviteMain), 12).catch(function () { return null; }) : loadImg(src);
    Promise.all([srcP].concat(fonts)).then(function (r) {
      var cv = drawShare(kind, r[0]);
      var done = function (blob) {
        if (!blob) return toast('Couldn’t make the image. Try again.');
        var fname = 'zenkicks-' + (kind === 'invite' && ST.inviteMain ? 'signup' : kind) + '.png', file = new File([blob], fname, { type: 'image/png' }); ST.shareFile = file;
        var url = URL.createObjectURL(blob), canShare = navigator.canShare && navigator.canShare({ files: [file] });
        var w = app.querySelector('.sharewrap'); if (!w) return;
        w.innerHTML = '<img src="' + url + '" alt="Share image preview">';
        w.insertAdjacentHTML('afterend', '<div class="row" style="gap:8px">' + (canShare ? '<button class="btn red" style="flex:1" data-act="sharego">' + I.share + ' Share</button>' : '') + '<a class="btn ' + (canShare ? 'ghost' : 'red') + '" style="flex:1' + (canShare ? ';color:var(--ink)' : '') + '" href="' + url + '" download="' + fname + '">Save image</a></div><p class="tiny center" style="margin:0">Post it on your IG or WhatsApp Story. ' + (canShare ? '' : 'Save it, then add it from your gallery.') + '</p>');
      };
      try { cv.toBlob(done, 'image/png'); } catch (e) { drawShare(kind, r[0], true).toBlob(done, 'image/png'); }
    });
  }

  VIEWS.market = function () {
    var chips = [['all', 'All'], ['new', 'New / DS'], ['used', 'Pre-owned'], ['checked', 'Legit-checked']].map(function (c) {
      return '<button class="chip' + (ST.marketFilter === c[0] ? ' on' : '') + '" aria-pressed="' + (ST.marketFilter === c[0]) + '" data-act="mfilter" data-v="' + c[0] + '">' + c[1] + '</button>';
    }).join('');
    var ms = mySize();
    chips += ms ? '<button class="chip sizechip' + (ST.sizeOnly ? ' on' : '') + '" aria-pressed="' + ST.sizeOnly + '" data-act="msize">' + (ST.sizeOnly ? '✓ ' : '') + 'My size · ' + esc(sizeLabel(ms)) + '</button>' : '<button class="chip sizechip" data-act="setsize">＋ My size</button>';
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
    if (ST.sizeOnly && mySize()) q = q.eq('size_eu', mySize());
    var term = cleanQ(ST.marketQ);
    if (term) q = q.or('model.ilike.%' + term + '%,brand.ilike.%' + term + '%,city.ilike.%' + term + '%');
    return q.then(function (r) {
      if (r.error) throw r.error;
      var ls = r.data || [];
      if (!ls.length) return '<div class="empty">' + I.bag + '<b>' + (term || ST.marketFilter !== 'all' || ST.sizeOnly ? 'No pairs match' : 'No pairs listed yet') + '</b><span>' + (term ? 'Try another model or clear the filter.' : 'List yours and it shows up here.') + '</span><button class="btn red" data-go="sell">Sell a pair</button></div>';
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
        me ? sb.from('bids').select('id,amount_aed,status,created_at,bidder_id,bidder:profiles!bids_bidder_id_fkey(username,verified_level)').eq('listing_id', l.id).order('amount_aed', { ascending: false }) : Promise.resolve({ data: [] }),
        vouchMap([l.seller_id])];
      return Promise.all(jobs).then(function (a) {
        var s = a[0][l.id] || {}; var watching = (a[1].data || []).length > 0; var bids = a[2].data || []; var sv = a[3][l.seller_id];
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
                (b.status === 'accepted' ? '<span class="row" style="gap:6px"><button class="btn dark" style="height:40px;padding:0 12px;font-size:13px" data-act="contact" data-id="' + b.id + '">Contact</button><button class="btn ghost" style="height:40px;padding:0 12px;font-size:13px" data-act="vouch" data-target="' + b.bidder_id + '" data-user="' + esc(b.bidder && b.bidder.username) + '" data-ref="' + l.id + '" data-kind="deal">★ Rate</button></span>'
                  : '<span class="row" style="gap:6px"><button class="btn red" style="height:40px;padding:0 12px;font-size:13px" data-act="accept" data-id="' + b.id + '">Accept</button><button class="btn ghost" style="height:40px;padding:0 12px;font-size:13px" data-act="decline" data-id="' + b.id + '">Decline</button></span>') + '</div>';
            }).join('') : '<span class="sub">No bids yet. Share your listing to get more eyes on it.</span>') +
            '<div class="row" style="gap:8px"><button class="btn dark" style="flex:1" data-act="sold" data-id="' + l.id + '">Mark as sold</button><button class="btn ghost" style="flex:1" data-act="remove" data-id="' + l.id + '">Remove</button></div></div>';
        }
        var myBidPanel = '';
        if (myBid) {
          myBidPanel = '<div class="note" role="status" style="background:' + (myBid.status === 'accepted' ? 'var(--green);color:#fff' : 'var(--mint)') + '"><span style="width:18px">' + I.check + '</span><span>' +
            (myBid.status === 'accepted' ? '<b>The seller accepted your bid of ' + aed(myBid.amount_aed) + '.</b> Contact them to agree on payment and meet-up or delivery. <button class="link" style="color:#fff;text-decoration:underline" data-act="contact" data-id="' + myBid.id + '">Show seller contact</button> · <button class="link" style="color:#fff;text-decoration:underline" data-act="vouch" data-target="' + l.seller_id + '" data-user="' + esc(l.seller && l.seller.username) + '" data-ref="' + l.id + '" data-kind="deal">Rate the seller</button>'
              : myBid.status === 'declined' ? '<b>Your bid of ' + aed(myBid.amount_aed) + ' was declined.</b> You can place a new one.'
                : '<b>Your bid: ' + aed(myBid.amount_aed) + '.</b> Waiting for the seller. <button class="link" style="padding:0" data-act="withdraw" data-id="' + myBid.id + '">Withdraw</button>') + '</span></div>';
        }
        ST.shareListing = l;
        var html = gal + '<div class="pad">' +
          '<div class="sec" style="gap:8px"><div class="chips-wrap">' + verifiedPill(l.seller && l.seller.verified_level) + (l.legit_checked ? '<span class="pill dark">Legit-checked</span>' : '') + '</div>' +
          '<h1 style="font-size:24px">' + esc(l.model) + '</h1><div class="sub">' + (l.size_eu ? sizeLabel(l.size_eu) + ' · ' : '') + esc(l.condition) + ' · ' + esc(l.city || 'UAE') + '</div>' +
          '<div class="row" style="align-items:baseline;gap:8px"><span class="m">Asking</span><span class="money" style="font-size:26px">' + aed(l.price_aed) + '</span><button class="chip" style="margin-left:auto;height:36px" data-act="share" data-k="listing">' + I.share + ' Share</button></div></div>' +
          '<div class="card between" style="padding:14px;align-items:center"><div><div class="m">Highest bid</div><div class="money" style="font-size:19px">' + (s.high_bid ? aed(s.high_bid) : '—') + '</div></div><span class="m">' + (s.bid_count || 0) + ' bids · ' + (s.watchers || 0) + ' watching</span></div>' +
          myBidPanel + ownerPanel +
          (l.description ? '<div class="card" style="padding:14px;display:flex;flex-direction:column;gap:6px"><b>Seller’s note</b><p class="sub" style="font-size:14px;white-space:pre-line">' + esc(l.description) + '</p></div>' : '') +
          '<div class="card row" style="padding:12px 14px"><button class="avatar" style="border:0" data-go="u/' + l.seller_id + '" aria-label="Seller profile">' + esc(((l.seller && l.seller.username) || '?')[0].toUpperCase()) + '</button><div class="grow"><div class="t">' + userLink(l.seller_id, l.seller && l.seller.username) + ' ' + starBadge(sv) + '</div><div class="m">Listed ' + ago(l.created_at) + ' ago · tap name for vouches</div></div>' +
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
    if (isBlocked()) return blockedNote('sell pairs');
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
      var f = S.f; if (!f.size && mySize()) f.size = String(mySize());
      body = '<h1>Pair details</h1>' +
        '<label class="field" for="s-model">Model<input id="s-model" data-sf="model" type="text" maxlength="80" placeholder="e.g. Jordan 1 Retro High OG" value="' + esc(f.model) + '"></label>' +
        '<div class="two"><label class="field" for="s-brand">Brand<select id="s-brand" data-sf="brand">' + ['', 'Nike', 'Jordan', 'adidas', 'New Balance', 'ASICS', 'Puma', 'Converse', 'Vans', 'Other'].map(function (o) { return '<option value="' + o + '"' + (f.brand === o ? ' selected' : '') + '>' + (o || 'Select') + '</option>'; }).join('') + '</select></label>' +
        '<label class="field" for="s-size">Size (US · EU)<select id="s-size" data-sf="size">' + sizeOptions(f.size, 'Select size') + '</select></label></div>' +
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
        return '<div class="pad">' + head + '<div class="feed">' + cs.map(function (c, i) { return checkCard(c, st[c.id] || {}) + (i === 1 ? adSlot() : ''); }).join('') + '</div></div>';
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
    if (isBlocked()) return blockedNote('post legit checks');
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
      return vouchMap([c.author_id].concat(comments.map(function (m) { return m.author_id; }))).then(function (vm) {
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
          '<div class="grow" style="display:flex;flex-direction:column;gap:4px"><div style="font-size:13px"><b>' + userLink(m.author_id, au.username) + '</b>' + badge + ' ' + starBadge(vm[m.author_id]) + ' <span class="m">· ' + ago(m.created_at) + '</span></div>' +
          '<div style="font-size:14px;line-height:1.45;white-space:pre-line' + (au.is_checker ? ';padding:8px 10px;border-radius:10px;background:var(--mint)' : '') + '">' + esc(m.body) + '</div>' +
          '<div class="row" style="gap:2px"><button class="link" style="color:' + (liked ? 'var(--red)' : 'var(--muted)') + ';padding:6px 8px 6px 0;font-size:12px;display:inline-flex;align-items:center;gap:4px" data-act="like" data-id="' + m.id + '" data-on="' + liked + '" aria-pressed="' + liked + '"><span style="width:14px;height:14px;display:inline-flex">' + (liked ? I.heartOn : I.heart) + '</span>' + (likes[m.id] || 0) + '</button>' +
          '<button class="link" style="color:var(--muted);padding:6px 8px;font-size:12px" data-act="reply" data-id="' + (m.parent_id || m.id) + '" data-user="' + esc(au.username) + '">Reply</button>' +
          (me && c.author_id === me && m.author_id !== me ? '<button class="link" style="color:var(--red);padding:6px 8px;font-size:12px;font-weight:700" data-act="vouch" data-target="' + m.author_id + '" data-user="' + esc(au.username) + '" data-ref="' + c.id + '" data-kind="legit">★ Vouch</button>' : '') +
          (m.author_id === me || isStaff() ? '<button class="link" style="color:var(--muted);padding:6px 8px;font-size:12px" data-act="delcomment" data-id="' + m.id + '">Delete</button>' : '<button class="link" style="color:var(--muted);padding:6px 8px;font-size:12px" data-act="report" data-type="comment" data-id="' + m.id + '">Report</button>') + '</div></div></div>';
      }
      var thread = tops.map(function (m) { return cItem(m, false) + comments.filter(function (x) { return x.parent_id === m.id; }).map(function (x) { return cItem(x, true); }).join(''); }).join('<div style="height:1px;background:#EFEBE2"></div>');
      ST.shareCheck = c;
      var verdictForm = (!c.verdict && isStaff()) ? '<div class="card" style="padding:14px;display:flex;flex-direction:column;gap:8px"><b>Checker verdict</b><textarea id="vnote" maxlength="400" placeholder="Why? (shown to everyone)" style="padding:10px;border:1px solid var(--line);border-radius:10px;min-height:70px"></textarea><div class="row"><button class="btn" style="flex:1;background:var(--green);color:#fff" data-act="verdict" data-id="' + c.id + '" data-v="legit">Legit</button><button class="btn red" style="flex:1" data-act="verdict" data-id="' + c.id + '" data-v="fake">Fake</button></div></div>' : '';
      var html = '<div class="pad">' +
        '<div class="row"><div class="avatar">' + esc(((c.author && c.author.username) || '?')[0].toUpperCase()) + '</div><div class="grow"><div class="t">' + userLink(c.author_id, c.author && c.author.username) + ' ' + starBadge(vm[c.author_id]) + '</div><div class="m">' + ago(c.created_at) + ' ago</div></div>' + statusPill(c) + '</div>' +
        '<div class="scroller" style="gap:8px">' + ps.map(function (u) { return '<a href="' + esc(u) + '" target="_blank" rel="noopener" style="width:200px;flex-shrink:0"><img src="' + esc(u) + '" alt="" style="width:200px;height:170px;object-fit:cover;border-radius:12px;background:#fff"></a>'; }).join('') + '</div>' +
        '<div class="sec" style="gap:6px"><h1 style="font-size:22px">' + esc(c.model) + '</h1>' + (c.question ? '<p style="margin:0;font-size:15px;line-height:1.5;white-space:pre-line">' + esc(c.question) + '</p>' : '') +
        '<div class="chips-wrap">' + (c.size ? '<span class="proof" style="background:#fff;border:1px solid var(--line)">' + esc(c.size) + '</span>' : '') + (c.price_aed ? '<span class="proof" style="background:#fff;border:1px solid var(--line)">Offered at ' + aed(c.price_aed) + '</span>' : '') + (c.found_where ? '<span class="proof" style="background:#fff;border:1px solid var(--line)">' + esc(c.found_where) + '</span>' : '') + '</div></div>' +
        (c.verdict ? '<div class="checker" style="background:' + (c.verdict === 'legit' ? 'var(--mint)' : '#F6DAD6') + '"><b style="color:' + (c.verdict === 'legit' ? 'var(--green)' : 'var(--red)') + '">Verdict: ' + c.verdict.toUpperCase() + '.</b> ' + esc(c.verdict_note || '') + '<br><button class="btn sharebtn light" data-act="share" data-k="check">' + I.share + ' Share verdict to Story</button></div>' : '') +
        '<div class="card" style="padding:14px;display:flex;flex-direction:column;gap:10px"><b>' + (c.verdict ? 'Community vote' : 'Your vote') + '</b>' + (!c.verdict ? (me ? voteBtns : '<button class="btn dark" data-go="login">Sign in to vote</button>') : '') + ((myVote || c.verdict) ? bars : '<span class="m">Vote to see how the community voted.</span>') + '</div>' +
        verdictForm +
        '<section class="sec"><h2>Comments <span class="m" style="font-family:var(--body)">(' + comments.length + ')</span></h2>' + (thread ? '<div class="card" style="padding:14px;display:flex;flex-direction:column;gap:12px">' + thread + '</div>' : '<p class="sub">No comments yet. Start the conversation.</p>') +
        '<p class="m" style="margin:0">Be respectful. Call out the pair, not the person.' + (me && c.author_id === me ? ' Tap <b>★ Vouch</b> on a comment to thank someone who helped.' : '') + '</p></section>' +
        (c.author_id !== me ? '<button class="link" style="align-self:flex-start;color:var(--muted)" data-act="report" data-type="check" data-id="' + c.id + '">Report this post</button>' : '') + '</div>';
      var bottom = me
        ? '<div style="flex-shrink:0;display:flex;flex-direction:column;gap:6px;padding:10px 12px calc(16px + env(safe-area-inset-bottom,0px));background:var(--ink);border-top:1px solid var(--ink3)">' +
          (ST.replyTo ? '<div class="row" style="justify-content:space-between;font-size:12px;color:var(--sand);padding:0 4px"><span>Replying to @' + esc(ST.replyTo.user) + '</span><button class="link" style="color:var(--coral);padding:4px 0;font-size:12px" data-act="noreply">Cancel</button></div>' : '') +
          '<div class="row" style="gap:8px"><label class="bidfield" for="cmt" style="font-family:var(--body);font-weight:400"><input id="cmt" type="text" maxlength="1000" placeholder="' + (ST.replyTo ? 'Write a reply…' : 'Add a comment…') + '" autocomplete="off"></label><button class="btn red" style="height:52px;padding:0 18px" data-act="send" data-id="' + c.id + '">Send</button></div></div>'
        : '<div class="actionbar"><button class="btn red" style="flex:1;height:52px" data-go="login">Sign in to comment</button></div>';
      return { html: html, bottom: bottom };
      });
    });
  };

  // ------------------------------------------------------------------
  // MEMBER PROFILE (public): rating + vouches
  // ------------------------------------------------------------------
  VIEWS.u = function (r) {
    if (!sb) return needSb();
    return Promise.all([
      sb.from('profiles').select('id,username,city,verified_level,is_checker,is_admin,is_owner,is_banned,banned_until,created_at').eq('id', r.id).maybeSingle(),
      vouchMap([r.id]),
      sb.from('vouches').select('id,kind,stars,note,created_at,from_id,from:profiles!vouches_from_id_fkey(username)').eq('to_id', r.id).order('created_at', { ascending: false }).limit(50),
      sb.from('listings').select(LISTING_COLS).eq('seller_id', r.id).eq('status', 'active').order('created_at', { ascending: false }).limit(6)
    ]).then(function (a) {
      var p = a[0].data; if (!p) return '<div class="empty">' + I.user + '<b>Member not found</b><button class="btn dark" data-go="market">Back</button></div>';
      var v = a[1][p.id] || {}; var vs = a[2].data || []; var ls = a[3].data || [];
      var bars = [5, 4, 3, 2, 1].map(function (n) { var k = vs.filter(function (x) { return x.stars === n; }).length; var w = vs.length ? Math.round(k * 100 / vs.length) : 0; return '<div class="bar"><span style="width:28px">' + n + '★</span><div class="track"><div class="fill" style="width:' + w + '%;background:var(--red)"></div></div><span style="width:24px;text-align:right">' + k + '</span></div>'; }).join('');
      return '<div class="pad"><div class="row"><div class="avatar" style="width:56px;height:56px;font-size:22px;background:var(--red)">' + esc((p.username || '?')[0].toUpperCase()) + '</div><div class="grow"><h1 style="font-size:22px">@' + esc(p.username) + '</h1>' + (p.is_owner || (ST.owners && ST.owners[p.id]) ? '<span class="pill founder" style="align-self:flex-start">★ Founder of Zenkicks</span>' : '') +
        '<div class="row" style="gap:6px;flex-wrap:wrap;margin-top:4px">' + (ST.og && ST.og[p.id] ? ogPill(ST.og[p.id]) : '') + trustedPill(v) +
        (p.is_banned ? '<span class="pill red">Banned</span>' : suspendedUntil(p) ? '<span class="pill red">On hold</span>' : '') + '</div><div class="m">' + esc(p.city || 'UAE') + ' · member since ' + new Date(p.created_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) + '</div></div>' + verifiedPill(p.verified_level) + '</div>' +
        (ST.og && ST.og[p.id] ? '<div class="card ogshow">' + ogBadge(ST.og[p.id]) + '<div><b>OG #' + ST.og[p.id] + '</b><br><span class="m">Founding member: one of the first 100 people to join Zenkicks.</span>' + (p.id === uid() ? '<br><button class="btn sharebtn" data-act="share" data-k="og">' + I.share + ' Share to Story</button>' : '') + '</div></div>' : '') +
        '<div class="card" style="padding:14px;display:flex;flex-direction:column;gap:10px"><div class="between"><div><div class="money" style="font-size:30px">' + (v.total ? '★ ' + Number(v.avg_stars).toFixed(1) : '—') + '</div><div class="m">' + (v.total || 0) + ' vouches · ' + (v.deals || 0) + ' from deals · ' + (v.legit || 0) + ' from legit checks</div></div>' + ((p.is_checker || p.is_admin) ? '<span class="pill ok">✓ Checker</span>' : '') + '</div>' + (v.total ? bars : '<span class="sub">No vouches yet. Members vouch after a deal or when someone helps on a legit check.</span>') + '</div>' +
        (vs.length ? '<section class="sec"><h2>Vouches</h2><div class="card" style="padding:4px 14px">' + vs.map(function (x) { return '<div class="kv" style="flex-direction:column;align-items:flex-start;gap:2px"><span><b style="color:var(--red)">' + '★★★★★'.slice(0, x.stars) + '</b><span style="opacity:.25">' + '★★★★★'.slice(x.stars) + '</span> <span class="m">· ' + (x.kind === 'deal' ? 'Deal' : 'Legit check') + ' · ' + ago(x.created_at) + ' ago</span></span>' + (x.note ? '<span style="font-size:14px">' + esc(x.note) + '</span>' : '') + '<span class="m">from ' + userLink(x.from_id, x.from && x.from.username) + '</span></div>'; }).join('') + '</div></section>' : '') +
        (ls.length ? '<section class="sec"><h2>Pairs for sale</h2><div class="grid">' + ls.map(function (l) { return itemCard(l, {}); }).join('') + '</div></section>' : '') +
        (uid() && uid() !== p.id ? '<button class="link" style="align-self:flex-start;color:var(--muted)" data-act="report" data-type="user" data-id="' + p.id + '">Report this member</button>' : '') + '</div>';
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
      isStaff() ? sb.from('reports').select('id,target_type,target_id,reason,created_at,resolved').eq('resolved', false).order('created_at', { ascending: false }).limit(30) : Promise.resolve({ data: null }),
      vouchMap([uid()]),
      pushState(),
      sb.rpc('my_invites').then(function (r) { return r.data || 0; }, function () { return 0; })
    ]).then(function (a) {
      ST.myVouch = a[3][uid()]; var pst = a[4], invN = a[5];
      var ls = a[0].data || []; var bs = a[1].data || []; var reps = a[2].data;
      var cities = ['', 'Dubai', 'Sharjah', 'Abu Dhabi', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain', 'Al Ain'];
      return '<div class="pad"><div class="row"><div class="avatar" style="width:56px;height:56px;font-size:22px;background:var(--red)">' + esc((me.username || '?')[0].toUpperCase()) + '</div><div class="grow"><h1 style="font-size:22px">@' + esc(me.username) + '</h1><div class="m">' + esc(ST.session.user.email || ST.session.user.phone || '') + '</div></div>' + verifiedPill(me.verified_level) + '</div>' +
        (isBlocked() ? '<div class="card notice suspend" style="padding:14px"><b>' + (me.is_banned ? 'Your account is banned' : 'Your account is on hold until ' + esc(fmtDay(suspendedUntil()))) + '</b><br><span class="m">You can browse, but you can’t sell, bid or post for now.</span></div>' : '') +
        (ST.og && ST.og[uid()] ? '<div class="card ogshow">' + ogBadge(ST.og[uid()]) + '<div><b>OG #' + ST.og[uid()] + '</b><br><span class="m">You’re one of the first 100 members of Zenkicks. This badge stays on your profile forever.</span><br><button class="btn sharebtn" data-act="share" data-k="og">' + I.share + ' Share to Story</button></div></div>' : '') +
        '<button class="card between" style="padding:14px;width:100%;text-align:left;align-items:center" data-go="grails"><span><b>⭐ My grails</b><br><span class="m">Pairs you’re hunting. We alert you when one gets listed.</span></span>' + (grailNew().length ? '<span class="pill red">' + grailNew().length + ' new</span>' : '<span aria-hidden="true" style="font-size:20px">›</span>') + '</button>' +
        pushCard(pst) + inviteCard(invN) + installLink() +
        '<button class="card between" style="padding:14px;width:100%;text-align:left;align-items:center" data-go="u/' + uid() + '"><span><b>My vouches</b><br><span class="m">See your public profile and ratings</span></span>' + starBadge(ST.myVouch) + '</button>' +
        '<div class="card" style="padding:14px;display:flex;flex-direction:column;gap:10px"><b>Profile</b>' +
        '<label class="field" for="p-user">Username<input id="p-user" type="text" maxlength="24" value="' + esc(me.username) + '" autocomplete="username"></label>' +
        '<label class="field" for="p-city">Emirate<select id="p-city">' + cities.map(function (o) { return '<option value="' + o + '"' + (me.city === o ? ' selected' : '') + '>' + (o || 'Select') + '</option>'; }).join('') + '</select></label>' +
        '<label class="field" for="p-size">My sneaker size<select id="p-size">' + sizeOptions(mySize(), 'Not set') + '</select></label>' +
        '<label class="field" for="p-wa">WhatsApp (private)<input id="p-wa" type="tel" placeholder="+971 50 123 4567" value="' + esc(ST.contact && ST.contact.whatsapp || '') + '"></label>' +
        '<p class="err" id="p-err" role="alert"></p><button class="btn dark" data-act="saveprofile">Save</button></div>' +
        '<section class="sec"><h2>My listings</h2>' + (ls.length ? '<div class="card" style="padding:4px 14px">' + ls.map(function (l) { return '<button class="kv" style="width:100%;background:none;border-left:0;border-right:0;border-top:0;text-align:left" data-go="l/' + l.id + '"><span>' + esc(l.model) + '</span><span class="m">' + aed(l.price_aed) + ' · ' + l.status + '</span></button>'; }).join('') + '</div>' : '<p class="sub">Nothing listed yet.</p>') + '</section>' +
        '<section class="sec"><h2>My bids</h2>' + (bs.length ? '<div class="card" style="padding:4px 14px">' + bs.map(function (b) { return '<button class="kv" style="width:100%;background:none;border-left:0;border-right:0;border-top:0;text-align:left" data-go="l/' + (b.listing && b.listing.id) + '"><span>' + esc(b.listing && b.listing.model) + '</span><span class="m">' + aed(b.amount_aed) + ' · ' + b.status + '</span></button>'; }).join('') + '</div>' : '<p class="sub">No bids yet.</p>') + '</section>' +
        (reps ? '<section class="sec"><h2>Open reports</h2>' + (reps.length ? '<div class="card" style="padding:4px 14px">' + reps.map(function (x) { return '<div class="kv" style="align-items:center"><span><b>' + x.target_type + '</b> · ' + esc(x.reason) + '<br><span class="tiny">' + x.target_id + '</span></span><button class="btn ghost" style="height:36px;padding:0 10px;font-size:12px" data-act="resolve" data-id="' + x.id + '">Resolve</button></div>'; }).join('') + '</div>' : '<p class="sub">No open reports.</p>') + '</section>' : '') +
        (isAdmin() ? '<button class="btn dark full" data-go="admin">' + (isOwner() ? '★ Owner panel' : 'Admin panel') + '</button>' : '') +
        '<button class="btn ghost full" data-act="signout">Sign out</button>' +
        '<p class="tiny center"><a href="terms.html" style="text-decoration:underline">Terms</a> · <a href="privacy.html" style="text-decoration:underline">Privacy</a>' + (C.CONTACT_EMAIL ? ' · ' + esc(C.CONTACT_EMAIL) : '') + '</p></div>';
    });
  };

  // ------------------------------------------------------------------
  // OWNER / ADMIN PANEL
  // ------------------------------------------------------------------
  VIEWS.admin = function () {
    if (!sb) return needSb();
    if (!uid()) return needLogin('open the admin panel');
    if (!isAdmin()) return '<div class="empty">' + I.shield + '<b>Admins only</b><button class="btn dark" data-go="drops">Back</button></div>';
    var q = ST.adminQ || '';
    return Promise.all([
      sb.rpc('admin_stats'),
      sb.rpc('admin_find_users', { q: q }),
      sb.from('reports').select('id,target_type,target_id,reason,created_at,reporter:profiles!reports_reporter_id_fkey(username)').eq('resolved', false).order('created_at', { ascending: false }).limit(30),
      sb.from('listings').select('id,model,price_aed,status,created_at,seller_id,seller:profiles!listings_seller_id_fkey(username)').order('created_at', { ascending: false }).limit(15),
      sb.from('checks').select('id,model,created_at,author_id,verdict,author:profiles!checks_author_id_fkey(username)').order('created_at', { ascending: false }).limit(10),
      isOwner() ? sb.rpc('invite_stats') : Promise.resolve({ data: [] }),
      loadOwners() // fresh OG numbers, so someone who just joined shows their badge here right away
    ]).then(function (a) {
      var invs = (a[5] && a[5].data) || [];
      if (a[0].error) throw a[0].error;
      var st = (a[0].data || [])[0] || {}; var users = a[1].data || []; var reps = a[2].data || []; var ls = a[3].data || []; var cs = a[4].data || [];
      function tile(n, label) { return '<div class="card" style="padding:12px;display:flex;flex-direction:column;gap:2px"><span class="money" style="font-size:22px">' + (n || 0) + '</span><span class="m">' + label + '</span></div>'; }
      function roleBtn(u, role, on, label) { return '<button class="chip' + (on ? ' on' : '') + '" data-act="arole" data-id="' + u.id + '" data-v="' + role + '" data-on="' + on + '" aria-pressed="' + on + '">' + (on ? '✓ ' : '') + label + '</button>'; }
      ST.pendingList = users.filter(function (u) { return u.confirmed === false && u.email; }).map(function (u) { return { id: u.id, email: u.email }; });
      var userRows = users.map(function (u) {
        var tags = (u.is_owner ? '<span class="pill founder">★ Founder</span>' : '') + (u.is_admin && !u.is_owner ? '<span class="pill dark">Admin</span>' : '') + (u.is_checker ? '<span class="pill ok">Checker</span>' : '') + (u.is_banned ? '<span class="pill red">Banned</span>' : '') +
          (!u.is_banned && u.banned_until ? '<span class="pill red">On hold until ' + esc(fmtDay(new Date(u.banned_until))) + '</span>' : '') + (u.confirmed === false ? '<span class="pill sample" title="Never finished signing in (email not confirmed)">Not confirmed' + (remindedAgo(u.id) !== null ? ' · reminded ' + (remindedAgo(u.id) < 60e3 ? 'just now' : ago(new Date(Date.now() - remindedAgo(u.id)).toISOString()) + ' ago') : '') + '</span>' : '') + (u.warns ? '<span class="pill sample">' + u.warns + ' warning' + (u.warns > 1 ? 's' : '') + '</span>' : '') + (ST.og && ST.og[u.id] ? ogPill(ST.og[u.id]) : '');
        var controls = u.is_owner ? '<span class="m">Owner. Cannot be changed.</span>' :
          (u.confirmed === false && u.email ? '<button class="chip" style="color:#9a5b00;border-color:#d8a24a" data-act="aremind" data-id="' + u.id + '" data-v="' + esc(u.email) + '">' + (remindedAgo(u.id) !== null ? 'Remind again' : 'Send reminder') + '</button>' : '') +
          (isOwner() ? roleBtn(u, 'admin', u.is_admin, 'Admin') : '') + roleBtn(u, 'checker', u.is_checker, 'Checker') +
          (u.id === uid() ? '' : (u.is_banned ? '' : '<button class="chip" data-act="awarn" data-id="' + u.id + '" data-user="' + esc(u.username) + '">Warn</button>' +
            (u.banned_until ? '<button class="chip" data-act="alift" data-id="' + u.id + '">Lift hold</button>' : '<button class="chip" style="color:#9a5b00;border-color:#d8a24a" data-act="asusp" data-id="' + u.id + '" data-user="' + esc(u.username) + '">Suspend</button>')) +
          '<button class="chip" style="' + (u.is_banned ? '' : 'color:var(--red);border-color:var(--red)') + '" data-act="aban" data-id="' + u.id + '" data-user="' + esc(u.username) + '" data-on="' + u.is_banned + '">' + (u.is_banned ? 'Unban' : 'Ban') + '</button>');
        return '<div class="kv" style="flex-direction:column;align-items:flex-start;gap:6px"><div class="row" style="gap:6px;flex-wrap:wrap">' + userLink(u.id, u.username).replace(founderPill(u.id), '') + ' ' + tags + '</div>' +
          '<span class="m">' + (u.email ? esc(u.email) + ' · ' : '') + esc(u.city || 'UAE') + ' · joined ' + ago(u.created_at) + ' ago</span><div class="chips-wrap">' + controls + '</div></div>';
      }).join('') || '<p class="sub">No members found.</p>';
      var repRows = reps.map(function (x) {
        var go = x.target_type === 'listing' ? 'l/' + x.target_id : x.target_type === 'check' ? 'c/' + x.target_id : x.target_type === 'user' ? 'u/' + x.target_id : '';
        return '<div class="kv" style="align-items:center"><span><b>' + esc(x.target_type) + '</b> · ' + esc(x.reason) + '<br><span class="m">by @' + esc(x.reporter && x.reporter.username) + ' · ' + ago(x.created_at) + ' ago</span></span><span class="row" style="gap:6px">' + (go ? '<button class="btn ghost" style="height:36px;padding:0 10px;font-size:12px" data-go="' + go + '">View</button>' : '') + '<button class="btn dark" style="height:36px;padding:0 10px;font-size:12px" data-act="resolve" data-id="' + x.id + '">Done</button></span></div>';
      }).join('') || '<p class="sub" style="padding:8px 0">No open reports. 🎉</p>';
      var lRows = ls.map(function (l) { return '<div class="kv" style="align-items:center"><button class="link" style="text-align:left;padding:0;color:inherit" data-go="l/' + l.id + '"><b>' + esc(l.model) + '</b><br><span class="m">' + aed(l.price_aed) + ' · @' + esc(l.seller && l.seller.username) + ' · ' + esc(l.status) + '</span></button>' + (l.status !== 'removed' ? '<button class="btn ghost" style="height:36px;padding:0 10px;font-size:12px;color:var(--red)" data-act="aremove" data-id="' + l.id + '">Remove</button>' : '<span class="m">removed</span>') + '</div>'; }).join('') || '<p class="sub">No listings yet.</p>';
      var cRows = cs.map(function (c) { return '<div class="kv" style="align-items:center"><button class="link" style="text-align:left;padding:0;color:inherit" data-go="c/' + c.id + '"><b>' + esc(c.model) + '</b><br><span class="m">@' + esc(c.author && c.author.username) + ' · ' + (c.verdict ? c.verdict.toUpperCase() : 'open') + ' · ' + ago(c.created_at) + ' ago</span></button><button class="btn ghost" style="height:36px;padding:0 10px;font-size:12px;color:var(--red)" data-act="adelcheck" data-id="' + c.id + '">Delete</button></div>'; }).join('') || '<p class="sub">No legit checks yet.</p>';
      return '<div class="pad"><div class="sec" style="gap:4px"><h1>' + (isOwner() ? 'Owner panel' : 'Admin panel') + '</h1><p class="sub">' + (isOwner() ? 'You’re the founder. You appoint admins and checkers, and nobody can change your role.' : 'Handle reports, checkers and bans.') + '</p></div>' +
        '<div class="grid" style="grid-template-columns:repeat(3,1fr)">' + tile(st.members, 'Members' + (st.pending ? '<br><span style="color:#9a5b00">+ ' + st.pending + ' pending</span>' : '')) + tile(st.new_7d, 'New this week') + tile(st.active_listings, 'Pairs for sale') + tile(st.sold, 'Sold') + tile(st.checks, 'Legit checks') + tile(st.open_reports, 'Open reports') + '</div>' +
        '<section class="sec"><h2>Reports</h2><div class="card" style="padding:4px 14px">' + repRows + '</div></section>' +
        (invs.length ? '<section class="sec"><h2>Top inviters</h2><div class="card" style="padding:4px 14px">' + invs.map(function (r, k) { return '<div class="kv"><span>' + (k + 1) + '. ' + userLink(r.user_id, r.username) + '</span><span class="pv">' + r.invited + ' joined</span></div>'; }).join('') + '</div></section>' : '') +
        '<section class="sec"><h2>Members</h2><label class="search" for="aq">' + I.search + '<input id="aq" type="search" placeholder="Search username' + (isOwner() ? ' or email' : '') + '" value="' + esc(q) + '" autocomplete="off"></label>' + (ST.pendingList.length ? '<div class="card pendbox"><div><b>' + ST.pendingList.length + ' never finished signing up</b><br><span class="m">They asked for a code but never typed it. A reminder re-sends their sign-up email with a fresh code. One per day each.</span></div><button class="btn red" style="height:40px;padding:0 16px;font-size:13px" data-act="aremindall">Remind all ' + ST.pendingList.length + '</button></div>' : '') +
        '<div class="card" style="padding:4px 14px">' + userRows + '</div>' +
        '<p class="m" style="margin:0">Be fair: <b>Warn</b> first, then <b>Suspend</b> (1–30 days), and <b>Ban</b> for scams or repeat offenders. The member sees your reason when they open the app. Banning also takes down their pairs for sale. Admin: reports, bans, removals' + (isOwner() ? ', appointed by you' : '') + '. Checker: posts Legit/Fake verdicts.</p></section>' +
        '<section class="sec"><h2>Latest listings</h2><div class="card" style="padding:4px 14px">' + lRows + '</div></section>' +
        '<section class="sec"><h2>Latest legit checks</h2><div class="card" style="padding:4px 14px">' + cRows + '</div></section></div>';
    });
  };

  // owner: re-send the sign-up code to members who never finished (max once a day each)
  function remindedAgo(id) { var r = store('reminded') || {}; return r[id] ? Date.now() - r[id] : null; }
  function remindUsers(list, btn) {
    var todo = list.filter(function (u) { var a = remindedAgo(u.id); return u.email && (a === null || a > 20 * 3600e3); });
    if (!todo.length) { toast('Already reminded in the last 24 hours'); return; }
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    var sent = 0, failed = 0, i = 0;
    (function next() {
      if (i >= todo.length) {
        toast(sent ? 'Reminder sent to ' + sent + ' member' + (sent > 1 ? 's' : '') + (failed ? ' (' + failed + ' failed, try later)' : '') : 'Could not send. Try again in a few minutes.');
        return render(true);
      }
      var u = todo[i++];
      sb.auth.resend({ type: 'signup', email: u.email, options: { emailRedirectTo: location.origin + location.pathname } }).then(function (r) {
        if (r.error) failed++; else { sent++; var rm = store('reminded') || {}; rm[u.id] = Date.now(); store('reminded', rm); }
        setTimeout(next, 1200);
      }, function () { failed++; setTimeout(next, 1200); });
    })();
  }

  // shown under the code box: most "missing" codes are sitting in Spam or Promotions
  function spamTip(em, canGoogle) {
    var d = String(em || '').split('@')[1] || '';
    var where = /yahoo|ymail|rocketmail/.test(d) ? 'On Yahoo, open the <b>Spam</b> folder.' :
      /gmail|googlemail/.test(d) ? 'On Gmail, check the <b>Promotions</b> tab and <b>Spam</b>.' :
      /outlook|hotmail|live|msn/.test(d) ? 'On Outlook, check <b>Junk Email</b> and the <b>Other</b> tab.' :
      /icloud|me\.com|mac\.com/.test(d) ? 'On iCloud Mail, check the <b>Junk</b> folder.' : 'Check your <b>Spam</b> or <b>Junk</b> folder.';
    return '<div class="spamtip"><b>Can’t find the code?</b><span>It can take a minute. Look for an email from <b>Zenkicks</b>. ' + where + ' If it’s there, tap <b>Not spam</b> so the next ones reach your inbox.</span>' +
      (canGoogle ? '<span>Still nothing? <button class="link" data-act="google">Continue with Google</button> instead. No code needed.</span>' : '') + '</div>';
  }

  VIEWS.login = function () {
    if (!sb) return needSb();
    if (uid()) { setTimeout(function () { go(takeAfter() || 'me'); }, 0); return skeleton(); }
    return '<div class="pad"><div class="sec" style="gap:4px"><h1>Join the tambayan</h1><p class="sub">Free. Takes 30 seconds. Sign in to sell, bid, vote and comment.</p></div>' + ogHook() + loginForm() + '</div>';
  };
  function loginForm() {
    var L = ST.login || {}; if (!L.email && !L.sentTo) { var pd = pendingSignup(); if (pd) L = { email: pd.email }; }
    var gBtn = C.GOOGLE_LOGIN && !inAppBrowser() ? '<button class="btn dark full gbtn" data-act="google">' + I.google + 'Continue with Google</button><div class="or"><span>or use your email</span></div>' : '';
    var emailBox = L.sentTo
      ? '<div class="card" style="padding:14px;display:flex;flex-direction:column;gap:10px"><p class="sub" style="margin:0">We emailed a code to <b>' + esc(L.sentTo) + '</b>. Type it here, or tap the button in the email.</p>' +
        '<label class="field" for="l-code">Sign-in code<input id="l-code" class="codein" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="••••••"></label>' +
        '<button class="btn red" data-act="emailverify">Sign in</button>' +
        '<div class="row" style="justify-content:space-between"><button class="link" data-act="emailchange">Use another email</button><button class="link" data-act="emaillink" id="l-resend">Send a new code</button></div>' +
        spamTip(L.sentTo, !!gBtn) + '</div>'
      : '<div class="card" style="padding:14px;display:flex;flex-direction:column;gap:10px"><label class="field" for="l-email">Email<input id="l-email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" value="' + esc(L.email || '') + '"></label><button class="btn red" data-act="emaillink">Email me a code</button><p class="tiny" style="margin:0">No password. New here? This creates your free account.</p></div>';
    return gBtn + emailBox +
      (C.SMS_LOGIN ? '<div class="card" style="padding:14px;display:flex;flex-direction:column;gap:10px"><label class="field" for="l-phone">Phone<input id="l-phone" type="tel" autocomplete="tel" placeholder="+971 50 123 4567"></label><button class="btn dark" data-act="smscode">Text me a code</button><div id="otp-wrap" hidden><label class="field" for="l-otp">6-digit code<input id="l-otp" inputmode="numeric" maxlength="6"></label><button class="btn red full" data-act="smsverify">Verify</button></div></div>' : '') +
      '<p class="err" id="l-err" role="alert"></p><p class="tiny">By signing in you agree to the <a href="terms.html" style="text-decoration:underline">Terms</a> and <a href="privacy.html" style="text-decoration:underline">Privacy Policy</a>.</p>';
  };

  VIEWS.install = function () {
    var env = installEnv();
    var os = ST.installOS || (env.ios ? 'ios' : 'android');
    var share = '<span class="kbd">' + I.share + '</span>';
    function steps(list) { return '<ol class="isteps">' + list.map(function (s, i) { return '<li><span class="ji">' + (i + 1) + '</span><span>' + s + '</span></li>'; }).join('') + '</ol>'; }
    var android = steps([
      'Buksan ang <b>serelldc.github.io/zenkicks</b> sa <b>Chrome</b>',
      'I-tap ang <b>Install app</b> sa home page ng Zenkicks<br><span class="m">o i-tap ang <span class="kbd">⋮</span> sa taas, tapos <b>Install app</b> o <b>Add to Home screen</b></span>' + (deferredInstall ? '<br><button class="btn red" style="height:40px;padding:0 16px;font-size:13px;margin-top:8px" data-act="install">Install app ngayon</button>' : ''),
      'I-tap ang <b>Install</b>',
      'Makikita mo na ang <b>Zenkicks icon</b> sa phone mo'
    ]);
    var ios = steps([
      'Buksan ang <b>serelldc.github.io/zenkicks</b> sa <b>Safari</b>',
      'I-tap ang <b>Share</b> button ' + share + ' (kahon na may arrow pataas)<br><span class="m">Kung wala sa baba, i-tap muna ang <span class="kbd">•••</span></span>',
      'Mag-scroll at piliin ang <b>Add to Home Screen</b>',
      'I-tap ang <b>Add</b>',
      'Buksan ang Zenkicks mula sa <b>bagong icon</b>'
    ]);
    return '<div class="pad">' +
      '<div class="joinhero"><span class="pill invited">' + I.plus + 'Install guide</span><h1>I-install ang <span>Zenkicks</span></h1><p class="sub">Libre, walang App Store o Play Store. 1 minuto lang.</p></div>' +
      (env.standalone ? '<div class="card youin"><span class="ji ok">' + I.check + '</span><span><b>Naka-install na</b><br><span class="m">Gamit mo na ang Zenkicks app sa phone na ito. I-share mo ang guide na ito sa tropa mo.</span></span></div>' : '') +
      (env.inApp ? '<div class="card itip warn"><b>Nasa loob ka ng Messenger o Instagram</b><span class="m">I-tap muna ang <span class="kbd">•••</span>, tapos <b>' + (env.ios ? 'Open in Safari' : 'Open in Chrome') + '</b>. Hindi gumagana ang install sa loob ng Messenger o Instagram.</span></div>' : '') +
      '<div class="seg" role="tablist" aria-label="Phone"><button role="tab" class="' + (os === 'android' ? 'on' : '') + '" aria-selected="' + (os === 'android') + '" data-act="ios" data-v="android">Android (Chrome)</button><button role="tab" class="' + (os === 'ios' ? 'on' : '') + '" aria-selected="' + (os === 'ios') + '" data-act="ios" data-v="ios">iPhone (Safari)</button></div>' +
      '<div class="card" style="padding:16px">' + (os === 'ios' ? ios : android) + '</div>' +
      '<section class="sec"><h2>Pagka-install</h2><ul class="joinlist light">' +
      [[I.user, 'Mag-sign up', 'gamit ang Google o email (libre)'], [I.bell, 'I-tap ang bell', 'sa kahit anong drop, tapos <b>Allow</b>, para may alert ka ng 8 AM sa araw ng release'], [I.star, 'First 100 members', 'lang ang may OG badge']].map(function (f) { return '<li><span class="ji">' + f[0] + '</span><span><b>' + f[1] + '</b> ' + f[2] + '</span></li>'; }).join('') +
      '</ul></section>' +
      (os === 'ios' ? '<div class="card itip"><b>Para sa iPhone</b><span class="m">Kailangang naka-Add to Home Screen ang Zenkicks para gumana ang drop alerts (iOS 16.4 pataas).</span></div>' : '') +
      '<div class="card itip"><b>Tip</b><span class="m">Kung galing ka sa Messenger o Instagram, i-tap muna ang <span class="kbd">•••</span> tapos <b>Open in Chrome</b> o <b>Open in Safari</b>. Hindi gumagana ang install sa loob ng Messenger o Instagram.</span></div>' +
      '<button class="btn ghost" style="color:var(--ink)" data-act="guidecopy">' + I.share + ' I-share ang guide na ito</button>' +
      (uid() ? '' : '<button class="btn red" data-go="join">Mag-sign up</button>') +
      '</div>';
  };

  // the page behind the sign-up link and QR code (serelldc.github.io/zenkicks/join)
  VIEWS.join = function () {
    var ref = pendingRef();
    var hero = '<div class="joinhero">' + (ref ? '<span class="pill invited">' + I.user + 'Invited by @' + esc(ref) + '</span>' : '<span class="pill invited">' + I.flame + 'UAE sneaker tambayan</span>') +
      '<h1>Join <span>Zenkicks</span></h1><p class="sub">Free. Takes 30 seconds. No app store needed.</p>' +
      '<ul class="joinlist">' + [[I.bell, 'Drop alerts', 'at 8 AM on release day'], [I.bag, 'Buy &amp; sell', 'pairs in AED'], [I.shield, 'Legit checks', 'from the community'], [I.star, 'Grail alerts', 'when your pair gets listed']].map(function (f) { return '<li><span class="ji">' + f[0] + '</span><span><b>' + f[1] + '</b> ' + f[2] + '</span></li>'; }).join('') + '</ul></div>';
    if (!sb) return '<div class="pad">' + hero + needSb() + '</div>';
    if (uid()) return '<div class="pad">' + hero + '<div class="card youin"><span class="ji ok">' + I.check + '</span><span><b>You’re in</b><br><span class="m">Signed in as @' + esc((ST.me && ST.me.username) || '') + '.</span></span></div>' + (ST.me ? inviteCard() : '') + installLink() + '<button class="btn red" data-go="drops">Go to drops</button></div>';
    return '<div class="pad">' + hero + ogHook() + loginForm() + installLink() + '</div>';
  };

  // ------------------------------------------------------------------
  // ACTIONS
  // ------------------------------------------------------------------
  function requireLogin() { if (!uid()) { rememberAfter(); go('login'); return false; } return true; }
  function reportModal(type, id) {
    if (!requireLogin()) return;
    openModal('<h2>Report</h2><p class="sub">Tell us what’s wrong. Our team reviews every report.</p><div class="chips-wrap">' + ['Fake or replica', 'Scam or suspicious', 'Offensive', 'Spam', 'Other'].map(function (r) { return '<button class="chip" data-act="rpick" data-v="' + r + '">' + r + '</button>'; }).join('') + '</div><textarea id="r-text" maxlength="500" placeholder="Add details (optional)" style="padding:10px;border:1px solid var(--line);border-radius:10px;min-height:80px"></textarea><div class="row"><button class="btn ghost" style="flex:1" data-act="mclose">Cancel</button><button class="btn red" style="flex:1" data-act="rsend" data-type="' + type + '" data-id="' + id + '">Send report</button></div>');
  }

  // ---- press & hold a sneaker: big photo + details ----
  function peekItem(key) {
    var p = String(key || '').split('|'), rest = p.slice(1).join('|');
    if (p[0] === 'h') { var h = (ST.hot && ST.hot.online || [])[+rest]; return h ? { kind: 'hot', rank: +rest + 1, d: h } : null; }
    if (p[0] === 'r') { var r = (ST.releases && ST.releases.items || []).filter(function (x) { return x.name + x.date === rest; })[0]; return r ? { kind: 'drop', d: r } : null; }
    return null;
  }
  function shortModel(name) { return String(name || '').split(/["“(]/)[0].replace(/\s+/g, ' ').trim(); }
  function openPeek(key) {
    var it = peekItem(key); if (!it) return;
    var d = it.d, im = releaseImg(d), rows = [], k = d.name + d.date;
    function row(l, v) { rows.push('<div class="kv"><span class="m">' + l + '</span><span class="pv">' + v + '</span></div>'); }
    if (it.kind === 'drop') {
      var dt = new Date(d.date + 'T00:00:00Z');
      row('Release', DOW[dt.getUTCDay()] + ', ' + dt.getUTCDate() + ' ' + MON[dt.getUTCMonth()].charAt(0) + MON[dt.getUTCMonth()].slice(1).toLowerCase() + ' ' + dt.getUTCFullYear() + ' · <b>' + whenLabel(d.date) + '</b>');
      row('Retail', priceLine(d.retail_usd));
    } else {
      row('Trending', '<b>#' + it.rank + '</b>' + (d.why ? ' · ' + esc(d.why) : ''));
      if (d.price_usd) row('Resale', 'From AED ' + usdToAed(d.price_usd).toLocaleString('en-US') + ' <span style="opacity:.7">(US$' + d.price_usd + ')</span>');
      if (d.retail_usd) row('Retail', priceLine(d.retail_usd));
      if (d.released) row('Released', esc(d.released));
    }
    if (d.brand) row('Brand', esc(d.brand));
    if (d.colorway) row('Colorway', esc(d.colorway));
    if (d.sku) row('Style code', esc(d.sku));
    var on = !!(store('rem') || {})[k];
    openModal('<div class="peek-top"><span class="pill ' + (it.kind === 'drop' ? 'ok">Release' : 'sample">What’s hot') + '</span><button class="round" data-act="peekclose" aria-label="Close">✕</button></div>' +
      '<div class="peek-img">' + (im ? '<img src="' + esc(im) + '" alt="' + esc(d.name) + '">' : I.shoe) + '</div>' +
      '<h2 class="peek-name">' + esc(d.name) + '</h2>' +
      '<div class="card" style="padding:4px 14px">' + rows.join('') + '</div>' +
      (it.kind === 'drop' ? codBtns(k, true) : '') +
      '<div class="row" style="gap:8px;flex-wrap:wrap">' +
      (it.kind === 'drop' && dayDiff(d.date) >= 0 ? '<button class="btn ' + (on ? 'ghost' : 'red') + '" style="flex:1" data-act="peekrem" data-key="' + esc(k) + '">' + (on ? I.check + ' Reminder on' : I.bell + ' Remind me') + '</button>' : '') +
      '<button class="btn dark" style="flex:1" data-act="peekmarket" data-v="' + esc(shortModel(d.name)) + '">' + I.bag + ' Find on Market</button>' +
      '</div>' +
      '<button class="btn ghost" style="color:var(--ink)" data-act="peekgrail" data-v="' + esc(String(d.name).replace(/["“”]/g, '')) + '">⭐ Add to my grails</button>' +
      (d.link ? '<a class="link" style="text-align:center" href="' + esc(d.link) + '" target="_blank" rel="noopener">See it on StockX ›</a>' : ''));
    var mb = app.querySelector('.modal-back'); if (mb) { mb.classList.add('peekback'); mb.querySelector('.modal').classList.add('peek'); }
  }
  function closePeek() { closeModal(); if (ST.peekDirty) { ST.peekDirty = false; render(true); } }
  (function () {
    var timer = null, sx = 0, sy = 0, fired = false, cur = null;
    function stop() { clearTimeout(timer); timer = null; if (cur) cur.classList.remove('peeking'); cur = null; }
    app.addEventListener('pointerdown', function (e) {
      fired = false; stop();
      var el = e.target.closest('[data-peek]'); if (!el || e.button > 0 || e.target.closest('[data-act]')) return;
      sx = e.clientX; sy = e.clientY; cur = el; el.classList.add('peeking');
      timer = setTimeout(function () { var key = cur && cur.getAttribute('data-peek'); stop(); fired = true; try { if (navigator.vibrate) navigator.vibrate(12); } catch (x) {} openPeek(key); }, 450);
    });
    app.addEventListener('pointermove', function (e) { if (timer && (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10)) stop(); });
    app.addEventListener('pointerup', stop); app.addEventListener('pointercancel', stop);
    window.addEventListener('scroll', stop, true);
    // the finger lifting after a hold must not also "tap" what is underneath
    app.addEventListener('click', function (e) { if (fired) { fired = false; e.preventDefault(); e.stopPropagation(); } }, true);
    app.addEventListener('contextmenu', function (e) { if (e.target.closest('[data-peek]')) e.preventDefault(); });
    app.addEventListener('dragstart', function (e) { if (e.target.closest('[data-peek]')) e.preventDefault(); });
  })();

  app.addEventListener('click', function (e) {
    if (e.target.classList && e.target.classList.contains('peekback')) { closePeek(); return; }
    var el = e.target.closest('[data-go],[data-act]'); if (!el) return;
    if (el.hasAttribute('data-go')) { e.preventDefault(); closeModal(); var g = el.getAttribute('data-go'); if (g === 'sell') ST.sell = ST.sell || freshSell(); if (g === 'login' && !uid()) rememberAfter(); go(g); return; }
    var a = el.getAttribute('data-act'), v = el.getAttribute('data-v'), id = el.getAttribute('data-id');
    var on = el.getAttribute('data-on') === 'true';
    switch (a) {
      case 'reload': render(); break;
      case 'rem': toggleRem(el.getAttribute('data-key'), function () { render(true); }); break;
      case 'pushon': pushOn().then(function (res) { toast({ on: '🔔 Drop alerts on. Check your notifications.', 'ios-home': 'Add Zenkicks to your Home Screen first', unsupported: 'This browser can’t show notifications', blocked: 'Notifications are blocked in your settings', declined: 'Alerts not turned on' }[res] || 'Couldn’t turn on alerts, try again later'); render(true); }); break;
      case 'pushoff': pushOff().then(function () { toast('Drop alerts off. Reminders stay saved in the app.'); render(true); }); break;
      case 'pushtest': currentSub().then(function (s) { if (!s) { toast('Turn alerts on first'); return; } return sb.functions.invoke('push', { body: { action: 'test', endpoint: s.endpoint } }).then(function (r) { toast(r.data && r.data.ok ? 'Test sent. Check your notifications.' : 'Wait a few seconds and try again'); }); }); break;
      case 'hottab': ST.hotTab = v; render(true); break;
      case 'mfilter': ST.marketFilter = v; render(true); break;
      case 'msize': ST.sizeOnly = !ST.sizeOnly; render(true); break;
      case 'setsize': openModal('<h2>My sneaker size</h2><p class="sub">We use it to show pairs that fit you. US and EU are both shown (Nike / Jordan size chart).</p><label class="field" for="ms-size">Size<select id="ms-size">' + sizeOptions(mySize(), 'Select size') + '</select></label><div class="row"><button class="btn ghost" style="flex:1" data-act="mclose">Cancel</button><button class="btn red" style="flex:1" data-act="savesize">Save</button></div>'); break;
      case 'savesize': var nsz = Number((document.getElementById('ms-size') || {}).value) || null; if (!nsz) return; store('mysize', nsz); if (ST.me) ST.me.size_eu = nsz; if (uid()) sb.from('profiles').update({ size_eu: nsz }).eq('id', uid()).then(function () {}); closeModal(); ST.sizeOnly = true; toast('Saved: ' + sizeLabel(nsz)); render(true); break;
      case 'cod': codVote(el.getAttribute('data-key'), Number(v)); break;
      case 'peekgrail': closeModal(); ST.grailDraft = { model: v }; if (!requireLogin()) return; go('grails'); break;
      case 'addgrail':
        var gm = (document.getElementById('g-model').value || '').trim(), gsz = Number(document.getElementById('g-size').value) || null, gerr = document.getElementById('g-err'); gerr.textContent = '';
        if (gm.length < 2) { gerr.textContent = 'Type the pair you’re hunting, e.g. Jordan 4 Bred.'; return; }
        el.disabled = true;
        sb.from('grails').insert({ user_id: uid(), model: gm, size_eu: gsz }).then(function (r) {
          el.disabled = false;
          if (r.error) { gerr.textContent = /row-level|policy/i.test(r.error.message) ? 'You can hunt up to 20 pairs. Remove one first.' : r.error.message; return; }
          toast('Added to your grails. We’ll alert you when it’s listed.'); ST.grailHits = null; render(true);
        });
        break;
      case 'delgrail': sb.from('grails').delete().eq('id', id).then(function () { ST.grailHits = null; render(true); }); break;
      case 'share': openShare(el.getAttribute('data-k')); break;
      case 'invcopy': (function (link) { var ok = function () { toast('Link copied. Paste it in your chats'); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(ok, function () { window.prompt('Copy your link:', link); }); else window.prompt('Copy your link:', link); })(inviteLink(v === 'main')); break;
      case 'invshare': (function (link) { if (navigator.share) navigator.share({ title: 'Join me on Zenkicks', text: 'UAE sneaker drops, buy & sell, legit checks. Free 🔥', url: link }).catch(function () {}); else { ST.tmp = link; app.querySelector('[data-act=invcopy]').click(); } })(inviteLink()); break;
      case 'invqr': inviteQR(v === 'main'); break;
      case 'invstory': ST.inviteMain = v === 'main'; openShare('invite'); break;
      case 'sharego': if (ST.shareFile && navigator.share) navigator.share({ files: [ST.shareFile], title: 'Zenkicks', text: /invite|signup/.test(ST.shareFile.name) ? inviteLink(ST.inviteMain).replace(/^https:\/\//, '') : 'serelldc.github.io/zenkicks' }).catch(function () {}); break;
      case 'ltab': ST.legitTab = v; render(true); break;
      case 'gal': ST.gallery.i = +el.getAttribute('data-i'); document.getElementById('gallery').outerHTML = galleryHTML(); break;
      case 'watch':
        if (!requireLogin()) return;
        (on ? sb.from('watches').delete().eq('user_id', uid()).eq('listing_id', id) : sb.from('watches').insert({ user_id: uid(), listing_id: id }))
          .then(function (r) { if (r.error) return fail(r.error); toast(on ? 'Removed from watchlist' : 'Saved to your watchlist'); render(true); });
        break;
      case 'bid':
        if (!requireLogin()) return;
        if (isBlocked()) { var su = suspendedUntil(); toast(su ? 'Your account is on hold until ' + fmtDay(su) : 'Your account can’t place bids'); return; }
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
      case 'peekclose': closePeek(); break;
      case 'peekrem': toggleRem(el.getAttribute('data-key'), function (onNow) { ST.peekDirty = true;
        el.className = 'btn ' + (onNow ? 'ghost' : 'red'); el.innerHTML = onNow ? I.check + ' Reminder on' : I.bell + ' Remind me'; }); break;
      case 'peekmarket': closeModal(); ST.marketQ = v || ''; ST.marketFilter = 'all'; go('market'); break;
      case 'acknotice': sb.rpc('ack_notices').then(function () { closeModal(); }); break;
      case 'vouch': vouchModal(el.getAttribute('data-target'), el.getAttribute('data-user'), el.getAttribute('data-ref'), el.getAttribute('data-kind')); break;
      case 'vstar':
        ST.vstars = +v;
        app.querySelectorAll('.stars button').forEach(function (b, i) { var onS = i < ST.vstars; b.classList.toggle('on', onS); b.setAttribute('aria-checked', String(i + 1 === ST.vstars)); });
        break;
      case 'vsend':
        if (!ST.vstars) { document.getElementById('v-err').textContent = 'Tap 1 to 5 stars.'; return; }
        el.disabled = true;
        sb.rpc('give_vouch', { target: el.getAttribute('data-target'), ref: el.getAttribute('data-ref'), k: el.getAttribute('data-kind'), s: ST.vstars, msg: (document.getElementById('v-note').value || '').trim() }).then(function (r) {
          el.disabled = false; if (r.error) { document.getElementById('v-err').textContent = r.error.message; return; }
          closeModal(); toast('Vouch sent. Thanks for keeping the tambayan legit!'); render(true);
        });
        break;
      case 'install': installApp(); break;
      case 'ios': ST.installOS = v; render(true); break;
      case 'guidecopy': (function (link) { if (navigator.share) navigator.share({ title: 'Paano i-install ang Zenkicks', text: 'Guide: paano i-install ang Zenkicks app sa Android at iPhone', url: link }).catch(function () {}); else if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(function () { toast('Guide link copied'); }); else window.prompt('Copy the guide link:', link); })('https://serelldc.github.io/zenkicks/#/install'); break;
      case 'arole':
        sb.rpc('admin_set_role', { target: id, role: v, val: !on }).then(function (r) { if (r.error) return fail(r.error); toast((!on ? 'Made ' : 'Removed ') + v); return loadOwners().then(function () { render(true); }); });
        break;
      case 'aban':
        if (on) { sb.rpc('admin_set_ban', { target: id, val: false, msg: null }).then(function (r) { if (r.error) return fail(r.error); toast('Unbanned'); render(true); }); break; }
        modModal('ban', id, el.getAttribute('data-user'));
        break;
      case 'awarn': modModal('warn', id, el.getAttribute('data-user')); break;
      case 'asusp': ST.modDays = 7; modModal('suspend', id, el.getAttribute('data-user')); break;
      case 'adays':
        ST.modDays = parseInt(v, 10);
        Array.prototype.forEach.call(app.querySelectorAll('[data-act="adays"]'), function (b) { var sel = b.getAttribute('data-v') === v; b.classList.toggle('on', sel); b.setAttribute('aria-pressed', sel); });
        break;
      case 'amodsend':
        var kind = el.getAttribute('data-kind'), why = ((document.getElementById('mod-why') || {}).value || '').trim(), merr = document.getElementById('mod-err');
        if (why.length < 3) { merr.textContent = 'Write a short reason. The member will see it.'; return; }
        el.disabled = true;
        (kind === 'warn' ? sb.rpc('admin_warn', { target: id, msg: why }) : kind === 'suspend' ? sb.rpc('admin_suspend', { target: id, days: ST.modDays || 7, msg: why }) : sb.rpc('admin_set_ban', { target: id, val: true, msg: why }))
          .then(function (r) { el.disabled = false; if (r.error) { merr.textContent = r.error.message; return; } closeModal(); toast(kind === 'warn' ? 'Warning sent' : kind === 'suspend' ? 'Suspended for ' + (ST.modDays || 7) + ' day' + ((ST.modDays || 7) > 1 ? 's' : '') : 'Banned'); render(true); });
        break;
      case 'alift':
        sb.rpc('admin_lift', { target: id }).then(function (r) { if (r.error) return fail(r.error); toast('Hold lifted'); render(true); });
        break;
      case 'aremove':
        sb.rpc('admin_remove_listing', { lid: id }).then(function (r) { if (r.error) return fail(r.error); toast('Listing removed'); render(true); });
        break;
      case 'adelcheck':
        if (!window.confirm('Delete this legit check and its comments?')) return;
        sb.from('checks').delete().eq('id', id).then(function (r) { if (r.error) return fail(r.error); toast('Deleted'); render(true); });
        break;
      case 'hideinstall': store('noinstall', true); var ic2 = document.getElementById('installcard'); if (ic2) ic2.remove(); break;
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
        var un = (document.getElementById('p-user').value || '').trim().toLowerCase(); var city = document.getElementById('p-city').value || null; var psz = Number(document.getElementById('p-size').value) || null; store('mysize', psz); var wa = (document.getElementById('p-wa').value || '').trim();
        var perr = document.getElementById('p-err'); perr.textContent = '';
        if (!/^[a-z0-9._]{3,24}$/.test(un)) { perr.textContent = 'Username: 3–24 characters, letters, numbers, dot or underscore.'; return; }
        if (wa && !/^\+?[0-9 ]{7,20}$/.test(wa)) { perr.textContent = 'Enter a valid WhatsApp number.'; return; }
        Promise.all([sb.from('profiles').update({ username: un, city: city, size_eu: psz }).eq('id', uid()), sb.from('private_contacts').update({ whatsapp: wa || null }).eq('user_id', uid())]).then(function (r) {
          var er = r[0].error || r[1].error; if (er) { perr.textContent = /duplicate|unique/i.test(er.message) ? 'That username is taken.' : er.message; return; }
          return loadMe().then(function () { toast('Saved'); render(true); });
        });
        break;
      case 'signout': sb.auth.signOut().then(function () { ST.me = null; ST.contact = null; go('drops'); }); break;
      case 'emaillink':
        var emEl = document.getElementById('l-email');
        var em = ((emEl ? emEl.value : (ST.login && ST.login.sentTo)) || '').trim().toLowerCase(); var lerr = document.getElementById('l-err'); lerr.textContent = '';
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { lerr.textContent = 'Enter a valid email.'; return; }
        var fixEm = emailFix(em);
        if (fixEm && ST.okEmail !== em) {
          lerr.innerHTML = 'Did you mean <b>' + esc(fixEm) + '</b>?<br><span class="row" style="gap:8px;margin-top:8px"><button class="btn red" style="height:38px;padding:0 14px;font-size:13px" data-act="emailfix" data-v="' + esc(fixEm) + '">Yes, use that</button><button class="btn ghost" style="height:38px;padding:0 14px;font-size:13px;color:var(--ink)" data-act="emailkeep" data-v="' + esc(em) + '">No, it’s correct</button></span>';
          return;
        }
        if (ST.login && ST.login.sentAt && ST.login.sentTo === em && Date.now() - ST.login.sentAt < 60000) { lerr.textContent = 'Please wait ' + Math.ceil((60000 - (Date.now() - ST.login.sentAt)) / 1000) + 's before asking for a new code.'; return; }
        el.disabled = true; var oldTxt = el.textContent; el.textContent = 'Sending…';
        sb.auth.signInWithOtp({ email: em, options: { emailRedirectTo: location.origin + location.pathname } }).then(function (r) {
          el.disabled = false; el.textContent = oldTxt;
          if (r.error) { lerr.textContent = /rate|security purposes|seconds/i.test(r.error.message) ? 'Too many tries. Wait a minute, then try again.' : r.error.message; return; }
          ST.login = { email: em, sentTo: em, sentAt: Date.now() }; store('pending', { email: em, t: Date.now() }); render(true); toast('Code sent. Check your inbox, and Spam too');
          setTimeout(function () { var c = document.getElementById('l-code'); if (c) c.focus(); }, 50);
        });
        break;
      case 'emailfix': var ei = document.getElementById('l-email'); if (ei) ei.value = v; ST.okEmail = v; document.getElementById('l-err').textContent = ''; var sb1 = app.querySelector('[data-act="emaillink"]'); if (sb1) sb1.click(); break;
      case 'emailkeep': ST.okEmail = v; document.getElementById('l-err').textContent = ''; var sb2 = app.querySelector('[data-act="emaillink"]'); if (sb2) sb2.click(); break;
      case 'emailverify':
        var code = ((document.getElementById('l-code') || {}).value || '').replace(/\D/g, ''); var verr = document.getElementById('l-err'); verr.textContent = '';
        if (code.length < 6) { verr.textContent = 'Enter the code from the email.'; return; }
        el.disabled = true; el.textContent = 'Signing in…';
        sb.auth.verifyOtp({ email: ST.login.sentTo, token: code, type: 'email' }).then(function (r) {
          if (r.error) { el.disabled = false; el.textContent = 'Sign in'; verr.textContent = /expired|invalid/i.test(r.error.message) ? 'That code is wrong or expired. Check it, or send a new code.' : r.error.message; return; }
          ST.login = null; // onAuthStateChange takes it from here
        });
        break;
      case 'pendcode': var pc = pendingSignup(); if (pc) { ST.login = { email: pc.email, sentTo: pc.email, sentAt: pc.t }; go('login'); } break;
      case 'pendnew': var pn = pendingSignup(); if (pn) { ST.login = { email: pn.email }; go('login'); setTimeout(function () { var sbn = app.querySelector('[data-act="emaillink"]'); if (sbn) sbn.click(); }, 150); } break;
      case 'pendforget': store('pending', null); render(true); break;
      case 'aremind': remindUsers([{ id: el.getAttribute('data-id'), email: v }], el); break;
      case 'aremindall': remindUsers(ST.pendingList || [], el); break;
      case 'emailchange': ST.login = { email: ST.login && ST.login.sentTo }; render(true); break;
      case 'google': el.disabled = true; sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } }).then(function (r) { if (r && r.error) { el.disabled = false; fail(r.error); } }); break;
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
    if (t.id === 'l-code') { var d = t.value.replace(/\D/g, ''); if (d !== t.value) t.value = d; if (d.length === (C.OTP_LENGTH || 6)) { var vb = app.querySelector('[data-act="emailverify"]'); if (vb && !vb.disabled) vb.click(); } return; }
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
    if (e.target.id === 'l-code') { e.preventDefault(); var b4 = app.querySelector('[data-act="emailverify"]'); if (b4) b4.click(); }
    if (e.target.id === 'aq') { e.preventDefault(); ST.adminQ = e.target.value.trim(); render(true); }
  });

  // ------------------------------------------------------------------
  // boot
  // ------------------------------------------------------------------
  function loadMe() {
    if (!sb || !uid()) { ST.me = null; ST.contact = null; return Promise.resolve(); }
    return Promise.all([sb.from('profiles').select('*').eq('id', uid()).maybeSingle(), sb.from('private_contacts').select('whatsapp').eq('user_id', uid()).maybeSingle()])
      .then(function (a) { ST.me = a[0].data; ST.contact = a[1].data; });
  }
  function checkNotices() {
    if (!sb || !uid()) return;
    sb.rpc('my_notices').then(function (r) {
      var ns = (r && r.data) || []; if (!ns.length) return;
      var label = { warn: 'Warning', suspend: 'Account on hold', ban: 'Account banned', lift: 'Good news' };
      openModal('<h2>' + (ns.some(function (n) { return n.kind !== 'lift'; }) ? 'A message from the Zenkicks team' : 'Good news') + '</h2>' +
        ns.map(function (n) {
          return '<div class="card notice ' + n.kind + '" style="padding:12px;display:flex;flex-direction:column;gap:4px"><b>' + label[n.kind] + '</b><span>' + esc(n.reason) + '</span>' +
            (n.until_at ? '<span class="m">Until ' + esc(fmtDay(new Date(n.until_at))) + '. You can still browse drops and the market.</span>' : '') + '</div>';
        }).join('') +
        '<p class="m" style="margin:0">Please follow the community rules: legit pairs only, honest photos and prices, and respect for every member.</p>' +
        '<button class="btn dark full" data-act="acknotice">I understand</button>');
    }).catch(function () {});
  }
  function loadOwners() {
    if (!sb) return Promise.resolve();
    return Promise.all([
      sb.rpc('owner_ids').then(function (r) { ST.owners = {}; (r.data || []).forEach(function (x) { ST.owners[typeof x === 'string' ? x : (x.owner_ids || x.id)] = true; }); }).catch(function () {}),
      sb.rpc('og_members').then(function (r) { if (r.error) return; ST.og = {}; ST.ogCount = (r.data || []).length; (r.data || []).forEach(function (x) { ST.og[x.user_id] = x.n; }); }).catch(function () {})
    ]);
  }
  if (sb) {
    // Start everything at once and show the page as soon as the session is known.
    // Badges come from the last visit first (instant), then refresh in the background.
    var cb = store('badges'); if (cb) { ST.owners = cb.owners || {}; ST.og = cb.og || {}; ST.ogCount = cb.ogCount; }
    loadFeeds();
    setTimeout(pushBoot, 2500);
    var ownersP = loadOwners().then(function () { store('badges', { owners: ST.owners || {}, og: ST.og || {}, ogCount: ST.ogCount }); });
    var booted = false;
    sb.auth.getSession().then(function (r) {
      ST.session = r.data.session;
      var meP = loadMe();
      var needMe = uid() && /^(me|admin|sell|new-check|login)$/.test(route().name);
      (needMe ? meP : Promise.resolve()).then(function () { booted = true; render(); });
      Promise.all([meP, ownersP]).then(function () {
        var badgesChanged = JSON.stringify([cb && cb.og, cb && cb.owners]) !== JSON.stringify([ST.og, ST.owners]);
        if (booted && (uid() && !needMe || badgesChanged)) render(true);
        checkNotices(); applyRef();
      });
    });
    sb.auth.onAuthStateChange(function (evt, session) {
      if (evt === 'INITIAL_SESSION') return; // handled by getSession above
      var was = uid(); ST.session = session;
      if ((session && session.user && session.user.id) !== was) Promise.all([loadMe(), evt === 'SIGNED_IN' ? loadOwners().then(function () { store('badges', { owners: ST.owners, og: ST.og, ogCount: ST.ogCount }); }) : null]).then(function () {
        if (evt !== 'SIGNED_IN' || !uid()) return render(true);
        var fresh = ST.me && ST.me.created_at && Date.now() - new Date(ST.me.created_at).getTime() < 10 * 60e3 || !!store('pending'); store('pending', null);
        var next = takeAfter();
        if (next) go(next); else if (route().name === 'login' || route().name === 'join' && fresh) go('drops'); else render(true); // join: only brand-new members jump to Drops (a returning member just sees "You're in")
        setTimeout(checkNotices, 1500); applyRef();
        setTimeout(function () { toast(fresh ? 'Welcome to Zenkicks, @' + ST.me.username + '! Change your username anytime in Profile.' : 'Signed in as @' + ((ST.me && ST.me.username) || '')); }, 400);
      });
    });
  } else {
    render();
  }
})();
