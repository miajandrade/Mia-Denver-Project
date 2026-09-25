# Denver Events Aggregator

## Project Purpose
A personal MVP single-page web app that aggregates and displays upcoming events in Denver, CO. Zero backend, deployable to GitHub Pages. Clean filterable event board sourced from the Ticketmaster Discovery API.

## Visual Design (as of May 2026)
Luxury editorial magazine aesthetic — high-end fashion meets city nightlife guide.
- **Color palette**: Deep dusty rose `#1a0a0f` background, `#2d1520` cards, hot pink `#ff2d78` accent, blush `#ffb3c6` secondary, dark filter bar `#3d1f2d`
- **Typography**: Playfair Display (900/700) for logo + headings; DM Sans (400/500/700) for body — loaded via Google Fonts in `index.html`
- **Header**: gradient `#1a0a0f → #3d1522`, SVG fractalNoise texture overlay via `::before` pseudo-element
- **Cards**: `#2d1520` surface, 3px hot-pink top border, glow box-shadow on hover, `fadeInUp` stagger animation (12 nth-child delays × 65 ms)
- **Image placeholders**: pink gradient (`#5c1f38 → #3a1225 → #7a2347`), emoji hidden via `font-size: 0`
- **Category badges**: uniformly hot pink `#ff2d78` with white text
- **Source badges**: blush `#ffb3c6` text, subtle translucent background
- **Filter pills**: blush border/text when inactive, hot pink filled when active

## Tech Stack
- **HTML5 / CSS3 / Vanilla JavaScript (ES6+)** — no frameworks, no build tools
- **Static site** — deployable to GitHub Pages as-is
- **API key required** (Ticketmaster free tier — stored as a constant in app.js for local/static use)

## File Structure
```
denver-events/
├── index.html      # App shell, semantic HTML
├── style.css       # All styles — CSS custom properties, responsive grid, card images
├── app.js          # Data fetching, normalization, filtering, rendering
└── CLAUDE.md       # This file
```

## APIs Used

