# Denver Events Aggregator

## Project Purpose
A personal MVP single-page web app that aggregates and displays upcoming events in Denver, CO. Zero backend, deployable to GitHub Pages. Clean filterable event board sourced from the Ticketmaster Discovery API.

## Visual Design (as of Nov 2026)
Luxury editorial magazine aesthetic — high-end fashion meets city nightlife guide.
- **Color palette**: Deep dusty rose `#1a0a0f` background, `#2d1520` cards, hot pink `#ff2d78` accent, blush `#ffb3c6` secondary, dark filter bar `#3d1f2d`
- **Typography**: Playfair Display (900/700) for logo + headings; DM Sans (400/500/700) for body — loaded via Google Fonts in `index.html`
- **Header**: Aerial downtown Denver sunset photo (`assets/header.jpg`, 2400×1600px, ~800KB, user-chosen — Unsplash, photographer Acton Crawford; original 5469×3646 kept on user's Desktop, not in repo) under a light pink tint + darkening overlay (`rgba(255,45,120,0.14)` → `rgba(26,10,15,0.50)` → `rgba(26,10,15,0.94)`), `center 20%`, header min-height 480px; SVG fractalNoise texture via `::before`; logo 6.5rem with hot-pink glow on "Events"
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
├── index.html           # App shell, semantic HTML
├── style.css            # All styles — CSS custom properties, responsive grid, card images
├── app.js               # Data fetching, normalization, filtering, rendering
├── assets/
│   └── header.jpg          # Header background (2400×1600px, user-chosen photo)
├── luma-events.json     # Static Lu.ma event cache (refreshed daily via GitHub Action)
└── CLAUDE.md            # This file
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
- **Auth**: Bearer token — **active and configured** in `app.js` as `PREDICTHQ_TOKEN`. Token replaced Sep 2026 after previous token expired.
- **Query params**: `location_around.origin=39.7392,-104.9903`, `location_around.offset=25mi`, `country=US`, `state=active`, `sort=start`, `limit=50`, `start.gte` (dynamic today's date)
- **Response shape**: `results[]` — each has `title`, `start_local`, `category`, `geo.address`, `start_local`
- **Category mapping**: concerts→Music, performing-arts→Arts & Theatre, sports→Sports, family→Family, film→Film, festivals/community/expos/conferences/food-drink-festival→Community
- **Coverage**: ~5,000 Denver-area events — community events, festivals, conferences, food markets, sports
- **Docs**: https://docs.predicthq.com/

### Lu.ma (active — served from static cache)
- **Direct API**: `https://api.lu.ma/discover/get-paginated-events` — unauthenticated, but CORS-restricted to `https://lu.ma` only; direct browser fetches from GitHub Pages are blocked
- **How it works**: A GitHub Actions workflow (`.github/workflows/fetch-luma-events.yml`) fetches Lu.ma events server-side once daily and writes `luma-events.json` to the repo root. `app.js` reads that static file instead of calling the API directly, bypassing the CORS restriction entirely.
- **Static cache file**: `luma-events.json` — shape: `{ fetchedAt, rawCount, entries[] }` where `entries` are already filtered to Denver-only (`geo_address_info.city === "denver"`)
- **Schedule**: daily at 8am MDT (14:00 UTC) / 7am MST via cron `0 14 * * *`; also triggerable manually from the GitHub Actions tab (`workflow_dispatch`)
- **Query params used by action**: `pagination_limit=50`, `geo_latitude=39.7392`, `geo_longitude=-104.9903`
- **Response shape**: each entry has an `event` object with `name`, `start_at` (UTC ISO 8601), `timezone` (IANA), `url` (short slug — prepend `https://lu.ma/`), `cover_url` (image), `geo_address_info.city`, `geo_address_info.city_state`
- **Category**: all Lu.ma events normalized to `Community`
- **Date/time**: `start_at` (UTC) converted to local date + time via `Intl` using the event's `timezone` field
- **Coverage**: professional meetups, networking events, workshops

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
- [x] Lu.ma integration via daily GitHub Action pre-fetch → `luma-events.json` (bypasses CORS restriction)
- [x] Three-source merge: events sorted by date, Ticketmaster > PredictHQ > Lu.ma on name+date duplicates
- [x] Deduplication: normalized name (lowercase, alphanumeric, first 40 chars) + date as key
- [x] Source badge on each card: "Ticketmaster", "PredictHQ", or "Lu.ma"
- [x] Event card grid (responsive 1–3 col) — image, name, date/time, venue, category badge, source badge
- [x] Category filter pills: multi-select (Music, Sports, Arts & Theatre, Family, Film, Community — any combination)
- [x] Keyword filter with Show-only / Hide toggle — matches against event name
- [x] Date range filter — client-side From/To inputs
- [x] Filter state persisted to `localStorage` (key: `denver-events-filters`) and restored on page load
- [x] "Clear all filters" button — resets all filters and localStorage
- [x] Loading skeleton animation
- [x] Error state with retry (friendly message when API key is placeholder)
- [x] Empty state
- [x] XSS-safe rendering
- [x] Clickable cards link to Ticketmaster event page

## Filter System

### Category pills (multi-select)
`activeCategories` is a `Set<string>`. An empty set means "show all" (equivalent to the old "All"). Clicking a non-active pill adds it; clicking an active pill removes it; clicking "All" clears the set. `syncCategoryPills()` keeps the pill UI in sync with state.

### Keyword filter
State: `keyword` (string) and `keywordMode` (`'show' | 'hide'`).
- **Show only**: hides every event whose `name` does NOT include the keyword (case-insensitive).
- **Hide**: hides every event whose `name` DOES include the keyword.
The mode toggle button cycles between the two states; `syncKeywordModeBtn()` updates its text and CSS class (`mode-show` / `mode-hide`).

### Persistence
`saveFilters()` serialises `{activeCategories, keyword, keywordMode, dateFrom, dateTo}` to `localStorage` on every `applyFilters()` call. `loadFilters()` restores state at `DOMContentLoaded` before `init()` runs. Filter state is therefore preserved across page reloads. The "Clear all filters" button resets all state to defaults (empty set, empty strings, `'show'` mode) and the next `saveFilters()` call overwrites localStorage with the clean defaults.

### Planned / Not Yet Built
- [ ] Pagination / load more
- [ ] Event detail modal
- [ ] Geolocation / map view

## Roadmap / Future Work

### Recurring events
Add recurring Denver events that don't appear in Ticketmaster/PredictHQ/Lu.ma — e.g. farmers markets, weekly open mics, regular club nights. These would need to be pulled or curated from other sources (city websites, Eventbrite, local blogs) and possibly maintained as a hand-curated static JSON file in the repo.

### Free events flagging
Add a way to identify and surface free events. Could be a "Free" filter pill and a badge on event cards. Sources would need to expose price/cost data; Ticketmaster includes `priceRanges[]` — events with no price ranges or a `$0` minimum could be auto-flagged. PredictHQ does not reliably expose pricing.

### Free days at Denver public places
Maintain a static list of Denver institutions that have periodic free admission days (e.g. Denver Art Museum first Saturdays, Denver Museum of Nature & Science, Botanic Gardens, etc.) and surface those on the relevant dates. Would live as a hand-maintained JSON or JS array since these schedules don't come from an API.

### Secure the API keys
The Ticketmaster and PredictHQ keys are currently hardcoded in `app.js` lines 1–2, and the GitHub repo is public — anyone can read them. Plan to fix this by:

1. **Move API calls behind a small free proxy** — a Cloudflare Worker (free tier) that holds the keys as environment secrets and forwards requests to Ticketmaster and PredictHQ. `app.js` would call the Worker URL instead of the APIs directly.
2. **Rotate the exposed keys** — after the proxy is in place, generate new keys for both services and discard the old ones, since they have been publicly visible in git history.
3. **Audit the repo** — checked as of Nov 2026: `CLAUDE.md`, `index.html`, `style.css`, and `.github/` contain no actual key values (only variable name references and the `YOUR_KEY_HERE` placeholder). The live keys live only in `app.js`.

### Other planned items
- **Weekly email digest** — send a curated list of upcoming Denver events to subscribers (would require a backend or a service like Buttondown/Mailchimp)
- **More event sources** — evaluate Eventbrite, Denver city calendar, Meetup.com, AXS, local venue scrapers
- **Weekly Lu.ma refresh** — the GitHub Action is IP-blocked by Azure; the manual workaround is `bash scripts/update-luma.sh` from a residential IP once a week or as needed

## Deployment
GitHub Pages: push to a repo, enable Pages from `main` root. Swap `YOUR_KEY_HERE` in `app.js` for your real Ticketmaster API key before pushing (note: the key will be public in client-side JS — Ticketmaster free keys are rate-limited, which is acceptable for a personal site).

## Setting Your API Key
Open `app.js` and replace the placeholder on line 1:
```js
const TICKETMASTER_API_KEY = 'YOUR_KEY_HERE';
```
