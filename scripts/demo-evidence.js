import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { runPlan } from '../src/agent.js';
import { fixture, FixtureAdapter } from '../src/fixtures.js';

const base = structuredClone(fixture.input);
const normal = await runPlan(base, new FixtureAdapter(base));
assert.equal(normal.status, 'ready', 'Default fixture must produce a usable brief.');
const vetoId = normal.decision.selected.items.find(item => item.domain === 'book').id;
const vetoInput = { ...base, vetoes: [vetoId] };
const strictInput = { ...base, minimumCoverage: 95 };
const emptyInput = { ...base, scenario: 'empty' };
const results = [
  { name: 'Balanced night', result: normal },
  { name: 'Selected book vetoed', result: await runPlan(vetoInput, new FixtureAdapter(vetoInput)) },
  { name: 'Strict coverage refusal', result: await runPlan(strictInput, new FixtureAdapter(strictInput)) },
  { name: 'No graph evidence', result: await runPlan(emptyInput, new FixtureAdapter(emptyInput)) }
];
assert.ok(!results[1].result.catalog.some(entity => entity.id === vetoId), 'Veto cannot be relaxed.');
assert.equal(results[2].result.status, 'blocked');
assert.equal(results[2].result.decision.refined, true);
assert.equal(results[3].result.status, 'blocked');
assert.equal(results[3].result.catalog.length, 0);
for (const { result } of results) {
  assert.ok(result.budget.workflowCount <= 22);
  assert.ok(result.evidence.every(record => record.provenance.mode === 'fixture' && record.provenance.requestCount === 0));
  if (result.decision.minimumGainVsAverage !== null) assert.ok(result.decision.minimumGainVsAverage >= 0);
  if (result.status === 'blocked') assert.equal(result.program, null);
}
const generatedAt = new Date().toISOString();
await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
await writeFile(new URL('../artifacts/demo-evidence.json', import.meta.url), JSON.stringify({
  category: 'synthetic_local_evaluation', generatedAt,
  actualQlooRequests: 0, fixture: 'fixtures/scenario.json',
  claims: 'These runs verify software behavior on invented fixture relationships. They do not validate Qloo access, real affinities, attendance, demand, or revenue.',
  results
}, null, 2));
const rows = results.map(({ name, result }) => {
  const bundle = result.decision.selected ?? result.decision.bestUnqualified;
  return `| ${name} | ${result.status} | ${bundle?.metrics.minimum ?? 'none'} | ${result.decision.baseline?.metrics.minimum ?? 'none'} | ${result.budget.workflowCount} | ${result.decision.refined ? 'yes' : 'no'} |`;
});
await writeFile(new URL('../artifacts/demo-evidence.md', import.meta.url), [
  '# Common Room local evidence', '', `Generated: ${generatedAt}`, '',
  '**Category: synthetic local evaluation. Actual Qloo requests: 0.**', '',
  '| Scenario | Decision | Balanced minimum | Average baseline minimum | Workflows | Refined |',
  '| --- | --- | ---: | ---: | ---: | --- |', ...rows, '',
  'All coverage values are application-derived rank scores on synthetic relationships. Both objectives use the same shortlist within each run. Scores across different runs are not calibrated or directly comparable.', '',
  'The script asserted the default completed brief, binding veto, strict-brief refusal, empty-evidence refusal, provenance labels, and workflow cap. It exits nonzero if any assertion fails.', '',
  'The complete records, inputs, entity IDs, tool traces, and counterfactuals are in demo-evidence.json. Live evidence remains pending.'
].join('\n'));
console.log(`PASS: ${results.length} synthetic scenarios; 0 Qloo requests. Wrote artifacts/demo-evidence.json and artifacts/demo-evidence.md.`);
