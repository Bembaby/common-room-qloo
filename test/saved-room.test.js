import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSavedRoom } from '../public/saved-room.js';
import { fixture, FixtureAdapter } from '../src/fixtures.js';
import { runPlan } from '../src/agent.js';

test('local reopen retains the original decision and host notes without executing the provider', async () => {
  const result=await runPlan(fixture.input,new FixtureAdapter(fixture.input));
  const saved={version:1,mode:'fixture',form:{venue:fixture.input.venue,minutes:90,coverage:60,circleCount:3,circles:fixture.input.circles.map(circle=>({name:circle.name,anchors:circle.anchors.join('\n')})),vetoes:''},identities:[],result,resultFormSnapshot:'{}',notes:{excerpt:'Host-selected passage',question:'A host-written question'}};
  const restored=parseSavedRoom(JSON.stringify(saved),'fixture');
  assert.equal(restored.result.id,result.id);assert.equal(restored.result.generatedAt,result.generatedAt);
  assert.equal(restored.notes.excerpt,'Host-selected passage');
  for(const bad of [ {...saved,mode:'live'}, {...saved,version:99}, {...saved,identities:[['key','not-a-uuid']]}, {...saved,result:{...result,mode:'live'}}, {...saved,result:{...result,decision:{...result.decision,selected:{...result.decision.selected,items:[]}}}} ]) assert.throws(()=>parseSavedRoom(JSON.stringify(bad),'fixture'));
  assert.throws(()=>parseSavedRoom('x'.repeat(1_500_001),'fixture'));
});
