// Central mutable state + a tiny event bus.
// Replaces the old grab-bag of globals and the setTimeout choreography in script.js.

export const store = {
  // Data
  categories: {},          // { key: { name, categoryIcon, iconSize, anchorLocation } }
  jobData: {},             // { categoryKey: [job, ...] }
  projects: [],            // [ project, ... ]

  // Map
  map: null,               // main MapLibre map
  minimap: null,           // Greece inset map
  markers: [],             // [ { marker, job, category } ]  (marker = maplibregl.Marker)
  initialCenter: [-94.5795, 37.8283], // [lng, lat] — note MapLibre order
  initialZoom: 3.4,

  // UI
  activeCategory: 'all',   // current filter ('all' or a category key)
  minimapOpen: true,
  theme: 'light',
};

// --- Minimal pub/sub -------------------------------------------------------
const listeners = new Map();

export const bus = {
  on(event, cb) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(cb);
    return () => listeners.get(event)?.delete(cb);
  },
  emit(event, payload) {
    listeners.get(event)?.forEach((cb) => cb(payload));
  },
};

// Shared camera-flight tuning, used for both flying to an experience and back home.
//   speed — scales duration by distance (lower = slower).
//   curve — how far the camera zooms out mid-flight (1.42 = MapLibre default arc;
//           lower flattens it toward a straight pan/zoom, so long hops like Greece
//           glide instead of lurching way out and back).
export const FLIGHT = { speed: 1.5, curve: 1.1 };

// Event names used across modules.
export const EVENTS = {
  VIEW_CHANGED: 'view:changed',       // map moved/zoomed → refresh job list
  FILTER_CHANGED: 'filter:changed',   // category filter toggled
  JOB_SELECTED: 'job:selected',       // { id } — from list or search
  JOB_DESELECTED: 'job:deselected',   // clear spotlights / collapse
  THEME_CHANGED: 'theme:changed',     // { theme }
  TAB_CHANGED: 'tab:changed',         // { tab }
};

/** Flatten jobData into a single array, tagging each job with its category key. */
export function allJobs() {
  return Object.entries(store.jobData).flatMap(([category, jobs]) =>
    jobs.map((job) => ({ ...job, category }))
  );
}

/** Look up a registered marker record by job id. */
export function markerById(id) {
  return store.markers.find((m) => m.job.id === id);
}

/**
 * Does a job belong to `cat`? True for 'all', the job's primary category, or any
 * of its `secondaryCategories` (e.g. a Red Sox sports role that also counts as
 * engineering). Used by the experiences list, marker filter, and minimap.
 */
export function jobInCategory(job, cat) {
  if (cat === 'all') return true;
  if (job.category === cat) return true;
  const alt = job.secondaryCategories;
  return Array.isArray(alt) && alt.includes(cat);
}
