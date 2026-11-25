import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';

export const VERDICTS = ['supported', 'contradicted', 'insufficient'];

function invalidTask(reason) {
  throw new Error(`CITETRACE_TASK_FILE has an invalid task: ${reason}.`);
}

function requiredText(value, field) {
  if (typeof value !== 'string' || !value.trim()) invalidTask(`${field} must be non-empty text`);
  return value;
}

function requireUniqueIds(items, label) {
  const ids = new Set();
  for (const { id } of items) {
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)) invalidTask(`${label} IDs must be stable lowercase identifiers`);
    if (ids.has(id)) invalidTask(`${label} IDs must be unique`);
    ids.add(id);
  }
}

function normalizeTask(value) {
  if (value?.durationSeconds !== 90) invalidTask('durationSeconds must be 90');
  if (!Array.isArray(value.sources) || !value.sources.length) invalidTask('at least one source is required');
  if (!Array.isArray(value.claims) || value.claims.length !== 3) invalidTask('exactly three claims are required');

  const sources = value.sources.map((source) => {
    if (!Array.isArray(source?.paragraphs) || !source.paragraphs.length) invalidTask('each source needs paragraphs');
    const paragraphs = source.paragraphs.map((paragraph) => ({
      id: requiredText(paragraph?.id, 'paragraph.id'),
      label: requiredText(paragraph?.label, 'paragraph.label'),
      body: requiredText(paragraph?.body, 'paragraph.body'),
    }));
    requireUniqueIds(paragraphs, 'paragraph');
    return {
      id: requiredText(source.id, 'source.id'),
      title: requiredText(source.title, 'source.title'),
      paragraphs,
    };
  });
  requireUniqueIds(sources, 'source');

  const claims = value.claims.map((claim) => ({
    id: requiredText(claim?.id, 'claim.id'),
    text: requiredText(claim?.text, 'claim.text'),
    sourceId: requiredText(claim?.sourceId, 'claim.sourceId'),
    paragraphId: requiredText(claim?.paragraphId, 'claim.paragraphId'),
    answer: requiredText(claim?.answer, 'claim.answer'),
    explanation: requiredText(claim?.explanation, 'claim.explanation'),
  }));
  requireUniqueIds(claims, 'claim');
  if (!VERDICTS.every((verdict) => claims.some((claim) => claim.answer === verdict))) {
    invalidTask('include one claim with each verdict');
  }
  for (const claim of claims) {
    const source = sources.find(({ id }) => id === claim.sourceId);
    if (!source?.paragraphs.some(({ id }) => id === claim.paragraphId)) invalidTask('every claim must cite an existing paragraph');
  }

  return {
    title: requiredText(value.title, 'title'),
    intro: requiredText(value.intro, 'intro'),
    durationSeconds: value.durationSeconds,
    sources,
    claims,
  };
}

export function isWithinDirectory(path, directory) {
  const fromDirectory = relative(directory, path);
  return !fromDirectory || (fromDirectory !== '..' && !fromDirectory.startsWith(`..${sep}`) && !isAbsolute(fromDirectory));
}

function loadPilotWindow(env, liveHeldOut) {
  const startText = env.CITETRACE_PILOT_START_UTC?.trim();
  const endText = env.CITETRACE_PILOT_END_UTC?.trim();
  if (!startText && !endText) return null;
  if (!liveHeldOut) throw new Error('A pilot window requires a held-out task and a Flagsmith environment key.');
  if (!startText || !endText) throw new Error('Set both CITETRACE_PILOT_START_UTC and CITETRACE_PILOT_END_UTC.');

  function parseUtc(value, name) {
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) {
      const iso = new Date(timestamp).toISOString();
      if (value === iso || value === iso.replace(/\.000Z$/, 'Z')) return timestamp;
    }
    throw new Error(`${name} must be a valid ISO 8601 UTC timestamp ending in Z.`);
  }

  const startsAt = parseUtc(startText, 'CITETRACE_PILOT_START_UTC');
  const endsAt = parseUtc(endText, 'CITETRACE_PILOT_END_UTC');
  if (startsAt >= endsAt) throw new Error('The pilot end must be after its start.');
  return { startsAt, endsAt };
}

export async function loadTaskConfiguration(env, publicRoot, defaultTask) {
  const configuredPath = env.CITETRACE_TASK_FILE;
  const experimentText = env.CITETRACE_EXPERIMENT_ID?.trim();
  const live = Boolean(env.FLAGSMITH_ENVIRONMENT_KEY?.trim());
  const pilotWindow = loadPilotWindow(env, Boolean(configuredPath && live));
  if (!configuredPath) {
    if (experimentText) throw new Error('CITETRACE_EXPERIMENT_ID requires CITETRACE_TASK_FILE.');
    return { task: defaultTask };
  }
  if (env.CITETRACE_TRAFFIC === 'synthetic') throw new Error('CITETRACE_TASK_FILE requires pilot traffic.');
  if (!isAbsolute(configuredPath) || extname(configuredPath).toLowerCase() !== '.json') {
    throw new Error('CITETRACE_TASK_FILE must be an absolute path to a JSON file.');
  }

  const expectedExperimentId = experimentText ? Number(experimentText) : null;
  if (live && (!/^\d+$/.test(experimentText ?? '') || !Number.isSafeInteger(expectedExperimentId) || expectedExperimentId < 1)) {
    throw new Error('Set CITETRACE_EXPERIMENT_ID to the positive numeric ID of the held-out Flagsmith experiment.');
  }
  if (!live && experimentText) throw new Error('CITETRACE_EXPERIMENT_ID requires a Flagsmith environment key.');

  const taskPath = await realpath(configuredPath).catch(() => {
    throw new Error('CITETRACE_TASK_FILE could not be resolved.');
  });
  if (isWithinDirectory(resolve(configuredPath), publicRoot) || isWithinDirectory(taskPath, publicRoot)) {
    throw new Error('CITETRACE_TASK_FILE must stay outside the public directory.');
  }
  let value;
  try {
    value = JSON.parse(await readFile(taskPath, 'utf8'));
  } catch {
    throw new Error('CITETRACE_TASK_FILE must be readable and contain valid JSON.');
  }
  const task = normalizeTask(value);
  const taskRevision = createHash('sha256').update(JSON.stringify(task)).digest('hex');
  return { task, taskRevision, expectedExperimentId, pilotWindow };
}
