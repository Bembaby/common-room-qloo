import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Recalculate directly from returned rank order. This verifier deliberately
// does not import the application's optimizer or its stored candidate scores.
const file = process.argv[2];
if (!file) throw new Error('Usage: node scripts/verify-evidence.js path/to/evidence.json [report.json]');
const bytes = await readFile(file);
const result = JSON.parse(bytes);
const domains = ['book', 'artist', 'movie'];
const round = value => Math.round(value * 100) / 100;
assert.equal(result.mode, 'live');
assert.equal(result.evidence.length, result.budget.workflowCount);
assert.ok(result.budget.workflowCount <= 22);
assert.ok(result.evidence.every(e => e.provenance.mode === 'live' && e.provenance.source === 'Qloo API' && e.provenance.endpoint === '/v2/insights'));
assert.ok(result.evidence.filter(e => e.operation === 'recommend' && e.inputs.limit === 6).length <= 1);
const candidates = Object.fromEntries(domains.map(domain => [domain, result.catalog.filter(item => item.domain === domain)]));
const scores = new Map();
for (const domain of domains) {
  const optionIds = candidates[domain].map(item => item.id).sort();
  for (const circle of result.input.circles) {
    const rank = result.evidence.filter(e => e.operation === 'rank' && e.domain === domain && e.circleId === circle.id).at(-1);
    assert.ok(rank, `Missing final rank for ${domain}/${circle.id}`);
    assert.deepEqual([...rank.inputs.optionIds].sort(), optionIds);
    for (const item of candidates[domain]) {
      const at = rank.results.findIndex(row => row.id === item.id);
      const score = at < 0 ? 0 : round(100 * (optionIds.length - at) / optionIds.length);
      scores.set(`${circle.id}:${item.id}`, score);
      assert.equal(item.scores[circle.id].relativeScore, score);
      assert.equal(item.scores[circle.id].observed, at >= 0);
    }
  }
}
const vetoes = new Set(result.input.vetoes.map(value => value.toLowerCase()));
for (const item of result.catalog) {
  assert.ok(!vetoes.has(item.id.toLowerCase()) && !vetoes.has(item.name.toLowerCase()));
  assert.ok(result.evidence.some(e => e.operation === 'recommend' && e.results.some(row => row.id === item.id)));
}
const metrics = items => {
  const coverage = result.input.circles.map(circle => round(items.reduce((sum, item) => sum + scores.get(`${circle.id}:${item.id}`), 0) / 3));
  return { minimum: Math.min(...coverage), average: round(coverage.reduce((sum, value) => sum + value, 0) / coverage.length) };
};
let balanced = null;
let average = null;
let considered = 0;
for (const book of candidates.book) for (const artist of candidates.artist) for (const movie of candidates.movie) {
  const value = metrics([book, artist, movie]);
  considered++;
  if (!balanced || value.minimum > balanced.minimum || (value.minimum === balanced.minimum && value.average > balanced.average)) balanced = value;
  if (!average || value.average > average.average || (value.average === average.average && value.minimum > average.minimum)) average = value;
}
const chosen = result.decision.selected ?? result.decision.bestUnqualified;
assert.ok(chosen && balanced && average);
assert.deepEqual(metrics(chosen.items), balanced);
assert.equal(chosen.metrics.minimum, balanced.minimum);
assert.equal(chosen.metrics.average, balanced.average);
assert.deepEqual(metrics(result.decision.baseline.items), average);
assert.equal(result.decision.minimumGainVsAverage, round(balanced.minimum - average.minimum));
if (result.status === 'ready') {
  assert.ok(balanced.minimum >= result.input.minimumCoverage);
  assert.ok(domains.every(domain => candidates[domain].length >= 3));
  assert.equal(result.program.schedule.reduce((sum, row) => sum + row.minutes, 0), result.input.minutes);
} else {
  assert.equal(result.program, null);
  assert.ok(balanced.minimum < result.input.minimumCoverage || domains.some(domain => candidates[domain].length < 3));
}
const report = { category: 'independent_live_rank_evaluation', verifiedAt: new Date().toISOString(), runId: result.id, inputSha256: createHash('sha256').update(bytes).digest('hex'), status: result.status, combinations: considered, balanced, averageOnly: average, minimumGain: round(balanced.minimum - average.minimum), note: 'Identical returned shortlist and vetoes. Rank coverage is not measured attendance, satisfaction or commercial impact.' };
if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
