# Executed evidence

Checked October 28, 2026. [Live app](https://common-room-eight.vercel.app), [public MIT source](https://github.com/Bembaby/common-room-qloo).

## Genuine hosted journeys

These checks used a fresh Chromium context without cookies, account credentials or a protection-bypass secret. The browser entered a new venue brief using the public cultural anchors Toni Morrison, Miles Davis and The Grand Budapest Hotel. Anchor identities had first been resolved through Qloo. Every recommendation and rank in the exported result came from the actual event API, not a fixture or a cached recommendation. The tested core source was `e853a577ff950d78163e7444b4f8beb728eddb19`.

| Journey | Outcome | Workflows | Run ID |
| --- | --- | --- | --- |
| Fresh 90-minute brief, minimum 50 | Ready; weakest circle 66.67 | 18 | `8d1bc156-53fa-4df8-b8e5-b8f258689ef8` |
| Exact selected-book veto | Ready; vetoed Life of Pi ID absent; weakest circle 66.14 | 18 | `1144c5a7-f05b-4e52-ab81-567c4b706dfe` |
| Minimum 95, preserving the veto | Blocked after one deeper movie search for Novel readers; best available minimum 65.56; no approved program | 22 | `3a299c60-19be-4eb5-9e61-09663ad98ee0` |

The fresh program selected Life of Pi, Sly & The Family Stone, and Birdman or (The Unexpected Virtue of Ignorance). Its schedule totaled 90 minutes. The veto run selected a different book and artist. The browser downloaded both the actual Markdown host brief and evidence JSON; IDs and contents were inspected. The 390px and 320px live result layouts had no horizontal page overflow, and the tested browser had no JavaScript errors.

## Independent same-shortlist evaluation

`scripts/verify-evidence.js` recalculates directly from the returned rank order, without importing the application optimizer or trusting stored scores. It checks discovery membership, identical final rank options across circles, binding vetoes, score arithmetic, the timing total and every eligible three-slot combination.

| Live result | Combinations | Balanced minimum | Average-only minimum | Minimum difference |
| --- | --- | --- | --- | --- |
| Fresh | 441 | 66.67 | 52.91 | +13.76 points |
| Veto | 378 | 66.14 | 62.43 | +3.71 points |
| Strict diagnostic | 540 | 65.56 | 58.15 | +7.41 points |

These comparisons isolate the decision policy on the exact same returned candidates and vetoes. They are **relative rank coverage**, not Qloo probabilities, measured satisfaction, attendance or commercial improvement. Scores from different shortlists are not calibrated comparisons. This is one brief with two interventions, not a user study or a general benchmark against an LLM.

To independently inspect an exported live run:

```text
node scripts/verify-evidence.js /path/to/common-room-evidence.json
```

Full raw live responses stay private. This public index and selected screenshots contain only reviewed cultural names, IDs, aggregate calculations and software behavior.

## Failures retained and repaired

- An ambiguous author/person identity stopped instead of being guessed. The UI now offers bounded, validated identities and preserves the brief for retry.
- An actual event response used generic entity type plus a precise subtype. The normalizer was corrected against observed data and pinned source; wrong subtypes remain rejected.
- An initial hosted recording could not retrieve its streamed response body from the browser debugger. It was retained as inconclusive. Final verification instead inspected the app's real evidence download.
- A genuine Qloo rate-limit failure was visible, with no fixture fallback. Provider headers showed remaining monthly allowance and a 10 requests/second limit. A trusted preload now paces native parallel lookups and retries. Subsequent hosted journeys passed.
- Malformed JSON, invalid input and hostile origins were rejected by the hosted backend. Private environment and source paths returned 404.

## Separate local and storage checks

The automated suite includes fairness, vetoes, refusal, empty evidence, schema/provenance rejection, subprocess boundaries, request pacing, cancellation, HTTP boundaries and durable quota behavior. Local browser checks exercised keyboard navigation, native validation, loading, text-safe identity choice, empty fixture refusal, reset, reconnection, downloads, reduced motion and 1440/390/320 layouts. Injected failures and empty fixtures are explicitly local tests, not real provider outcomes.

Real private Blob checks verified conditional writes, exclusion between independent coordinators and release. The hosted veto and strict runs then exercised repeat use of the same persisted coordinator. Uncertain runs keep their full reservation. Only confirmed completed outcomes reconcile unused reserved workflow slots; lifetime reservations survive hourly expiry.

## Interface refinement, October 28

The second interface pass adds a first-screen action that uses the current brief, observed search stages and elapsed time, immediate result exports, a cumulative host running order, a changed-brief warning, and a distinct refusal with focused recovery. Rejected candidates are disclosed as diagnostics rather than presented as approved selections. The cultural identity remains self-hosted Newsreader and Manrope, paper grain, plum controls and credited Met artwork.

The core suite passed all 42 tests. Fourteen existing local browser checks and eight additional round-two checks passed, including edited-brief execution, stale exports, disabled old-result vetoes, cumulative schedule timing, collapsed refusal diagnostics, focused recovery, quota errors and interrupted streams. Layouts were inspected at 1440, 768, 390 and 320 pixels. Checked text contrasts ranged from 5.38:1 upward on composited CSS surfaces. Injected failures remain local UI tests, not claims of a real provider outage.

The design detector's paper-palette warning is an intentional exception documented by the existing material and typography direction. The two section numbers indicate the actual brief-to-decision sequence. An unused pulsing indicator was removed. Source scanning does not replace the rendered browser checks.

## Material limits

The app is a deterministic goal-directed agent and makes no runtime model API call. Cultural interests are public anchors, not demographic profiles. A host must independently arrange inventory, playback or screening rights, performer availability and venue logistics. No organizer research or real event outcomes have been measured. The pinned harness has known transitive dependency advisories, described in DEPENDENCIES.md. Browser checks are scoped verification, not an accessibility certification.

The official developer guide says event keys remain active through judging. An exact per-key expiration timestamp was not returned. Keep the public app and source available through judging and respect the remaining account allowance. Provider timestamps and observer timestamps are retained separately; a measured server/observer clock offset is recorded privately.

Video is optional under the current event requirements. The release uses genuine application screenshots and reproducible instructions; no paid narration or media generation was commissioned.
