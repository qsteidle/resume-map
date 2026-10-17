import { defineConfig } from 'vite';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Dev-only endpoint: POST /__save-skills writes the request body to
// public/skills.json on disk, so the Skills edit mode (?edit) can save straight
// to the repo without a file picker. Never registered in a production build.
function saveSkillsPlugin() {
  const target = resolve(__dirname, 'public/skills.json');
  return {
    name: 'save-skills-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__save-skills', (req, res, next) => {
        if (req.method !== 'POST') return next();
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', async () => {
          try {
            JSON.parse(body); // reject malformed payloads before writing
            await writeFile(target, body, 'utf8');
            res.statusCode = 200;
            res.end('ok');
          } catch (err) {
            res.statusCode = 400;
            res.end(String(err?.message || err));
          }
        });
      });
    },
  };
}

// Static site. `public/` holds jobs.json, projects.json, resume.pdf and emblems/,
// which are served from the root (e.g. /jobs.json) in dev and copied verbatim on build.
export default defineConfig({
  base: './',
  plugins: [saveSkillsPlugin()],
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
});
