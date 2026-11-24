import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

import { createApp } from '../server.mjs';
import { createPreviewProvider } from '../lib/flagsmith.mjs';
import { TASK } from '../data/task.mjs';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const js = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

function fakeElement(tagName) {
  const callbacks = new Map();
  return {
    tagName, className: '', dataset: {}, attrs: {}, children: [], hidden: false, firstChild: {}, scrollTop: 0,
    classList: { toggle() {} },
    querySelectorAll(selector) {
      assert.equal(selector, 'input[type="radio"]');
      function inputs(element) {
        if (element.tagName === 'input') return element.type === 'radio' ? [element] : [];
        return element.children.flatMap(inputs);
      }
      return inputs(this);
    },
    append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = items; },
    setAttribute(key, value) { this.attrs[key] = value; },
    addEventListener(event, callback) { callbacks.set(event, callback); },
    fire(event) { return callbacks.get(event)?.({ preventDefault() {} }); },
    getBoundingClientRect() { return { top: this.className.includes('is-cited') ? 352 : 0 }; },
    focus() { this.focused = true; }, scrollIntoView() {},
  };
}

async function boot(app, browser, now) {
  const ui = Object.fromEntries([...html.matchAll(/<([a-z0-9]+)[^>]*?\bid="([^"]+)"[^>]*>/gi)].map(([element, tag, id]) => [id, { ...fakeElement(tag), id, hidden: element.includes(' hidden') }]));
  const pending = new Set();
  const request = async (pathname, options = {}) => {
    const response = { headers: {}, status: 0, value: null, setHeader(name, value) { this.headers[name] = value; }, writeHead(status) { this.status = status; }, end(bytes) { this.value = bytes; } };
    await app.handle({ method: options.method ?? 'GET', url: pathname, headers: { ...options.headers, 'content-type': options.headers?.['Content-Type'], cookie: browser.cookie, host: 'localhost' }, async *[Symbol.asyncIterator]() { if (options.body) yield Buffer.from(options.body); } }, response);
    if (response.headers['Set-Cookie']) browser.cookie = response.headers['Set-Cookie'].split(';')[0];
    return { ok: response.status >= 200 && response.status < 300, json: async () => JSON.parse(response.value) };
  };
  await request('/');
  runInNewContext(js, {
    document: { querySelectorAll: () => Object.values(ui), createElement: fakeElement }, window: { scrollTo() {} },
    fetch: (...args) => { const task = request(...args); pending.add(task); void task.finally(() => pending.delete(task)); return task; },
    setInterval(callback) { browser.tick = callback; return 1; }, clearInterval() { browser.tick = null; },
    matchMedia: () => ({ matches: browser.mobile }), requestAnimationFrame: (callback) => queueMicrotask(callback),
    performance: { now }, sessionStorage: { getItem: (key) => browser.storage.get(key), setItem: (key, value) => browser.storage.set(key, value) },
  });
  const settled = async () => {
    for (let i = 0; i < 4; i++) { await Promise.all([...pending]); await new Promise((resolve) => setImmediate(resolve)); }
  };
  await settled();
  return { ui, settled };
}

for (const variant of ['full_source', 'focused_source']) {
  test(`renders and scores the ${variant} experience`, async (t) => {
    let time = 1760000000000;
    const now = () => time;
    const app = createApp({ clock: now, provider: createPreviewProvider('pilot', variant) });
    t.after(() => app.close());
    const browser = { storage: new Map(), mobile: variant === 'focused_source' };
    let { ui, settled } = await boot(app, browser, now);
    assert.equal(ui.mode.textContent, 'Local preview');
    assert.equal(ui.welcome.hidden, false);
    await ui.start.fire('click');
    await settled();
    assert.equal(ui.workspace.hidden, false);
    assert.equal(ui.time.textContent, '1:30');
    assert.equal(ui.claims.children.length, 3);
    assert.equal(ui.submit.disabled, true);
    ui.claims.children[0].children[2].fire('click');
    const sourceContents = ui['source-article'].children;
    assert.equal(sourceContents.length, TASK.sources[0].paragraphs.length + 2);
    assert.equal(sourceContents.filter((element) => element.className.includes('is-cited')).length, variant === 'focused_source' ? 1 : 0);
    assert.equal(ui['source-scroll'].scrollTop, variant === 'focused_source' ? 340 : 0);
    const choices = [1, 2, 3];
    const firstAnswer = ui.claims.children[0].children[3].children[1].children[0];
    firstAnswer.checked = true;
    firstAnswer.fire('change');
    time += 10000;
    ({ ui, settled } = await boot(app, browser, now));
    assert.equal(ui.progress.textContent, '1 of 3 reviewed');
    assert.equal(ui.time.textContent, '1:20');
    assert.equal(ui.claims.children[0].children[3].children[1].children[0].checked, true);
    if (variant === 'full_source') {
      for (const [index, choice] of choices.entries()) ui.claims.children[index].children[3].children[choice].children[0].fire('change');
    } else {
      time += 81000;
      browser.tick();
      assert.equal(ui['time-notice'].hidden, false);
      assert.ok(ui.claims.querySelectorAll('input[type="radio"]').every((input) => input.disabled));
    }
    assert.equal(ui.submit.disabled, false);
    await ui.review.fire('submit');
    await settled();
    assert.equal(ui.workspace.hidden, true);
    assert.equal(ui.results.hidden, false);
    assert.equal(ui['result-metrics'].children[0].children[0].textContent, variant === 'full_source' ? '3/3' : '1/3');
    assert.equal(ui.feedback.children.length, 3);
    ({ ui, settled } = await boot(app, browser, now));
    assert.equal(ui.results.hidden, false);
  });
}
