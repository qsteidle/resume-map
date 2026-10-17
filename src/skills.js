// Skills — competency-level sliders. Formerly a standalone tab; now they live
// in the collapsible rail on the Projects page and cross-highlight with the
// bento grid (hover/focus/click a skill → its projects light up, and vice
// versa; projects.js drives the grid side via onSkillActivate).
//
// The axis is a criterion-referenced ladder (no fake percentiles):
//   1 Exposure · 2 Working · 3 Proficient · 4 Advanced   (half-steps allowed)
//
// Author edit mode (obscurity, NOT security — this is a static site, so anyone
// determined can read the passphrase in the bundle). Edits only affect the
// editor's own browser via localStorage; they never change what other visitors
// see. To update the live site for everyone, use Save, then commit
// public/skills.json.  → visit the site with ?edit in the URL.

import { flattenSkills } from './format.js';

const LEVELS = ['Exposure', 'Working', 'Proficient', 'Advanced'];
const ABBR = ['Exp', 'Wrk', 'Pro', 'Adv'];
const STEP = 0.5;
const MIN = 1;
const MAX = 4;
const EDIT_PASSPHRASE = 'change-me'; // ← set your own; obscurity only
const STORE_KEY = 'skills-overrides-v1';

let loaded = false;
let editing = false;
let skills = [];        // flat, ordered; each entry carries its `category` name
let taxonomy = null;    // raw categorized payload (kept intact for save/export)
let baseNote = '';
let activateCb = null; // (label | null, pinned?) → projects.js highlights the grid

/** Register the grid-side reaction to skill hover/focus/click. */
export function onSkillActivate(cb) {
  activateCb = cb;
}

/** The loaded skill entries (label, level, sub, projects[]…). */
export function getSkills() {
  return skills;
}

export async function initSkills() {
  if (loaded) {
    render(); // rail may have been rebuilt when the Projects view re-opened
    if (editing) enableEditing();
    return;
  }
  loaded = true;
  try {
    const res = await fetch('skills.json');
    if (!res.ok) throw new Error(`skills.json: HTTP ${res.status}`);
    const data = await res.json();
    baseNote = data.note || '';
    taxonomy = data;
    skills = flattenSkills(data).map((s) => ({ ...s, level: clampLevel(s.level) }));

    editing = wantsEdit();
    if (editing) applyOverrides();

    render();
    if (editing) enableEditing();
  } catch (err) {
    console.warn('Skills failed to load:', err);
    loaded = false;
  }
}

// --- level math -----------------------------------------------------------
function clampLevel(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return MIN;
  const snapped = Math.round(n / STEP) * STEP;
  return Math.min(MAX, Math.max(MIN, snapped));
}
function pos(level) {
  return ((level - MIN) / (MAX - MIN)) * 100; // 0–100 across the track
}
function shortLabel(level) {
  const i = Math.floor(level) - 1;
  return level % 1 === 0 ? ABBR[i] : `${ABBR[i]}+`;
}
function fullLabel(level) {
  const i = Math.floor(level) - 1;
  return level % 1 === 0 ? LEVELS[i] : `${LEVELS[i]}–${LEVELS[i + 1]}`;
}

// --- render ---------------------------------------------------------------
function render() {
  const noteEl = document.getElementById('skills-note');
  if (noteEl) {
    noteEl.textContent = editing
      ? '✎ Edit mode — drag a marker or focus it and use ← → · then Save'
      : baseNote;
  }

  const host = document.getElementById('savant');
  if (!host) return;

  // Group into categories, preserving first-seen order.
  const order = [];
  const byCat = new Map();
  skills.forEach((s, i) => {
    const cat = s.category || 'Skills';
    if (!byCat.has(cat)) { byCat.set(cat, []); order.push(cat); }
    byCat.get(cat).push({ s, i });
  });

  host.innerHTML = order
    .map((cat) => `
      <div class="savant__group">
        <div class="savant__cat">${escapeAttr(cat)}</div>
        ${byCat.get(cat).map(({ s, i }) => rowHtml(s, i)).join('')}
      </div>`)
    .join('');

  wireHighlight(host);
}

