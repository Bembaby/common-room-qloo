import test from 'node:test';
import assert from 'node:assert/strict';
import { presentationCopy, presentationText } from '../public/presentation.js';
import { parseSavedRoom } from '../public/saved-room.js';
import { runPlan } from '../src/agent.js';
import { fixture, FixtureAdapter } from '../src/fixtures.js';

test('provider and reopened text uses the requested punctuation without changing evidence or decisions', () => {
  const dash = String.fromCodePoint(0x2014);
  const original = { id: 'unchanged-id', description: `Group${dash}five members${dash}formed in England.`, scores: [0.183, 66.67], decision: { selected: ['a', 'b', 'c'], gain: 0 } };
  const copy = presentationCopy(original);
  assert.equal(copy.description, 'Group-five members-formed in England.');
  assert.equal(copy.presentationNormalization.replacements, 2);
  assert.equal(copy.presentationNormalization.entityIdsAndNumericScoresChanged, false);
  assert.equal(original.description.includes(dash), true);
  assert.deepEqual(copy.scores, original.scores);
  assert.deepEqual(copy.decision, original.decision);
  assert.equal(copy.id, original.id);
  assert.deepEqual(presentationCopy(copy), copy);
  assert.equal(presentationText(66.67), 66.67);
});

test('maximum-length venue and circle names still reopen after repeated presentation normalization', async () => {
  const input = structuredClone(fixture.input), dash = String.fromCodePoint(0x2014);
  input.venue = 'V'.repeat(79) + dash;
  input.circles[0].name = 'C'.repeat(59) + dash;
  const result = await runPlan(input, new FixtureAdapter(input));
  const saved = { version: 1, mode: 'fixture', form: { venue: input.venue, minutes: 90, coverage: 60, circleCount: 3, circles: input.circles.map(circle => ({name: circle.name, anchors: circle.anchors.join('\n')})), vetoes: '' }, identities: [], result: presentationCopy(result), resultFormSnapshot: '{}', notes: {} };
  for (let reopen = 0; reopen < 2; reopen++) {
    const restored = parseSavedRoom(JSON.stringify(saved), 'fixture');
    assert.equal(restored.result.input.venue.length, 80);
    assert.equal(restored.result.input.circles[0].name.length, 60);
    assert.equal(restored.result.id, result.id);
    assert.deepEqual(restored.result.decision.selected.items.map(item => item.id), result.decision.selected.items.map(item => item.id));
    saved.result = presentationCopy(restored.result);
  }
});
