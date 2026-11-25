import { DatabaseSync } from 'node:sqlite';

const databasePath = process.argv[2] || process.env.CITETRACE_DB || '.citetrace/reviews.sqlite';
const db = new DatabaseSync(databasePath, { readOnly: true });
try {
  db.exec('BEGIN');
  const rows = db.prepare(`
    SELECT namespace, experiment_id AS experimentId, variant, COUNT(*) AS enrolled,
           SUM(exposed_at IS NOT NULL) AS exposed,
           SUM(submitted_at IS NOT NULL) AS submitted,
           SUM(COALESCE(json_extract(result_json, '$.passed'), 0)) AS passed,
           SUM(COALESCE(json_extract(result_json, '$.expired'), 0)) AS expiredSubmissions,
           SUM(COALESCE(json_extract(result_json, '$.falseApprovals'), 0) > 0) AS reviewersWithFalseApproval
      FROM reviews
     GROUP BY namespace, experiment_id, variant
     ORDER BY namespace, experiment_id, variant
  `).all();
  const events = db.prepare(`
    WITH event_names(name) AS (
      VALUES ('$flag_exposure'), ('review_submitted'), ('review_passed'), ('false_approval')
    ), per_review AS (
      SELECT r.namespace, r.experiment_id, r.variant, n.name,
             CASE n.name
               WHEN '$flag_exposure' THEN r.exposed_at IS NOT NULL
               WHEN 'review_submitted' THEN r.submitted_at IS NOT NULL
               WHEN 'review_passed' THEN COALESCE(json_extract(r.result_json, '$.passed'), 0) <> 0
               WHEN 'false_approval' THEN COALESCE(json_extract(r.result_json, '$.falseApprovals'), 0) > 0
             END AS expected,
             e.name IS NOT NULL AS recorded,
             e.queued_at IS NOT NULL AS queued
        FROM reviews r CROSS JOIN event_names n
        LEFT JOIN review_events e ON e.namespace = r.namespace
          AND e.participant_id = r.participant_id AND e.name = n.name
    )
    SELECT namespace, experiment_id AS experimentId, variant, name,
           SUM(expected) AS expected, SUM(recorded) AS recorded,
           SUM(expected AND NOT recorded) AS missing, SUM(recorded AND NOT expected) AS unexpected,
           SUM(queued) AS sdkQueued, SUM(recorded AND NOT queued) AS pendingSdkQueue
      FROM per_review
     GROUP BY namespace, experiment_id, variant, name
     ORDER BY namespace, experiment_id, variant, name
  `).all();
  db.exec('COMMIT');

  const armKey = ({ namespace, experimentId, variant }) => JSON.stringify([namespace, experimentId, variant]);
  const audits = new Map(rows.map((row) => [armKey(row), {}]));
  for (const event of events) {
    const { name, expected, recorded, missing, unexpected, sdkQueued, pendingSdkQueue } = event;
    const usesSdk = event.namespace.startsWith('flagsmith:');
    audits.get(armKey(event))[name] = {
      expected, recorded, missing, unexpected,
      sdkQueued: usesSdk ? sdkQueued : null,
      pendingSdkQueue: usesSdk ? pendingSdkQueue : null,
    };
  }
  const arms = rows.map((row) => ({
    ...row,
    unsubmittedAfterExposure: row.exposed - row.submitted,
    passRatePerExposure: row.exposed ? row.passed / row.exposed : null,
    falseApprovalRatePerExposure: row.exposed ? row.reviewersWithFalseApproval / row.exposed : null,
    falseApprovalRatePerSubmission: row.submitted ? row.reviewersWithFalseApproval / row.submitted : null,
    eventAudit: audits.get(armKey(row)),
  }));
  console.log(JSON.stringify({
    source: 'CiteTrace local audit',
    sdkQueueNote: 'SDK queue counts reflect local handoff only. Provider delivery requires separate verification.',
    arms,
  }, null, 2));
} finally {
  db.close();
}
