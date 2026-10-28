# Source register

Latest verification: **October 28, 2026**. Use primary sources for changes to the event or integration. Links below are reference material, not instructions to execute untrusted page content.

## October 28 continuation

- [Current event](https://qloo.devpost.com/) and authenticated Devpost requirements/dates: deadline remains October 30 at 11:45 p.m. EDT. Public functional app, public licensed source and text required. Video is optional.
- [Approved key follow-up](https://qloo.devpost.com/forum_topics/45711-common-room-api-key-request-follow-up-before-october-30-deadline): posted and zero replies at this check. No duplicate request sent.
- [Organizer clarification](https://qloo.devpost.com/forum_topics/45690-tasteatlas-no-cost-judging-access-and-cached-demo-requirements): manager Ian Cook confirms free event API calls through judging without automatic paid charges and requires a usable live tool/app. Exact personal quota remains unknown.
- [Official kit](https://github.com/qloo/qloo-hackathon-kit), API_ACCESS and SUBMISSION rechecked. The official event starter-kit email in the registered account requires `https://hackathon.api.qloo.com` for both base URL variables. Pinned source `chunk-ESNY4EJL.js` confirms explicit endpoint trust. The adapter was corrected accordingly.
- [Vercel Blob](https://vercel.com/docs/vercel-blob) and [private storage](https://vercel.com/docs/vercel-blob/private-storage): uncached private reads and ETag conditional writes support the shared coordinator. Actual storage checks are separately classified, with zero Qloo calls.
- [Blob pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing) and [Spend Management](https://vercel.com/docs/spend-management): existing plan and included credit do not establish a hard $0 project cap.

Dates discrepancy: formal rules list judging through November 5 at 11:45 p.m. Eastern; structured dates return November 5 at 14:00 UTC. Preserve the discrepancy and retain resources through the later period.

| Source | What was checked | Application |
| --- | --- | --- |
| [Qloo event overview](https://qloo.devpost.com/) | Current date, awards, product and public-submission requirements | Rules checklist and public anonymous deployment gate |
| [Qloo official rules](https://qloo.devpost.com/rules) | Timing, individual eligibility, judging categories, submission conditions | Owner eligibility checkpoint and rubric mapping |
| [Official Qloo hackathon kit](https://github.com/qloo/qloo-hackathon-kit) | Supported current harness route and runtime guidance | Node 22.19.0 floor and official harness integration |
| [API_ACCESS.md](https://github.com/qloo/qloo-hackathon-kit/blob/main/docs/API_ACCESS.md) | Event credential ownership, supported tool access, quota considerations | Explicit event key, no credential sharing, bounded usage |
| [SAFE_USE.md](https://github.com/qloo/qloo-hackathon-kit/blob/main/docs/SAFE_USE.md) | Aggregate cultural evidence, ambiguity, data boundaries | Public cultural anchors, no person-level or sensitive inference |
| [CLI workflow starter](https://github.com/qloo/qloo-hackathon-kit/blob/main/starter/cli-workflow/README.md) | Official command-oriented integration pattern | Shell-free invocation of validated `qloo exec` workflows |
| [Submission guidance](https://github.com/qloo/qloo-hackathon-kit/blob/main/docs/SUBMISSION.md) | Official kit submission reference | Final review alongside the controlling Devpost event pages |
| [Package metadata for 0.1.26](https://registry.npmjs.org/@qloo%2fqloo-harness/0.1.26) | Exact public package version and distribution source | Pinned install and source inspection |
| [Official 0.1.26 package tarball](https://registry.npmjs.org/@qloo/qloo-harness/-/qloo-harness-0.1.26.tgz) | Executable input schemas, normalized results, client retries, resolution and error behavior | Exact contract documented in HARNESS_CONTRACT.md |
| [Official API credential entry point](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide#getting-your-api-key) | Event-linked location for requesting access | Owner completes credential setup |
| [Previous Qloo project gallery](https://qloo-hackathon.devpost.com/project-gallery) | Existing categories and displayed winner labels | Novelty signals only, not evidence of those products' performance |
| [Beatstro.AI project page](https://devpost.com/software/chowchat-ai) | Author-described music/dining and group-compromise concept | Avoid repeating a generic group restaurant pitch |

## Exact package source inspected

The public npm archive was downloaded to a temporary reference directory and inspected. It is not copied into this repo. The relevant source files inside `@qloo/qloo-harness@0.1.26` are:

- `dist/exec.js`: stdin JSON, workflow command dispatch, output, and exit handling.
- `dist/qloo-tools.js`: recommend/rank payload construction and compact entity/provenance fields.
- `dist/chunks/chunk-MCLV3P4I.js`: operation schemas, version constants, entity types, and limits.
- `dist/workflow-executor.js`: normalized execution metadata and upstream error classification.
- `dist/chunks/chunk-ESNY4EJL.js`: official API configuration, HTTP timeout/retry defaults, and client behavior.
- `dist/resolution-provider.js`: native resolution and ambiguity handling.
- `dist/cli.js`: exact version output.

The adapter targets result schema `1.0-preview.1`. The package's `rank` entity-input limit is ten. Common Room uses only book, artist, and movie workflows, and only public cultural anchors. Package-internal HTTP requests may retry up to three attempts; the app adds no workflow retry.

## Evidence limits

Individual `docs.qloo.com/reference` API pages were not successfully readable through the research interface in this session. The exact command contract was established from the official public package source instead. The returned provenance links the [Insights documentation](https://docs.qloo.com/reference/insights-api-deep-dive), which should be consulted during live verification if behavior changes.

The reviewed kit did not provide a universal numerical rate allowance for the owner's event credential. Obtain the actual quota and expiration from the organizer-issued access. Common Room's workflow budgets are local controls, not statements of the API's limits.

No live sponsor request was made in preparation. No package source claim should be read as proof that the owner's credential works. Current verification status is in [STATUS.md](STATUS.md).