// One skill row (a "percentile"/proficiency control). Shared by both the thin
// (dot) and expanded (full-track) rail states — CSS handles the two looks.
function rowHtml(s, i) {
  const p = pos(s.level);
  const color = scaleColor(p / 100);
  const tip = ` title="${escapeAttr(fullLabel(s.level))}"`;
  return `
    <div class="pctl" data-i="${i}" data-label="${escapeAttr(s.label)}" role="button" tabindex="0"
         aria-label="${escapeAttr(`${s.label} — ${fullLabel(s.level)}. Highlight related projects.`)}">
      <div class="pctl__head">
        <span class="pctl__label">${escapeAttr(s.label)}</span>
        ${s.sub ? `<span class="pctl__sub">${escapeAttr(s.sub)}</span>` : ''}
      </div>
      <div class="pctl__track"${tip}>
        <span class="pctl__marker" style="left:${p}%;background:${color}">${shortLabel(s.level)}</span>
      </div>
    </div>`;
}

// Hover/focus previews the skill's projects; click pins the filter. Editing
// (drag markers) is layered on top separately in enableEditing().
function wireHighlight(host) {
  host.querySelectorAll('.pctl').forEach((row) => {
    const label = row.dataset.label;
    row.addEventListener('mouseenter', () => activateCb?.(label));
    row.addEventListener('mouseleave', () => activateCb?.(null));
    row.addEventListener('focus', () => activateCb?.(label));
    row.addEventListener('blur', () => activateCb?.(null));
    row.addEventListener('click', (e) => {
      if (editing && e.target.closest('.pctl__track')) return; // drag/track edits win in edit mode
      activateCb?.(label, true);
    });
    row.addEventListener('keydown', (e) => {
      if (editing) return; // arrows adjust the marker in edit mode
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activateCb?.(label, true);
      }
    });
  });
}

// --- cross-highlight (called by projects.js) -------------------------------
/** Light up the given skill labels; dim the rest. Empty/none clears. */
export function highlightSkillRows(labels) {
  const set = new Set(labels || []);
  document.querySelectorAll('#savant .pctl').forEach((row) => {
    row.classList.toggle('is-hot', set.has(row.dataset.label));
    row.classList.toggle('is-cool', set.size > 0 && !set.has(row.dataset.label));
  });
}

/** Mark a single row as the pinned/active filter (or clear with null). */
export function setPinnedRow(label) {
  document.querySelectorAll('#savant .pctl').forEach((row) => {
    const on = label != null && row.dataset.label === label;
    row.classList.toggle('is-pinned', on);
    row.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

export function clearSkillRows() {
  document.querySelectorAll('#savant .pctl').forEach((row) =>
    row.classList.remove('is-hot', 'is-cool')
  );
}

// --- edit mode ------------------------------------------------------------
function wantsEdit() {
  if (!/[?&]edit\b/.test(location.search)) return false;
  if (sessionStorage.getItem('skills-edit-ok') === '1') return true;
  const pass = window.prompt('Edit passphrase:');
  if (pass === EDIT_PASSPHRASE) {
    sessionStorage.setItem('skills-edit-ok', '1');
    return true;
  }
  return false;
}

function enableEditing() {
  const host = document.getElementById('savant');
  if (!host || host.classList.contains('savant--edit')) return;
  host.classList.add('savant--edit');
  document.getElementById('skill-rail')?.classList.add('is-expanded'); // show full tracks to drag
  buildToolbar(host);

  host.querySelectorAll('.pctl').forEach((row) => {
    const i = Number(row.dataset.i);
    const track = row.querySelector('.pctl__track');
    const marker = row.querySelector('.pctl__marker');
    marker.tabIndex = 0;

    const setFromClientX = (clientX) => {
      const rect = track.getBoundingClientRect();
      const pct = ((clientX - rect.left) / rect.width) * 100;
      update(i, MIN + (pct / 100) * (MAX - MIN));
    };

    marker.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      marker.setPointerCapture(e.pointerId);
      const move = (ev) => setFromClientX(ev.clientX);
      const up = () => {
        marker.releasePointerCapture(e.pointerId);
        marker.removeEventListener('pointermove', move);
        marker.removeEventListener('pointerup', up);
      };
      marker.addEventListener('pointermove', move);
      marker.addEventListener('pointerup', up);
    });

    // click anywhere on the track to jump the marker there
    track.addEventListener('pointerdown', (e) => {
      if (e.target === marker) return;
      setFromClientX(e.clientX);
    });

    marker.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { update(i, skills[i].level - STEP); e.preventDefault(); e.stopPropagation(); }
      else if (e.key === 'ArrowRight') { update(i, skills[i].level + STEP); e.preventDefault(); e.stopPropagation(); }
    });
  });
}

