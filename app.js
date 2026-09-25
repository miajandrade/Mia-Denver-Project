const TICKETMASTER_API_KEY = 'h7RuuPhK1lwRyRqciogdVfxmAxwTTLIJ';
const PREDICTHQ_TOKEN     = 'R2-fr5jpUT0t9Oy-_mS66OqNlWoUnWFsrnT8tUZf';

const TM_BASE   = 'https://app.ticketmaster.com/discovery/v2/events.json';
const PHQ_BASE  = 'https://api.predicthq.com/v1/events/';
const LUMA_BASE = 'https://api.lu.ma/discover/get-paginated-events';
const PAGE_SIZE = 50;

// ── Category config ───────────────────────────────────

const CATEGORIES = ['All', 'Music', 'Sports', 'Arts & Theatre', 'Family', 'Film', 'Community'];

const BADGE_CLASS = {
  'Music':          'badge-music',
  'Sports':         'badge-sports',
  'Arts & Theatre': 'badge-arts',
  'Family':         'badge-family',
  'Film':           'badge-film',
  'Community':      'badge-community',
};

const CATEGORY_ICON = {
  'Music':          '🎵',
  'Sports':         '🏟️',
  'Arts & Theatre': '🎭',
  'Family':         '👨‍👩‍👧',
  'Film':           '🎬',
  'Community':      '🤝',
};

// PredictHQ category string → our display category
const PHQ_CATEGORY_MAP = {
  'concerts':            'Music',
  'performing-arts':     'Arts & Theatre',
  'sports':              'Sports',
  'family':              'Family',
  'film':                'Film',
  'festivals':           'Community',
  'community':           'Community',
  'expos':               'Community',
  'conferences':         'Community',
  'food-drink-festival': 'Community',
};

// ── State ─────────────────────────────────────────────

let allEvents = [];
let activeCategory = 'All';
let dateFrom = '';
let dateTo = '';

// ── XSS safety ───────────────────────────────────────

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// ── Ticketmaster ──────────────────────────────────────

async function fetchTicketmaster() {
  const startDateTime = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const params = new URLSearchParams({
    apikey:        TICKETMASTER_API_KEY,
    city:          'Denver',
    stateCode:     'CO',
    countryCode:   'US',
    size:          String(PAGE_SIZE),
    sort:          'date,asc',
    startDateTime,
  });
  const res = await fetch(`${TM_BASE}?${params}`);
  if (!res.ok) throw new Error(`TM HTTP ${res.status}`);
  const data = await res.json();
  const raw = data?._embedded?.events ?? [];
  const filtered = raw.filter(ev => {
    const city  = (ev._embedded?.venues?.[0]?.city?.name ?? '').toLowerCase();
    const state = (ev._embedded?.venues?.[0]?.state?.stateCode ?? '').toUpperCase();
    return city === 'denver' && state === 'CO';
  });
  return { events: filtered.map(normalizeTM), rawCount: raw.length };
}

function normalizeTM(raw) {
  const start    = raw.dates?.start;
  const segment  = raw.classifications?.[0]?.segment?.name ?? '';
  const category = CATEGORIES.includes(segment) ? segment : 'Other';
  const image    = (raw.images ?? [])
    .filter(img => img.ratio === '16_9')
    .sort((a, b) => b.width - a.width)[0]?.url ?? null;

  return {
    name:      raw.name || 'Unnamed Event',
    localDate: start?.localDate ?? null,
    localTime: start?.localTime ?? null,
    venueName: raw._embedded?.venues?.[0]?.name ?? 'Denver, CO',
    category,
    image,
    ticketUrl: raw.url ?? null,
    source:    'Ticketmaster',
  };
}

// ── PredictHQ ─────────────────────────────────────────

async function fetchPredictHQ() {
  const today = new Date().toISOString().slice(0, 10);
  const params = new URLSearchParams({
    'location_around.origin': '39.7392,-104.9903',
    'location_around.offset': '10mi',
    country:     'US',
    state:       'active',
    sort:        'start',
    limit:       String(PAGE_SIZE),
    'start.gte': today,
  });
  const res = await fetch(`${PHQ_BASE}?${params}`, {
    headers: {
      Authorization: `Bearer ${PREDICTHQ_TOKEN}`,
      Accept:        'application/json',
    },
  });
  if (!res.ok) throw new Error(`PHQ HTTP ${res.status}`);
  const data = await res.json();
  const raw = data.results ?? [];
  const filtered = raw.filter(ev => {
    const addr  = ev.geo?.address ?? {};
    const label = [addr.formatted_address, addr.locality, addr.region].filter(Boolean).join(' ');
    return label.includes('Denver') || label.includes('CO');
  });
  return { events: filtered.map(normalizePHQ).filter(Boolean), rawCount: raw.length };
}

