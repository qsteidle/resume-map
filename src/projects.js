import { store, bus, EVENTS } from './store.js';
import {
  inlineMd,
  escapeHtml,
  isRealUrl,
  coverOf,
  resolveSize,
  buildSkillIndex,
} from './format.js';
import {
  initSkills,
  getSkills,
  onSkillActivate,
  highlightSkillRows,
  clearSkillRows,
  setPinnedRow,
} from './skills.js';

// -------------------------------------------------------------------------
// Projects — a filterable bento grid. Tiles preview on hover and expand
// (FLIP animation) into a fit-to-viewport detail panel below the header. The
// skill rail cross-highlights: hover a skill → its projects light up; hover a
// project → its skills light up; click a skill to pin the filter.
// -------------------------------------------------------------------------

const LINK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17L17 7M9 7h8v8"/></svg>';
const ZOOM_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10" cy="10" r="6"/><path d="M15 15l4 4M10 7v6M7 10h6"/></svg>';
// Stands in for a brand mark on document links (PDF, deck) that have no host.
const DOC_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 3v5.5H19"/><path d="M19 9.2V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.6L19 9.2Z"/></svg>';
// Brand marks (official simple-icons paths) for known link hosts.
const GITHUB_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>';
// Medium's three-circle wordmark, not the boxed monogram — the boxed variant is
// a filled container, so it reads as a solid block beside glyph-style marks.
const MEDIUM_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.54 12a6.8 6.8 0 01-6.77 6.82A6.8 6.8 0 010 12a6.8 6.8 0 016.77-6.82A6.8 6.8 0 0113.54 12zM20.96 12c0 3.54-1.51 6.42-3.38 6.42-1.87 0-3.39-2.88-3.39-6.42s1.52-6.42 3.39-6.42 3.38 2.88 3.38 6.42M24 12c0 3.17-.53 5.75-1.19 5.75-.66 0-1.19-2.58-1.19-5.75s.53-5.75 1.19-5.75C23.47 6.25 24 8.83 24 12z"/></svg>';
const FIT_FLOOR = 0.82; // keep copy readable; if it still overflows, that's a signal to trim

let bento;
let layer;         // detail overlay (fills area below header)
let detail;        // the expanding card inside the layer
let railEl;        // the skill rail (thin ↔ expanded)
let skillIndex;    // { skillToProjects, projectToSkills }
let pinnedSkill = null;
let railExpanded = false;
let activeTile = null;
let lastFocus = null;
let fitRO = null;
let layoutRO = null;
let wired = false;
let initPromise = null;

// Footprints (cols × rows) for the bento packer.
const TILE_SPAN = { feature: [2, 2], wide: [2, 1], tall: [1, 2], regular: [1, 1] };

const reduceMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const compact = () =>
  window.matchMedia?.('(max-width: 860px), (max-height: 560px)').matches;

// ---- YouTube helpers (shared shapes) ------------------------------------
function youTubeId(url) {
  const m = String(url).match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/))([\w-]{11})/
  );
  return m ? m[1] : null;
}
function linkDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return url; }
}

// -------------------------------------------------------------------------
// Boot
// -------------------------------------------------------------------------
// Cached: safe to call on every Projects-tab entry and concurrently from
// search (openProjectById). Builds the grid exactly once.
export function initProjects() {
  if (!initPromise) initPromise = boot();
  return initPromise;
}

async function boot() {
  bento = document.getElementById('bento');
  layer = document.getElementById('proj-detail-layer');
  detail = document.getElementById('proj-detail');
  railEl = document.getElementById('skill-rail');
  if (!bento) { initPromise = null; return; }

  await initSkills();                    // renders the rail + loads skills.json
  skillIndex = buildSkillIndex(getSkills(), store.projects);

  buildGrid();
  wireOnce();
  closeDetail(true);
}

