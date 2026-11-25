import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFlagsmithProvider } from '../lib/flagsmith.mjs';

function makeProvider(flag) {
  return createFlagsmithProvider({
    client: { async getIdentityFlags() { return { getFlag: () => flag }; } },
    flagName: 'citation_opening',
    environmentKey: 'test',
    traffic: 'pilot',
  });
}

const control = {
  enabled: true,
  value: 'full_source',
  variant: 'control',
  experiment: { inExperiment: true, id: 42 },
};

test('accepts documented Flagsmith assignments and normalizes decimal experiment IDs', async () => {
  assert.deepEqual(await makeProvider(control).assign('reviewer'), {
    variant: 'full_source', variantKey: 'control', experimentId: 42,
  });
  const treatment = { ...control, value: 'focused_source', variant: 'focused_source',
    experiment: { inExperiment: true, id: '42' } };
  assert.deepEqual(await makeProvider(treatment).assign('reviewer'), {
    variant: 'focused_source', variantKey: 'focused_source', experimentId: 42,
  });
});

test('rejects swapped, unknown, or incomplete variant mappings', async () => {
  for (const invalid of [
    { ...control, value: 'focused_source' },
    { ...control, variant: 'focused_source' },
    { ...control, variant: 'full_source' },
    { ...control, value: undefined, variant: undefined },
  ]) {
    await assert.rejects(makeProvider(invalid).assign('reviewer'), /supported active experiment assignment/);
  }
});

test('rejects missing and noncanonical experiment identifiers', async () => {
  for (const id of [undefined, null, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, true, '0', ' 42', '42.0', '4e1', '0x2a', '0042', '9007199254740992']) {
    const invalid = { ...control, experiment: { inExperiment: true, id } };
    await assert.rejects(makeProvider(invalid).assign('reviewer'), /supported active experiment assignment/);
  }
});

