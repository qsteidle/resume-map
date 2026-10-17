import maplibregl from 'maplibre-gl';
import { store, bus, EVENTS, markerById, allJobs, jobInCategory, FLIGHT } from '../store.js';

/** Create a DOM emblem marker for every job (Athens is reachable on the main
 *  map too, once you fly there from the Greece inset). */
export function addJobMarkers() {
  for (const job of allJobs()) addMarker(job);
}

function addMarker(job) {
  const cat = store.categories[job.category];
  const [w, h] = cat.iconSize || [50, 50];

  const el = document.createElement('div');
  el.className = 'map-marker';
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  el.innerHTML = `<img class="map-marker__img" src="${cat.categoryIcon}" alt="${cat.name}">`;

  const [lat, lng] = job.coords;
  const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
    .setLngLat([lng, lat])
    .addTo(store.map);

  const popup = new maplibregl.Popup({ offset: h / 2, closeButton: true, maxWidth: '280px' })
    .setHTML(popupHtml(job));
  marker.setPopup(popup);

  // Marker click → select (fly + spotlight + expand card). MapLibre's own
  // setPopup handler toggles the popup on the same click.
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    bus.emit(EVENTS.JOB_SELECTED, { id: job.id, fly: true });
  });

  // User dismissing the popup deselects and flies home (guarded so it doesn't
  // loop with clearSpotlights, which closes popups after selectedJobId is cleared).
  popup.on('close', () => {
    if (store.selectedJobId === job.id) bus.emit(EVENTS.JOB_DESELECTED, { flyHome: true });
  });

  store.markers.push({ marker, el, popup, job, category: job.category, offset: [0, 0] });
}

function popupHtml(job) {
  return `<div class="popup">
      <div class="popup-job-title">${job.title}</div>
      <div class="popup-company">${job.company}</div>
      <div class="popup-location">${job.location} • ${job.period}</div>
    </div>`;
}

/** Add the pulsing highlight to a marker and open its popup. */
export function spotlightMarker(id) {
  clearSpotlights();
  const rec = markerById(id);
  if (!rec) return;
  rec.el.classList.add('map-marker--pulse');
  applyBestAnchor(rec);
  if (!rec.popup.isOpen()) rec.marker.togglePopup();
}

/** Re-evaluate the popup angle once the camera settles (marker positions on
 *  screen are only final after the flyTo `moveend`). */
export function refineMarkerPopup(id) {
  const rec = markerById(id);
  if (rec && rec.popup.isOpen()) applyBestAnchor(rec);
}

// -------------------------------------------------------------------------
// Popup placement — angle the popup so it covers as few other emblems as
// possible. When some overlap is unavoidable, prefer covering the experience
// with the OLDEST end date (least likely to matter to a viewer).
// -------------------------------------------------------------------------
const ANCHORS = ['bottom', 'top', 'left', 'right', 'bottom-left', 'bottom-right', 'top-left', 'top-right'];
// Rough popup footprint (content + padding + tip). Only used to score overlap,
// so an approximation is fine.
const POPUP_W = 220;
const POPUP_H = 96;

export function applyBestAnchor(rec) {
  const anchor = chooseAnchor(rec);
  if (!anchor) return;
  const [, mh] = store.categories[rec.job.category]?.iconSize || [50, 50];
  const g = mh / 2 + 6; // same gap chooseAnchor uses for the popup footprint
  const [dx, dy] = rec.offset || [0, 0];
  rec.popup.options.anchor = anchor;
  // Fold the emblem's pixel offset into the popup's per-anchor offset so the tip
  // lands on the offset emblem, not the empty true point.
  rec.popup.options.offset = popupOffsetObject(g, dx, dy);
  // Force MapLibre to re-lay-out with the chosen (fixed) anchor.
  if (rec.popup.isOpen()) rec.popup.setLngLat(rec.popup.getLngLat());
}

// Per-anchor pixel offset for the popup, with the marker's own pixel shift
// (dx, dy) folded in. `g` is the straight gap; diagonals use g/√2 per axis.
function popupOffsetObject(g, dx, dy) {
  const c = Math.round(g / Math.SQRT2);
  const add = (x, y) => [x + dx, y + dy];
  return {
    center: add(0, 0),
    top: add(0, g),
    bottom: add(0, -g),
    left: add(g, 0),
    right: add(-g, 0),
    'top-left': add(c, c),
    'top-right': add(-c, c),
    'bottom-left': add(c, -c),
    'bottom-right': add(-c, -c),
  };
}