// -------------------------------------------------------------------------
// Bento grid
// -------------------------------------------------------------------------
function buildGrid() {
  bento.innerHTML = '';
  store.projects.forEach((project) => {
    bento.appendChild(tile(project));
  });
  bento.style.gridAutoFlow = 'row'; // we place every tile explicitly
  relayout();
  if (!layoutRO && 'ResizeObserver' in window) {
    layoutRO = new ResizeObserver(() => relayout());
    layoutRO.observe(bento);
  }
}

// Column count follows the bento's own width (keeps ~250px+ tiles).
function colsForWidth(w) {
  return w >= 1040 ? 4 : w >= 720 ? 3 : w >= 480 ? 2 : 1;
}

function relayout() {
  const w = bento.clientWidth;
  if (!w) return;
  const cols = colsForWidth(w);
  bento.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  packBento(cols);
  orientPointers();
}

// Rotate each "pointer" cover arrow so it aims at its target nav button. Only
// meaningful while the Projects tab is visible (rects are 0 when hidden), so we
// skip zero-size rects and recompute on tab show.
function orientPointers() {
  document.querySelectorAll('.cover--pointer').forEach((el) => {
    const target = document.querySelector(`.nav__btn[data-view="${el.dataset.pointTo}"]`);
    const arrow = el.querySelector('.cover__arrow');
    if (!target || !arrow) return;
    const t = target.getBoundingClientRect();
    const a = arrow.getBoundingClientRect();
    if (!a.width || !t.width) return; // view hidden — don't lock in a bad angle
    const deg = Math.atan2(
      t.top + t.height / 2 - (a.top + a.height / 2),
      t.left + t.width / 2 - (a.left + a.width / 2)
    ) * 180 / Math.PI;
    arrow.style.transform = `rotate(${deg}deg)`;
  });
}

// Gap-filling packer. Feature tiles (2×2) anchor the layout, centered. Every
// other tile then fills the earliest open cell in reading order — but when the
// next tile is too big for that cell, we reach ahead for the tile that fills the
// most area there. That little reordering closes the holes a strict row-major
// flow would leave whenever a wide/tall can't drop into a leftover slot.
function packBento(cols) {
  const span = (size) => {
    let [w, h] = TILE_SPAN[size] || TILE_SPAN.regular;
    return [Math.min(w, cols), h];
  };
  const items = store.projects.map((p, i) => ({ id: p.id, order: i, size: resolveSize(p) }));

  const occ = []; // occ[row][col] = taken?
  const row = (r) => { while (occ.length <= r) occ.push(new Array(cols).fill(false)); return occ[r]; };
  const fits = (r, c, w, h) => {
    if (c < 0 || c + w > cols) return false;
    for (let y = r; y < r + h; y++) { row(y); for (let x = c; x < c + w; x++) if (occ[y][x]) return false; }
    return true;
  };
  const mark = (r, c, w, h) => { for (let y = r; y < r + h; y++) { row(y); for (let x = c; x < c + w; x++) occ[y][x] = true; } };

  const placements = {};

  // 1) Feature tiles anchor the grid: centered, stacked if there's more than one.
  for (const it of items) {
    if (it.size !== 'feature') continue;
    const [w, h] = span(it.size);
    const c = Math.max(0, Math.floor((cols - w) / 2));
    let r = 0;
    while (!fits(r, c, w, h)) r++;
    mark(r, c, w, h);
    placements[it.id] = [r, c, w, h];
  }

  // 2) Fill the rest. Walk cells row-major; at each open cell pick the pending
  // tile that fits and covers the most area (ties keep original reading order).
  const pending = items
    .filter((it) => it.size !== 'feature')
    .map((it) => ({ ...it, span: span(it.size) }));

  for (let r = 0; pending.length; r++) {
    row(r);
    for (let c = 0; c < cols && pending.length; c++) {
      if (occ[r][c]) continue;
      let best = -1;
      for (let k = 0; k < pending.length; k++) {
        const [w, h] = pending[k].span;
        if (!fits(r, c, w, h)) continue;
        if (best === -1) { best = k; continue; }
        const area = w * h;
        const [bw, bh] = pending[best].span;
        const barea = bw * bh;
        if (area > barea || (area === barea && pending[k].order < pending[best].order)) best = k;
      }
      if (best === -1) continue; // nothing pending fits here — leave the cell open
      const it = pending.splice(best, 1)[0];
      const [w, h] = it.span;
      mark(r, c, w, h);
      placements[it.id] = [r, c, w, h];
    }
  }

  for (const it of items) {
    const el = bento.querySelector(`.tile[data-proj="${CSS.escape(it.id)}"]`);
    const p = placements[it.id];
    if (!el || !p) continue;
    const [r, c, w, h] = p;
    el.style.gridColumn = `${c + 1} / span ${w}`;
    el.style.gridRow = `${r + 1} / span ${h}`;
  }
}

