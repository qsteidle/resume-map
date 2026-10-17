import maplibregl from 'maplibre-gl';
import { store, bus, EVENTS, allJobs, jobInCategory } from '../store.js';

// Match the main map (Voyager) so the inset reads clearly as a map, not a gray box.
const STYLES = {
  light: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
};

// A small, non-interactive inset for the Athens study-abroad entry, which sits
// off the main US view. Clicking its marker flies the main map to Greece.
export function initMinimap() {
  const athens = allJobs().find((j) => j.id === 'athens');
  if (!athens) return;

  const mm = new maplibregl.Map({
    container: 'greece-minimap',
    style: STYLES[store.theme] || STYLES.light,
    center: [23.7, 38.5],
    zoom: 4.6,
    interactive: false,
    attributionControl: false,
  });
  store.minimap = mm;

  mm.on('load', () => {
    const cat = store.categories[athens.category];
    const el = document.createElement('div');
    el.className = 'map-marker minimap-marker';
    el.style.width = '34px';
    el.style.height = '34px';
    el.innerHTML = `<img class="map-marker__img" src="${cat.categoryIcon}" alt="${cat.name}">`;

    const [lat, lng] = athens.coords;
    new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([lng, lat])
      .addTo(mm);

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      bus.emit(EVENTS.JOB_SELECTED, { id: 'athens', fly: true });
    });
  });

  // Hide the inset while focused on a single experience; show it otherwise.
  bus.on(EVENTS.JOB_SELECTED, () => { focused = true; refreshMinimapVisibility(); });
  bus.on(EVENTS.JOB_DESELECTED, () => { focused = false; refreshMinimapVisibility(); });
  // Hide the inset when the active category filter excludes Athens (education) —
  // no point showing the Greece study-abroad entry under, say, an Engineering filter.
  bus.on(EVENTS.FILTER_CHANGED, ({ category }) => {
    filterAllows = jobInCategory(athens, category);
    refreshMinimapVisibility();
  });
  // Also hide it once zoomed into the US (Greece is well out of frame); the
  // inset only earns its space at the country-wide zooms where Athens is offscreen.
  store.map.on('zoom', refreshMinimapVisibility);
}

// Above this main-map zoom the Greece inset is hidden; below it, shown.
const MINIMAP_MAX_ZOOM = 9.0;
let focused = false;       // true while a single experience is selected
let filterAllows = true;   // false when the category filter excludes Athens

function refreshMinimapVisibility() {
  const zoomedIn = store.map ? store.map.getZoom() > MINIMAP_MAX_ZOOM : false;
  setMinimapOpen(!focused && !zoomedIn && filterAllows);
}

function setMinimapOpen(open) {
  store.minimapOpen = open;
  const el = document.getElementById('greece-minimap');
  if (el) el.classList.toggle('is-hidden', !open);
}
