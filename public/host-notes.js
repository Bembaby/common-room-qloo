export const hostFields = [
  { key: 'excerpt', label: 'Book excerpt or introduction', placeholder: 'Edition and passage location, or the introduction you will prepare', max: 300 },
  { key: 'recording', label: 'Recording to discuss', placeholder: 'Track, recording and version, or a discussion-only choice', max: 200 },
  { key: 'filmMoment', label: 'Film moment or question', placeholder: 'The scene or discussion focus, without assuming a full screening', max: 300 },
  { key: 'question', label: 'Your connecting question', placeholder: 'The connection or disagreement you want guests to explore', max: 500 }
];

export function normalizeHostNotes(value = {}) {
  return Object.fromEntries(hostFields.map(field => [field.key, typeof value[field.key] === 'string' ? value[field.key].replace(/[\u0000-\u001f\u007f]/gu, ' ').trim().slice(0, field.max) : '']));
}

export function hostNoteState(value) {
  const notes = normalizeHostNotes(value);
  const missing = hostFields.filter(field => !notes[field.key]).map(field => field.label);
  return { notes, missing, completed: hostFields.length - missing.length, source: 'Host-entered preparation notes', verifiedByQloo: false, status: missing.length ? 'preparation_needed' : 'host_choices_recorded' };
}

export function hostNotesMarkdown(value) {
  const state = hostNoteState(value);
  return ['## Host choices', '', 'These notes are entered by the host. Qloo supports the cultural shortlist, not the thematic connection or permissions.', '',
    ...hostFields.map(field => `- ${field.label}: ${state.notes[field.key] || 'Still to choose before hosting.'}`), '',
    state.missing.length ? `Preparation checklist: ${state.missing.join('; ')}.` : 'All four content choices are recorded. The host still checks availability, permissions and access needs.', ''].join('\n');
}

export function hostRunningOrder(program, value) {
  const notes = normalizeHostNotes(value);
  return program.schedule.map((row, index) => {
    const choice = index === 1 ? notes.excerpt : index === 2 ? notes.recording : index === 3 ? notes.filmMoment : '';
    let activity = row.activity;
    if (choice) activity = `Host-selected material: ${choice}. ${activity}`;
    if (index === 3 && notes.question) activity = `${choice ? `Host-selected focus: ${choice}. ` : ''}Ask the host's question: ${notes.question} Invite each circle to contribute an example or disagreement. The host's interpretation is separate from Qloo ranks.`;
    return { ...row, activity };
  });
}
