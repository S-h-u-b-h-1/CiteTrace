import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { TASK } from '../data/task.mjs';
import { createFlagsmithProvider, createPreviewProvider } from '../lib/flagsmith.mjs';
import { loadTaskConfiguration } from '../lib/task-loader.mjs';
import { createApp } from '../server.mjs';

const correctAnswers = Object.fromEntries(TASK.claims.map(({ id, answer }) => [id, answer]));
const quiet = { error() {} };

async function request(app, path, { method = 'GET', cookie, body, headers = {} } = {}) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const req = Object.assign(Readable.from(chunks), {
    method,
    url: path,
    headers: {
      host: 'citetrace.test',
      ...(cookie ? { cookie } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
  });
  const response = {
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    writeHead(status, values) {
      this.status = status;
      for (const [name, value] of Object.entries(values)) this.setHeader(name, value);
    },
    end(bytes) { this.text = bytes?.toString() ?? ''; },
  };
  await app.handle(req, response);
  return {
    ...response,
    cookie: response.headers['set-cookie']?.split(';')[0],
    json: response.headers['content-type']?.startsWith('application/json') ? JSON.parse(response.text) : undefined,
  };
}

function flagsmithFixture({ variant = 'focused_source' } = {}) {
  const calls = [];
  let unavailable = false;
  let queueUnavailable = false;
  const client = {
    async getIdentityFlags(id) {
      calls.push(['assignment', id]);
      if (unavailable) throw new Error('upstream unavailable');
      return {
        getFlag(flagName) {
          assert.equal(flagName, 'citation_opening');
          return {
            enabled: true,
            value: variant,
            variant: variant === 'full_source' ? 'control' : 'focused_source',
            experiment: { inExperiment: true, id: 42 },
          };
        },
      };
    },
    trackExposureEvent(...args) {
      if (queueUnavailable) throw new Error('event queue unavailable');
      calls.push(['exposure', ...args]);
    },
    trackEvent(...args) { calls.push(['event', ...args]); },
    async close() { calls.push(['close']); },
  };
  const provider = createFlagsmithProvider({
    client,
    flagName: 'citation_opening',
    environmentKey: 'fixture-environment-key',
    traffic: 'pilot',
  });
  return {
    calls,
    provider,
    setUnavailable(value) { unavailable = value; },
    setQueueUnavailable(value) { queueUnavailable = value; },
  };
}

test('serves the app and starts a stable preview without exposing the answer key', async (t) => {
  const app = createApp();
  t.after(() => app.close());
  const page = await request(app, '/');
  assert.equal(page.status, 200);
  assert.match(page.headers['content-type'], /^text\/html/);
  assert.match(page.headers['set-cookie'], /HttpOnly; SameSite=Lax/);
  assert.match(page.text, /CiteTrace/);
  const scripts = await request(app, '/app.js', { cookie: page.cookie });
  assert.equal(scripts.status, 200);
  assert.equal((await request(app, '/data/task.mjs')).status, 404);

  const before = await request(app, '/api/session', { cookie: page.cookie });
  assert.equal(before.json.task, null);
  const start = await request(app, '/api/start', { method: 'POST', cookie: page.cookie });
  assert.equal(start.status, 200);
  assert.equal(start.json.mode, 'preview');
  assert.ok(['full_source', 'focused_source'].includes(start.json.variant));
  assert.equal(start.json.startedAt, null);
  assert.ok(start.json.task.claims.every((claim) => !Object.hasOwn(claim, 'answer') && !Object.hasOwn(claim, 'explanation')));
  const resume = await request(app, '/api/session', { cookie: page.cookie });
  assert.equal(resume.json.variant, start.json.variant);
  assert.equal(resume.json.task.title, TASK.title);
});

test('uses the same provider identity, records one rendered exposure, and preserves the first result', async (t) => {
  const fixture = flagsmithFixture({ variant: 'full_source' });
  let now = 1_000_000;
  const app = createApp({ provider: fixture.provider, clock: () => now });
  t.after(() => app.close());

  const start = await request(app, '/api/start', { method: 'POST' });
  const cookie = start.cookie;
  assert.equal(start.json.variant, 'full_source');
  assert.deepEqual(fixture.calls.map(([kind]) => kind), ['assignment']);
  const early = await request(app, '/api/submit', { method: 'POST', cookie, body: { answers: correctAnswers } });
  assert.equal(early.status, 409);

  const first = await request(app, '/api/exposure', { method: 'POST', cookie });
  now += 10_000;
  const second = await request(app, '/api/exposure', { method: 'POST', cookie });
  assert.equal(first.json.startedAt, second.json.startedAt);
  assert.equal(Date.parse(first.json.expiresAt) - Date.parse(first.json.startedAt), 90_000);
  const { json: resumed } = await request(app, '/api/start', { method: 'POST', cookie });
  assert.equal(resumed.variant, 'full_source');
  assert.equal(resumed.startedAt, first.json.startedAt);

  const results = await Promise.all([
    request(app, '/api/submit', { method: 'POST', cookie, body: { answers: correctAnswers } }),
    request(app, '/api/submit', { method: 'POST', cookie, body: { answers: correctAnswers } }),
  ]);
  const result = results[0].json;
  assert.equal(results[0].status, 200);
  assert.deepEqual(result, results[1].json);
  assert.equal(result.passed, true);
  assert.equal(result.falseApprovals, 0);
  assert.equal(result.elapsedSeconds, 10);
  assert.deepEqual((await request(app, '/api/session', { cookie })).json.result, result);

  const id = fixture.calls[0][1];
  assert.match(id, /^citetrace-pilot-/);
  assert.deepEqual(fixture.calls.slice(1), [
    ['exposure', 'citation_opening', { identifier: id, value: 'control', metadata: { experiment_id: 42 } }],
    ['event', 'review_submitted', { identifier: id, value: 10 }],
    ['event', 'review_passed', { identifier: id }],
  ]);
});

test('records a false approval and timeouts while rejecting malformed early reviews', async (t) => {
  const fixture = flagsmithFixture();
  let now = 2_000_000;
  const app = createApp({ provider: fixture.provider, clock: () => now });
  t.after(() => app.close());
  const { cookie } = await request(app, '/api/start', { method: 'POST' });
  await request(app, '/api/exposure', { method: 'POST', cookie });
  const wrongId = TASK.claims.find(({ answer }) => answer !== 'supported').id;
  const partial = { answers: { [wrongId]: 'supported' } };

  assert.equal((await request(app, '/api/submit', { method: 'POST', cookie, body: partial })).status, 400);
  assert.equal((await request(app, '/api/submit', { method: 'POST', cookie, body: partial,
    headers: { origin: 'https://other.test' } })).status, 403);
  now += 90_001;
  const result = await request(app, '/api/submit', { method: 'POST', cookie, body: partial });
  assert.equal(result.status, 200);
  assert.equal(result.json.passed, false);
  assert.equal(result.json.expired, true);
  assert.equal(result.json.falseApprovals, 1);
  assert.deepEqual(fixture.calls.filter(([kind]) => kind === 'event').map(([, name]) => name),
    ['review_submitted', 'false_approval']);
});

test('fails closed on assignment errors and retries locally pending SDK events', async (t) => {
  const fixture = flagsmithFixture();
  const app = createApp({ provider: fixture.provider, logger: quiet });
  t.after(() => app.close());
  fixture.setUnavailable(true);
  const failed = await request(app, '/api/start', { method: 'POST' });
  assert.equal(failed.status, 503);
  const cookie = failed.cookie;
  assert.equal((await request(app, '/api/session', { cookie })).json.variant, null);
  assert.equal((await request(app, '/api/health')).json.assignment, 'last_failed');
  fixture.setUnavailable(false);
  assert.equal((await request(app, '/api/start', { method: 'POST', cookie })).json.mode, 'flagsmith');
  fixture.setQueueUnavailable(true);
  await request(app, '/api/exposure', { method: 'POST', cookie });
  const pending = await request(app, '/api/health');
  assert.equal(pending.json.eventQueue, 'queue_error');
  assert.equal(pending.json.pendingEvents, 1);
  fixture.setQueueUnavailable(false);
  await request(app, '/api/exposure', { method: 'POST', cookie });
  const recovered = await request(app, '/api/health');
  assert.equal(recovered.json.eventQueue, 'sdk_buffered');
  assert.equal(recovered.json.pendingEvents, 0);
  assert.equal(fixture.calls.filter(([kind]) => kind === 'exposure').length, 1);
});

test('keeps reviews after restart and separates pilot by traffic namespace', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'citetrace-test-'));
  const databasePath = join(directory, 'reviews.sqlite');
  try {
    const initial = createApp({ databasePath });
    const { cookie } = await request(initial, '/api/start', { method: 'POST' });
    await request(initial, '/api/exposure', { method: 'POST', cookie });
    const completed = await request(initial, '/api/submit', { method: 'POST', cookie, body: { answers: correctAnswers } });
    await initial.close();

    const reopened = createApp({ databasePath });
    const recovered = await request(reopened, '/api/session', { cookie });
    assert.deepEqual(recovered.json.result, completed.json);
    await reopened.close();

    const synthetic = createApp({ databasePath, provider: createPreviewProvider('synthetic') });
    const separate = await request(synthetic, '/api/session', { cookie });
    assert.equal(separate.json.traffic, 'synthetic');
    assert.equal(separate.json.variant, null);
    assert.equal(separate.json.result, null);
    await synthetic.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

async function privateTaskFiles(t) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'citetrace-held-out-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const publicRoot = join(directory, 'public');
  await mkdir(publicRoot);
  const taskPath = join(directory, 'task.json');
  const task = structuredClone(TASK);
  task.title = 'Held-out test fixture';
  task.claims[0].explanation = 'Private feedback fixture';
  task.sources[0].paragraphs[0].answer = 'Unrecognized fields must stay out of public responses';
  await writeFile(taskPath, JSON.stringify(task));
  return { directory, publicRoot, taskPath, task, env: { CITETRACE_TASK_FILE: taskPath } };
}

