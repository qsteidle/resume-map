import maplibregl from 'maplibre-gl';
import { store, bus, EVENTS, allJobs, FLIGHT } from '../store.js';
import {
  addJobMarkers, spotlightMarker, clearSpotlights, flyToJob, refineMarkerPopup, applyMarkerFilter,
} from './markers.js';
import { initMinimap } from './minimap.js';
import { addExtras } from './extras.js';
import { relayoutMarkers, relayoutMarkersLive } from './declutter.js';

// CARTO free vector GL styles — no API key. Voyager ≈ the old raster look.
const STYLES = {
  light: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
};

// Viewport padding when fitting all experiences (extra on the right for the
// top-right controls, extra on top for the emblem overhang).
const HOME_PAD = { top: 72, right: 90, bottom: 55, left: 55 };

export function initMap() {
  const map = new maplibregl.Map({
    container: 'map',
    style: STYLES[store.theme] || STYLES.light,
    center: store.initialCenter,
    zoom: store.initialZoom,
    minZoom: 2.5,
    maxZoom: 17,
    attributionControl: false, // hide the MapLibre "ⓘ" attribution popup
  });
  store.map = map;

  map.on('load', () => {
    addJobMarkers();
    addExtras();
    initMinimap();
    store.homeBounds = computeHomeBounds();
    if (store.homeBounds) map.fitBounds(store.homeBounds, { padding: HOME_PAD, duration: 0, maxZoom: 6 });
    relayoutMarkers(); // fan out coincident emblems for the initial view
    updateCoord();
    bus.emit(EVENTS.VIEW_CHANGED);
  });

  map.on('move', () => {
    updateCoord();
    relayoutMarkersLive(); // keep emblems decluttered throughout a flyTo (no end-snap)
  });
  map.on('moveend', () => {
    relayoutMarkers(); // final settle + re-anchor the open popup
    bus.emit(EVENTS.VIEW_CHANGED);
    if (store.selectedJobId) refineMarkerPopup(store.selectedJobId);
  });

  // Clicking empty map (markers live in their own DOM layer) deselects.
  map.on('click', () => {
    if (store.selectedJobId) bus.emit(EVENTS.JOB_DESELECTED);
  });

  // The design's map controls (styled to match the shell).
  document.querySelectorAll('#mapfield .mapctrl').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.map;
      if (action === 'in') map.zoomIn();
      else if (action === 'out') map.zoomOut();
      else if (action === 'home') flyHome();
    });
  });

  // Cross-module wiring via the event bus.
  bus.on(EVENTS.JOB_SELECTED, ({ id, fly }) => {
    spotlightMarker(id);
    if (fly) {
      const job = allJobs().find((j) => j.id === id);
      if (job) {
        flyToJob(job);
        // Positions on screen are only final once the camera settles.
        map.once('moveend', () => refineMarkerPopup(id));
      }
    }
  });
  bus.on(EVENTS.JOB_DESELECTED, (payload) => {
    clearSpotlights();
    if (payload?.flyHome) flyToHomeView();
  });
  bus.on(EVENTS.FILTER_CHANGED, ({ category }) => {
    applyMarkerFilter(category);
    relayoutMarkers(); // re-fan visible emblems now that some are hidden
  });
  bus.on(EVENTS.THEME_CHANGED, ({ theme }) => applyTheme(theme));
  bus.on(EVENTS.TAB_CHANGED, ({ tab }) => {
    if (tab === 'resume') requestAnimationFrame(() => map.resize());
  });

  return map;
}

function updateCoord() {
  const el = document.getElementById('map-coord');
  if (!el || !store.map) return;
  const c = store.map.getCenter();
  const lat = c.lat.toFixed(2);
  const lng = c.lng.toFixed(2).replace('-', '−'); // typographic minus
  el.textContent = `${lat}, ${lng} · z${store.map.getZoom().toFixed(1)}`;
}

/** Bounds covering all US experiences (Athens stays in the Greece inset). */
function computeHomeBounds() {
  const b = new maplibregl.LngLatBounds();
  let any = false;
  for (const job of allJobs()) {
    if (job.id === 'athens') continue;
    const [lat, lng] = job.coords;
    b.extend([lng, lat]);
    any = true;
  }
  return any ? b : null;
}

/** Job ids currently inside the viewport (+ Athens while the Greece inset is open). */
export function getVisibleJobIds() {
  const map = store.map;
  if (!map) return [];
  const bounds = map.getBounds();
  const ids = [];
  for (const job of allJobs()) {
    const [lat, lng] = job.coords;
    if (job.id === 'athens' && store.minimapOpen) ids.push(job.id);
    else if (bounds.contains([lng, lat])) ids.push(job.id);
  }
  return ids;
}

// Home button: clear any selection AND fly back to the fitted home view.
export function flyHome() {
  bus.emit(EVENTS.JOB_DESELECTED, { flyHome: true });
}

function flyToHomeView() {
  const map = store.map;
  if (store.homeBounds) {
    const cam = map.cameraForBounds(store.homeBounds, { padding: HOME_PAD, maxZoom: 6 });
    if (cam) {
      map.flyTo({ center: cam.center, zoom: cam.zoom, ...FLIGHT });
      return;
    }
  }
  map.flyTo({ center: store.initialCenter, zoom: store.initialZoom, ...FLIGHT });
}

function applyTheme(theme) {
  const styleUrl = STYLES[theme] || STYLES.light;
  const map = store.map;
  map.setStyle(styleUrl);
  map.once('styledata', () => addExtras()); // custom layers are wiped by setStyle
  if (store.minimap) store.minimap.setStyle(styleUrl);
}
