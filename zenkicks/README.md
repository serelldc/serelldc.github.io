# Zenkicks — UAE sneaker tambayan

Libreng web app para sa sneakerheads sa UAE:

- **Drops:** release calendar na nag-a-update araw-araw, may presyo sa AED at product photos
- **What's hot:** trending online (StockX data) at trending sa Zenkicks (bids at saves)
- **Market:** magbenta, mag-bid, at mag-deal nang direkta sa WhatsApp. Walang bayaran sa loob ng app.
- **Legit or Fake:** mag-post ng photos, bumoto ang community, may comments at replies, at final verdict mula sa checker
- **Installable:** "Add to Home Screen" sa phone, may sariling Zenkicks icon

Walang build step. Plain HTML/CSS/JS ito, kaya pwede mong i-edit sa GitHub web UI.

---

## Ano ang laman ng folder

| File / folder | Para saan |
|---|---|
| `index.html` | Ang app (pinapatakbo ng GitHub Pages) |
| `config.js` | **Dito mo ilalagay ang Supabase keys**, login options at ads |
| `assets/app.js`, `assets/app.css` | Code at itsura ng app |
| `data/releases.json`, `data/hot.json` | Release calendar at What's hot. Automatic na ina-update araw-araw. |
| `data/photos.json`, `img/releases/` | Sariling photos na ipapalit sa auto images (opsyonal) |
| `supabase/schema.sql` | Database, security rules at photo storage. Isang beses lang patatakbuhin. |
| `scripts/fetch-releases.mjs` | Kumukuha ng bagong releases at images mula sa KicksDB |
| `.github/workflows/refresh-data.yml` | Nagpapatakbo ng script araw-araw, 7:46am Dubai time |
| `terms.html`, `privacy.html` | **Draft** na legal pages. Ipa-review sa lawyer bago mag-launch. |
| `manifest.webmanifest`, `sw.js`, `icons/` | Para ma-install ang app at magkaroon ng icon |

---

## Setup (mga 30–45 minuto, isang beses lang)

### Step 1 — I-upload sa GitHub

1. Buksan ang folder na `Documents/zenkicks-app` sa **VS Code**.
2. Pumunta sa **Source Control** (icon na parang sanga), tapos **Publish to GitHub**.
3. Piliin ang **Public repository** at pangalanang `zenkicks`. Kailangang public para libre ang GitHub Pages.

> Kung GitHub Desktop ang gamit mo: File → Add Local Repository → piliin ang folder → Publish repository.

### Step 2 — Gumawa ng Supabase project (database + login + photos)

