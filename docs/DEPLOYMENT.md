# Hosting and judging access

Verified October 28, 2026. A fixture deployment is a preview, not a valid Qloo entry.

## Reproduce locally

Use Node.js 22.19 or later. Run `npm ci --ignore-scripts`, `npm test`, then `npm start`. The default is the synthetic fixture at http://127.0.0.1:4312. No model API is used. The two pinned dependencies support the official Qloo subprocess and Vercel's durable quota storage. Local planning and HTTP handling use the Node standard library.

## Vercel

The `public/` directory is the static output. Requests under `/api/` reach `api/index.js`. The harness and fixtures must be included in the function bundle. Its 800-second lifetime bounds at most 22 sequential workflows with a default 25-second deadline. Harness scratch files use the temporary filesystem. They are not the quota ledger.

The hosted quota coordinator uses one dedicated **private Vercel Blob** object, `quota/shared-v1.json`. Every deployment reads uncached state and conditionally writes against its ETag. A plan reserves its entire maximum allowance before constructing the provider adapter. One shared 15-minute lease prevents concurrent live plans across instances. Lost acknowledgements retain reservations; missing or corrupt state stops all queries. Reservations are never refunded, including on failed plans. The terminal response follows the release attempt, so function freezing cannot routinely skip it. A failed release retains the lease until expiry.

The local file ledger supports a single persistent Node process. It must not be used as a serverless quota store. Do not run local quota-consuming scripts concurrently with the public app against an independent ledger.

Server-only deployment settings:

```dotenv
APP_MODE=live
PUBLIC_DEMO=true
APP_ACCESS_CODE=
QLOO_API_KEY=organizer-issued-secret
QLOO_MAX_WORKFLOWS=22
QLOO_MAX_WORKFLOWS_PER_HOUR=88
QLOO_TIMEOUT_MS=25000
```

The connected private store supplies `BLOB_READ_WRITE_TOKEN`. `88` is an application default, not a known event allowance. Confirm the issued quota and expiry before enabling live mode. The adapter pins both base URL variables to `https://hackathon.api.qloo.com`; user-controlled URLs cannot redirect credentials. No model key enters the subprocess.

Initialize a new dedicated store once using `scripts/init-hosted-budget.js`. It refuses overwrite. Never recreate state to bypass an allowance. Run `npm run host:verify` to check real conditional writes, exclusion and release. This sends no Qloo requests and conservatively retains two test reservations. Its category is `hosted_storage_verified`.

## Release checks

Publish only the allowlisted tree produced by `npm run release:stage`. Its manifest stays private under `.data`. Handoffs, registration answers, local history, secrets, quota state and private live evidence are excluded. Review the staged tree and diff before publication.

Disable Vercel Authentication for the intended public project. Check the final URL without cookies or a bypass secret. The production homepage, config, streamed plan, veto and both downloads must work anonymously. A 200 homepage proves only reachability. A fixture result or storage test does not prove actual Qloo integration.

Keep final source and assets stable after the deadline. Formal rules and structured dates differ on the precise judging-end time. Preserve resources through November 6 while resolving that discrepancy, subject to the owner's $0 additional-spend limit.

## Costs and limits

No paid model API is required. Check the hosting account's included resources and spending controls before deployment. Included credit is shared and does not establish a project spending cap. Do not change shared billing settings or pause unrelated projects as a deployment side effect. The event credential's allowance and expiration also require verification before live activation.

The in-memory per-IP limit is a secondary local defense, not a distributed rate limit. Blob reservations and the lease are the shared sponsor-quota boundary. Workflows are not HTTP-request counts: resolution and upstream retries can add requests. No venue outcomes or full accessibility certification is claimed.
