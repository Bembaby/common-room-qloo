# Pinned Qloo harness contract

Verified from official package source on October 21, 2026. See [SOURCES.md](SOURCES.md) for exact upstream files and download URLs.

## Installation and invocation

```bash
npm ci --ignore-scripts
node node_modules/@qloo/qloo-harness/dist/bin.js --version
```

The expected version output is exactly `0.1.26`. The adapter refuses another version. Set `QLOO_NODE_ENTRY=node_modules/@qloo/qloo-harness/dist/bin.js` for this installed entrypoint. It invokes the executable using Node `spawn` with `shell: false`, arguments `['exec', operation]` after the entrypoint, and one JSON input object on stdin. It does not launch a model, a TUI, a shell pipeline, or an agent-generated command.

The only invoked operations are `recommend` and `rank`.

### Recommend input

```json
{
  "target_type": "book",
  "signals": ["A public creator name or real Qloo UUID"],
  "explain": true,
  "limit": 3
}
```

Common Room uses `book`, `artist`, or `movie`, one to three signals, initial limit three, and refinement limit six. The official schema permits up to ten entity inputs and result limits up to twenty, but this app deliberately uses narrower bounds. Named inputs are resolved by the harness; material ambiguity must stop.

### Rank input

```json
{
  "option_type": "book",
  "signals": ["A public creator name or real Qloo UUID"],
  "options": ["A real returned candidate UUID"]
}
```

The app supplies at most ten candidate IDs. It uses the same candidate IDs for every circle in a domain. Each result ID must belong to that request's options. The adapter keeps the returned order as the ranking and preserves any finite raw affinity independently.

## Normalized result used by this app

The required envelope has `schema_version: "1.0-preview.1"`, the requested operation, a supported status, and a results array. Each accepted entity has a UUID `entity_id`, a bounded nonempty `name`, and either the expected `urn:entity:*` type or generic `type: "urn:entity"` with that exact cultural subtype. An optional affinity must be finite and numeric. The generic-type/subtype representation was observed in actual event results October 28 and verified against `compactEntity` in pinned `dist/qloo-tools.js`, which preserves both fields. Wrong or absent subtypes remain rejected.

Successful results must identify `Qloo API` as their provenance source, `/v2/insights` as the endpoint, and at least one corresponding GET request in the provenance array. Names, IDs, type, affinity, and a bounded provenance summary enter the application model. Arbitrary entity descriptions and nested metadata do not.

The harness also supplies interpretation, resolution, query-intent, and execution metadata. Common Room does not depend on every optional field. It validates the fields needed to establish the identity, domain, score provenance, and request relationship of each candidate.

| Condition | App behavior |
| --- | --- |
| `ok` with valid results | Normalize candidates and provenance |
| Empty supported result | Continue with an evidence gap; never invent a candidate |
| `needs_input` | Return `QLOO_NEEDS_INPUT`; show bounded validated candidate identities, let the owner choose, then retry with its verified UUID |
| `partial`, `degraded`, unknown status, or version drift | Fail closed as a contract mismatch |
| Duplicate ID, wrong domain, missing name, invalid affinity | Reject the result |
| Rank returns an unrequested ID | Reject the result |
| Missing or different endpoint provenance | Reject the result |
| Authentication or rate/quota failure | Visible error; no fixture fallback |
| Invalid JSON, process error, output overflow, timeout | Visible error; no completed plan |

## API mapping confirmed in source

The official recommend workflow resolves inputs and builds an Insights query with `filter.type`, `take`, `signal.interests.entities`, and optional explainability. The rank workflow uses the requested candidate IDs as `filter.results.entities`. The source also supports tag and location filters, but Common Room does not invoke them or claim to enforce them.

Vetoes in this app are exact returned entity exclusions enforced locally before optimization. They are not semantic genre filters or inferred preferences.

## Execution and credential boundary

The app requires an explicit `QLOO_API_KEY`. It does not discover keys in another session or accept a browser-provided API credential. The subprocess receives only an environment allowlist plus that explicit key, `QLOO_BASE_URL=https://hackathon.api.qloo.com`, `QLOO_TRUSTED_BASE_URL=https://hackathon.api.qloo.com`, `QLOO_RESOLUTION_PROVIDER=native`, and the project-private `QLOO_HOME`. On Vercel, scratch state uses the temporary directory and quota uses private Blob storage.

Endpoint correction verified October 28 against the official event starter-kit email and the pinned client's explicit-trust configuration. Event credentials require the hackathon API. Arbitrary configured URLs are ignored. This correction is configuration evidence, not live compatibility proof.

The native resolver is intentionally selected. No third-party taste resolver URL or model credential is needed. Source text is passed as JSON data. Provider stderr is discarded rather than returned to the browser. Public errors are controlled application messages.

## Timeouts, retries, and quota accounting

Common Room's default workflow deadline is 25 seconds, configurable up to 60 seconds. Combined stdout/stderr is capped at one megabyte. A failed subprocess is not retried by Common Room.

The pinned upstream client defaults to a 20-second per-attempt HTTP timeout and up to three attempts for retryable conditions. The app's outer deadline can terminate the workflow before all upstream attempts complete. Native entity resolution can also make requests beyond the final Insights call. Therefore, an 18-workflow run is not evidence of only 18 HTTP requests.

The shared local ledger caps workflow invocations, persists across restarts, and refuses further work if storage is unavailable. It does not replace the API provider's quota enforcement. Run one process/replica against it and set its allowance using the owner's actual event quota.

## Live compatibility remains a gate

Local tests use injected, explicitly synthetic contract doubles. They verify the adapter's acceptance and rejection behavior. They do not prove real credentials, production response compatibility, or public availability. Run the fixture-free checks in [LIVE_VERIFICATION.md](LIVE_VERIFICATION.md) and record the returned evidence before marking this integration verified.