1. Mag-sign up sa [supabase.com](https://supabase.com) at pindutin ang **New project**.
   - Name: `zenkicks`
   - Database password: gumawa ng malakas na password at **i-save ito**
   - Region: piliin ang pinakamalapit sa UAE na available
2. Kapag handa na ang project, pumunta sa **SQL Editor → New query**. I-paste ang buong laman ng `supabase/schema.sql`, tapos pindutin ang **Run**. Dapat "Success" ang lumabas.
3. Pumunta sa **Project Settings → API** at kopyahin ang dalawa:
   - **Project URL**
   - **anon public** key
4. Buksan ang `config.js` at ilagay sila:
   ```js
   SUPABASE_URL: 'https://xxxx.supabase.co',
   SUPABASE_ANON_KEY: 'eyJhbGciOi...',
   ```
   Ligtas i-publish ang anon key. Ang security rules sa database ang nagbabantay kung sino ang pwedeng magbasa at magsulat.
5. Pumunta sa **Authentication → URL Configuration**:
   - **Site URL:** `https://serelldc.github.io/zenkicks/`
   - **Redirect URLs:** idagdag ang `https://serelldc.github.io/zenkicks/**`
6. I-commit at i-push ang `config.js` (VS Code: Source Control → message "Add Supabase keys" → Commit → Sync).

### Step 3 — I-on ang GitHub Pages

1. Sa GitHub repo, pumunta sa **Settings → Pages**.
2. Sa Source, piliin ang **Deploy from a branch**, branch `main`, folder `/ (root)`, tapos **Save**.
3. Pagkatapos ng 1–2 minuto, live na ang app sa **https://serelldc.github.io/zenkicks/**

### Step 4 — Automatic na releases at images (KicksDB)

1. Mag-sign up sa [kicks.dev](https://kicks.dev). May libreng 1,000 requests/buwan, at mga 150 lang ang gagamitin ng app.
2. Kopyahin ang **API key** mo.
3. Sa GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `KICKSDB_API_KEY`
   - Secret: i-paste ang key
4. Pumunta sa **Actions** tab, piliin ang **Refresh releases and what's hot**, tapos **Run workflow**.
5. Kapag berde (✓) ang lumabas, may bagong `data/releases.json` na may images. Mula ngayon, automatic na itong tatakbo araw-araw.

> Kung pula (✕) o "0 releases" ang lumabas, buksan ang log at i-screenshot mo para sa akin. Baka kailangang i-adjust ang field names sa script para tumugma sa sagot ng API.

### Step 5 — Gawing admin ang sarili mo

1. Buksan ang app, mag-sign in gamit ang email mo, at i-click ang link na ipapadala sa email mo.
2. Sa Supabase: **Table Editor → profiles**. Hanapin ang username mo at gawing `true` ang **is_admin**.
3. Kapag admin ka na:
   - Makikita mo ang **Open reports** sa profile page mo.
   - Pwede kang mag-post ng **Legit/Fake verdict** sa legit checks.
   - Para gumawa ng ibang checkers, gawing `true` ang **is_checker** nila.

---

## Araw-araw na paggamit

- **Palitan ang release photo:** ilagay ang JPG sa `img/releases/`, tapos idagdag sa `data/photos.json`:
  ```json
  "Nike Dunk Low \"Panda\"": "img/releases/nike-dunk-low-panda.jpg"
  ```
  Mas mananaig ang sarili mong photo kaysa sa auto image.
- **Mag-ban ng user:** Table Editor → profiles → `is_banned` = `true`
- **Markahan ang listing na legit-checked:** Table Editor → listings → `legit_checked` = `true`
- **Pagkatapos baguhin ang `app.js` o `app.css`:** palitan ang `VERSION` sa `sw.js` (hal. `zk-v2`) para makuha ng phones ang update.

## Ads (kapag marami nang users)

Sa `config.js`, i-set ang `ADS.enabled: true`. Dalawang paraan:

1. **Sponsor:** halimbawa isang UAE sneaker store. Punan ang `sponsor` (name, text, link, image). Kadalasan mas malaki ang kita rito sa maliit na audience.
2. **Google AdSense:** mag-apply sa AdSense gamit ang sariling domain. Kapag approved, ilagay ang `adsenseClient` at `adsenseSlot`. Kailangang i-update ang Privacy Policy tungkol sa ad cookies.

Lalabas ang ads sa Drops, Hot, Market at Legit feed na may label na "Sponsored".

---

## Gastos at limits

| Serbisyo | Libre hanggang | Kapag lumaki |
|---|---|---|
| GitHub Pages | 100 GB bandwidth/buwan | Libre pa rin |
| Supabase | 50,000 users/buwan, 500 MB database, 1 GB photos | Pro: **$25/buwan** (8 GB DB, 100 GB photos) |
| KicksDB | 1,000 requests/buwan | Starter: €29/buwan |
| Domain (opsyonal) | — | ~AED 40–150/taon |

⚠️ **Napo-pause ang libreng Supabase project kapag walang gumamit nang 7 araw.** Mare-restore ito mula sa dashboard. Kapag may regular users na, lumipat sa Pro.

**SMS login at phone verification:** kailangan ng SMS provider (hal. Twilio) na may bayad kada text. Kapag handa ka na, i-connect ito sa Supabase → Authentication → Providers → Phone, tapos i-set ang `SMS_LOGIN: true` sa `config.js`.

**ID + face verification:** idadagdag sa susunod (hal. Sumsub, Veriff o UAE Pass). May bayad kada verification. Handa na ang database para dito (`verified_level = 'id'`).

## Bago mag-public launch

- [ ] Ipa-review sa UAE lawyer ang `terms.html` at `privacy.html` at punan ang lahat ng [brackets]
- [ ] Alamin kung kailangan ng e-commerce o online platform trade license
- [ ] Basahin ang KicksDB Terms tungkol sa pag-display ng product images
- [ ] Gumawa ng hiwalay na Zenkicks email para sa reports at contact
- [ ] Mag-test: gumawa ng 2 account, mag-list, mag-bid, mag-accept, at mag-legit check
