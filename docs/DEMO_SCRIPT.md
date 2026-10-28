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
4. Click **Replace this book with a binding veto**. The exact selected book ID is inserted into the vetoes and the revised fixture remains ready.
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

## Optional narrated edit

Use an actual browser recording of the public live application. A simulated product video is unnecessary. The opening can use the application's own credited cultural artwork. Keep any illustrative venue footage visibly separate from execution evidence.

Target a concise two-minute edit. Show the brief, actual streamed search stages, three selected works, per-circle scores, average-only comparison and an evidence download. Explain the already verified veto and strict-refusal paths only over footage captured from those actual executions. Label every removed waiting period as shortened; do not imply an unmeasured speed improvement.

Suggested narration for the opening and core story:

> One room. Three different ways into culture. A bookshop's readers, listeners and film regulars do not all start with the same tastes. Common Room helps a host plan an evening with a reason for every circle to be there.
>
> Here, each circle starts with a public cultural anchor. I can change the venue, timing and minimum coverage, and add a title the host cannot use. Every veto is binding.
>
> This is the live app. The agent uses Qloo to discover books, artists and films. Then it compares the same shortlist for each circle. These stages follow the actual search. Waiting time is shortened in this edit.
>
> The result gives the host three conversation anchors. These scores describe relative ranks within this shortlist. They are not predictions about attendance or whether any individual will like the event.
>
> Common Room prioritizes the least-served circle, then the room average. The comparison shows what changes if we optimize only the average using the same candidates. Every selected work has inspectable entity IDs and source workflows.
>
> The host gets a timed running order, discussion prompts and downloadable evidence. If the constraints cannot be met, the agent performs one targeted refinement, then stops and asks for a revised brief. It does not quietly relax a veto or invent a successful event.
>
> Common Room grounds the cultural choices in Qloo and keeps the programming decision open to inspection. The public app is ready to try without an account.

For ElevenLabs narration, generate a short stock-voice sample before a full recording, only after the owner configures a project-local key and a Common Room credit or cost allowance. Use the timestamped speech endpoint's actual character alignment to derive word timing. Render captions from that alignment and verify the final audio/video together. A draft script or estimated caption timing is not completed narrated media. No paid media has been commissioned.
