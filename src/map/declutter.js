// Screen-space marker decluttering.
//
// Experiences in the same city share (near-)identical coordinates, so their DOM
// emblems render on top of each other. This fans each colliding group of markers
// onto a tight circle around the group centroid, so every emblem stays visible
// with a distinct center (overlap is never concentric) and none is pushed far
// from its true spot. Offsets are applied via MapLibre's `marker.setOffset`,
// which keeps each marker anchored to its true lng/lat. Grouping uses a tight
// threshold so only genuinely-coincident same-city markers stack — neighbouring
// cities/states stay independent.
//
// Recomputed on every `move` frame (via relayoutMarkersLive) so the fan tracks
// the camera throughout a flyTo — no end-of-flight snap — and re-anchors open
// popups once on `moveend` (relayoutMarkers).

import { store } from '../store.js';
import { applyBestAnchor } from './markers.js';

// --- Tunables --------------------------------------------------------------
// Grouping: two emblems stack only when their centers are within
// GROUP_FACTOR * avgDiameter + GROUP_PAD px. A tight threshold keeps distinct
// cities (PA / MD / MA) apart while still catching true same-city overlaps.
const GROUP_FACTOR = 0.1;
const GROUP_PAD = 2;
const FAN_PAD = 8;                 // px term feeding the fan radius
const START_ANGLE = -Math.PI / 2;  // first fan member points up
// Tight fan spread. Lower TIGHT_CLEAR / TIGHT_MIN_R = more overlap (still offset,
// never centered); raise for a looser fan.
const TIGHT_CLEAR = 0.25;
const TIGHT_MIN_R = 5;

// True while relaying out mid-flight — skips per-frame popup re-anchoring.
let live = false;

function emblemDiameter(rec) {
  const [w, h] = store.categories[rec.job.category]?.iconSize || [50, 50];
  return Math.max(w, h);
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Project every marker's TRUE coords to screen pixels (transient `rec._p`). */
function projectAll(recs) {
  const map = store.map;
  for (const rec of recs) {
    const [lat, lng] = rec.job.coords; // JSON stores [lat, lng]
    rec._p = map.project([lng, lat]);
  }
}

/** Union-find grouping of markers whose projected emblems overlap. */
function groupColliding(recs) {
  const parent = recs.map((_, i) => i);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a, b) => { parent[find(a)] = find(b); };

  for (let i = 0; i < recs.length; i++) {
    for (let j = i + 1; j < recs.length; j++) {
      const a = recs[i];
      const b = recs[j];
      const dist = Math.hypot(a._p.x - b._p.x, a._p.y - b._p.y);
      const need = GROUP_FACTOR * (emblemDiameter(a) + emblemDiameter(b)) / 2 + GROUP_PAD;
      if (dist < need) union(i, j);
    }
  }

  const groups = new Map();
  recs.forEach((rec, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(rec);
  });
  return [...groups.values()];
}

function fanRadius(group) {
  const slots = group.length;
  const base = (Math.max(...group.map(emblemDiameter)) + FAN_PAD) / (2 * Math.sin(Math.PI / slots));
  return Math.max(TIGHT_MIN_R, TIGHT_CLEAR * base);
}

/** Place a group on a tight circle around its centroid; pins the selected member. */
function layoutFan(group) {
  if (group.length === 1) { applyOffset(group[0], 0, 0); return; }
  group.sort((a, b) => (a.job.id < b.job.id ? -1 : 1));

  const selIdx = group.findIndex((r) => r.job.id === store.selectedJobId);
  let center;
  let ring;
  if (selIdx !== -1) {
    const sel = group[selIdx];
    applyOffset(sel, 0, 0);
    center = { x: sel._p.x, y: sel._p.y };
    ring = group.filter((_, i) => i !== selIdx);
  } else {
    center = { x: mean(group.map((r) => r._p.x)), y: mean(group.map((r) => r._p.y)) };
    ring = group;
  }
  if (ring.length === 0) return;

  const slots = group.length;
  const R = fanRadius(group);
  ring.forEach((rec, i) => {
    const slot = selIdx !== -1 ? i + 1 : i;
    const theta = START_ANGLE + slot * (2 * Math.PI / slots);
    applyOffset(rec, center.x + R * Math.cos(theta) - rec._p.x,
      center.y + R * Math.sin(theta) - rec._p.y);
  });
}

/** Commit a pixel offset to a marker record; re-anchor its popup when settled. */
function applyOffset(rec, dx, dy) {
  rec.offset = [dx, dy];
  rec.marker.setOffset([dx, dy]); // pixel translate; +x right, +y down
  // Only re-angle the popup once the camera settles — re-choosing every frame
  // makes the tip flip around mid-flight.
  if (!live && rec.popup.isOpen()) applyBestAnchor(rec);
}

function relayout() {
  const map = store.map;
  if (!map) return;
  const recs = store.markers.filter((r) => !r.hidden); // filtered-out markers don't affect the fan
  projectAll(recs);

  const groups = groupColliding(recs);
  const placed = new Set();
  for (const g of groups) {
    if (g.length < 2) continue;
    g.forEach((r) => placed.add(r));
    layoutFan(g);
  }
  for (const rec of recs) if (!placed.has(rec)) applyOffset(rec, 0, 0);
}

/** Full pass — use on load and `moveend` (re-anchors open popups). */
export function relayoutMarkers() {
  live = false;
  relayout();
}

/** Per-frame pass for `move` — tracks the camera through a flyTo without the
 *  popup-anchor churn. */
export function relayoutMarkersLive() {
  live = true;
  relayout();
  live = false;
}