function normalizePHQ(raw) {
  // Drop any non-US events that slip through the geo filter
  const countryCode = raw.geo?.address?.country_code;
  if (countryCode && countryCode !== 'US') return null;

  const startLocal = raw.start_local ?? raw.start ?? '';
  const tIdx = startLocal.indexOf('T');
  const localDate = tIdx > 0 ? startLocal.slice(0, tIdx) : startLocal.slice(0, 10) || null;
  const localTime = tIdx > 0 ? startLocal.slice(tIdx + 1, tIdx + 6) + ':00' : null;

  const addr      = raw.geo?.address;
  const venueName = addr?.locality ?? addr?.formatted_address ?? 'Denver, CO';
  const category  = PHQ_CATEGORY_MAP[raw.category] ?? 'Community';

  return {
    name:      raw.title || 'Unnamed Event',
    localDate,
    localTime,
    venueName,
    category,
    image:     null,
    ticketUrl: null,
    source:    'PredictHQ',
  };
}

// ── Lu.ma ─────────────────────────────────────────────

async function fetchLuma() {
  const params = new URLSearchParams({
    pagination_limit: String(PAGE_SIZE),
    geo_latitude:  '39.7392',
    geo_longitude: '-104.9903',
  });
  const res = await fetch(`${LUMA_BASE}?${params}`);
  if (!res.ok) throw new Error(`Lu.ma HTTP ${res.status}`);
  const data = await res.json();
  const raw = data.entries ?? [];
  const filtered = raw.filter(entry => {
    const city = (entry.event?.geo_address_info?.city ?? '').toLowerCase();
    return city === 'denver';
  });
  return { events: filtered.map(normalizeLuma), rawCount: raw.length };
}

function normalizeLuma(entry) {
  const ev = entry.event;
  const tz = ev.timezone || 'America/Denver';
  const d  = new Date(ev.start_at);

  const localDate = d.toLocaleDateString('en-CA', { timeZone: tz });
  const localTime = d.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }) + ':00';

  const geo       = ev.geo_address_info || {};
  const venueName = geo.city_state || geo.city || 'Denver, CO';
  const ticketUrl = ev.url ? `https://lu.ma/${ev.url}` : null;

  return {
    name:      ev.name || 'Unnamed Event',
    localDate,
    localTime,
    venueName,
    category:  'Community',
    image:     ev.cover_url || null,
    ticketUrl,
    source:    'Lu.ma',
  };
}

// ── Deduplication ─────────────────────────────────────
// Priority: Ticketmaster > PredictHQ > Lu.ma on name+date collision

function dedupKey(event) {
  const nameKey = (event.name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 40);
  return `${nameKey}|${event.localDate ?? ''}`;
}

function mergeAndDeduplicate(...sources) {
  const seen = new Map();
  for (const events of sources) {
    for (const e of events) {
      const k = dedupKey(e);
      if (!seen.has(k)) seen.set(k, e);
    }
  }
  return [...seen.values()].sort((a, b) => {
    const da = a.localDate ?? '9999', db = b.localDate ?? '9999';
    return da < db ? -1 : da > db ? 1 : 0;
  });
}

// ── Date / time formatting ────────────────────────────

function formatDate(localDate, localTime) {
  if (!localDate) return 'Date TBD';
  const d = new Date(`${localDate}T${localTime || '00:00:00'}`);
  const dateStr = d.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
  if (!localTime) return dateStr;
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${dateStr} · ${timeStr}`;
}

// ── Rendering ─────────────────────────────────────────

function renderSkeletons() {
  document.getElementById('events-grid').innerHTML = Array(6).fill(`
    <div class="event-card skeleton" aria-hidden="true">
      <div class="skeleton-img"></div>
      <div class="skeleton-body">
        <div class="skeleton-line" style="width:28%"></div>
        <div class="skeleton-line" style="width:88%;height:18px;margin-top:4px"></div>
        <div class="skeleton-line" style="width:62%"></div>
        <div class="skeleton-line" style="width:72%"></div>
      </div>
    </div>
  `).join('');
  setCount('Loading…');
}

function renderError(msg) {
  document.getElementById('events-grid').innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">⚠️</div>
      <h3>Couldn't load events</h3>
      <p>${msg}</p>
      <button class="retry-btn" onclick="init()">Try again</button>
    </div>
  `;
  setCount('—');
}