function tile(project) {
  const size = resolveSize(project);
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `tile tile--${size}`;
  el.dataset.proj = project.id;
  el.setAttribute('role', 'listitem');
  el.setAttribute('aria-label', `${project.title} — open details`);

  // A "pointer" cover renders a big arrow (aimed at a nav button) instead of media.
  const cover = project.cover?.type === 'pointer' ? project.cover : coverOf(project);
  const meta = project.experience || '';
  el.innerHTML = `
    <div class="tile__cover">${coverMarkup(cover)}</div>
    <div class="tile__scrim" aria-hidden="true"></div>
    ${meta ? `<div class="tile__top"><span class="tile__exp">${escapeHtml(meta)}</span></div>` : ''}
    <div class="tile__reveal">
      <h3 class="tile__title">${escapeHtml(project.title)}</h3>
      <p class="tile__summary">${escapeHtml(project.overview || '')}</p>
      <span class="tile__go">Open →</span>
    </div>`;

  el.addEventListener('click', () => openDetail(project, el));
  el.addEventListener('mouseenter', () => onTileHover(project.id));
  el.addEventListener('mouseleave', onTileLeave);
  el.addEventListener('focus', () => onTileHover(project.id));
  el.addEventListener('blur', onTileLeave);
  return el;
}

// A tile/hero visual. YouTube → thumbnail image; local video → muted first
// frame; image → the image. No cover → a typographic placeholder.
function coverMarkup(cover, hero = false) {
  // On the tile, a pointer cover is just the welcome text (the arrow + snark
  // live inside the detail view, where the Resume tab is a click away).
  if (cover?.type === 'pointer') {
    return `<div class="cover cover--welcome"><span>${escapeHtml(cover.tileText || 'Welcome.')}</span></div>`;
  }
  if (!cover) {
    return `<div class="cover cover--none"><span aria-hidden="true">{ }</span></div>`;
  }
  if (cover.type === 'video') {
    const yt = youTubeId(cover.url);
    if (yt) {
      return `<img class="cover__img" src="https://img.youtube.com/vi/${yt}/hqdefault.jpg" alt="" loading="lazy">`;
    }
    return `<video class="cover__img" src="${escapeHtml(cover.url)}" muted loop autoplay playsinline preload="metadata"></video>`;
  }
  return `<img class="cover__img" src="${escapeHtml(cover.url)}" alt="" loading="lazy">`;
}

// -------------------------------------------------------------------------
// Cross-highlight
// -------------------------------------------------------------------------
function tilesFor(label) {
  return new Set(skillIndex.skillToProjects.get(label) || []);
}

// Show the projects for a skill (dim the rest). null → restore pinned / clear.
function showFilter(label) {
  if (!label) {
    if (pinnedSkill) return showFilter(pinnedSkill);
    bento.classList.remove('is-filtering');
    bento.querySelectorAll('.tile').forEach((t) => t.classList.remove('is-match', 'is-dim'));
    return;
  }
  const ids = tilesFor(label);
  bento.classList.add('is-filtering');
  bento.querySelectorAll('.tile').forEach((t) => {
    const on = ids.has(t.dataset.proj);
    t.classList.toggle('is-match', on);
    t.classList.toggle('is-dim', !on);
  });
}

