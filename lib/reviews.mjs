import { DatabaseSync } from 'node:sqlite';

export function openReviews(path, namespace) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS reviews (
      namespace TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      variant TEXT NOT NULL,
      variant_key TEXT,
      experiment_id INTEGER,
      enrolled_at INTEGER NOT NULL,
      exposed_at INTEGER,
      submitted_at INTEGER,
      result_json TEXT,
      PRIMARY KEY (namespace, participant_id)
    );
    CREATE TABLE IF NOT EXISTS review_events (
      namespace TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      recorded_at INTEGER NOT NULL,
      value REAL,
      queued_at INTEGER,
      PRIMARY KEY (namespace, participant_id, name),
      FOREIGN KEY (namespace, participant_id) REFERENCES reviews (namespace, participant_id)
    );
  `);

  const read = db.prepare('SELECT * FROM reviews WHERE namespace = ? AND participant_id = ?');
  const enroll = db.prepare(`
    INSERT OR IGNORE INTO reviews (namespace, participant_id, variant, variant_key, experiment_id, enrolled_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const expose = db.prepare(`
    UPDATE reviews SET exposed_at = ? WHERE namespace = ? AND participant_id = ? AND exposed_at IS NULL
  `);
  const submit = db.prepare(`
    UPDATE reviews SET submitted_at = ?, result_json = ?
    WHERE namespace = ? AND participant_id = ? AND submitted_at IS NULL AND exposed_at IS NOT NULL
  `);
  const recordEvent = db.prepare(`
    INSERT INTO review_events (namespace, participant_id, name, recorded_at, value) VALUES (?, ?, ?, ?, ?)
  `);
  const pending = db.prepare(`
    SELECT e.*, r.variant_key, r.experiment_id
      FROM review_events e JOIN reviews r USING (namespace, participant_id)
     WHERE e.namespace = ? AND e.queued_at IS NULL ORDER BY e.recorded_at, e.rowid
     LIMIT 250
  `);
  const markQueued = db.prepare(`
    UPDATE review_events SET queued_at = ? WHERE namespace = ? AND participant_id = ? AND name = ?
  `);
  const readPending = db.prepare(`
    SELECT COUNT(*) AS count FROM review_events WHERE namespace = ? AND queued_at IS NULL
  `);

  function transaction(work) {
    db.exec('BEGIN IMMEDIATE');
    try {
      work();
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  return {
    read: (id) => read.get(namespace, id),
    enroll(id, assignment, at) {
      enroll.run(namespace, id, assignment.variant, assignment.variantKey, assignment.experimentId, at);
      return read.get(namespace, id);
    },
    expose(id, at, exposureEvent) {
      transaction(() => {
        if (expose.run(at, namespace, id).changes) recordEvent.run(namespace, id, exposureEvent, at, null);
      });
      return read.get(namespace, id);
    },
    submit(id, at, result) {
      transaction(() => {
        if (!submit.run(at, JSON.stringify(result), namespace, id).changes) return;
        recordEvent.run(namespace, id, 'review_submitted', at, result.elapsedSeconds);
        if (result.passed) recordEvent.run(namespace, id, 'review_passed', at, null);
        if (result.falseApprovals) recordEvent.run(namespace, id, 'false_approval', at, result.falseApprovals);
      });
      return JSON.parse(read.get(namespace, id).result_json);
    },
    pending: () => pending.all(namespace),
    pendingCount: () => readPending.get(namespace).count,
    markQueued: (event, at) => markQueued.run(at, namespace, event.participant_id, event.name),
    close: () => db.close(),
  };
}
