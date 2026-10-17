import 'maplibre-gl/dist/maplibre-gl.css';
import './styles/style.css';

import { store } from './store.js';
import { loadData } from './data.js';
import { initUI } from './ui.js';
import { initFilters, initJobs } from './jobs.js';
import { initSearch } from './search.js';
import { initMap } from './map/map.js';

async function boot() {
  try {
    await loadData();

    initUI();
    initFilters();
    initJobs(); // register selection listeners BEFORE the map's
    initSearch();
    initMap();

    document.getElementById('loading')?.classList.add('is-hidden');
  } catch (err) {
    console.error('Failed to load resume data:', err);
    showError();
  }
}

function showError() {
  const loading = document.getElementById('loading');
  if (loading) {
    loading.innerHTML = `<div style="max-width:420px;text-align:center;padding:24px">
      <h3 style="margin-bottom:8px">Couldn't load resume data</h3>
      <p style="color:var(--ink-2);font-size:.875rem">Run a dev server (<code>npm run dev</code>) so jobs.json / projects.json are reachable.</p>
    </div>`;
  }
}

document.addEventListener('DOMContentLoaded', boot);
window.addEventListener('beforeunload', () => store?.map?.remove?.());
