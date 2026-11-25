# CiteTrace · Toggle Wars

**Track 01 — Test Something Real**

## Tagline

Does jumping to the cited paragraph help people catch mistakes in AI-written answers?

## Project description

CiteTrace gives reviewers 90 seconds to verify three AI-drafted claims against a fictional library policy. They classify each claim as supported, contradicted, or insufficiently evidenced, then see the exact source passages behind the verdicts. The control opens a citation at the top of the full source. The treatment opens the same source at the highlighted passage. Both versions use the same claims, documents, timer, and scoring.

Our hypothesis is that more reviewers will classify all three claims correctly within 90 seconds when they land on the cited paragraph. The trust guardrail counts reviewers who mark a contradicted or insufficiently evidenced claim as supported.

## How we used Flagsmith

The multivariate flag `citation_opening` assigns each anonymous reviewer to a 50/50 experiment. The Node SDK records an exposure after the assigned review renders. Submissions, successful reviews, and unsupported approvals use the same identity. A SQLite audit checks the local counts against the provider results.

## Verified rehearsal

We ran 48 scripted sessions through Flagsmith Cloud Development. Flagsmith accepted all 130 events. Control had 13 passes from 22 exposures, and 7 of 20 submitted reviews approved at least one unsupported claim. Focused citations had 15 passes from 26 exposures, and 6 of 21 submitted reviews approved at least one unsupported claim. The dashboard agreed with the pass counts and remained in **Collecting data**. Scripted behavior was independent of assignment. The rehearsal verifies the integration, and the rollout decision is to hold until human outcomes can be measured.

## Judge walkthrough

Download and open the [interactive offline preview](https://github.com/S-h-u-b-h-1/CiteTrace/releases/download/v1.1.0/CiteTrace-preview.html) to inspect the same citation in both views side by side and then try a timed review. It sends no telemetry. From source, `npm run preview` rebuilds that HTML file. The [2:21 demo video](https://github.com/S-h-u-b-h-1/CiteTrace/releases/download/v1.0.0/CiteTrace-Demo.mp4) walks through a completed review. The [judge evidence appendix](evidence.md) and [experiment protocol](experiment.md) record the results, limits, and verification steps.

## Submission checklist

- Public GitHub repository and setup README.
- Working demo video showing both citation behaviors, scoring, and the Flagsmith experiment.
- Submit through the [official WeMakeDevs portal](https://www.wemakedevs.org/hackathons/flagsmith/submit) by November 29, 2026 at 8 p.m. IST. The portal showed registration-only status when checked on November 25.
