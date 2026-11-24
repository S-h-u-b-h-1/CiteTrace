# CiteTrace demo script

Runtime target is **2 minutes 30 seconds**. Open the standalone `CiteTrace-preview.html` or both forced local preview modes, the Flagsmith configuration, and the results page before recording. Use a practice identity for the walkthrough. Keep the selection and scoring process visible, and display exactly the data source shown in the recording.

| Time | On screen | Narration |
| --- | --- | --- |
| 0:00–0:17 | Start a CiteTrace preview and show a sample claim next to its source link. | “A citation shows where a claim came from. You still have to read the source to decide whether it supports the claim. CiteTrace measures whether jumping straight to the cited paragraph helps people get that judgment right.” |
| 0:17–0:41 | Open a source in the control preview. Then open the same citation in the treatment preview. Scroll just far enough to show the full source is available in both cases. | “In control, the source opens at the top. In treatment, it opens at the highlighted paragraph. Both versions use the same source and the same three questions. A highlighted paragraph can still be insufficient evidence for the claim.” |
| 0:41–1:10 | Complete a preview. Show the timer, three judgments, submit, and an explanation grounded in the quoted source. | “Can a reviewer classify all three claims correctly in 90 seconds? That’s our primary outcome. We also measure false approvals, where someone says a contradicted or insufficiently supported claim is supported.” |
| 1:10–1:41 | Open the Flagsmith experiment. Show the multivariate flag and keyed variation, 50/50 allocation, and configured metrics. | “Flagsmith assigns the experience. An anonymous identity stays on its assigned version and links the exposure to the review outcome. We count each participant’s first live attempt. This walkthrough is a preview and is excluded.” |
| 1:41–2:14 | Show the Flagsmith Development result and the local guardrail audit. Zoom in on the two rows and the Collecting data banner. | “Flagsmith recorded 48 scripted participants: 22 in control and 26 in treatment. Their pass rates were 59.1% and 57.7%. Thirteen completed reviews included an unsupported approval. The dashboard is still collecting data. These were scripted reviews, so the numbers show the wiring works and tell us nothing about whether the design helps people.” |
| 2:14–2:30 | Return to the treatment screen, then show repository and live demo links if available. | “CiteTrace gives teams a way to evaluate how people use citations, with both accuracy and false approvals in the decision. The repository includes the setup and experiment protocol.” |

## Recording checklist

- Show one claim whose evidence supports it and one whose citation does not establish it. Verify all preview verdicts against the actual source material before recording.
- Include one full successful review submission, the Flagsmith assignment setup, and the corresponding event or aggregate view when available. Use a walkthrough that a judge can reproduce.
- Replace narration placeholders with numbers visible in the recorded Flagsmith result. Say “collecting data” or “inconclusive” when that is the result. Keep local, cloud, synthetic, and human evidence accurately labeled.
- Check the recording for tokens, private account details, and participant identifiers. Confirm the video link opens for a signed-out judge and that the public repository links to setup instructions.
- Register via the official WeMakeDevs event page. Submit the public repository, README, and video by 8:00 p.m. IST on November 29, 2026. The organizer’s Luma listing provides reminders. [Event page](https://www.wemakedevs.org/hackathons/flagsmith) · [Schedule](https://www.wemakedevs.org/hackathons/flagsmith/schedule) · [Luma listing](https://luma.com/toggle-wars)

**Portal check, November 24.** The signed-in event page displayed a submission link, but the linked [submission page](https://www.wemakedevs.org/hackathons/flagsmith/submit) reported that submissions were unavailable. Recheck the portal when the event opens or ask the organizers in the official Flagsmith Discord.
