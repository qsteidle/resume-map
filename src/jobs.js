import { store, bus, EVENTS, allJobs, jobInCategory } from './store.js';
import { getVisibleJobIds } from './map/map.js';

// Map data category keys → design color slugs used by the CSS.
const CAT_SLUG = {
  sports: 'sports', engineering: 'engineering', education: 'education',
  service: 'service', 'part-time': 'parttime',
};
const slugOf = (key) => CAT_SLUG[key] || key.replace(/[^a-z]/gi, '').toLowerCase();
const nameOf = (key) => store.categories[key]?.name || key;

const CHEV = '<svg class="card__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>';

function logosHtml(job) {
  const logo = (src) => src
    ? `<img class="card__logo" src="${src}" alt="" loading="lazy" onerror="this.remove()">` : '';
  return logo(job.partnerorgIcon) + logo(job.companyIcon);
}

// -------------------------------------------------------------------------
// Filter pills
// -------------------------------------------------------------------------
export function initFilters() {
  const container = document.getElementById('filters');
  container.innerHTML = '';
  store.activeCategory = 'all';

  container.appendChild(makePill('all', 'All', true));
  for (const key of Object.keys(store.categories)) {
    container.appendChild(makePill(key, nameOf(key), false));
  }
}

function makePill(key, label, isAll) {
  const pill = document.createElement('button');
  pill.type = 'button';
  pill.className = 'pill';
  pill.dataset.cat = isAll ? 'all' : slugOf(key);
  pill.dataset.key = key;
  pill.setAttribute('aria-pressed', String(isAll));
  const icon = isAll ? '' : `<img class="pill__icon" src="${store.categories[key]?.categoryIcon || ''}" alt="" onerror="this.remove()">`;
  pill.innerHTML = icon + `<span>${label}</span>`;
  pill.addEventListener('click', () => applyFilter(key));
  return pill;
}

export function applyFilter(key) {
  store.activeCategory = key;
  document.querySelectorAll('#filters .pill').forEach((p) =>
    p.setAttribute('aria-pressed', String(p.dataset.key === key)));
  bus.emit(EVENTS.FILTER_CHANGED, { category: key });
  renderJobList();
}

// -------------------------------------------------------------------------
// "Experiences in View" list
// -------------------------------------------------------------------------
export function initJobs() {
  bus.on(EVENTS.VIEW_CHANGED, renderJobList);
  bus.on(EVENTS.JOB_SELECTED, ({ id }) => {
    store.selectedJobId = id;
    expandSelectedCard();
  });
  bus.on(EVENTS.JOB_DESELECTED, () => {
    store.selectedJobId = null;
    collapseAllCards();
  });
}

function visibleFilteredJobs() {
  const ids = new Set(getVisibleJobIds());
  let jobs = allJobs().filter((j) => ids.has(j.id));
  if (store.activeCategory !== 'all') jobs = jobs.filter((j) => jobInCategory(j, store.activeCategory));
  return jobs.sort((a, b) => parseEndDate(b) - parseEndDate(a));
}

export function renderJobList() {
  const list = document.getElementById('exp-list');
  const num = document.getElementById('exp-num');
  const lbl = document.getElementById('exp-lbl');
  if (!list) return;

  const jobs = visibleFilteredJobs();
  if (num) num.textContent = String(jobs.length);
  if (lbl) lbl.textContent = `position${jobs.length !== 1 ? 's' : ''} in view`;

  list.innerHTML = '';
  if (jobs.length === 0) {
    const anyVisible = getVisibleJobIds().length > 0;
    const empty = document.createElement('div');
    empty.className = 'exp-empty';
    empty.textContent = anyVisible
      ? 'No positions match this filter.'
      : 'Zoom or pan the map to see positions in view.';
    list.appendChild(empty);
    return;
  }

  jobs.forEach((job) => list.appendChild(createJobElement(job)));
  expandSelectedCard();
}

function createJobElement(job) {
  const el = document.createElement('article');
  el.className = 'card';
  el.dataset.cat = slugOf(job.category);
  el.dataset.jobId = job.id;
  el.innerHTML = `
    <button class="card__btn" type="button">
      <span class="card__rail"></span>
      <div class="card__info">
        <div class="card__title">${job.title}</div>
        <div class="card__company">${job.company}</div>
        <div class="card__meta"><span>${job.location}</span><span class="sep">·</span><span>${job.period}</span></div>
      </div>
      <div class="card__logos">${logosHtml(job)}</div>
      ${CHEV}
    </button>
    <div class="card__detail"><div class="card__detail-inner"><p>${job.description}</p></div></div>`;

  el.querySelector('.card__btn').addEventListener('click', (e) => {
    e.stopPropagation();
    if (store.selectedJobId === job.id) bus.emit(EVENTS.JOB_DESELECTED, { flyHome: true });
    else bus.emit(EVENTS.JOB_SELECTED, { id: job.id, fly: true });
  });
  return el;
}

function expandSelectedCard() {
  const id = store.selectedJobId;
  document.querySelectorAll('.card').forEach((el) => {
    const match = el.dataset.jobId === id;
    el.classList.toggle('is-open', match);
    el.classList.toggle('is-highlight', match);
    if (match) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

function collapseAllCards() {
  document.querySelectorAll('.card.is-open, .card.is-highlight')
    .forEach((el) => el.classList.remove('is-open', 'is-highlight'));
}

// -------------------------------------------------------------------------
// Reverse-chronological sort (handles MM-YYYY, YYYY, Present)
// -------------------------------------------------------------------------
function parseEndDate(job) {
  const raw = job['end date'];
  if (!raw) return new Date(0);
  if (typeof raw === 'string' && /present|current/i.test(raw)) return new Date();
  let m = typeof raw === 'string' && raw.match(/^(\d{2})-(\d{4})$/);
  if (m) return new Date(+m[2], +m[1] - 1);
  m = typeof raw === 'string' && raw.match(/^(\d{4})$/);
  if (m) return new Date(+m[1], 11);
  const d = new Date(raw);
  return isNaN(d.getTime()) ? new Date(0) : d;
}
