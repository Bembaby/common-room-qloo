# Judge walkthrough and optional recording

The event does not require a video. This script is useful for a short recording, live demo, or written judge-testing guide. Use real live mode for the submitted core demonstration. If showing the offline fixture, say “synthetic demo” clearly and keep its badge visible.

## Three-minute story

| Time | Action | Suggested narration |
| --- | --- | --- |
| 0:00 to 0:20 | Show the venue brief and three taste circles | “A small venue has room for one cultural night. Its readers, listeners, and film regulars do not all start in the same place. Common Room helps the owner choose one program with a visible reason for each circle.” |
| 0:20 to 0:55 | Enter fresh public anchors and run the agent | “The agent resolves cultural anchors through Qloo, discovers candidates across books, music, and film, and compares the same shortlist separately for each circle.” |
| 0:55 to 1:25 | Show the chosen three works and coverage matrix | “These are relative ranking scores from this shortlist. Raw Qloo affinity remains separate. The objective protects the lowest circle score, then the room average.” |
| 1:25 to 1:45 | Show the average-only counterfactual | “Here is the decision from optimizing only the average, using exactly the same candidates. The difference is our decision policy, not an invented claim about turnout.” |
| 1:45 to 2:15 | Click the selected-book veto action | “The owner cannot use this book. That is a hard veto. Watch the program change while the excluded entity stays out.” |
| 2:15 to 2:40 | Use a strict threshold and open the agent notebook | “The first plan misses the brief. The agent chooses a deeper search for the weak circle and domain, reranks, and stops if the evidence still does not support a qualifying night.” |
| 2:40 to 3:00 | Return to a successful brief; export Markdown and JSON | “The owner leaves with a timed conversation plan and the evidence behind every selection. No screening, booking, attendance, or sales is claimed.” |

Do not speed through the real API execution and imply an unmeasured latency. If editing a recording, mark waiting periods as shortened. Keep the live/synthetic label legible.

## Local rehearsal now

1. Run `npm start` and open port 4312.
2. Click **Find our common thread**. The default synthetic case returns a ready brief in 18 workflows, with minimum coverage 62.5 versus 58.33 for the average-only baseline.
3. Export the host brief and evidence JSON after the stream finishes.
4. Click **What if this book is unavailable?**. The exact selected book ID is inserted into the vetoes and the revised fixture remains ready.
5. Click **Try a strict brief**. The agent uses 22 workflows, performs one refinement, and returns a blocked decision. Its best unqualified candidate is explicitly labeled as diagnostic.
6. Reset the sample before another ordinary run. The sample reset restores controls; the next run replaces the previous result.

The [local evidence report](../artifacts/demo-evidence.md) contains executed values, including an empty-evidence refusal that is available through the scenario API and automated evaluator. Do not describe these values as real cultural relationships.

## What to show if something fails live

If a name is ambiguous, explain that the agent needs a more specific title or verified UUID. If authentication, quota, or transport fails, leave the failure visible. Show the separate local fixture only with its mode clearly identified, then repair the live blocker before submission. A substitute fixture is not successful live integration.

## Recording assets to capture after verification

- Public landing page with live mode and anonymous access.
- A fresh-input result with actual entity IDs and provenance.
- The binding veto revision.
- The targeted refinement and meaningful refusal.
- The useful host brief and evidence export.

Record only actual outputs. No fabricated terminal logs, screenshots, testimonials, attendance statistics, or published URLs are needed for this story.
