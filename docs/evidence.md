# CiteTrace judge evidence

## What to try

1. Download and open the [offline preview](https://github.com/S-h-u-b-h-1/CiteTrace/releases/download/v1.1.0/CiteTrace-preview.html) in a browser. No sign-in or dependencies are required.
2. In the side-by-side comparison, select the booking-transfer claim. Both panels show the same complete policy. The control starts at the first section and the focused view starts at the cited transfer-policy paragraph.
3. Finish a review to see your score, time, unsupported approvals, and the exact passage behind each verdict. The preview records no experimental data.

## What the provider verified

In Flagsmith Cloud Development, the running **CiteTrace · Synthetic rehearsal** experiment showed the `citation_opening` flag, **Review passed** as its primary metric, and a 50/50 rollout. The dashboard snapshot was last calculated on **24 November 2026 at 16:51 UTC** and rechecked on **25 November**. It showed **Collecting data** and left the winner, win probability, and credible interval blank.

| Measure | Full source | Focused citation | Focused minus full source |
| --- | ---: | ---: | ---: |
| Exposed reviewers | 22 | 26 | |
| Submitted a review | 20/22 (90.9%) | 21/26 (80.8%) | −10.1 pp |
| Correct on all claims in time | 13/22 (59.1%) | 15/26 (57.7%) | −1.4 pp |
| Approved an unsupported claim, per exposure | 7/22 (31.8%) | 6/26 (23.1%) | −8.7 pp |
| Approved an unsupported claim, per submission | 7/20 (35.0%) | 6/21 (28.6%) | −6.4 pp |

Flagsmith reported exposure counts and pass rates. The local audit reported submissions and guardrail counts. Provider ingestion acknowledged **130 events** in the rehearsal: 48 exposures, 41 submissions, 28 passes, and 13 unsupported-approval events. See the [experiment protocol](experiment.md#verified-synthetic-rehearsal) for provenance.

## Decision

**Hold the rollout.** The script generated outcomes independently of the assigned view. These differences describe the rehearsal. They verify integration and do not estimate the effect on human reviewers. The primary denominator includes every exposure, so abandoning the review cannot improve the pass rate. The two guardrail denominators help distinguish checking quality from differences in submission rates.

The [held-out pilot procedure](experiment.md#run-a-held-out-pilot) uses a fresh task and dedicated Flagsmith experiment. The [analysis protocol](experiment.md#analysis-and-reporting) specifies the evidence needed before making a rollout decision.

## Reproduce the checks

Run `npm test` for the app and scoring checks. Run `npm run preview` to regenerate the interactive HTML. With a rehearsal database, run `npm run report -- <database.sqlite>` for participant-free counts and event reconciliation by namespace, Flagsmith experiment ID, and arm. The verdict table breaks out mistakes on contradicted claims and claims with insufficient evidence. The report identifies missing or unexpected local events and distinguishes queued events from pending local handoff. Confirm provider delivery separately in Flagsmith.
