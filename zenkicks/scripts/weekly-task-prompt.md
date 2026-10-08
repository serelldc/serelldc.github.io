Weekly job: add newly announced sneaker drops (plus their UAE availability) to the Zenkicks release calendar and publish it. The owner is Rell; he reads casual Taglish and wants a short report. He may be away, so do not ask questions: make sensible choices and say what you assumed.

## Background
Zenkicks is a free UAE sneaker web app at https://serelldc.github.io/zenkicks/.
- It lives in the GitHub repo serelldc/serelldc.github.io, folder zenkicks/. The repo is already cloned in your working directory.
- The release calendar is the file zenkicks/data/releases.json.
- A daily GitHub Action (7:46 AM UAE) handles the rest automatically: it removes past drops and adds StockX photo/link/brand to drops that have none.
- The app only shows drops that have a photo, so new drops appear once that bot finds a photo. You only ADD new drops and fill in UAE info.

## File format
`{"updated": "YYYY-MM-DD", "source": "...", "items": [ ... ]}`

Each item looks like this:
`{"date": "2026-10-02", "name": "Air Jordan 4 \"Light Army\"", "brand": "Jordan", "retail_usd": 220, "image": "", "link": ""}`

Naming style:
- Colorway in straight double quotes.
- Collabs written as "J Balvin x Air Jordan 4 \"Amazonas\"".
- `brand` is the real brand name: Jordan, Nike, adidas, New Balance, ASICS, etc.
- `retail_usd` is a number (US retail). Use null if unknown.
- New items get `"image": ""` and `"link": ""`.
- Items may also have a `"tried"` field, which belongs to the bot. Leave it alone.

### Optional "uae" field
Only add it when the info is confirmed:

`"uae": {"aed": 799, "where": [{"name": "Jordan Dubai Mall", "url": "https://...", "how": "Raffle on Sole Retriever, closes Thu"}], "note": "short optional note"}`

- `aed`: the UAE retail price in AED, only if a UAE store lists it. Otherwise leave `aed` out. Never convert from USD.
- `where`: UAE stores or raffles confirmed for this release. Each entry needs:
  - `url`: https only, a direct page for that release or the store's launch page.
  - `how`: a few words, such as "SNKRS draw", "Online raffle", "In store, first come".
- Leave `uae` out entirely if nothing is confirmed. The app already shows a generic list of UAE stores in that case.

## Steps

### 1. Get the current file
Work in the cloned repo. Run `git pull --rebase origin main`, then read `zenkicks/data/releases.json`.
Today = the Dubai date (UTC+4). Do not use any device or computer tools; everything happens in this repo.

### 2. Research
Use WebSearch and WebFetch. If a site cannot be fetched, do NOT try curl/python or mirrors; use other sources. Budget: about 25 tool calls in total.

**a) New drops.** Look at drops from today to about 8 weeks ahead:
- SneakerFiles release dates: https://www.sneakerfiles.com/release-dates/
- Sneaker News release calendar: https://sneakernews.com/release-dates/
- other reputable sneaker news sites if needed

Only include:
- real sneakers: no slides, clogs, boots, apparel or kids-only.
- a confirmed release date: skip "TBD" and month-only dates.

**b) UAE info**, for the hyped drops in the next 3 weeks (Jordan, Nike SB/Dunk, Kobe, New Balance, adidas collabs; not every drop). At most 10 searches.
- These pages do NOT work with WebFetch, so do not fetch them: nike.com/ae (empty without JavaScript), soleretriever.com (403).
- Use WebSearch only, with queries like `<shoe name> UAE release Dubai` or `<shoe name> raffle Dubai Mall`.
- Add `uae` ONLY if a search result explicitly names a UAE store, draw or raffle for that exact shoe. Use that result's URL. Leave `aed` out unless the result states an AED price. Never guess and never convert from USD.
- It is normal to add `uae` to few or no drops. Say so in the report instead of inventing data.

### 3. Merge
Merging rules:
- **Never change the `name` or `date` of an existing item.** The app's reminders are keyed on name+date. The one exception is a date that was officially moved: update the date only, keep the name, and mention it in the report.
- **Never delete items.** Never touch `image`/`link`/`tried` of existing items.
- **UAE info.** You MAY add or update the `uae` field on existing items.
- **Skip duplicates.** Treat a new drop as a duplicate if an existing item is the same shoe, judged by model number plus colorway words (case/punctuation insensitive), within ±10 days.
- **Order and metadata.** Sort items by date, then name. Set `updated` = today (Dubai). Keep `source` as is.

Then validate with `python3 -c "import json;json.load(open('zenkicks/data/releases.json'))"`, keep the 2-space indent and the trailing newline.

If nothing new was found, no UAE info was added and no date changed, stop and report "walang bagong drops this week" with the current count. Do not commit.

### 4. Publish (git, no GitHub API needed)
1. `git add zenkicks/data/releases.json`
2. `git commit -m "Weekly release calendar: N new drops"` (N = number of new drops; mention UAE updates if any)
3. `git pull --rebase origin main` (the daily bot may have pushed; if the rebase conflicts, take the bot's version of image/link/tried, keep your new items and `uae` fields)
4. `git push origin HEAD:main`
If the push is refused, say so clearly in the report and attach the final file content path. Never force-push.

### 5. Verify
About 90 seconds later: `curl -sS "https://raw.githubusercontent.com/serelldc/serelldc.github.io/main/zenkicks/data/releases.json?t=$(date +%s)"` and confirm `updated` = today and the item count is as expected.

### 6. Report
Final message, short, Taglish:
- the new drops (date, name, USD price);
- which drops got UAE info (store, raffle, AED), or "walang UAE na na-confirm";
- any date changes;
- the total upcoming count and the furthest date;
- a reminder that photos appear automatically after the daily bot runs.