test('validates held-out task paths, citation pointers, and live configuration before startup', async (t) => {
  const { directory, publicRoot, taskPath, task, env } = await privateTaskFiles(t);
  assert.deepEqual(await loadTaskConfiguration({}, publicRoot, TASK), { task: TASK });
  const load = (variables) => loadTaskConfiguration(variables, publicRoot, TASK);
  await assert.rejects(load({ CITETRACE_TASK_FILE: 'task.json' }), /absolute path/);
  await assert.rejects(load({ ...env, CITETRACE_TRAFFIC: 'synthetic' }), /requires pilot traffic/);
  await assert.rejects(load({ ...env, FLAGSMITH_ENVIRONMENT_KEY: 'fake-test-key' }), /CITETRACE_EXPERIMENT_ID/);

  const visiblePath = join(publicRoot, 'task.json');
  await writeFile(visiblePath, JSON.stringify(task));
  const alias = join(directory, 'visible-alias.json');
  await symlink(visiblePath, alias);
  await assert.rejects(load({ CITETRACE_TASK_FILE: visiblePath }), /outside the public/);
  await assert.rejects(load({ CITETRACE_TASK_FILE: alias }), /outside the public/);

  const loaded = await load({ ...env, FLAGSMITH_ENVIRONMENT_KEY: 'fake-test-key', CITETRACE_EXPERIMENT_ID: '42' });
  assert.equal(loaded.expectedExperimentId, 42);
  assert.match(loaded.taskRevision, /^[a-f0-9]{64}$/);
  assert.equal(loaded.task.sources[0].paragraphs[0].answer, undefined);
  task.claims[0].paragraphId = 'missing-field';
  await writeFile(taskPath, JSON.stringify(task));
  await assert.rejects(load(env), /cite an existing paragraph/);
});