// Click a skill to pin its filter; click it again to unpin.
function togglePin(label) {
  pinnedSkill = pinnedSkill === label ? null : label;
  setPinnedRow(pinnedSkill);
  showFilter(pinnedSkill);
  if (pinnedSkill) highlightSkillRows([pinnedSkill]);
  else clearSkillRows();
}

// Hovering a tile lights up the skills that map to it.
function onTileHover(id) {
  const labels = skillIndex.projectToSkills.get(id) || [];
  highlightSkillRows(labels);
}
function onTileLeave() {
  if (pinnedSkill) highlightSkillRows([pinnedSkill]);
  else clearSkillRows();
}

// -------------------------------------------------------------------------
// Detail — open with a FLIP animation from the source tile
// -------------------------------------------------------------------------
export async function openProjectById(id) {
  const project = store.projects.find((p) => p.id === id);
  if (!project) return;
  await initProjects();
  const el = bento?.querySelector(`.tile[data-proj="${CSS.escape(id)}"]`);
  openDetail(project, el || null);
}

function openDetail(project, sourceTile) {
  if (!layer || !detail) return;
  lastFocus = document.activeElement;
  activeTile = sourceTile;
  renderDetail(project);

  layer.hidden = false;
  layer.setAttribute('aria-hidden', 'false');
  layer.classList.add('is-open');
  document.body.classList.add('detail-open');

  // Lay out at final size first, then fit the copy, then FLIP into place.
  fitContent();
  const anim = flipIn(sourceTile);

  // Aim the pointer arrow (if any) once the card has settled — rects are only
  // final after the FLIP transform clears.
  if (anim?.finished) anim.finished.then(orientPointers).catch(() => {});
  else requestAnimationFrame(orientPointers);

  observeFit();
  detail.querySelector('.proj-detail__close')?.focus();
}

function flipIn(sourceTile) {
  if (reduceMotion() || !sourceTile) {
    return detail.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
  }
  const first = sourceTile.getBoundingClientRect();
  const last = detail.getBoundingClientRect();
  if (!last.width || !last.height) return null;
  const dx = first.left - last.left;
  const dy = first.top - last.top;
  const sx = first.width / last.width;
  const sy = first.height / last.height;
  return detail.animate(
    [
      { transformOrigin: 'top left', transform: `translate(${dx}px,${dy}px) scale(${sx},${sy})`, opacity: 0.35, borderRadius: '16px' },
      { transformOrigin: 'top left', transform: 'none', opacity: 1, borderRadius: '0px' },
    ],
    { duration: 440, easing: 'cubic-bezier(.22,.7,.25,1)' }
  );
}

function closeDetail(instant = false) {
  if (!layer) return;
  observeFit(false);
  const finish = () => {
    layer.classList.remove('is-open');
    layer.setAttribute('aria-hidden', 'true');
    layer.hidden = true;
    document.body.classList.remove('detail-open');
    if (detail) detail.innerHTML = '';
    lastFocus?.focus?.();
    lastFocus = null;
    activeTile = null;
  };

  if (instant || layer.hidden || reduceMotion() || !activeTile) {
    finish();
    return;
  }
  const first = activeTile.getBoundingClientRect();
  const last = detail.getBoundingClientRect();
  const dx = first.left - last.left;
  const dy = first.top - last.top;
  const sx = first.width / last.width;
  const sy = first.height / last.height;
  const anim = detail.animate(
    [
      { transformOrigin: 'top left', transform: 'none', opacity: 1 },
      { transformOrigin: 'top left', transform: `translate(${dx}px,${dy}px) scale(${sx},${sy})`, opacity: 0.2 },
    ],
    { duration: 320, easing: 'cubic-bezier(.4,0,.2,1)' }
  );
  anim.onfinish = finish;
  anim.oncancel = finish;
}

