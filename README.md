<!-- R6_PUBLIC_START -->
# Current walkthrough and verification, October 28

[Open Common Room](https://common-room-eight.vercel.app) or [watch the new 122.4-second Jessica demo](https://common-room-eight.vercel.app/demo.html?v=jessica-r6). Real full-browser capture, eased zooms, 39 added breathing rests and a verified zero-query reload replace the previous tight edit. 61 core tests pass. New fresh/veto/strict runs retain actual Qloo provenance and independently checked 216/180/270 bundle comparisons, with zero policy gain in all three. See [the execution record](docs/EVIDENCE.md) and [film provenance](docs/DEMO_SCRIPT.md). Older checkpoints below retain their original scope.
<!-- R6_PUBLIC_END -->

# Common Room

**One night. More than one crowd.**

Common Room helps an independent bookshop, café, or small cultural venue balance a cultural shortlist for two or three taste circles, then prepare its own hosted conversation. The agent discovers books, artists, and films, compares each circle against the same cultural shortlist, honors explicit vetoes, and prioritizes the least-served circle. It explains observed entry points and per-circle tradeoffs. The host selects the actual introduction or passage, recording, film focus and connecting question; these choices enter the running order, print copy and both exports. A tab-local save can reopen the same result without another provider query.

**[Try the live app](https://common-room-eight.vercel.app) · [Executed evidence and limits](docs/EVIDENCE.md)**

Common Room completed genuine hosted Qloo planning, a binding book veto, and a strict refusal from a fresh anonymous browser on October 28. Both downloads were inspected. The default local application remains explicitly synthetic. Provider, hosting and contest-submission evidence are separate categories; this repository does not claim a final Devpost submission.

[Watch the 2:03 real-execution walkthrough](https://common-room-eight.vercel.app/demo.html), with synthetic stock-voice narration, word highlights and a transcript. The application itself makes no language-model or ElevenLabs calls.

[Read the worked host copy](https://common-room-eight.vercel.app/examples/curator-worked-example.md) · [Independent-review response and limits](docs/ROUND4_REVIEW.md)

The objective uses equal slot and circle weights. It makes shortlist tradeoffs inspectable; it does not establish thematic coherence or predict a successful venue event. No venue pilot or measured time saving is claimed.

## Run it in one minute

Use Node.js 22.19.0 or later. Install the pinned dependencies for the official harness and hosted quota coordinator.

```bash
npm ci --ignore-scripts
npm start
```

Open <http://127.0.0.1:4312>.

1. Click **Find our common thread** to build the sample night.
2. Inspect **A reason for every seat** and the counterfactual that optimizes only the average.
3. Choose **Veto this book**, **Veto this artist** or **Veto this movie**. Review the exact identity added to your brief, then run the updated brief. The next decision reports whether the veto matched an observed discovery.
4. Click **Try a strict brief** to see a targeted second search and an honest refusal when the threshold cannot be met.
5. Export the host brief and evidence JSON, or print the host copy. The Markdown includes preparation notes, rank-backed entry points, constraints and per-circle tradeoffs. The agent notebook records actual executed steps.

Demo anchors are read-only because the fixture models only those anchors. Venue names, circle labels, timing, vetoes, and the comparison threshold are editable. Fresh cultural anchors require live mode.

The connecting question is a participant-led hosting prompt. Common Room does not invent a shared theme or claim that Qloo supplied an interpretation of the works. Entry points describe the strongest observed relative ranks among the selected works; raw provider affinities remain separate.

## Verify the local work

```bash
npm test
npm run demo:evidence
```

The test suite covers fairness, hard vetoes, empty evidence, bounded refinement, malformed input, schema drift, missing provenance, ambiguity, subprocess safety, authentication and quota failures, streaming HTTP, and shared quota protection. October 28 Chromium checks completed the fixture flow, veto revision, strict refusal, exports, and responsive layouts. Test logs record the current count; historical preparation counts are not release claims.

[artifacts/demo-evidence.md](artifacts/demo-evidence.md) summarizes four executed scenarios. In the default synthetic case, weakest-circle relative coverage is **62.5**, compared with **58.33** for the average-optimized baseline. That **4.17-point** difference is a calculation on invented fixture relationships. It is not a measured attendance, revenue, satisfaction, or Qloo quality improvement.

Restricted execution environments may block localhost binding or subprocess tests. Run the complete suite in an environment that permits those local operations; do not remove the failure-path assertions.

## Connect real Qloo evidence

The live adapter uses the official `@qloo/qloo-harness` package, pinned to **0.1.26**. Its exact input and output contract is documented in [docs/HARNESS_CONTRACT.md](docs/HARNESS_CONTRACT.md). No model API is required.

```bash
cp .env.example .env
```

The pinned harness is already installed by `npm ci`. Set `QLOO_NODE_ENTRY=node_modules/@qloo/qloo-harness/dist/bin.js` in the ignored `.env`. This avoids Windows `.cmd` shims and uses the same trusted Node entrypoint across platforms. The adapter uses no shell, checks the exact version and sends cultural anchors only as JSON on stdin. Installation alone does not establish live API access.

In your local environment, set `APP_MODE=live` and your individually issued `QLOO_API_KEY`. Obtain the credential through the [official event resource link](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide#getting-your-api-key). Keep the key on the server.

```bash
npm run live:check
```

This checks configuration and the installed harness version, not API access. Set `QLOO_SMOKE_ENTITY_ID` to a real, verified Qloo entity UUID, then run:

```bash
npm run live:smoke
npm run live:plan -- fixtures/live-input.example.json
```

The full-plan example uses public creator names. If Qloo reports ambiguity, replace the ambiguous name with a specific title or verified entity ID. Never invent a UUID or quietly choose an uncertain entity. Both live scripts exit nonzero when blocked, and save an explicitly classified artifact under `artifacts/live-*`. Those files are ignored by Git because they contain the owner's live inputs and query evidence.

Follow [docs/LIVE_VERIFICATION.md](docs/LIVE_VERIFICATION.md) before claiming a working live integration. Do not run live CLI scripts concurrently with the server because the quota ledger supports one process at a time.

## Public submission setup

The current event requires a publicly usable application. **A password or access-code gate is not an acceptable submission configuration.** The event checklist and source links are in [docs/RULES_AND_RUBRIC.md](docs/RULES_AND_RUBRIC.md).

For the final public instance:

```dotenv
APP_MODE=live
HOST=0.0.0.0
PUBLIC_DEMO=true
APP_ACCESS_CODE=
QLOO_MAX_WORKFLOWS=22
QLOO_MAX_WORKFLOWS_PER_HOUR=88
QLOO_BUDGET_FILE=.data/qloo-workflow-budget.json
```

For a conventional Node host, use one replica and persist `.data`. On Vercel, the app uses a dedicated private Blob object with conditional writes and a shared lease. Every hosted plan reserves its full bounded allowance before provider access. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for configuration, safety, costs and signed-out verification. Choose the allowance using the actual issued quota; the value above is an application default, not a Qloo entitlement.

A workflow can perform entity resolution plus an Insights request. The pinned harness can retry retryable HTTP requests internally, up to three attempts. Common Room adds no workflow retry and imposes a 25-second subprocess deadline by default. Workflow counts are **not** API-request counts.

The optional `APP_ACCESS_CODE` setting is only for private development. Public submission mode refuses to start if that code is set. The Vercel app and this source are public; contest submission requires its own confirmed receipt.

## Container

```bash
docker build -t common-room .
docker run --rm -p 4312:4312 common-room
```

That image runs the synthetic demo. To include the pinned live harness, build with `--build-arg INSTALL_QLOO_HARNESS=true`, supply environment secrets at runtime, and mount a persistent writable volume at `/app/.data`. The container configuration is provided but has not been built or deployed in this preparation session.

## How the agent makes a decision

For each circle, it discovers candidates across three domains. It takes the union of eligible entities, then asks Qloo to rank the same shortlist separately for each circle. It exhaustively evaluates combinations of one book, one artist, and one film. Its first objective is the lowest circle coverage; its second is the average. If the brief is unsatisfied, it targets the weakest circle and weakest domain with one deeper search, reranks that domain, and either completes the brief or refuses.

The rank-derived coverage scores belong to Common Room. Raw Qloo affinities remain separate evidence fields. A missing result means an evidence gap, not dislike. Scores are relative to one shortlist and are not calibrated across different runs. There is no inference about age, race, gender, health, politics, or individual behavior.

## Reproducibility and limits

The remaining gates are real API verification, a fresh-input evidence run and a public anonymous live deployment check. Private coordinator handoffs and account receipts are deliberately excluded from public releases. No model API, venue research, turnout prediction or commercial outcome is claimed.

| File | Purpose |
| --- | --- |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Hosting, shared quota, access checks and operational limits |
| [docs/EVIDENCE.md](docs/EVIDENCE.md) | Actual hosted journeys, independent rank evaluation and limitations |
| [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md) | Pinned dependencies and known upstream advisory limitations |
| [docs/SPEC.md](docs/SPEC.md) | Product behavior, scores, architecture, and boundaries |
| [docs/HARNESS_CONTRACT.md](docs/HARNESS_CONTRACT.md) | Pinned official command/schema contract |
| [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) | A concise judge walkthrough and optional recording script |

MIT licensed. Working project name: Common Room. Built for Belal Embaby as a new solo project starting October 21, 2026.
