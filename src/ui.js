import { store, bus, EVENTS } from './store.js';
import { initProjects } from './projects.js';

const THEME_KEY = 'resume-theme';
const VIEWS = { resume: 'view-resume', projects: 'view-projects', contact: 'view-contact' };

const SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>';
const MOON = '<path d="M20 14.5A8 8 0 0 1 9.5 4 7 7 0 1 0 20 14.5z"/>';

// -------------------------------------------------------------------------
// Views (top nav)
// -------------------------------------------------------------------------
export function setView(name) {
  const id = VIEWS[name];
  if (!id) return;

  document.querySelectorAll('.nav__btn').forEach((b) => {
    if (b.dataset.view === name) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });

  Object.values(VIEWS).forEach((vid) =>
    document.getElementById(vid)?.classList.remove('is-active'));
  document.getElementById(id)?.classList.add('is-active');

  bus.emit(EVENTS.TAB_CHANGED, { tab: name });
  if (name === 'projects') initProjects();
  if (name === 'resume') bus.emit(EVENTS.JOB_DESELECTED);
}

function initNav() {
  document.querySelectorAll('.nav__btn').forEach((btn) =>
    btn.addEventListener('click', () => setView(btn.dataset.view)));
  // In-page view jumps (the contact page's "keep exploring" buttons). Kept on a
  // separate attribute so they don't inherit .nav__btn's styling or its
  // aria-current bookkeeping — they're shortcuts, not tabs.
  document.querySelectorAll('[data-nav-to]').forEach((btn) =>
    btn.addEventListener('click', () => setView(btn.dataset.navTo)));
}

// -------------------------------------------------------------------------
// Theme
// -------------------------------------------------------------------------
function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  setTheme(saved || (prefersDark ? 'dark' : 'light'), false);
  document.getElementById('theme-toggle')?.addEventListener('click', () =>
    setTheme(store.theme === 'dark' ? 'light' : 'dark'));
}

export function setTheme(theme, emit = true) {
  store.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  const icon = document.getElementById('theme-icon');
  if (icon) icon.innerHTML = theme === 'dark' ? SUN : MOON;
  if (emit) bus.emit(EVENTS.THEME_CHANGED, { theme });
}

// -------------------------------------------------------------------------
// Modals (Help + PDF)
// -------------------------------------------------------------------------
function open(id) { document.getElementById(id)?.classList.add('is-open'); }
function close(id) { document.getElementById(id)?.classList.remove('is-open'); }

function wireModal(modalId, openBtnId, closeBtnId) {
  const modal = document.getElementById(modalId);
  document.getElementById(openBtnId)?.addEventListener('click', (e) => { e.stopPropagation(); open(modalId); });
  document.getElementById(closeBtnId)?.addEventListener('click', () => close(modalId));
  modal?.addEventListener('click', (e) => { if (e.target === modal) close(modalId); });
}

function initModals() {
  wireModal('help-modal', 'help-btn', 'help-close');
  wireModal('pdf-modal', 'pdf-btn', 'pdf-close');

  const pdf = 'resume.pdf';
  // Lazily load the preview: only fetch/render the PDF while the modal is open,
  // and unload it on close so it isn't rendered in the background.
  const frame = document.getElementById('pdf-frame');
  const loadPreview = (on) => {
    if (!frame) return;
    if (on) frame.setAttribute('data', `${pdf}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`);
    else frame.removeAttribute('data');
  };
  document.getElementById('pdf-btn')?.addEventListener('click', () => loadPreview(true));
  document.getElementById('pdf-close')?.addEventListener('click', () => loadPreview(false));
  document.getElementById('pdf-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'pdf-modal') loadPreview(false);
  });

  // Open in a new tab (browser's native PDF viewer: zoom/print, works on mobile).
  document.getElementById('pdf-view')?.addEventListener('click', () => {
    window.open(pdf, '_blank');
  });
  // Download → save the file AND open it in a new tab.
  document.getElementById('pdf-download')?.addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = pdf; a.download = 'Quincy-Steidle-Resume.pdf'; a.click();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.modal.is-open').forEach((m) => m.classList.remove('is-open'));
    loadPreview(false);
  });
}

export function initUI() {
  initTheme();
  initNav();
  initModals();
}