// -------------------------------------------------------------------------
// Detail content
// -------------------------------------------------------------------------
function renderDetail(project) {
  const media = (project.media || []).filter(
    (m) => (m?.type === 'image' || m?.type === 'video') && isRealUrl(m.url)
  );
  const links = (project.media || []).filter((m) => m?.type === 'link' && isRealUrl(m.url));

  const bullets = (project.descriptions?.length ? project.descriptions : [project.overview])
    .filter(Boolean)
    .map((d) => `<li><span>${inlineMd(d)}</span></li>`) // span keeps mixed text/bold as one flex item
    .join('');

  const meta = [project.experience, project.timeRange].filter(Boolean).join(' · ');
  const chips = (project.skills || []).map((s) => `<span class="chip">${escapeHtml(s)}</span>`).join('');

  // All media shown at once. This --mcols is only the first-paint default; once
  // the images report their dimensions, layoutGallery() repacks by orientation.
  const cols = media.length <= 2 ? 1 : 2;
  const gallery = media.length
    ? `<div class="proj-detail__gallery" style="--mcols:${cols}">${media.map(galleryCell).join('')}</div>`
    : `<div class="proj-detail__gallery"><div class="gcell cover--none"><span aria-hidden="true">{ }</span></div></div>`;
  // A pointer project shows an arrow (aimed at its nav tab) + a snarky note here
  // instead of a media gallery.
  const pointer = project.cover?.type === 'pointer' ? project.cover : null;
  const mediaBlock = pointer
    ? `<div class="proj-detail__pointer cover--pointer" data-point-to="${escapeHtml(pointer.target || 'resume')}">
          <span class="cover__arrow" aria-hidden="true">
            <svg viewBox="0 0 170 36" fill="currentColor"><rect x="3" y="14.5" width="126" height="7" rx="3.5"/><path d="M123 3 167 18 123 33Z"/></svg>
          </span>
          <p class="proj-detail__snark">${inlineMd(pointer.message || '')}</p>
        </div>`
    : gallery;
  // Links live in the media column, beneath the images — not under the copy.
  const linksRow = links.length ? `<div class="proj-links">${links.map(linkButton).join('')}</div>` : '';

  detail.innerHTML = `
    <button class="proj-detail__close" id="proj-detail-close" aria-label="Close">×</button>
    <div class="proj-detail__grid">
      <div class="proj-detail__media">
        ${mediaBlock}
        ${linksRow}
      </div>
      <div class="proj-detail__body">
        <h1 class="proj-detail__title" id="proj-detail-title">${escapeHtml(project.title)}</h1>
        ${meta ? `<p class="proj-meta">${escapeHtml(meta)}</p>` : ''}
        ${chips ? `<div class="proj-detail__skills stack">${chips}</div>` : ''}
        ${project.overview ? `<p class="proj-overview">${inlineMd(project.overview)}</p>` : ''}
        <ul class="detail-list">${bullets}</ul>
      </div>
    </div>`;

  detail.querySelector('#proj-detail-close')?.addEventListener('click', () => closeDetail());
  detail.querySelectorAll('[data-lightbox]').forEach((el) =>
    el.addEventListener('click', () => openLightbox(el.dataset.src, el.dataset.alt, el.dataset.kind)));
  initGallery(detail.querySelector('.proj-detail__gallery'));
}

// -------------------------------------------------------------------------
// Gallery layout — orientation-aware packing
// -------------------------------------------------------------------------
// The gallery fills a fixed-height column, so a rigid equal-cell grid wastes
// space whenever an image's aspect doesn't match its cell (a tall diagram in a
// squat slot, a lone third image leaving a hole). We measure each image's
// orientation once it loads, then choose a layout that lets tall images span two
// rows and fill the column. The common shapes (1, two landscapes, 4) are left
// exactly as they were — only the awkward mixes change.

