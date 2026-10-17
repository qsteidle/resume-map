import { store, bus, EVENTS, allJobs } from './store.js';
import { setView } from './ui.js';
import { applyFilter } from './jobs.js';
import { openProjectById } from './projects.js';

let index = [];
let debounce = null;

/** Build the search index from the SAME data the app renders (jobs + real projects). */
function buildIndex() {
  index = [];
  for (const job of allJobs()) {
    const text = [
      job.title, job.company, job.location, job.period, job.description,
      job.partnerorg || '', store.categories[job.category]?.name || '',
    ].join(' ').toLowerCase();
    index.push({ id: job.id, type: 'job', title: job.title, subtitle: job.company, text });
  }
  for (const p of store.projects) {
    const text = [p.title, (p.skills || []).join(' '), p.overview].join(' ').toLowerCase();
    index.push({ id: p.id, type: 'project', title: p.title, subtitle: (p.skills || []).slice(0, 3).join(' · '), text });
  }
}

function search(query) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return index
    .map((item) => {
      const matched = terms.filter((t) => item.text.includes(t));
      return { ...item, score: matched.length, matched };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

function highlight(text, terms) {
  if (!terms?.length) return text;
  const esc = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return text.replace(new RegExp(`(${esc.join('|')})`, 'gi'), '<mark class="hl">$1</mark>');
}

function render(results) {
  const box = document.getElementById('search-results');
  if (!results.length) {
    box.innerHTML = '<div class="search-empty">No results found</div>';
  } else {
    box.innerHTML = results.slice(0, 8).map((r) => `
      <div class="search-result" data-id="${r.id}" data-type="${r.type}">
        <span class="search-result__type">${r.type === 'job' ? 'Role' : 'Project'}</span>
        <div class="search-result__title">${highlight(r.title, r.matched)}</div>
        <div class="search-result__sub">${highlight(r.subtitle, r.matched)}</div>
      </div>`).join('');
  }
  box.classList.add('is-open');
}

export function clearSearch() {
  const input = document.getElementById('search-input');
  input.value = '';
  document.getElementById('search').classList.remove('has-value');
  document.getElementById('search-results').classList.remove('is-open');
}

function handleResultClick(el) {
  const { id, type } = el.dataset;
  clearSearch();
  if (type === 'job') {
    setView('resume');
    applyFilter('all');
    requestAnimationFrame(() => bus.emit(EVENTS.JOB_SELECTED, { id, fly: true }));
  } else {
    setView('projects');
    openProjectById(id);
  }
}

export function initSearch() {
  buildIndex();
  const wrap = document.getElementById('search');
  const input = document.getElementById('search-input');
  const box = document.getElementById('search-results');
  const clearBtn = document.getElementById('search-clear');

  input.addEventListener('input', (e) => {
    const q = e.target.value.trim();
    wrap.classList.toggle('has-value', q.length > 0);
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      if (q.length >= 2) render(search(q));
      else box.classList.remove('is-open');
    }, 200);
  });

  clearBtn.addEventListener('click', () => { clearSearch(); input.focus(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') clearSearch(); });
  box.addEventListener('click', (e) => {
    const item = e.target.closest('.search-result');
    if (item) handleResultClick(item);
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#search')) box.classList.remove('is-open');
  });
}
