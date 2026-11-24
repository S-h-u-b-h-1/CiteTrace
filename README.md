# CiteTrace

CiteTrace tests whether opening a citation at its highlighted paragraph helps people verify AI-drafted claims. It is a **Track 01 · Test Something Real** entry for the WeMakeDevs Toggle Wars Flagsmith hackathon.

A reviewer has 90 seconds to read three claims about a fictional library programme and decide whether each is supported, contradicted, or insufficiently evidenced. In control, a citation opens the full source at the top. In treatment, the same source opens at the highlighted paragraph. Claims, options, document text, and scoring stay fixed.

A successful review classifies all three claims correctly within 90 seconds. The experiment also tracks whether any unsupported claim was approved. Each reviewer gets source-backed feedback after submitting.

The [synthetic rehearsal](docs/experiment.md#verified-synthetic-rehearsal) verified the complete Cloud integration. Flagsmith recorded 48 exposures and the dashboard matched the app's primary outcome counts. Human participant collection has yet to start.

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

For a standalone walkthrough, open `CiteTrace-preview.html` from the project package in a browser. Choose either arm in the preview header. Generate a fresh copy with `npm run preview`. The file uses the same UI and scoring in memory, with no server or event traffic. Its answer key is visible to anyone inspecting the file, so keep it out of participant recruitment.

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

The Node SDK evaluates the multivariate flag against a stable anonymous identifier. CiteTrace requires a valid active experiment assignment before returning a live task. Flagsmith owns the allocation, and its SDK records an exposure after the assigned task renders. The same identifier links the exposure and outcomes. The local database keeps the first submission and queues each event once per participant in normal single-process operation. The SDK buffers and transmits events separately from that database.

| Event | Recorded when |
| --- | --- |
| `$flag_exposure` | The assigned review first renders |
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

The generator checks for synthetic mode before creating any attempts. It scripts correct, wrong, and abandoned reviews independent of the assignment and verifies the server's scores. The audit report groups local attempts by environment and arm, with raw denominators. It excludes participant IDs and produces no Bayesian estimate. Read live experiment estimates in Flagsmith.

## Verify

```sh
npm test
```

The suite covers both citation views, deadline and replay behavior, answer-key redaction, assignment and event identity, provider failures, and SQLite persistence. It uses a DOM harness and a Flagsmith SDK fixture. Live provider delivery must be checked against the configured warehouse. See the [experiment protocol](docs/experiment.md) for the metrics, collection window, and interpretation, and the [demo script](docs/demo-script.md) for the recording and submission checklist.