// Classify a cell by the aspect ratio of its media. Unknown (YouTube iframe,
// not-yet-loaded) counts as landscape, which is the safe default for every plan.
function cellOrientation(cell) {
  const m = cell.querySelector('img, video');
  const w = m ? (m.naturalWidth || m.videoWidth || 0) : 0;
  const h = m ? (m.naturalHeight || m.videoHeight || 0) : 0;
  if (!w || !h) return 'l';
  return w / h < 0.85 ? 'p' : 'l'; // portrait vs landscape/square
}

// Choose a grid template + per-cell placement for `n` items with orientations
// `o` ('p' | 'l'). Returns 1-indexed { cols, rows, cells:[{c,r,cs,rs}] }.
function galleryPlan(n, o) {
  const cell = (c, r, cs = 1, rs = 1) => ({ c, r, cs, rs });
  const portraits = o.filter((x) => x === 'p').length;

  if (n === 1) return { cols: 1, rows: 1, cells: [cell(1, 1)] };

  if (n === 2) {
    // Two tall images sit side by side; anything else keeps the big stack.
    if (portraits === 2) return { cols: 2, rows: 1, cells: [cell(1, 1), cell(2, 1)] };
    return { cols: 1, rows: 2, cells: [cell(1, 1), cell(1, 2)] };
  }

  if (n === 3) {
    if (portraits >= 1) {
      // One tall image spans both rows; the other two stack beside it. Keep the
      // tall on the side where it appears in reading order.
      const tall = o[0] === 'p' ? 0 : o[1] === 'p' ? 1 : 2;
      const rest = [0, 1, 2].filter((i) => i !== tall);
      const cells = [];
      if (tall === 0) {
        cells[0] = cell(1, 1, 1, 2);
        cells[rest[0]] = cell(2, 1);
        cells[rest[1]] = cell(2, 2);
      } else {
        cells[rest[0]] = cell(1, 1);
        cells[rest[1]] = cell(1, 2);
        cells[tall] = cell(2, 1, 1, 2);
      }
      return { cols: 2, rows: 2, cells };
    }
    // All landscape → a wide hero on top with two beneath, filling the square.
    return { cols: 2, rows: 2, cells: [cell(1, 1, 2, 1), cell(1, 2), cell(2, 2)] };
  }

  if (n === 4) {
    return { cols: 2, rows: 2, cells: [cell(1, 1), cell(2, 1), cell(1, 2), cell(2, 2)] };
  }

  // 5+ : two-column row-major flow (unchanged from the original behavior).
  const rows = Math.ceil(n / 2);
  const cells = [];
  for (let i = 0; i < n; i++) cells.push(cell((i % 2) + 1, Math.floor(i / 2) + 1));
  return { cols: 2, rows, cells };
}

function layoutGallery(galleryEl) {
  if (!galleryEl) return;
  const cells = [...galleryEl.querySelectorAll('.gcell')];
  if (!cells.length) return;
  const plan = galleryPlan(cells.length, cells.map(cellOrientation));
  galleryEl.style.gridTemplateColumns = `repeat(${plan.cols}, 1fr)`;
  galleryEl.style.gridTemplateRows = `repeat(${plan.rows}, 1fr)`;
  cells.forEach((el, i) => {
    const p = plan.cells[i];
    el.style.gridColumn = `${p.c} / span ${p.cs}`;
    el.style.gridRow = `${p.r} / span ${p.rs}`;
  });
}

// Lay out now (correct immediately for cached/local media) and again as each
// image reports its true dimensions. layoutGallery() is idempotent.
function initGallery(galleryEl) {
  if (!galleryEl) return;
  const relayout = () => layoutGallery(galleryEl);
  relayout();
  galleryEl.querySelectorAll('.gcell img, .gcell video').forEach((m) => {
    if (m.tagName === 'VIDEO') { m.addEventListener('loadedmetadata', relayout, { once: true }); return; }
    if (!m.complete || !m.naturalWidth) m.addEventListener('load', relayout, { once: true });
  });
}

