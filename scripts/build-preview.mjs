import { readFile, writeFile } from 'node:fs/promises';
import { TASK } from '../data/task.mjs';
import { scoreAnswers, taskForParticipant } from '../lib/scoring.mjs';

const readSource = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [markup, styles, app] = await Promise.all([
  readSource('../public/index.html'),
  readSource('../public/styles.css'),
  readSource('../public/app.js'),
]);

function previewRuntime(task, score, publicTask, mount) {
  const allowed = ['full_source', 'focused_source'];
  const view = document.getElementById('preview-variant');
  const chosen = new URLSearchParams(location.search).get('view');
  view.value = allowed.includes(chosen) ? chosen : 'full_source';
  view.addEventListener('change', () => {
    location.search = new URLSearchParams({ view: view.value }).toString();
  });
  const mode = 'preview';
  const traffic = 'pilot';
  let variant = null;
  let exposedAt = null;
  let result = null;
  const times = () => ({
    startedAt: exposedAt === null ? null : new Date(exposedAt).toISOString(),
    expiresAt: exposedAt === null ? null : new Date(exposedAt + task.durationSeconds * 1_000).toISOString(),
    serverNow: new Date().toISOString(),
  });
  const state = () => ({ mode, traffic, variant, task: variant ? publicTask : null, ...times(), result });

  async function localFetch(path, options = {}) {
    let payload;
    if (path === '/api/start') {
      variant ||= view.value;
      payload = state();
    } else if (path === '/api/session') {
      payload = state();
    } else if (path === '/api/exposure') {
      exposedAt ??= Date.now();
      payload = times();
    } else if (path === '/api/submit') {
      result ||= score(task, JSON.parse(options.body).answers, Date.now() - exposedAt, mode);
      payload = result;
    } else {
      return { ok: false, json: async () => ({ error: 'Preview route unavailable.' }) };
    }
    return { ok: true, json: async () => payload };
  }

  mount(localFetch);
}

const embed = (value) => JSON.stringify(value).replaceAll('<', '\\u003c');
const script = `(${previewRuntime})(${embed(TASK)}, ${scoreAnswers}, ${embed(taskForParticipant(TASK))}, function(fetch) {\n${app}\n});`;
const css = `${styles}
.preview-controls { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; justify-content: flex-end; }
.preview-controls label { display: flex; gap: .4rem; align-items: center; font-size: .77rem; color: var(--muted); }
.preview-controls select { font: inherit; padding: .3rem; background: var(--paper-white); color: var(--ink); border: 1px solid var(--line); border-radius: 4px; }`;
const controls = '<div class="preview-controls"><div class="status" id="mode" hidden></div><label>Preview arm <select id="preview-variant"><option value="full_source">Full source</option><option value="focused_source">Focused citation</option></select></label></div>';
const preview = markup
  .replace('<title>CiteTrace — Evidence review</title>', '<title>CiteTrace — Offline preview</title>')
  .replace('<link rel="stylesheet" href="/styles.css">', () => `<style>\n${css}\n</style>`)
  .replace('  <script type="module" src="/app.js"></script>\n', '')
  .replace('class="brand" href="/"', 'class="brand" href="?view=full_source"')
  .replace('<div class="status" id="mode" hidden></div>', controls)
  .replace('</body>', () => `<script>\n${script}\n</script>\n</body>`);
const target = process.argv[2] ?? 'CiteTrace-preview.html';
await writeFile(target, preview);
console.log(`Wrote ${target}`);
