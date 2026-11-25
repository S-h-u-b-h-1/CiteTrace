import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { readFile, realpath } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TASK } from './data/task.mjs';
import { createPreviewProvider, createProvider, EXPOSURE_EVENT } from './lib/flagsmith.mjs';
import { openReviews } from './lib/reviews.mjs';
import { scoreAnswers, taskForParticipant } from './lib/scoring.mjs';
import { isWithinDirectory, loadTaskConfiguration, VERDICTS } from './lib/task-loader.mjs';

const COOKIE_NAME = 'citetrace_participant';
const COOKIE_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const PUBLIC_ROOT = await realpath(fileURLToPath(new URL('./public/', import.meta.url)));
const STATIC_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/vnd.microsoft.icon',
  '.woff2': 'font/woff2',
};

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function participantId(req) {
  const pair = (req.headers.cookie || '').split(';').map((piece) => piece.trim())
    .find((piece) => piece.startsWith(`${COOKIE_NAME}=`));
  const id = pair?.slice(COOKIE_NAME.length + 1);
  return id && COOKIE_ID.test(id) ? id : null;
}

function useParticipant(req, res, secureCookie) {
  const existing = participantId(req);
  if (existing) return existing;
  const id = randomUUID();
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${id}; Path=/; Max-Age=604800; HttpOnly; SameSite=Lax${secureCookie ? '; Secure' : ''}`);
  return id;
}

function verifyOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    throw new RequestError(403, 'Request must come from this site.');
  }
  if (parsed.host !== req.headers.host) throw new RequestError(403, 'Request must come from this site.');
}

async function readJson(req) {
  if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) {
    throw new RequestError(415, 'Send a JSON request.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= 4096) chunks.push(chunk);
  }
  if (size > 4096) throw new RequestError(413, 'The submission is too large.');
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new RequestError(400, 'The request is not valid JSON.');
  }
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function validateAnswers(answers, claims, allowPartial) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    throw new RequestError(400, 'Send your verdicts as an answers object.');
  }
  const valid = Object.entries(answers).every(([id, answer]) =>
    claims.some((claim) => claim.id === id) && VERDICTS.includes(answer));
  if (!valid) throw new RequestError(400, 'The submission contains an unknown claim or verdict.');
  if (!allowPartial && Object.keys(answers).length !== claims.length) {
    throw new RequestError(400, 'Choose a verdict for each claim before submitting.');
  }
}

export function createApp({ databasePath = ':memory:', provider = createPreviewProvider(), task = TASK,
  taskRevision = null, expectedExperimentId = null, clock = Date.now, secureCookie = false, logger = console } = {}) {
  const namespace = taskRevision
    ? `${provider.namespace}:task-${taskRevision}:experiment-${expectedExperimentId ?? 'preview'}`
    : provider.namespace;
  const reviews = openReviews(databasePath, namespace);
  const publicTask = taskForParticipant(task);
  let providerError = false;
  let queueError = false;

  function sendPending() {
    if (provider.mode !== 'flagsmith') return;
    for (const event of reviews.pending()) {
      try {
        provider.queue(event.participant_id, event.name, event, event.value);
      } catch {
        queueError = true;
        logger.error('Flagsmith SDK could not queue an experiment event. It remains pending locally.');
        return;
      }
      reviews.markQueued(event, clock());
      queueError = false;
    }
  }

  function reviewTimes(row) {
    const startedAt = row?.exposed_at ?? null;
    return {
      startedAt: startedAt === null ? null : new Date(startedAt).toISOString(),
      expiresAt: startedAt === null ? null : new Date(startedAt + task.durationSeconds * 1000).toISOString(),
      serverNow: new Date(clock()).toISOString(),
    };
  }

  function session(row) {
    return {
      mode: provider.mode,
      traffic: provider.traffic,
      variant: row?.variant ?? null,
      task: row ? publicTask : null,
      ...reviewTimes(row),
      result: row?.result_json ? JSON.parse(row.result_json) : null,
    };
  }

  async function handle(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'");

    try {
      const { pathname } = new URL(req.url, 'http://localhost');
      const method = req.method;

      if (method === 'GET' && pathname === '/api/health') {
        return sendJson(res, 200, {
          mode: provider.mode,
          traffic: provider.traffic,
          assignment: provider.mode === 'preview' ? 'local_only' : providerError ? 'last_failed' : 'configured',
          eventQueue: provider.mode === 'preview' ? 'local_only' : queueError ? 'queue_error' : 'sdk_buffered',
          pendingEvents: provider.mode === 'flagsmith' ? reviews.pendingCount() : 0,
        });
      }

      if (method === 'GET' && pathname === '/api/session') {
        return sendJson(res, 200, session(reviews.read(participantId(req))));
      }

      if (method === 'POST' && pathname === '/api/start') {
        verifyOrigin(req);
        const id = useParticipant(req, res, secureCookie);
        const existing = reviews.read(id);
        if (existing) return sendJson(res, 200, session(existing));

        let assignment;
        try {
          assignment = await provider.assign(id);
        if (expectedExperimentId !== null && Number(assignment.experimentId) !== expectedExperimentId) {
          throw new Error('Flagsmith assigned a different experiment.');
        }
          providerError = false;
        } catch {
          providerError = true;
          logger.error('Flagsmith could not assign the requested active experiment.');
          throw new RequestError(503, 'Experiment assignment is temporarily unavailable. Please try again.');
        }
        return sendJson(res, 200, session(reviews.enroll(id, assignment, clock())));
      }

      if (method === 'POST' && (pathname === '/api/exposure' || pathname === '/api/submit')) {
        verifyOrigin(req);
        const id = participantId(req);
        const row = reviews.read(id);
        if (!row) throw new RequestError(409, 'Start a review first.');

        if (pathname === '/api/exposure') {
          const exposed = reviews.expose(id, clock(), EXPOSURE_EVENT);
          sendPending();
          return sendJson(res, 200, reviewTimes(exposed));
        }

        if (row.result_json) {
          sendPending();
          return sendJson(res, 200, JSON.parse(row.result_json));
        }
        if (row.exposed_at === null) throw new RequestError(409, 'Open the review before submitting.');

        const body = await readJson(req);
        const submittedAt = clock();
        const elapsedMs = Math.max(0, submittedAt - row.exposed_at);
        validateAnswers(body?.answers, task.claims, elapsedMs >= task.durationSeconds * 1000);
        const score = scoreAnswers(task, body.answers, elapsedMs, provider.mode);
        const result = reviews.submit(id, submittedAt, score);
        sendPending();
        return sendJson(res, 200, result);
      }

      if (pathname.startsWith('/api/') || !['GET', 'HEAD'].includes(method)) {
        throw new RequestError(404, 'This route does not exist.');
      }

      const file = pathname === '/' ? resolve(PUBLIC_ROOT, 'index.html') : resolve(PUBLIC_ROOT, `.${decodeURIComponent(pathname)}`);
      const type = STATIC_TYPES[extname(file)];
      if (!type || !isWithinDirectory(file, PUBLIC_ROOT)) throw new RequestError(404, 'This page does not exist.');

      let bytes;
      try {
        const resolvedFile = await realpath(file);
        if (!isWithinDirectory(resolvedFile, PUBLIC_ROOT)) throw new RequestError(404, 'This page does not exist.');
        bytes = await readFile(resolvedFile);
      } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'EISDIR') throw new RequestError(404, 'This page does not exist.');
        throw error;
      }
      if (type === 'text/html' && method === 'GET') useParticipant(req, res, secureCookie);
      res.writeHead(200, { 'Content-Type': `${type}${type.startsWith('text/') ? '; charset=utf-8' : ''}`,
        'Content-Length': bytes.length, 'Cache-Control': 'no-cache' });
      res.end(method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      if (error instanceof RequestError) {
        return sendJson(res, error.status, { error: error.message });
      }
      logger.error('CiteTrace could not complete a request.', error);
      return sendJson(res, 500, { error: 'Something went wrong. Please try again.' });
    }
  }

  sendPending();
  return {
    handle,
    async close() {
      try {
        await provider.close?.();
      } finally {
        reviews.close();
      }
    },
  };
}

async function main() {
  const taskConfiguration = await loadTaskConfiguration(process.env, PUBLIC_ROOT, TASK);
  const databasePath = process.env.CITETRACE_DB || resolve('.citetrace', 'reviews.sqlite');
  if (databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), { recursive: true });
  const provider = await createProvider();
  const app = createApp({ databasePath, provider, ...taskConfiguration,
    secureCookie: process.env.CITETRACE_SECURE_COOKIE === 'true' });
  const server = createServer(app.handle);
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  server.listen(port, host, () => console.log(`CiteTrace ${provider.mode} (${provider.traffic}) listening on http://${host}:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => server.close(() => {
      app.close().catch((error) => {
        console.error('CiteTrace could not finish event shutdown.', error);
        process.exitCode = 1;
      });
    }));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