// One media cell in the gallery. Images are shown whole (contain) and open the
// lightbox; local videos autoplay on a muted loop; YouTube plays inline.
function galleryCell(m) {
  const cap = m.caption ? `<span class="gcell__cap">${escapeHtml(m.caption)}</span>` : '';
  if (m.type === 'video') {
    const yt = youTubeId(m.url);
    if (yt) {
      return `<div class="gcell"><iframe class="gcell__media" src="https://www.youtube.com/embed/${yt}" title="${escapeHtml(m.caption || 'Video')}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="lazy"></iframe>${cap}</div>`;
    }
    return `<div class="gcell"><video class="gcell__media" src="${escapeHtml(m.url)}" autoplay loop muted playsinline preload="metadata"></video>${cap}</div>`;
  }
  return `<button class="gcell gcell--img" data-lightbox data-kind="image" data-src="${escapeHtml(m.url)}" data-alt="${escapeHtml(m.caption || '')}" aria-label="${escapeHtml(m.caption || 'Open image')}">
      <img class="gcell__media" src="${escapeHtml(m.url)}" alt="${escapeHtml(m.caption || '')}" loading="lazy">
      <span class="media-slot__zoom" aria-hidden="true">${ZOOM_ICON}</span>
      ${cap}
    </button>`;
}

// The brand logo for a known host (GitHub, Medium), or null. github.io / other
// hosts fall through to the generic external-link arrow.
function brandMark(url) {
  const host = linkDomain(url);
  if (/(^|\.)github\.com$/.test(host)) return GITHUB_ICON;
  if (/(^|\.)medium\.com$/.test(host)) return MEDIUM_ICON;
  return null;
}

