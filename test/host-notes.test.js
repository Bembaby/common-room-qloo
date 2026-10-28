import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHostNotes, hostNoteState, hostNotesMarkdown, hostRunningOrder, compileHostProgram } from '../public/host-notes.js';
import { runPlan } from '../src/agent.js';
import { FixtureAdapter, fixture } from '../src/fixtures.js';

test('unprepared host copies retain an explicit missing-material checklist rather than claim a finished event', () => {
  const state = hostNoteState({});
  assert.equal(state.completed, 0);assert.equal(state.missing.length, 4);
  assert.equal(state.status, 'preparation_needed');assert.equal(state.verifiedByQloo, false);
  assert.ok(hostNotesMarkdown({}).includes('Still to choose before hosting.'));
});

test('host choices enter the running order and portable copy without changing provider evidence or decision scores', async () => {
  const result = await runPlan(fixture.input, new FixtureAdapter(fixture.input));
  const before = JSON.stringify(result);
  const notes = { excerpt: 'My edition, opening passage', recording: 'My chosen recording, discussion only', filmMoment: 'A scene selected by the host', question: '<script>Literal host question</script>' };
  const order = hostRunningOrder(result.program, notes);
  assert.equal(order.reduce((sum,row)=>sum+row.minutes,0),result.input.minutes);
  assert.ok(order[1].activity.includes(notes.excerpt));assert.ok(order[2].activity.includes(notes.recording));
  assert.ok(order[3].activity.includes(notes.filmMoment));assert.ok(order[3].activity.includes(notes.question));
  assert.equal(hostNoteState(notes).status, 'host_choices_recorded');
  assert.ok(hostNotesMarkdown(notes).includes('entered by the host'));
  assert.equal(JSON.stringify(result), before);
  const compiled=compileHostProgram(result.program,notes);
  assert.equal(compiled.openingQuestion,notes.question);
  assert.ok(!compiled.schedule[2].activity.includes('participant-chosen recording'));
  assert.equal(result.program.openingQuestion,JSON.parse(before).program.openingQuestion);
  assert.deepEqual(compileHostProgram(compiled,notes),compiled);
  assert.equal(compileHostProgram(compiled,{}).openingQuestion,result.program.openingQuestion);
  assert.deepEqual(normalizeHostNotes({ question: '\u0000A\nquestion', extra: 'not supported' }), { excerpt: '', recording: '', filmMoment: '', question: 'A question' });
});
