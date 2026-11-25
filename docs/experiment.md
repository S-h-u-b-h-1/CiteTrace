# CiteTrace experiment protocol

**Toggle Wars Track 01, Test Something Real**, awards $2,000 in cash. Its scorecard asks for a testable hypothesis, versions behind a Flagsmith flag, a metric based on application events, and an explanation of the result. The rules allow a head start and require a public GitHub repository, a setup README explaining how Flagsmith is used, and a short working demo. The submission deadline is November 29, 2026 at 8:00 p.m. IST. [Event overview](https://www.wemakedevs.org/hackathons/flagsmith) · [Rules](https://www.wemakedevs.org/hackathons/flagsmith/rules)

## Hypothesis

Showing the paragraph a citation refers to, with that paragraph highlighted, will increase the percentage of reviewers who classify all three claims correctly within 90 seconds. An increase in reviewers who approve an unsupported claim would count against shipping the change.

Participants see three claims about a fictional public learning or library policy. They classify each claim as supported, contradicted, or insufficiently evidenced. The sources, claims, answer options, time limit, and scoring are identical in both versions. Some cited paragraphs provide insufficient evidence, so the treatment still requires the participant to read and judge the source.

| Arm | What the source link opens |
| --- | --- |
| Control | The full source at the top of the document. |
| Treatment | The same full source at the cited paragraph, with the paragraph highlighted. The rest of the source remains available. |

This tests the effect of the two navigation cues as a package. It measures performance on one three-claim exercise. A larger study would need other documents, harder claims, and a broader participant pool.

## Ideas considered

| Idea | Single A/B test | Primary outcome | Tradeoff |
| --- | --- | --- | --- |
| **CiteTrace** | Full source versus direct navigation to the highlighted cited paragraph. | All three evidence judgments correct within 90 seconds. | Objective scoring, a quick task, and a meaningful safety guardrail. The controlled corpus limits the scope of the conclusion. |
| IncidentBrief | Chronological incident log versus a timeline grouped by service. | Identify the first failing service from the same log within two minutes. | Clear ground truth, with more specialized recruitment and log-writing effort. |
| PacketTutor | Standard routing exercise versus the same exercise with the current path highlighted. | Identify the broken hop correctly on the first attempt. | Easy to demo and recruit classmates for. It measures a narrower learning workflow. |
| OnboardPreview | Empty dashboard versus the same dashboard with a prefilled sample project. | Create and save a first real project. | Easy to explain. A convincing experiment needs people who actually want to onboard. |
| ReviewOrder | Unsorted findings versus the same findings ordered by confidence. | Correctly triage the highest-priority finding within a fixed time. | Strong engineering use case. Confidence and ordering can influence perceived severity independent of evidence. |

CiteTrace was selected because everyone can complete the same short task and the three answers can be scored against fixed source text.

## Population and outcomes

- Enroll each anonymous participant using a stable random identifier. Keep that identity across reloads and use it for both exposure and conversion events. Assign eligible participants approximately 50/50 through Flagsmith. Count the first live attempt only. Practice previews, reviewer walkthroughs, and synthetic sessions use a separate environment or do not enter the live experiment.
- Record an exposure when the participant starts the triage and receives the assigned source experience. The exposure defines the denominator, including participants who leave or time out. An anonymous browser ID cannot establish that two browsers belong to the same person.
- **Primary event `review_passed`** occurs once when an on-time final submission includes all three correct judgments. A partial, wrong, missing, or late submission does not earn the event. Use an occurrence metric, higher is better.
- **Guardrail event `false_approval`** occurs once when an accepted final submission labels at least one contradicted or insufficiently evidenced claim as supported. Use an occurrence metric, lower is better. Show the count as well as the rate. A participant who leaves without submitting supplies no observed false approval. Include submission and timeout counts to make this distinction visible.
- Define the clock start and deadline consistently in both arms. Freeze task text, answer key, source paragraphs, allocation, and outcome rules before inviting participants. Keep all participant identities opaque and telemetry limited to the experiment's operational needs.

## Flagsmith setup

1. Create a project environment for pilot traffic. In **Environment Settings → Warehouse**, connect the managed Flagsmith warehouse. For self-hosting with PostgreSQL, use `EXPERIMENTATION_ENABLED=true` and select **Flagsmith database**. Confirm the warehouse can receive an event. Use `CITETRACE_TRAFFIC=pilot` for human pilot traffic and a separate Flagsmith environment with `CITETRACE_TRAFFIC=synthetic` for scripted traffic. [Connect a Warehouse](https://docs.flagsmith.com/experimentation/connect-a-warehouse) · [Self-hosting](https://docs.flagsmith.com/experimentation/self-hosting)
2. Create the enabled multivariate flag `citation_opening`. Set the base value to `full_source`. Its experiment variant key is `control`. Add the treatment with key and string value `focused_source`. Create occurrence metrics for `review_passed` and `false_approval`, with their respective directions. Create the experiment with 100% enrollment for eligible traffic, allocate 50% to `focused_source`, and leave the remaining 50% for control. Select `review_passed` as primary. Configure and verify measurement of `false_approval` as a guardrail before inviting participants. The Cloud wizard selected only the primary metric during the rehearsal. Verify the guardrail through accepted provider events and the local audit report when the wizard does not attach it. [Set Up an Experiment](https://docs.flagsmith.com/experimentation/set-up-with-a-coding-agent) · [Create an Experiment](https://docs.flagsmith.com/experimentation/create-an-experiment)
3. Configure the Flagsmith SDK to send events. Use the same identified participant and exact event names for assignment, exposure, and conversion. Resolve the experiment flag when the assigned view is served, or evaluate it without exposure and record exposure explicitly when the screen appears. Flush buffered events before an SDK process exits. For a self-hosted native warehouse, the API base ends in `/api/v1/` and the SDK events base ends in `/api/`. Check the CiteTrace runtime with `GET /api/health`, then verify actual events separately in Flagsmith. [Run an Experiment](https://docs.flagsmith.com/experimentation/run-an-experiment)
4. Before sharing the live link, verify both flag values render, each retains the same identity across refresh, conversion visibility matches the scoring rules, and previews or synthetic traffic leave the live measurement unchanged. Check the warehouse after a real exposure and review. Allow for processing delay and keep any smoke test labeled and outside measured results.

The Flagsmith API accepts both metrics in the experiment creation payload. For scripts, use `aggregation: occurrence` and `definition: {version: 1, event: <event_name>}` for each metric. The API direction fields are `up` and `increase` for the primary metric, and `down` and `not_increase` for the guardrail. In the experiment rollout, `feature_state_value` is a string with value `full_source`, and the keyed treatment is allocated 50 percent via `multivariate_feature_state_values`. [Flagsmith API setup example](https://docs.flagsmith.com/experimentation/set-up-with-a-coding-agent) · [Flagsmith metric model](https://github.com/Flagsmith/flagsmith/blob/main/api/experimentation/models.py)

## Run a held-out pilot

The public Open Desk task is for demonstration. For recruitment, use a fresh fictional task with three source documents and three claims. Include one supported claim, one contradiction, and one claim whose cited document leaves the answer open. Review the labels against the complete source text, vary the order of correct verdicts, and place the relevant passages at comparable depths. Keep the task, answer key, 90-second limit, and scoring frozen across both arms.

1. Keep the JSON in a private directory outside the web root and repository. Match the fields in `data/task.mjs`. Set `CITETRACE_TASK_FILE` to its absolute path and `CITETRACE_DB` to a dedicated SQLite file. Use the real app for pilot participants. The downloadable judge preview contains the public exercise.
2. For a private smoke test, leave the Flagsmith key unset. Force each preview arm separately using `CITETRACE_PREVIEW_VARIANT`. Confirm the exact same claims and source bodies appear, the focused link scrolls to the intended paragraph, and verdict explanations appear after submission. Keep smoke-test data outside the live database.
3. Use a new Flagsmith environment and active experiment with the same allocation and metrics. Set `CITETRACE_TRAFFIC=pilot`, `FLAGSMITH_ENVIRONMENT_KEY`, and `CITETRACE_EXPERIMENT_ID` for that experiment. Verify assignment, exposure, and outcomes in a separate preflight environment before collecting participant data. Use a clean pilot database, HTTPS, and a persistent volume. If the task changes after collection begins, start a fresh provider experiment and treat its results as a separate run.
4. Before recruiting, record the planned window, population, expected enrollment, and outcome definitions. Set `CITETRACE_PILOT_START_UTC` and `CITETRACE_PILOT_END_UTC` as UTC timestamps ending in `Z`. The window includes the start and excludes the end. The server starts the review clock when it first sends the held-out claims. After enrollment closes, already exposed reviewers retain their original deadline. Invite eligible adult volunteers to complete one review in one browser and keep answers private until the window closes. The anonymous browser ID cannot enforce one review per person across multiple browsers. Explain that participation is optional and that the app records an anonymous browser ID, assigned variant, verdicts, timing, and review outcome. State a retention period and delete the operational data when it ends. Avoid forms that collect names or contact details alongside results.
5. Allow the last exposed review its full deadline, then record a dated snapshot for analysis. Report exposure, completion, on-time success, and unsupported approvals for each arm. Cumulative success at 30, 60, and 90 seconds uses all exposures as the denominator. The local verdict table can distinguish mistakes on contradicted claims from guesses on claims with inconclusive evidence. These are exploratory claim-level counts from submitted reviews. People who abandon contribute to exposure-based rates and supply no claim-level answers.

Treat a small volunteer pilot as evidence of usability and feasibility. Keep wide or inconclusive effects visible, including when one arm has fewer submissions. Preserve the original scripted rehearsal as a separate integration check.

## Analysis and reporting

- Use a fixed collection window announced before recruitment. The initial planning target is **200 unique exposed participants per arm**. This is an illustrative feasibility target. The project makes no power or significance claim at that sample size. Time, sample size, and uncertainty may all prevent a rollout decision.
- Report the window, telemetry source, exposure counts by arm, first submissions, primary and guardrail events, absolute percentage-point change, and available Flagsmith lift, 95% credible intervals, and win probability. Report every denominator explicitly. The 30- and 60-second success counts are exploratory. Timestamp the result refresh and include any sample ratio mismatch or assignment exclusions.
- Check assignment integrity before interpreting lift. Treat the primary result as inconclusive if the credible interval crosses zero, enrollment misses the predeclared target, or assignment or instrumentation checks fail. A positive primary result still needs a guardrail review. Treat a concerning or poorly measured guardrail as a reason to collect more evidence before rollout. A dashboard win probability is a model output and should be reported with the interval and counts.
- An organizer-permitted synthetic run can verify the end-to-end workflow. Report it separately from human data and record its traffic assumptions. Scripted behavior cannot establish how human reviewers behave. If there are no eligible humans or no provider readout, report that status literally. [Flagsmith results guide](https://docs.flagsmith.com/experimentation/analyse-an-experiment) · [Organizer judging advice](https://www.wemakedevs.org/blogs/how-to-win-toggle-wars)

## Verified synthetic rehearsal

CiteTrace used the actual Node.js Flagsmith SDK 9.4.0 to send scripted traffic from a private test runtime to the project’s Development environment. Flagsmith assigned the arm to each fresh anonymous identity. The instrumented run verified that the identity, assigned variant, and experiment ID matched at exposure, and that each later event belonged to an exposed identity. [CiteTrace project in Flagsmith](https://app.flagsmith.com/project/55886)

| Arm | Exposed | Submitted | Passed | Pass per exposure | Reviewers who approved an unsupported claim | False approvals per submission |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Control | 22 | 20 | 13 | 59.1% | 7 | 35.0% |
| Focused citation | 26 | 21 | 15 | 57.7% | 6 | 28.6% |
| Total | 48 | 41 | 28 | 58.3% | 13 | 31.7% |

Cloud accepted 130 experiment events via HTTP 202, including 48 exposures, 41 submissions, 28 passes, and 13 false-approval events. Seven exposed sessions abandoned the task. Flagsmith’s dashboard matched both exposure counts and primary rates as of November 24, 2026 at 10:21 p.m. IST. It displayed **Collecting data** with no lift estimate, credible interval, or winner. The false-approval counts were verified through the Cloud event batch and the local audit report. The Cloud wizard attached only the primary metric to the dashboard analysis.

The traffic generator scripted its answers independently of arm. The rehearsal demonstrates assignment, telemetry, and scoring. It provides no estimate of how the citation design affects human reviewers. Production has separate occurrence metrics and was kept free of rehearsal traffic. A human experiment requires deployment, a defined collection window, and recruitment.