function update(i, level) {
  const lv = clampLevel(level);
  skills[i].level = lv;
  const row = document.querySelector(`.pctl[data-i="${i}"]`);
  if (!row) return;
  const marker = row.querySelector('.pctl__marker');
  const track = row.querySelector('.pctl__track');
  const p = pos(lv);
  marker.style.left = `${p}%`;
  marker.style.background = scaleColor(p / 100);
  marker.textContent = shortLabel(lv);
  track.title = fullLabel(lv);
  persist();
}

function buildToolbar(host) {
  const bar = document.createElement('div');
  bar.className = 'skills-edit-bar';
  bar.innerHTML = `
    <button type="button" data-act="save">Save to skills.json</button>
    <button type="button" data-act="reset">Reset local edits</button>`;
  host.parentNode.insertBefore(bar, host);
  bar.addEventListener('click', (e) => {
    const act = e.target.dataset.act;
    if (act === 'save') saveToRepo(e.target);
    else if (act === 'reset') resetEdits();
  });
}

// Rebuild the categorized payload from the untouched taxonomy, folding in the
// only thing edit mode changes: each skill's level (looked up by label).
function exportData() {
  const levelByLabel = new Map(skills.map((s) => [s.label, s.level]));
  const categories = (taxonomy?.categories || []).map((c) => ({
    name: c.name,
    skills: (c.skills || []).map((s) => ({
      label: s.label,
      ...(s.sub ? { sub: s.sub } : {}),
      level: levelByLabel.has(s.label) ? levelByLabel.get(s.label) : s.level,
      ...(s.aliases ? { aliases: s.aliases } : {}),
      ...(s.projects ? { projects: s.projects } : {}),
    })),
  }));
  return JSON.stringify({ note: baseNote, categories }, null, 2);
}

// Write straight to the repo's public/skills.json via the dev-server endpoint
// (see vite.config.js), falling back to the File System Access API, then to a
// plain download.
let fileHandle = null;

async function saveToRepo(btn) {
  const text = exportData();

  try {
    const res = await fetch('/__save-skills', { method: 'POST', body: text });
    if (res.ok) { flash(btn, 'Saved ✓'); return; }
  } catch (_) { /* endpoint absent — fall through */ }

  if (!window.showSaveFilePicker) {
    downloadJSON(text);
    flash(btn, 'Downloaded');
    return;
  }
  try {
    if (!fileHandle) {
      fileHandle = await window.showSaveFilePicker({
        suggestedName: 'skills.json',
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      });
    }
    if ((await fileHandle.requestPermission({ mode: 'readwrite' })) !== 'granted') {
      flash(btn, 'Permission denied');
      return;
    }
    const writable = await fileHandle.createWritable();
    await writable.write(text);
    await writable.close();
    flash(btn, 'Saved ✓');
  } catch (err) {
    if (err?.name === 'AbortError') return; // picker dismissed
    console.warn('Save to skills.json failed:', err);
    fileHandle = null;
    flash(btn, 'Save failed');
  }
}

function downloadJSON(text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'skills.json';
  a.click();
  URL.revokeObjectURL(url);
}

function resetEdits() {
  try { localStorage.removeItem(STORE_KEY); } catch (_) { /* ignore */ }
  location.reload();
}

function flash(btn, msg) {
  if (!btn) return;
  const original = btn.textContent;
  btn.textContent = msg;
  setTimeout(() => { btn.textContent = original; }, 1400);
}

// --- persistence (author's browser only) ----------------------------------
function persist() {
  try {
    const map = Object.fromEntries(skills.map((s) => [s.label, s.level]));
    localStorage.setItem(STORE_KEY, JSON.stringify(map));
  } catch (_) { /* ignore */ }
}
function applyOverrides() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const map = JSON.parse(raw);
    skills.forEach((s) => {
      if (map[s.label] != null) s.level = clampLevel(map[s.label]);
    });
  } catch (_) { /* ignore */ }
}

// --- helpers --------------------------------------------------------------
function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

// Diverging cold(#3763B0) → mid(#8a8f99) → hot(#C6382F) by t in [0,1].
function scaleColor(t) {
  const cold = [55, 99, 176];
  const mid = [138, 143, 153];
  const hot = [198, 56, 47];
  const [a, b, k] = t < 0.5 ? [cold, mid, t / 0.5] : [mid, hot, (t - 0.5) / 0.5];
  const mix = a.map((v, i) => Math.round(v + (b[i] - v) * k));
  return `rgb(${mix[0]},${mix[1]},${mix[2]})`;
}