function chooseAnchor(rec) {
  const map = store.map;
  if (!map) return null;
  const { width: CW, height: CH } = map.getContainer().getBoundingClientRect();

  const [lat, lng] = rec.job.coords;
  const p0 = map.project([lng, lat]);
  const off = rec.offset || [0, 0];
  const p = { x: p0.x + off[0], y: p0.y + off[1] }; // emblem's real on-screen pos
  const [, mh] = store.categories[rec.job.category]?.iconSize || [50, 50];
  const gap = mh / 2 + 6;

  // On-screen boxes for every OTHER emblem (in their real, offset positions),
  // tagged with their end date.
  const boxes = [];
  for (const other of store.markers) {
    if (other.job.id === rec.job.id) continue;
    const [la, lo] = other.job.coords;
    const q0 = map.project([lo, la]);
    const oo = other.offset || [0, 0];
    const qx = q0.x + oo[0];
    const qy = q0.y + oo[1];
    if (qx < -60 || qy < -60 || qx > CW + 60 || qy > CH + 60) continue;
    const [w, h] = store.categories[other.job.category]?.iconSize || [50, 50];
    boxes.push({
      x1: qx - w / 2, y1: qy - h / 2, x2: qx + w / 2, y2: qy + h / 2,
      end: endMillis(other.job),
    });
  }

  // Rank overlapping emblems by end date (oldest = rank 0 = cheapest to cover).
  const ends = boxes.map((b) => b.end).sort((a, b) => a - b);
  const recencyRank = (e) => Math.max(0, ends.indexOf(e));

  let best = null;
  let bestScore = Infinity;
  for (const anchor of ANCHORS) {
    const r = popupRect(anchor, p, gap);
    let score = 0;
    // Heavily penalize a popup that would spill outside the map.
    if (r.x1 < 0 || r.y1 < 0 || r.x2 > CW || r.y2 > CH) {
      score += 50000
        + Math.max(0, -r.x1) + Math.max(0, r.x2 - CW)
        + Math.max(0, -r.y1) + Math.max(0, r.y2 - CH);
    }
    // Each covered emblem costs a big base + its recency (newer costs more).
    for (const b of boxes) {
      if (intersects(r, b)) score += 1000 + recencyRank(b.end);
    }
    if (score < bestScore) { bestScore = score; best = anchor; }
  }
  return best;
}

function popupRect(anchor, p, g) {
  const W = POPUP_W;
  const H = POPUP_H;
  const d = g * 0.72; // diagonal offset component
  let x1;
  let y1;
  switch (anchor) {
    case 'bottom': x1 = p.x - W / 2; y1 = p.y - g - H; break;       // popup above
    case 'top': x1 = p.x - W / 2; y1 = p.y + g; break;             // popup below
    case 'left': x1 = p.x + g; y1 = p.y - H / 2; break;            // popup right
    case 'right': x1 = p.x - g - W; y1 = p.y - H / 2; break;       // popup left
    case 'bottom-left': x1 = p.x + d; y1 = p.y - d - H; break;     // up-right
    case 'bottom-right': x1 = p.x - d - W; y1 = p.y - d - H; break; // up-left
    case 'top-left': x1 = p.x + d; y1 = p.y + d; break;           // down-right
    default: x1 = p.x - d - W; y1 = p.y + d;                       // top-right: down-left
  }
  return { x1, y1, x2: x1 + W, y2: y1 + H };
}

function intersects(a, b) {
  return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
}

// End date → milliseconds (mirrors the list's parser; "Present" sorts newest).
function endMillis(job) {
  const raw = job['end date'];
  if (!raw) return 0;
  if (typeof raw === 'string' && /present|current/i.test(raw)) return 8.64e15;
  let m = typeof raw === 'string' && raw.match(/^(\d{2})-(\d{4})$/);
  if (m) return new Date(+m[2], +m[1] - 1).getTime();
  m = typeof raw === 'string' && raw.match(/^(\d{4})$/);
  if (m) return new Date(+m[1], 11).getTime();
  const d = new Date(raw);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

/** Show only markers in `category` (or all when 'all'); hidden ones are also
 *  skipped by the declutter pass so the fan-out only considers visible emblems. */
export function applyMarkerFilter(category) {
  store.markers.forEach((rec) => {
    const show = jobInCategory(rec.job, category);
    rec.hidden = !show;
    rec.el.style.display = show ? '' : 'none';
    if (!show && rec.popup.isOpen()) rec.marker.togglePopup();
  });
}

export function clearSpotlights() {
  store.markers.forEach((rec) => {
    rec.el.classList.remove('map-marker--pulse');
    if (rec.popup.isOpen()) rec.marker.togglePopup();
  });
}

export function flyToJob(job) {
  const [lat, lng] = job.coords;
  // Boston is dense with experiences, so zoom in a touch tighter than the default.
  const zoom = /boston/i.test(job.location || '') ? 12.5 : 11;
  // speed-paced (not fixed-duration) so a long hop like Greece stays a slow,
  // controlled pan/zoom instead of a "speed run".
  store.map.flyTo({ center: [lng, lat], zoom, ...FLIGHT });
}
