import { TASK } from '../data/task.mjs';

const base = new URL(process.env.CITETRACE_URL || 'http://127.0.0.1:3000');
const count = Number(process.argv[2] ?? 40);
if (!Number.isInteger(count) || count < 1 || count > 500) {
  throw new Error('Supply a whole number of attempts from 1 through 500.');
}

async function request(path, { cookie, body } = {}) {
  const response = await fetch(new URL(path, base), {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${data.error ?? 'request failed'}`);
  return { data, cookie: response.headers.get('set-cookie')?.split(';', 1)[0] };
}

const { data: health } = await request('/api/health');
if (health.traffic !== 'synthetic') {
  throw new Error('Start a separate instance with CITETRACE_TRAFFIC=synthetic. No review was started.');
}

const tally = Object.fromEntries(['full_source', 'focused_source'].map((variant) => [
  variant, { exposed: 0, abandoned: 0, completed: 0, passed: 0, falseApprovals: 0 },
]));
const expected = Object.fromEntries(TASK.claims.map(({ id, answer }) => [id, answer]));
const contradicted = TASK.claims.find(({ answer }) => answer === 'contradicted').id;

for (let index = 0; index < count; index += 1) {
  const { data: { variant }, cookie } = await request('/api/start', { body: {} });
  if (!cookie || !Object.hasOwn(tally, variant)) throw new Error('Unexpected session response.');

  await request('/api/exposure', { cookie, body: {} });
  const arm = tally[variant];
  arm.exposed += 1;
  if (index % 7 === 0) {
    arm.abandoned += 1;
    continue;
  }

  const mistake = index % 3 === 0;
  const answers = mistake ? { ...expected, [contradicted]: 'supported' } : expected;
  const { data: result } = await request('/api/submit', { cookie, body: { answers } });
  if (typeof result.passed !== 'boolean' || result.passed === mistake || result.falseApprovals !== Number(mistake)) {
    throw new Error('The server score disagrees with the fixture.');
  }
  arm.completed += 1;
  arm.passed += Number(result.passed);
  arm.falseApprovals += result.falseApprovals;
}

console.log(JSON.stringify({ cohort: 'synthetic', mode: health.mode, count, tally }, null, 2));
