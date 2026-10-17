import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  inlineMd,
  isRealUrl,
  coverOf,
  resolveSize,
  resolveSkillProjects,
  buildSkillIndex,
} from './format.js';

describe('escapeHtml', () => {
  it('escapes the html-significant characters', () => {
    expect(escapeHtml('<a href="x">&\'</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;'
    );
  });
  it('coerces nullish to empty string', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('inlineMd', () => {
  it('turns **bold** into <strong> after escaping', () => {
    expect(inlineMd('a **key** term')).toBe('a <strong>key</strong> term');
  });
  it('handles multiple bold spans on one line non-greedily', () => {
    expect(inlineMd('**one** and **two**')).toBe(
      '<strong>one</strong> and <strong>two</strong>'
    );
  });
  it('does not let markup smuggle html through', () => {
    expect(inlineMd('**<img src=x onerror=1>**')).toBe(
      '<strong>&lt;img src=x onerror=1&gt;</strong>'
    );
  });
  it('leaves un-bolded text untouched (incl. unicode)', () => {
    expect(inlineMd('R² ≈ 0.37, 5×10⁻³')).toBe('R² ≈ 0.37, 5×10⁻³');
  });
});

describe('isRealUrl', () => {
  it('rejects placeholder + empty urls', () => {
    expect(isRealUrl('path/to/x.png')).toBe(false);
    expect(isRealUrl('')).toBe(false);
    expect(isRealUrl(undefined)).toBe(false);
  });
  it('accepts real relative + absolute urls', () => {
    expect(isRealUrl('media/x.png')).toBe(true);
    expect(isRealUrl('https://a.b/c')).toBe(true);
  });
});

describe('coverOf', () => {
  it('prefers an explicit real cover', () => {
    const p = { cover: { type: 'video', url: 'media/hero.mp4' }, media: [{ type: 'image', url: 'media/a.png' }] };
    expect(coverOf(p)).toEqual({ type: 'video', url: 'media/hero.mp4' });
  });
  it('ignores a placeholder cover and falls back to first real media', () => {
    const p = { cover: { type: 'image', url: 'path/to/x.png' }, media: [{ type: 'image', url: 'media/a.png' }] };
    expect(coverOf(p)).toEqual({ type: 'image', url: 'media/a.png' });
  });
  it('skips link media and placeholder media when choosing a fallback', () => {
    const p = { media: [{ type: 'link', url: 'https://x' }, { type: 'image', url: 'path/to/a.png' }, { type: 'image', url: 'media/real.png' }] };
    expect(coverOf(p).url).toBe('media/real.png');
  });
  it('returns null when there is no usable visual', () => {
    expect(coverOf({ media: [{ type: 'link', url: 'https://x' }] })).toBeNull();
    expect(coverOf({})).toBeNull();
  });
});

describe('resolveSize', () => {
  it('passes through known sizes', () => {
    expect(resolveSize({ size: 'feature' })).toBe('feature');
    expect(resolveSize({ size: 'wide' })).toBe('wide');
  });
  it('defaults unknown/missing to regular', () => {
    expect(resolveSize({ size: 'huge' })).toBe('regular');
    expect(resolveSize({})).toBe('regular');
  });
});

const PROJECTS = [
  { id: 'p1', skills: ['Python', 'XGBoost', 'pandas'] },
  { id: 'p2', skills: ['SolidWorks', 'CFD'] },
  { id: 'p3', skills: ['Python', 'MapLibre GL JS'] },
];

describe('resolveSkillProjects', () => {
  it('uses explicit curated ids when present', () => {
    expect(resolveSkillProjects({ label: 'X', projects: ['p2', 'p3'] }, PROJECTS)).toEqual(['p2', 'p3']);
  });
  it('drops explicit ids that do not exist', () => {
    expect(resolveSkillProjects({ label: 'X', projects: ['p2', 'ghost'] }, PROJECTS)).toEqual(['p2']);
  });
  it('matches by keyword against project tags (case-insensitive)', () => {
    expect(resolveSkillProjects({ label: 'ML', match: ['xgboost', 'maplibre'] }, PROJECTS)).toEqual(['p1', 'p3']);
  });
  it('falls back to matching the label itself', () => {
    expect(resolveSkillProjects({ label: 'Python' }, PROJECTS)).toEqual(['p1', 'p3']);
  });
});

describe('buildSkillIndex', () => {
  it('builds a bidirectional map', () => {
    const skills = [
      { label: 'Python' },
      { label: 'Mechanical', match: ['solidworks', 'cfd'] },
    ];
    const { skillToProjects, projectToSkills } = buildSkillIndex(skills, PROJECTS);
    expect(skillToProjects.get('Python')).toEqual(['p1', 'p3']);
    expect(skillToProjects.get('Mechanical')).toEqual(['p2']);
    expect(projectToSkills.get('p1')).toEqual(['Python']);
    expect(projectToSkills.get('p2')).toEqual(['Mechanical']);
    expect(projectToSkills.get('p3')).toEqual(['Python']);
  });
  it('gives every project an entry even with no matching skill', () => {
    const { projectToSkills } = buildSkillIndex([], PROJECTS);
    expect(projectToSkills.get('p2')).toEqual([]);
  });
});
