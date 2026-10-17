// Pure, framework-free helpers shared by the projects UI and its unit tests.
// Kept DOM-free on purpose so Vitest can exercise them in isolation.

// ---- html safety + inline markdown ---------------------------------------

/** Escape the five HTML-significant characters for safe text interpolation. */
export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Minimal inline formatter for description/overview copy: HTML-escape first,
// then re-enable **bold** only (no block/link syntax — links are structured
// data). Non-greedy so multiple bold spans on one line each close correctly.
export function inlineMd(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

// ---- media / cover --------------------------------------------------------

/** A url is "real" if it isn't one of the path/to/ placeholder stubs. */
export function isRealUrl(url) {
  return !!url && !String(url).startsWith('path/to/');
}

// The tile/hero visual for a project: an explicit `cover` if present and real,
// else the first real image or video in `media`. Returns null when a project
// has no usable visual (the tile then falls back to a typographic cover).
export function coverOf(project) {
  const c = project?.cover;
  if (c && isRealUrl(c.url)) return c;
  const media = project?.media || [];
  return (
    media.find((m) => (m?.type === 'image' || m?.type === 'video') && isRealUrl(m.url)) || null
  );
}

// ---- bento sizing ---------------------------------------------------------

// Span footprints for the bento grid. `feature` is the hero (2x2); the grid
// uses dense auto-flow so smaller tiles backfill the gaps a big tile leaves.
export const SIZES = {
  feature: { cols: 2, rows: 2 },
  wide: { cols: 2, rows: 1 },
  tall: { cols: 1, rows: 2 },
  regular: { cols: 1, rows: 1 },
};

/** Resolve a project's declared size to a known key, defaulting to regular. */
export function resolveSize(project) {
  const s = project?.size;
  return SIZES[s] ? s : 'regular';
}

// ---- skill <-> project mapping -------------------------------------------

/**
 * Flatten a skills payload into a single ordered array, tagging each skill with
 * its category name. Accepts the categorized shape ({ categories:[{name,skills}] })
 * or the legacy flat shape ({ skills:[...] }).
 */
export function flattenSkills(data) {
  if (Array.isArray(data?.categories)) {
    return data.categories.flatMap((c) =>
      (c.skills || []).map((s) => ({ ...s, category: c.name }))
    );
  }
  return data?.skills || [];
}

// Which project ids a single sidebar skill covers. Projects (via their own
// `skills` tags) are the single source of truth for the edges; this only
// declares how a canonical skill maps onto them:
//   1. explicit `projects: [ids]`  → curated (for domain skills with no tag)
//   2. `aliases`/`match: [keywords]`→ case-insensitive substring vs project tags
//   3. fallback: the skill's own label matched against project tags
// (1) and (2) union, so a domain skill can add extra curated projects on top of
// whatever its aliases catch.
export function resolveSkillProjects(skillEntry, projects) {
  const known = new Set(projects.map((p) => p.id));
  const out = [];
  const seen = new Set();
  const push = (id) => { if (known.has(id) && !seen.has(id)) { seen.add(id); out.push(id); } };

  if (Array.isArray(skillEntry.projects)) skillEntry.projects.forEach(push);

  // Alias/keyword matching. If explicit projects were given but no aliases, skip
  // the label fallback (the curated list is authoritative on its own).
  const list =
    skillEntry.aliases?.length ? skillEntry.aliases
    : skillEntry.match?.length ? skillEntry.match
    : skillEntry.projects?.length ? []
    : [skillEntry.label];
  const keywords = list.map((k) => String(k).toLowerCase());
  if (keywords.length) {
    for (const p of projects) {
      const hay = (p.skills || []).join(' ').toLowerCase();
      if (keywords.some((k) => hay.includes(k))) push(p.id);
    }
  }
  return out;
}

// Build the bidirectional index the cross-highlight relies on:
//   skillToProjects: Map(skillLabel -> [projectId, ...])
//   projectToSkills: Map(projectId  -> [skillLabel, ...])
export function buildSkillIndex(skills, projects) {
  const skillToProjects = new Map();
  const projectToSkills = new Map(projects.map((p) => [p.id, []]));
  for (const s of skills) {
    const ids = resolveSkillProjects(s, projects);
    skillToProjects.set(s.label, ids);
    for (const id of ids) projectToSkills.get(id)?.push(s.label);
  }
  return { skillToProjects, projectToSkills };
}
