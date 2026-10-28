# Live evidence and public verification

Current state, October 28: **genuine hosted core journeys verified**. Fresh planning, binding veto, strict refusal, downloads and anonymous access passed. See [EVIDENCE.md](EVIDENCE.md) for actual run IDs, comparisons, failures and limits. The procedures below remain the reproducibility guide; they are not a final contest-submission receipt.

## Evidence categories

| Category | What it proves |
| --- | --- |
| `synthetic_local_evaluation` | Software behavior on invented fixture relationships |
| `configuration_ready` | The explicit credential is present and the exact harness version starts |
| `live_api_success` | One actual recommendation workflow returned validated Qloo evidence |
| `live_plan_success` | A full real-graph plan satisfied the stated constraints |
| `live_constraints_blocked` | Live graph queries completed, but no qualifying plan was found |
| `live_blocked` / `configuration_blocked` | A concrete failure or missing setup, not successful integration |
| `public_live_verified` | A fresh anonymous visitor completed the actual hosted live flow; requires a separate recorded check |

## Gate 1: configuration

Install the exact official harness, configure the owner's event key server-side, and set `APP_MODE=live`. Stop the local server before running quota-consuming CLI checks against the same ledger.

```bash
npm run live:check
```

Pass criteria: exact harness version accepted, explicit event credential present, public-mode settings coherent. This command intentionally makes no Qloo API request. It is not evidence that the key is valid.

## Gate 2: one real entity

Choose a real, independently resolved Qloo UUID. Do not use IDs from `fixtures/scenario.json`; they are synthetic. Set `QLOO_SMOKE_ENTITY_ID`, then:

```bash
npm run live:smoke
```

Pass criteria: a real book entity is returned with valid UUID, type, affinity representation, and Insights provenance. The script reserves its workflow in the shared ledger and saves `artifacts/live-smoke.json`. Empty results and every transport/auth/schema failure exit nonzero and are classified honestly.

Inspect the normalized result and the official harness behavior. If the package returns a valid but unsupported shape, verify it from current primary source code before changing the adapter. Do not disable provenance or identity checks to make this gate pass.

## Gate 3: a full fresh-input plan

Copy `fixtures/live-input.example.json` to a private working input file. Choose public cultural anchors beyond the fixed demo set. Use specific names or verified UUIDs; ambiguity should stop instead of guessing.

```bash
npm run live:plan -- /absolute/path/to/your-live-input.json
```

Pass criteria:

- The exported result is `mode: live` and every workflow has actual Qloo provenance.
- Selected IDs appear in discovery evidence and corresponding rank requests.
- The common shortlist is identical across circles within each domain.
- The returned order and score handling match the official rank contract.
- The final brief is feasible, its schedule totals the requested duration, and its score labels remain relative.
- No fabricated genre, identity, availability, popularity, attendance, or business claim appears in the output.

The script stores `artifacts/live-plan.json`. A live constraint refusal is useful evidence but does not replace at least one successful core use case.

## Gate 4: intervention and failures

Start the app in live mode. Build a successful brief, veto its selected book, and verify the next plan excludes that exact ID. If no replacement qualifies, verify the explicit refusal. Set a strict coverage minimum and inspect which circle/domain the agent targets for its one deeper search.

Exercise an ambiguous cultural name, an invalid key in a temporary local configuration, and a deliberately low local workflow allowance. Each must show the appropriate visible failure without returning synthetic success. Restore the valid configuration afterward. Do not repeatedly provoke provider limits or spend quota merely to manufacture an error screenshot.

## Gate 5: public anonymous use

After authorized publication, use a fresh anonymous browser at the final HTTPS URL. Configure `PUBLIC_DEMO=true` and leave `APP_ACCESS_CODE` empty. A conventional Node host needs one replica with persistent writable `.data`. Vercel uses the private Blob coordinator described in [DEPLOYMENT.md](DEPLOYMENT.md), shared by all instances and deployments. Set the budget from the actual event allowance and keep enough availability for judging.

Record the URL, UTC time, commit identifier, safe configuration summary, fresh cultural inputs, successful result ID, veto result, evidence export, mobile check, and any limits encountered. Verify the public repository can be cloned without a private account and its README starts the app.

Only then record `public_live_verified` in STATUS. A reachable page, a synthetic deployment, a screenshot, or a private judge code does not satisfy this gate.

## What to keep private

Never publish `.env`, `.data`, credentials, private access codes, or unrelated environment variables. Live evidence contains the submitted cultural interests and should be reviewed before selective publication. Preserve public cultural entity IDs and safe provenance needed for reproducibility, while excluding secrets. Retain a truthful failure record alongside success when it explains a material limitation.
