import test from 'node:test';
import assert from 'node:assert/strict';
import { explainCuration, explainVetoes } from '../public/curation.js';
import { runPlan } from '../src/agent.js';
import { FixtureAdapter, fixture } from '../src/fixtures.js';

const fresh = () => structuredClone(fixture.input);

test('curatorial entry points cite only observed highest ranks, including ties', async () => {
  const input = fresh();
  const result = await runPlan(input, new FixtureAdapter(input));
  const selected = result.decision.selected;
  for (const entry of result.curation.entryPoints) {
    const highest = Math.max(...selected.items.filter(item => item.scores[entry.circleId].observed).map(item => item.scores[entry.circleId].relativeScore));
    assert.deepEqual(entry.works.map(work => work.id), selected.items.filter(item => item.scores[entry.circleId].observed && item.scores[entry.circleId].relativeScore === highest).map(item => item.id));
    for (const work of entry.works) {
      const score = selected.items.find(item => item.id === work.id).scores[entry.circleId];
      assert.equal(work.rank, score.rank);assert.equal(work.totalOptions, score.totalOptions);
    }
  }
  const tied = structuredClone(selected);
  tied.items.forEach(item => {item.scores['circle-1'].relativeScore=70;});
  assert.equal(explainCuration(tied,result.input,result.decision.baseline,result.evidence).entryPoints[0].works.length,3);
});

test('unobserved scores never become a claimed entry point or invented thematic explanation', async () => {
  const input = fresh();const result = await runPlan(input,new FixtureAdapter(input));
  const bundle = structuredClone(result.decision.selected);
  bundle.items.forEach(item=>{item.scores['circle-1'].observed=false;item.scores['circle-1'].relativeScore=0;});
  const explanation=explainCuration(bundle,result.input,result.decision.baseline,result.evidence);
  assert.deepEqual(explanation.entryPoints[0].works,[]);
  assert.ok(explanation.note.includes('not Qloo-supplied themes'));
});

test('tradeoff deltas use the same circle identities and report equal policies honestly', async () => {
  const input=fresh();const result=await runPlan(input,new FixtureAdapter(input));
  const explanation=explainCuration(result.decision.selected,result.input,result.decision.selected,result.evidence);
  assert.equal(explanation.sameAsAverage,true);
  assert.ok(explanation.circles.every(row=>row.delta===0));
  for(const row of result.curation.circles) {
    const baseline=result.decision.baseline.metrics.coverage.find(other=>other.circleId===row.circleId);
    assert.equal(row.delta,Math.round((row.score-baseline.score)*100)/100);
  }
});

test('veto receipts distinguish observed exclusions from exact vetoes never returned by discovery', () => {
  const evidence=[{operation:'recommend',results:[{id:'book-1',name:'Jazz'},{id:'book-1',name:'Jazz'}]},{operation:'rank',results:[{id:'book-2',name:'Rank only'}]}];
  const rows=explainVetoes(['JAZZ','unseen','Rank only'],evidence,[]);
  assert.deepEqual(rows[0].matchedNames,['Jazz']);assert.deepEqual(rows[0].matchedIds,['book-1']);
  assert.deepEqual(rows[1].matchedNames,[]);assert.deepEqual(rows[2].matchedNames,[]);
  assert.ok(rows.every(row=>row.excludedFromBundle));
  assert.equal(explainVetoes(['Jazz'],evidence,[{id:'book-1',name:'Jazz'}])[0].excludedFromBundle,false);
});

test('two-circle briefs retain exact evidence, prepare a complete host copy and honor all vetoes', async () => {
  const input=fresh();input.circles=input.circles.slice(0,2);input.minutes=60;
  const first=await runPlan(input,new FixtureAdapter(input));
  assert.equal(first.status,'ready');assert.equal(first.input.circles.length,2);
  assert.equal(first.program.invitations.length,2);
  assert.equal(first.program.schedule.reduce((sum,row)=>sum+row.minutes,0),60);
  for(const item of first.decision.selected.items) assert.ok(first.program.openingQuestion.includes(item.name));
  assert.equal(first.program.preparation.length,4);
  input.vetoes=[first.decision.selected.items.find(item=>item.domain==='artist').id];
  const next=await runPlan(input,new FixtureAdapter(input));
  assert.ok(!(next.decision.selected??next.decision.bestUnqualified)?.items.some(item=>input.vetoes.includes(item.id)));
});

test('empty and rejected evidence never produces a host invitation or approved program', async () => {
  const input={...fresh(),scenario:'empty'};const result=await runPlan(input,new FixtureAdapter(input));
  assert.equal(result.curation,null);assert.equal(result.program,null);
  assert.equal(explainCuration(null,result.input,null,[]),null);
});
