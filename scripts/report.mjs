import { DatabaseSync } from 'node:sqlite';

const databasePath = process.argv[2] || process.env.CITETRACE_DB || '.citetrace/reviews.sqlite';
const db = new DatabaseSync(databasePath, { readOnly: true });
try {
  const rows = db.prepare(`
    SELECT namespace, variant, COUNT(*) AS enrolled,
           SUM(exposed_at IS NOT NULL) AS exposed,
           SUM(submitted_at IS NOT NULL) AS submitted,
           SUM(COALESCE(json_extract(result_json, '$.passed'), 0)) AS passed,
           SUM(COALESCE(json_extract(result_json, '$.expired'), 0)) AS expiredSubmissions,
           SUM(COALESCE(json_extract(result_json, '$.falseApprovals'), 0) > 0) AS reviewersWithFalseApproval
      FROM reviews
     GROUP BY namespace, variant
     ORDER BY namespace, variant
  `).all();
  const arms = rows.map((row) => ({
    ...row,
    unsubmittedAfterExposure: row.exposed - row.submitted,
    passRatePerExposure: row.exposed ? row.passed / row.exposed : null,
    falseApprovalRatePerExposure: row.exposed ? row.reviewersWithFalseApproval / row.exposed : null,
    falseApprovalRatePerSubmission: row.submitted ? row.reviewersWithFalseApproval / row.submitted : null,
  }));
  console.log(JSON.stringify({ source: 'CiteTrace local audit', arms }, null, 2));
} finally {
  db.close();
}
