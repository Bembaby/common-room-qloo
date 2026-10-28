# Dependency review

Checked October 28, 2026 with Node 24.15.0 and npm 11.12.1.

The project pins `@qloo/qloo-harness` 0.1.26 to preserve its inspected workflow/schema contract and `@vercel/blob` 2.8.2 for conditional private quota writes. No language-model API is used.

`npm audit --omit=dev` currently reports four findings: two moderate and two high. The upstream `@earendil-works/pi-coding-agent` 0.84.2 package has its own shrinkwrap, which retains `undici` 8.9.0 and `brace-expansion` 5.0.9 despite root overrides requesting patched versions. A clean resolution reproduced this. Root override declarations are not evidence that the installed tree is patched.

Common Room exposes only the validated `qloo exec recommend` and `qloo exec rank` routes, with bounded JSON stdin, a server-selected official endpoint, no shell, a restricted environment, deadlines and output limits. It does not expose upstream chat, build, file-browsing, WebSocket, proxy or arbitrary URL tools. These boundaries narrow exposure; they are not an assertion that the dependencies have no vulnerabilities.

Before claiming a fully verified live release, evaluate an official updated harness or a reproducibly patched dependency tree, inspect its workflow contract and run genuine event-key compatibility checks. Do not silently replace dependencies, edit vendored code or claim a clean audit on the current pin. Registry audit checks are distinct from provider execution.

Advisories: [brace expansion](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr), [Undici](https://github.com/advisories/GHSA-3wwx-pv8p-q78v). Read the full current audit for the remaining advisory IDs.