### Ticketmaster Discovery API (active)
- **Endpoint**: `https://app.ticketmaster.com/discovery/v2/events.json`
- **Auth**: Free-tier API key — **active and configured** in `app.js` line 1
- **Key location**: `TICKETMASTER_API_KEY` constant at the top of `app.js`
- **Query params used**: `city=Denver`, `stateCode=CO`, `countryCode=US`, `size=50`, `sort=date,asc`, `startDateTime` (dynamically set to today's ISO 8601 timestamp at fetch time — ensures only future events are returned)
- **Response shape**: `_embedded.events[]` — each event has `name`, `dates.start.localDate`, `dates.start.localTime`, `_embedded.venues[0].name`, `classifications[0].segment.name`, `images[]`, `url`
- **Docs**: https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/

### PredictHQ (active)
- **Endpoint**: `https://api.predicthq.com/v1/events/`
- **Auth**: Bearer token — **active and configured** in `app.js` as `PREDICTHQ_TOKEN`
- **Query params**: `location_around.origin=39.7392,-104.9903`, `location_around.offset=25mi`, `country=US`, `state=active`, `sort=start`, `limit=50`, `start.gte` (dynamic today's date)
- **Response shape**: `results[]` — each has `title`, `start_local`, `category`, `geo.address`, `start_local`
- **Category mapping**: concerts→Music, performing-arts→Arts & Theatre, sports→Sports, family→Family, film→Film, festivals/community/expos/conferences/food-drink-festival→Community
- **Coverage**: ~5,000 Denver-area events — community events, festivals, conferences, food markets, sports
- **Docs**: https://docs.predicthq.com/

### Lu.ma (active)
- **Endpoint**: `https://api.lu.ma/discover/get-paginated-events` — unauthenticated public API (same one Lu.ma's website uses for logged-out visitors)
- **Auth**: None required
- **Query params**: `pagination_limit=50`, `geo_latitude=39.7392`, `geo_longitude=-104.9903`
- **Response shape**: `{ entries[], has_more, next_cursor }` — each entry has an `event` object with `name`, `start_at` (UTC ISO 8601), `timezone` (IANA, e.g. `America/Denver`), `url` (short slug — prepend `https://lu.ma/`), `cover_url` (image), `geo_address_info.city`, `geo_address_info.city_state`, `geo_address_info.region`, `geo_address_info.country_code`
- **Category**: all Lu.ma events normalized to `Community` (no structured category in API response)
- **Date/time conversion**: `start_at` (UTC) converted to local date + time using `Intl`/`toLocaleDateString`+`toLocaleTimeString` with the event's `timezone` field
- **Coverage**: professional meetups, networking events, workshops — strong complement to Ticketmaster/PredictHQ

## Strict Denver-Only Filtering (added May 2026)
All three API sources apply two layers of filtering to ensure only genuine Denver events are shown:

**Ticketmaster**
- API params already include `city=Denver&stateCode=CO&countryCode=US`
- Post-fetch JS filter: drops any raw event where `venues[0].city.name` (lowercased) ≠ `"denver"` OR `venues[0].state.stateCode` (uppercased) ≠ `"CO"`

**PredictHQ**
- Radius tightened from `25mi` → `10mi` around Denver lat/lon `39.7392,-104.9903`
- Post-fetch JS filter: drops any raw event whose combined `formatted_address + locality + region` does not include `"Denver"` or `"CO"`

**Lu.ma**
- Geo params request events near `39.7392,-104.9903` (returns ~25 mi radius)
- Post-fetch JS filter: drops any raw entry where `event.geo_address_info.city` (lowercased) ≠ `"denver"`

**Deduplication priority**: Ticketmaster > PredictHQ > Lu.ma on name+date collision (TM has richest data). `mergeAndDeduplicate()` now accepts rest args (`...sources`) so all three arrays are passed in priority order.

**Filter stats display**: After each load, a `#filter-stats` element below the events header shows `"X of Y fetched events matched Denver"` where X = geo-passed count (pre-dedup), Y = total raw events from all three APIs. The existing `#event-count` badge continues to show the final count after category/date filtering.

---

### Denver Open Data Portal (retired from MVP)
- Removed: dataset `t8qm-tp6a` returned no data during initial development.

## What Has Been Built

### Completed
- [x] Single-page app: `index.html` + `style.css` + `app.js`
- [x] Ticketmaster Discovery API integration
- [x] PredictHQ API integration — fetched in parallel with Ticketmaster via `Promise.allSettled`
- [x] Lu.ma API integration — fetched in parallel via `Promise.allSettled`
- [x] Three-source merge: events sorted by date, Ticketmaster > PredictHQ > Lu.ma on name+date duplicates
- [x] Deduplication: normalized name (lowercase, alphanumeric, first 40 chars) + date as key
- [x] Source badge on each card: "Ticketmaster", "PredictHQ", or "Lu.ma"
- [x] Event card grid (responsive 1–3 col) — image, name, date/time, venue, category badge, source badge
- [x] Category filter pills: Music, Sports, Arts & Theatre, Family, Film, Community
- [x] Date range filter — client-side From/To inputs
- [x] Loading skeleton animation
- [x] Error state with retry (friendly message when API key is placeholder)
- [x] Empty state
- [x] XSS-safe rendering
- [x] Clickable cards link to Ticketmaster event page

### Planned / Not Yet Built
- [ ] Text search bar
- [ ] Pagination / load more
- [ ] Event detail modal
- [ ] Geolocation / map view
- [ ] Saved/favorited events (localStorage)

## Deployment
GitHub Pages: push to a repo, enable Pages from `main` root. Swap `YOUR_KEY_HERE` in `app.js` for your real Ticketmaster API key before pushing (note: the key will be public in client-side JS — Ticketmaster free keys are rate-limited, which is acceptable for a personal site).

## Setting Your API Key
Open `app.js` and replace the placeholder on line 1:
```js
const TICKETMASTER_API_KEY = 'YOUR_KEY_HERE';
```
