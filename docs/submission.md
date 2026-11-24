# CiteTrace · Toggle Wars

**Track 01 — Test Something Real**

## Tagline

Does jumping to the cited paragraph help people catch mistakes in AI-written answers?

## Project description

CiteTrace gives reviewers 90 seconds to verify three AI-drafted claims against a fictional library policy. The control opens a citation at the top of the full source. The treatment opens the same source at the highlighted passage. Both versions use the same claims, documents, timer, and scoring.

Our hypothesis is that more reviewers will classify all three claims correctly within 90 seconds when they land on the cited paragraph. We also track whether reviewers approve any unsupported claim.

## How we used Flagsmith

The multivariate flag `citation_opening` assigns each anonymous reviewer to a 50/50 experiment. The Node SDK records an exposure after the assigned review renders. Submissions, successful reviews, and unsupported approvals use the same identity. A SQLite audit checks the local counts against the provider results.

## Verified rehearsal

We ran 48 scripted reviews through Flagsmith Cloud Development. Flagsmith accepted all 130 events. Control had 13 passes from 22 exposures. Focused citations had 15 passes from 26 exposures. The dashboard agreed with both counts and remained in **Collecting data**. Scripted behavior was independent of assignment, so the rehearsal verifies the integration. The effect on human reviewers has yet to be measured.

## Judge walkthrough

Run `npm start` using Node.js 22.13 or newer. Open `http://127.0.0.1:3000` and complete a review to see the supporting passages. Use the deterministic preview commands in the [README](../README.md) to compare both views. The [experiment protocol](experiment.md) records the exact setup, rehearsal numbers, and result limits.

## Submission checklist

- Public GitHub repository and setup README.
- Working demo video showing both citation behaviors, scoring, and the Flagsmith experiment.
- Submit through the official WeMakeDevs portal by November 29, 2026 at 8 p.m. IST. The portal showed registration-only status when checked on November 24.