function renderEvents(events) {
  const grid = document.getElementById('events-grid');

  if (events.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🏔️</div>
        <h3>No events found</h3>
        <p>Try a different category or date range.</p>
      </div>
    `;
    setCount('0 events');
    return;
  }

  grid.innerHTML = events.map(event => {
    const badgeClass  = BADGE_CLASS[event.category] ?? 'badge-other';
    const sourceClass = event.source === 'Ticketmaster' ? 'source-tm'
                     : event.source === 'Lu.ma'         ? 'source-luma'
                     : 'source-phq';
    const dateStr     = formatDate(event.localDate, event.localTime);
    const href        = event.ticketUrl ? esc(event.ticketUrl) : '#';

    const imageEl = event.image
      ? `<img class="event-card__image" src="${esc(event.image)}" alt="${esc(event.name)}" loading="lazy">`
      : `<div class="event-card__image-placeholder">${CATEGORY_ICON[event.category] ?? '📅'}</div>`;

    return `
      <a class="event-card" href="${href}" target="_blank" rel="noopener noreferrer" role="listitem">
        ${imageEl}
        <div class="event-card__header">
          <span class="category-badge ${badgeClass}">${esc(event.category)}</span>
          <span class="source-badge ${sourceClass}">${esc(event.source)}</span>
        </div>
        <div class="event-card__body">
          <h3 class="event-card__title">${esc(event.name)}</h3>
          <div class="event-card__meta">
            <div class="meta-row">
              <span class="meta-icon" aria-hidden="true">📅</span>
              <span>${esc(dateStr)}</span>
            </div>
            <div class="meta-row">
              <span class="meta-icon" aria-hidden="true">📍</span>
              <span>${esc(event.venueName)}</span>
            </div>
          </div>
        </div>
      </a>
    `;
  }).join('');

  setCount(`${events.length} event${events.length !== 1 ? 's' : ''}`);
}

function setCount(text) {
  const el = document.getElementById('event-count');
  if (el) el.textContent = text;
}

function setFilterStats(totalFetched, geoPassed) {
  const el = document.getElementById('filter-stats');
  if (el) el.textContent = `${geoPassed} of ${totalFetched} fetched events matched Denver`;
}

// ── Category pills ────────────────────────────────────

function wireCategoryPills() {
  document.getElementById('category-filters')
    .querySelectorAll('.category-pill')
    .forEach(btn => {
      btn.addEventListener('click', () => {
        activeCategory = btn.dataset.category;
        document.querySelectorAll('.category-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyFilters();
      });
    });
}

// ── Client-side filter ────────────────────────────────

function applyFilters() {
  const filtered = allEvents.filter(event => {
    if (activeCategory !== 'All' && event.category !== activeCategory) return false;
    if (event.localDate) {
      if (dateFrom && event.localDate < dateFrom) return false;
      if (dateTo   && event.localDate > dateTo)   return false;
    }
    return true;
  });
  renderEvents(filtered);
}

// ── Init ──────────────────────────────────────────────

async function init() {
  renderSkeletons();
  activeCategory = 'All';
  document.querySelectorAll('.category-pill').forEach(b => {
    b.classList.toggle('active', b.dataset.category === 'All');
  });

  const [tmResult, phqResult, lumaResult] = await Promise.allSettled([
    fetchTicketmaster(),
    fetchPredictHQ(),
    fetchLuma(),
  ]);

  const tmData   = tmResult.status   === 'fulfilled' ? tmResult.value   : { events: [], rawCount: 0 };
  const phqData  = phqResult.status  === 'fulfilled' ? phqResult.value  : { events: [], rawCount: 0 };
  const lumaData = lumaResult.status === 'fulfilled' ? lumaResult.value : { events: [], rawCount: 0 };

  if (tmResult.status   === 'rejected') console.warn('[Ticketmaster]', tmResult.reason);
  if (phqResult.status  === 'rejected') console.warn('[PredictHQ]',   phqResult.reason);
  if (lumaResult.status === 'rejected') console.warn('[Lu.ma]',       lumaResult.reason);

  if (tmData.events.length === 0 && phqData.events.length === 0 && lumaData.events.length === 0) {
    renderError('All event sources failed to load. Check your connection and try again.');
    return;
  }

  allEvents = mergeAndDeduplicate(tmData.events, phqData.events, lumaData.events);
  setFilterStats(
    tmData.rawCount + phqData.rawCount + lumaData.rawCount,
    tmData.events.length + phqData.events.length + lumaData.events.length,
  );
  applyFilters();
}

document.addEventListener('DOMContentLoaded', () => {
  wireCategoryPills();
  document.getElementById('date-from').addEventListener('change', e => {
    dateFrom = e.target.value;
    applyFilters();
  });
  document.getElementById('date-to').addEventListener('change', e => {
    dateTo = e.target.value;
    applyFilters();
  });
  init();
});
