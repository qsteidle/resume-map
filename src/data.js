import { store } from './store.js';

/**
 * Load jobs + projects JSON and populate the store.
 * Served from /public at the site root.
 */
export async function loadData() {
  const [jobsRes, projectsRes] = await Promise.all([
    fetch('jobs.json'),
    fetch('projects.json'),
  ]);

  if (!jobsRes.ok) throw new Error(`jobs.json: HTTP ${jobsRes.status}`);
  const jobs = await jobsRes.json();
  store.categories = jobs.categories || {};
  store.jobData = jobs.jobs || {};

  // Projects are non-fatal: the site still works without them.
  if (projectsRes.ok) {
    const projects = await projectsRes.json();
    store.projects = projects.projects || [];
  } else {
    console.warn(`projects.json: HTTP ${projectsRes.status} — projects tab will be empty`);
    store.projects = [];
  }

  return store;
}