test('held-out feedback remains private until submission and old attempts cannot cross task revisions', async (t) => {
  const { directory, publicRoot, taskPath, task, env } = await privateTaskFiles(t);
  const databasePath = join(directory, 'reviews.sqlite');
  const initial = await loadTaskConfiguration(env, publicRoot, TASK);
  const first = createApp({ databasePath, ...initial });
  let cookie;
  let completed;
  try {
    const started = await request(first, '/api/start', { method: 'POST' });
    cookie = started.cookie;
    assert.equal(started.json.task.title, task.title);
    assert.equal(started.json.task.claims[0].answer, undefined);
    assert.equal(started.json.task.claims[0].explanation, undefined);
    assert.equal(started.json.task.sources[0].paragraphs[0].answer, undefined);
    await request(first, '/api/exposure', { method: 'POST', cookie });
    completed = await request(first, '/api/submit', { method: 'POST', cookie, body: { answers: correctAnswers } });
    assert.equal(completed.json.feedback[0].explanation, task.claims[0].explanation);
  } finally {
    await first.close();
  }

  await writeFile(taskPath, JSON.stringify(task, null, 2));
  const reformatted = await loadTaskConfiguration(env, publicRoot, TASK);
  const resumed = createApp({ databasePath, ...reformatted });
  try {
    assert.equal(reformatted.taskRevision, initial.taskRevision);
    assert.deepEqual((await request(resumed, '/api/session', { cookie })).json.result, completed.json);
  } finally {
    await resumed.close();
  }

  task.claims[0].explanation = 'New version private feedback';
  await writeFile(taskPath, JSON.stringify(task));
  const revised = await loadTaskConfiguration(env, publicRoot, TASK);
  const next = createApp({ databasePath, ...revised });
  try {
    assert.notEqual(revised.taskRevision, initial.taskRevision);
    assert.equal((await request(next, '/api/session', { cookie })).json.variant, null);
    assert.equal((await request(next, '/api/submit', { method: 'POST', cookie, body: { answers: correctAnswers } })).status, 409);
  } finally {
    await next.close();
  }
});

test('rejects held-out assignments from a different Flagsmith experiment before exposure', async (t) => {
  const { publicRoot, env } = await privateTaskFiles(t);
  const config = await loadTaskConfiguration({ ...env, FLAGSMITH_ENVIRONMENT_KEY: 'fake-test-key',
    CITETRACE_EXPERIMENT_ID: '41' }, publicRoot, TASK);
  const fixture = flagsmithFixture();
  const app = createApp({ provider: fixture.provider, ...config, logger: quiet });
  t.after(() => app.close());
  const attempt = await request(app, '/api/start', { method: 'POST' });
  assert.equal(attempt.status, 503);
  assert.equal((await request(app, '/api/exposure', { method: 'POST', cookie: attempt.cookie })).status, 409);
  assert.deepEqual(fixture.calls.map(([kind]) => kind), ['assignment']);
});
