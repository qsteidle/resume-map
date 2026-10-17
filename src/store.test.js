import { describe, it, expect } from 'vitest';
import { jobInCategory } from './store.js';

describe('jobInCategory', () => {
  it("'all' matches every job", () => {
    expect(jobInCategory({ category: 'sports' }, 'all')).toBe(true);
  });
  it('matches the primary category', () => {
    expect(jobInCategory({ category: 'engineering' }, 'engineering')).toBe(true);
  });
  it('matches a secondary category', () => {
    const job = { category: 'sports', secondaryCategories: ['engineering'] };
    expect(jobInCategory(job, 'engineering')).toBe(true);
  });
  it('does not match an unrelated category', () => {
    expect(jobInCategory({ category: 'sports' }, 'engineering')).toBe(false);
  });
  it('tolerates a missing/invalid secondaryCategories field', () => {
    expect(jobInCategory({ category: 'sports', secondaryCategories: null }, 'engineering')).toBe(false);
    expect(jobInCategory({ category: 'sports' }, 'engineering')).toBe(false);
  });
});
