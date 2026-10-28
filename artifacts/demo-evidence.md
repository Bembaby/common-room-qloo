# Common Room local evidence

Generated: 2026-10-28T14:18:45.077Z

**Category: synthetic local evaluation. Actual Qloo requests: 0.**

| Scenario | Decision | Balanced minimum | Average baseline minimum | Workflows | Refined |
| --- | --- | ---: | ---: | ---: | --- |
| Balanced night | ready | 62.5 | 58.33 | 18 | no |
| Selected book vetoed | ready | 61.31 | 55.95 | 18 | no |
| Strict coverage refusal | blocked | 61.11 | 56.48 | 22 | yes |
| No graph evidence | blocked | none | none | 10 | yes |

All coverage values are application-derived rank scores on synthetic relationships. Both objectives use the same shortlist within each run. Scores across different runs are not calibrated or directly comparable.

The script asserted the default completed brief, binding veto, strict-brief refusal, empty-evidence refusal, provenance labels, and workflow cap. It exits nonzero if any assertion fails.

The complete records, inputs, entity IDs, tool traces, and counterfactuals are in demo-evidence.json. Live evidence remains pending.