// The document extension for a local file link ("PDF", "PPTX"), or null for a
// web link. Reads the path only, so query strings and hashes don't fool it.
function fileKind(url) {
  const path = String(url).split(/[?#]/)[0];
  const ext = /\.([a-z0-9]{2,5})$/i.exec(path)?.[1];
  return ext && /^(pdf|pptx?|docx?|xlsx?|csv|zip)$/i.test(ext) ? ext.toUpperCase() : null;
}

// The sub-label under a link's title. Documents announce their format (screen
// readers should hear "PDF" before the user commits to a download); web links
// keep showing the host. Relative URLs have no host, so they'd otherwise fall
// back to the raw path — hence the null.
function linkMeta(m) {
  if (m.meta) return m.meta;
  const kind = fileKind(m.url);
  if (kind) return kind;
  return /^https?:/i.test(m.url) ? linkDomain(m.url) : '';
}

// The first link is the project's headline action, so it gets the filled accent
// treatment; the rest stay outlined. `index` comes from the caller's map().
function linkButton(m, index) {
  const label = m.caption || linkDomain(m.url);
  const mark = brandMark(m.url) || (fileKind(m.url) ? DOC_ICON : null);
  const meta = linkMeta(m);
  const primary = index === 0 ? ' proj-link--primary' : '';
  return `<a class="proj-link${primary}" href="${escapeHtml(m.url)}" target="_blank" rel="noopener noreferrer">
      ${mark ? `<span class="proj-link__brand">${mark}</span>` : ''}
      <span class="proj-link__text">
        <span class="proj-link__label">${escapeHtml(label)}</span>
        ${meta ? `<span class="proj-link__meta">${escapeHtml(meta)}</span>` : ''}
      </span>
      ${LINK_ICON}
    </a>`;
}

// -------------------------------------------------------------------------
// Fit-to-viewport: shrink the body copy with a --fit factor until it fits the
// fixed detail box; below the floor (or on compact screens) allow scroll.
// -------------------------------------------------------------------------
function fitContent() {
  if (!detail) return;
  const body = detail.querySelector('.proj-detail__body');
  if (!body) return;

  detail.classList.remove('is-scrolling');
  if (compact()) {
    detail.style.removeProperty('--fit'); // CSS stacks + scrolls on small screens
    return;
  }

  let fit = 1;
  detail.style.setProperty('--fit', String(fit));
  // Iteratively shrink until the body's content fits its (fixed-height) box.
  for (let step = 0; step < 12; step++) {
    if (body.scrollHeight <= body.clientHeight + 1) break;
    fit -= 0.04;
    if (fit <= FIT_FLOOR) {
      fit = FIT_FLOOR;
      detail.style.setProperty('--fit', String(fit));
      break;
    }
    detail.style.setProperty('--fit', String(fit));
  }
  // Still overflowing at the floor → let the body scroll as a last resort.
  if (body.scrollHeight > body.clientHeight + 1) detail.classList.add('is-scrolling');
}

function observeFit(on = true) {
  if (!on) {
    fitRO?.disconnect();
    fitRO = null;
    return;
  }
  if (!('ResizeObserver' in window)) return;
  fitRO?.disconnect();
  fitRO = new ResizeObserver(() => { fitContent(); orientPointers(); });
  fitRO.observe(layer);
}

// -------------------------------------------------------------------------
// Lightbox
// -------------------------------------------------------------------------
function openLightbox(src, alt, kind) {
  const lb = document.getElementById('lightbox');
  const content = document.getElementById('lightbox-content');
  if (!lb || !content || !src) return;
  content.innerHTML = kind === 'video'
    ? `<video src="${escapeHtml(src)}" controls autoplay playsinline></video>`
    : `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt || '')}">`;
  lb.classList.add('is-open');
}
function closeLightbox() {
  const lb = document.getElementById('lightbox');
  lb?.classList.remove('is-open');
  const content = document.getElementById('lightbox-content');
  if (content) content.innerHTML = '';
}

// -------------------------------------------------------------------------
// Wiring (once)
// -------------------------------------------------------------------------
// The rail rests thin (dots); clicking the widget expands it to full sliders.
function expandRail() {
  if (railExpanded || !railEl) return;
  railExpanded = true;
  railEl.classList.add('is-expanded');
  railEl.setAttribute('aria-expanded', 'true');
  relayout(); // bento narrows → repack
}
function collapseRail() {
  if (!railExpanded || !railEl) return;
  if (document.querySelector('#savant.savant--edit')) return; // stay open while editing
  railExpanded = false;
  railEl.classList.remove('is-expanded');
  railEl.setAttribute('aria-expanded', 'false');
  relayout();
}

function wireOnce() {
  if (wired) return;
  wired = true;

  onSkillActivate((label, clicked) => {
    if (clicked) {
      if (!railExpanded) { expandRail(); return; } // first click opens the sliders
      togglePin(label);
      return;
    }
    showFilter(label); // hover preview (works thin or expanded)
  });

  // Re-aim the pointer arrow once the Projects tab is actually on-screen.
  bus.on(EVENTS.TAB_CHANGED, ({ tab }) => {
    if (tab === 'projects') requestAnimationFrame(orientPointers);
  });

  // Click the rail widget → expand; when open, click empty space → collapse.
  railEl?.addEventListener('click', (e) => {
    if (!railExpanded) { expandRail(); return; }
    if (!e.target.closest('.pctl')) collapseRail();
  });
  document.addEventListener('click', (e) => {
    if (railExpanded && !e.target.closest('#skill-rail')) collapseRail();
  });

  layer?.addEventListener('click', (e) => { if (e.target === layer) closeDetail(); });
  document.getElementById('lightbox-close')?.addEventListener('click', closeLightbox);
  document.getElementById('lightbox')?.addEventListener('click', (e) => {
    if (e.target.id === 'lightbox') closeLightbox();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const lb = document.getElementById('lightbox');
    if (lb?.classList.contains('is-open')) { closeLightbox(); return; }
    if (layer && !layer.hidden) { closeDetail(); return; }
    if (railExpanded) collapseRail();
  });
}
