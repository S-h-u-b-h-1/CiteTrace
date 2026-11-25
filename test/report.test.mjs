import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { openReviews } from '../lib/reviews.mjs';

test('reports claim verdicts by experiment and arm without attributing abandoned reviews', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'citetrace-audit-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const database = join(directory, 'reviews.sqlite');
  const reviews = openReviews(database, 'flagsmith:pilot:test:citation_opening');
  const enroll = (participant, experimentId, variant = 'full_source') => {
    reviews.enroll(participant, { experimentId, variant, variantKey: 'control' }, 1);
    reviews.expose(participant, 2, '$flag_exposure');
  };
  const submit = (participant, feedback, falseApprovals) => {
    reviews.submit(participant, 3, { feedback, falseApprovals, passed: false, elapsedSeconds: 1 });
  };

  enroll('first-review', 101);
  enroll('abandoned-review', 101);
  enroll('treatment-review', 101, 'focused_source');
  enroll('new-experiment-review', 102);
  submit('first-review', [
    { answer: 'contradicted', selected: 'supported', explanation: 'private passage' },
    { answer: 'insufficient', selected: null },
  ], 1);
  submit('treatment-review', [{ answer: 'insufficient', selected: 'supported' }], 1);
  submit('new-experiment-review', [{ answer: 'contradicted', selected: 'contradicted' }], 0);
  reviews.close();

  const script = fileURLToPath(new URL('../scripts/report.mjs', import.meta.url));
  const output = execFileSync(process.execPath, [script, database], { encoding: 'utf8' });
  assert.doesNotMatch(output, /first-review|abandoned-review|private passage/);
  const { arms } = JSON.parse(output);
  assert.equal(arms.length, 3);
  const first = arms.find((arm) => arm.experimentId === 101 && arm.variant === 'full_source');
  assert.equal(first.exposed, 2);
  assert.equal(first.submitted, 1);
  assert.deepEqual(first.verdictBreakdown.contradicted, {
    submittedClaims: 1, supported: 1, contradicted: 0, insufficient: 0, unanswered: 0,
  });
  assert.equal(first.verdictBreakdown.insufficient.unanswered, 1);
  const treatment = arms.find((arm) => arm.variant === 'focused_source');
  assert.equal(treatment.verdictBreakdown.insufficient.supported, 1);
  const second = arms.find((arm) => arm.experimentId === 102);
  assert.equal(second.verdictBreakdown.contradicted.contradicted, 1);
  assert.equal(second.verdictBreakdown.contradicted.supported, 0);
});
