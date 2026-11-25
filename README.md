# CiteTrace

CiteTrace tests whether opening a citation at its highlighted paragraph helps people verify AI-drafted claims without approving unsupported ones. It is a **Track 01 · Test Something Real** entry for the WeMakeDevs Toggle Wars Flagsmith hackathon.

**Try it in your browser.** Download and open the [interactive offline preview](https://github.com/S-h-u-b-h-1/CiteTrace/releases/download/v1.2.0/CiteTrace-preview.html). Compare the same citation in both views side by side, then take a timed review. The preview sends no telemetry. The [2:21 demo video](https://github.com/S-h-u-b-h-1/CiteTrace/releases/download/v1.0.0/CiteTrace-Demo.mp4) walks through a complete review and the Flagsmith rehearsal.

A reviewer has 90 seconds to read three claims about a fictional library programme and decide whether each is supported, contradicted, or insufficiently evidenced. In control, a citation opens the full source at the top. In treatment, the same source opens at the highlighted paragraph. Claims, options, document text, and scoring stay fixed.

A successful review classifies all three claims correctly within 90 seconds. The trust guardrail counts reviewers who mark a contradicted claim or one with insufficient evidence as supported. Each reviewer gets feedback with the exact source passages behind the verdicts.

In the [scripted rehearsal](docs/experiment.md#verified-synthetic-rehearsal), Flagsmith accepted 130 events across 48 exposures. Its dashboard matched the app's pass rates, 13/22 for control and 15/26 for the focused view. Human outcomes remain unmeasured, so the rollout decision is to hold. See the [judge evidence appendix](docs/evidence.md) for the guardrail counts and verification details.

## Run locally

Use **Node.js 22.13 or newer**. Preview and tests have no installation step.

```sh
npm start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Local preview assigns a stable variant for one anonymous browser session and sends no events to Flagsmith. The workspace persists reviews in SQLite. To see a specific treatment in preview, start an instance with the corresponding value.

```sh
CITETRACE_PREVIEW_VARIANT=full_source PORT=3000 npm start
CITETRACE_PREVIEW_VARIANT=focused_source PORT=3001 npm start
```

Run these in separate terminals. The two previews can share the default database because each uses a separate namespace.

To build the standalone preview from source, run `npm run preview`, then open the generated `CiteTrace-preview.html` in a browser. Choose either arm in the preview header. The file uses the same UI and scoring in memory, with no server or event traffic. Its answer key is visible to anyone inspecting the file, so keep it out of participant recruitment.

## Connect Flagsmith Experimentation

1. In Flagsmith Cloud, create a project and enable its environment's warehouse. Or follow the [official local Flagsmith setup](https://docs.flagsmith.com/getting-started/run-locally-with-a-coding-agent) and select the native database warehouse.
2. Follow the [experiment protocol](docs/experiment.md) to create the enabled multivariate `citation_opening` flag. Use `full_source` as the base value (variant key `control`) and `focused_source` as the keyed treatment value. Allocate 50% of traffic to each. Set `review_passed` as the primary occurrence metric. Create `false_approval` as a lower-is-better occurrence metric and use the local audit report for its counts when the dashboard wizard accepts only a primary metric. Start the experiment.
3. Install the pinned SDK and configure the environment. The template lists all runtime variables.

```sh
npm ci
cp .env.example .env
```

Set `FLAGSMITH_ENVIRONMENT_KEY` in `.env`. For a local Flagsmith instance, also set `FLAGSMITH_API_URL` and `FLAGSMITH_EVENTS_URL` to the example values. Start CiteTrace with `npm start`, then open [its health endpoint](http://127.0.0.1:3000/api/health). A configured runtime should report `mode: "flagsmith"`. Verify a test exposure and matching participant outcomes in the provider; the health endpoint only reports the local SDK queue. Deploy the participant app behind HTTPS using `HOST=0.0.0.0`, `CITETRACE_SECURE_COOKIE=true`, and one Node process with a persistent SQLite volume. Keep replies, experiment config, SDK keys, and data stores separate for every environment.

### Flagsmith's role

The Node SDK evaluates the multivariate flag against a stable anonymous identifier. CiteTrace validates that the assignment's variant key and rendered citation view agree. Flagsmith owns the allocation. For the original demo task the app records exposure as the review opens. In a held-out live pilot the server timestamps exposure and serves the claims in the same request. The same identifier links the exposure and outcomes. The local database keeps the first submission and queues each event once per participant in normal single-process operation. The SDK buffers and transmits events separately from that database.

| Event | Recorded when |
| --- | --- |
| `$flag_exposure` | The assigned review first opens, or the server first serves a held-out task |
| `review_submitted` | A valid first submission arrives, with elapsed seconds |
| `review_passed` | That submission has all three correct answers within the limit |
| `false_approval` | A submitted verdict approves at least one unsupported claim |

### Synthetic rehearsal and local audit

Use a **separate Flagsmith environment and database** for scripted traffic. For a local-only rehearsal with no provider events, leave the Flagsmith environment key empty.

```sh
CITETRACE_TRAFFIC=synthetic CITETRACE_DB=.citetrace/synthetic.sqlite PORT=3001 npm start
CITETRACE_URL=http://127.0.0.1:3001 npm run traffic -- 100
npm run report -- .citetrace/synthetic.sqlite
```

The generator checks for synthetic mode before creating any attempts. It scripts correct, wrong, and abandoned reviews independent of the assignment and verifies the server's scores. The audit groups attempts by data namespace, experiment ID, and arm. It compares how many exposed reviewers answered everything correctly within 30, 60, and 90 seconds, keeping dropouts in the denominator. Its verdict table distinguishes approvals of directly contradicted claims from approvals where the source is inconclusive. Claim counts cover submitted reviews, including unanswered claims in timed-out submissions. The audit checks expected events against the local ledger. SDK queue counts indicate local handoff. Verify delivery and view any experiment estimates in Flagsmith.

### Run a held-out human pilot

Use a fresh task for participants who could have seen the demo answers. `CITETRACE_TASK_FILE` takes an absolute path to a private JSON file with the same schema as `data/task.mjs`. Assign both arms the same frozen task. In a live held-out pilot, the server starts the clock when it serves the claims. Answers are scored on submission. With a Flagsmith key configured, `CITETRACE_EXPERIMENT_ID` must match the designated pilot experiment before enrollment. Set both `CITETRACE_PILOT_START_UTC` and `CITETRACE_PILOT_END_UTC` to enforce the collection window. Reviews already exposed can finish on their original clock. The local audit keeps each task revision separate. See the [pilot procedure](docs/experiment.md#run-a-held-out-pilot) for setup, recruitment, and interpretation.

## Verify

```sh
npm test
```

The suite covers both citation views, deadline and replay behavior, answer-key redaction, assignment and event identity, provider failures, and SQLite persistence. It uses a DOM harness and a Flagsmith SDK fixture. Live provider delivery must be checked against the configured warehouse. See the [experiment protocol](docs/experiment.md) for the metrics, collection window, and interpretation, and the [demo script](docs/demo-script.md) for the recording and submission checklist.
