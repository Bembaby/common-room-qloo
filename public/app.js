import { explainCuration, explainVetoes, slotNames } from './curation.js';
import { hostFields, normalizeHostNotes, hostNoteState, hostNotesMarkdown, hostRunningOrder, compileHostProgram } from './host-notes.js';
import { parseSavedRoom } from './saved-room.js';
const $ = selector => document.querySelector(selector);
let config;
let currentResult;
let busy = false;
let resultFormSnapshot;
let progressStage = 1;
let elapsedTimer;
const chosenIdentities = new Map();
const originalAnchorLabels = new Map();
const hostNotesByRun = new Map();
let currentHostNotes = normalizeHostNotes();
let restoredResult = false;
const savedKey = mode => `common-room-saved-room-v1-${mode}`;
const scrollBehavior = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

function node(tag, attributes = {}, children = []) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key === 'class') element.className = value;
    else if (key === 'text') element.textContent = value;
    else element.setAttribute(key, value);
  }
  for (const child of children) element.append(typeof child === 'string' ? document.createTextNode(child) : child);
  return element;
}
const paragraph = (text, className = '') => node('p', { text, class: className });
const format = number => Number(number).toFixed(1).replace(/\.0$/, '');

function providerError(value, status) {
  const error = new Error(value?.message ?? 'The request could not be completed. Your brief is still here.');
  error.code = value?.code ?? String(status ?? 'CONNECTION');
  error.details = value?.details;
  return error;
}

function focusField(selector) {
  const field = $(selector);
  field.focus({ preventScroll: true });
  field.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
}

function updateBriefState() {
  const decisionSnapshot = value => JSON.stringify({ venue: value.venue, circles: value.circles.map(({name,anchors})=>({name,anchors})), minutes: value.minutes, minimumCoverage: value.minimumCoverage, vetoes: value.vetoes });
  let changed = false;
  if (currentResult) {
    try { changed = decisionSnapshot(readInput()) !== decisionSnapshot(JSON.parse(resultFormSnapshot)); }
    catch { changed = true; }
  }
  const notice = $('#stale-notice');
  if (notice) notice.hidden = !changed;
  for (const veto of document.querySelectorAll('[data-veto]')) veto.disabled = Boolean(changed || busy);
  $('#run span').textContent = changed ? 'Update the common thread' : 'Find our common thread';
  saveRoom();
}

function saveRoom() {
  if (!config || !$('#circle-name-2')) return;
  try {
    sessionStorage.setItem(savedKey(config.mode), JSON.stringify({ version: 1, mode: config.mode, savedAt: new Date().toISOString(), busy, form: {
      venue: $('#venue').value, minutes: $('#minutes').value, coverage: $('#coverage').value, circleCount: $('#circle-count').value, vetoes: $('#vetoes').value,
      circles: [...document.querySelectorAll('#circles .circle')].map(circle => ({ name: circle.querySelector('input').value, anchors: circle.querySelector('textarea').value }))
    }, identities: [...chosenIdentities].slice(-40), originalLabels: [...originalAnchorLabels].slice(-40), result: currentResult ?? null, resultFormSnapshot, notes: currentHostNotes }));
    const message = 'Saved locally in this tab. Reopening makes no provider call. Export a copy to keep it elsewhere.';
    if ($('#saved-room-status').textContent !== message) $('#saved-room-status').textContent = message;
  } catch {
    $('#saved-room-status').textContent = 'Local saving is unavailable. Keep this page open and export your brief and evidence before leaving.';
  }
}

function restoreRoom() {
  try {
    const raw = sessionStorage.getItem(savedKey(config.mode));
    if (!raw) return;
    const saved = parseSavedRoom(raw, config.mode), form = saved.form;
    $('#venue').value = form.venue;$('#minutes').value = form.minutes;$('#coverage').value = form.coverage;$('#coverage-value').textContent = form.coverage;$('#circle-count').value = form.circleCount;$('#vetoes').value = form.vetoes;
    form.circles.forEach((circle,index)=>{$(`#circle-name-${index}`).value=circle.name;$(`#circle-anchors-${index}`).value=circle.anchors;});
    chosenIdentities.clear();saved.identities.forEach(([key,value])=>chosenIdentities.set(key,value));originalAnchorLabels.clear();(saved.originalLabels??[]).forEach(([key,value])=>originalAnchorLabels.set(key,value));syncCircles();
    if (saved.result) {
      hostNotesByRun.set(saved.result.id,saved.notes);renderResult(saved.result,{formSnapshot:saved.resultFormSnapshot,focus:false});restoredResult=true;
      $('#empty').hidden=true;
      $('#results').prepend(node('div',{class:'previous-result-notice',role:'status'},[paragraph(`Saved result from ${new Date(saved.result.generatedAt).toLocaleString()}. No new Qloo query was made. Its original evidence and host notes are restored from this tab.`)]));
    }
    if (saved.busy) {
      $('#error').replaceChildren(paragraph('The previous attempt was interrupted in this tab and may have used quota. No automatic retry was made. Review your preserved brief before trying again.'));
      $('#error').hidden=false;$('#retry').hidden=false;
    }
    updateBriefState();
  } catch {
    reset({ clearSaved: false });
    $('#saved-room-status').textContent = 'The saved room could not be reopened. You can start a new brief; no provider query was made.';
  }
}

function renderChoices(choices = [], context = {}) {
  const panel = $('#resolution');
  panel.replaceChildren();
  panel.hidden = true;
  for (const choice of choices) {
    if (!choice.candidates?.length || !choice.input?.trim()) continue;
    const group = node('section', { class: 'resolution-choice' }, [node('h3', { text: `Which ${choice.input} did you mean?` }), paragraph(`${context.circleName ? context.circleName + ': ' : ''}Qloo returned these identities. Choose a specific cultural anchor, then run your brief again.`)]);
    for (const candidate of choice.candidates) {
      const button = node('button', { type: 'button', class: 'secondary', text: `${candidate.name} · ${candidate.type.replace('urn:entity:', '')} · ${candidate.id.slice(-6)}` });
      button.addEventListener('click', () => {
        let changed = false;
        for (const [index, input] of [...document.querySelectorAll('#circles textarea')].entries()) {
          if (context.circleId && context.circleId !== `circle-${index + 1}`) continue;
          if (changed && !context.circleId) break;
          input.value = input.value.split('\n').map((anchor, line) => {
            if (anchor.trim() !== choice.input) return anchor;
            chosenIdentities.set(`${index}:${line}:${candidate.name}`, candidate.id);
            originalAnchorLabels.set(`${index}:${line}:${candidate.name}`, choice.input);
            changed = true;
            return candidate.name;
          }).join('\n');
        }
        if (!changed) {
          group.replaceChildren(paragraph('This anchor has changed since the choice was requested. Run the updated brief to resolve its current identity.', 'resolution-selected'));
          $('#retry').focus();
          return;
        }
        group.replaceChildren(paragraph(`Selected ${candidate.name} (${candidate.type.replace('urn:entity:', '')}). Its exact Qloo identity is retained for your next run; the name stays readable in your brief.`, 'resolution-selected'));
        updateBriefState();
        $('#retry').focus();
      });
      group.append(button);
    }
    panel.append(group);
    panel.hidden = false;
  }
}

function reset({ clearSaved = true } = {}) {
  if (busy) return;
  currentResult = undefined;
  resultFormSnapshot = undefined;
  chosenIdentities.clear();
  originalAnchorLabels.clear();
  hostNotesByRun.clear();currentHostNotes=normalizeHostNotes();restoredResult=false;
  if (clearSaved) { try { sessionStorage.removeItem(savedKey(config.mode)); } catch {} }
  $('#run span').textContent = 'Find our common thread';
  $('#results').hidden = true;
  $('#error').hidden = true;
  $('#retry').hidden = true;
  $('#resolution').hidden = true;
  $('#trace-wrap').hidden = true;
  $('#empty').hidden = false;
  const sample = config.sample;
  $('#venue').value = sample.venue;
  $('#minutes').value = sample.minutes;
  $('#coverage').value = sample.minimumCoverage;
  $('#coverage-value').textContent = sample.minimumCoverage;
  $('#vetoes').value = '';
  $('#veto-feedback').textContent = '';
  $('#circle-count').value = '3';
  $('#circles').replaceChildren();
  sample.circles.forEach((circle, index) => {
    const name = node('input', { id: `circle-name-${index}`, value: circle.name, maxlength: '60', 'aria-label': `Circle ${index + 1} name`, required: '' });
    const anchors = node('textarea', { id: `circle-anchors-${index}`, rows: '2', maxlength: '480', 'aria-label': `Circle ${index + 1} cultural anchors`, 'aria-describedby': 'anchor-note', required: '' });
    anchors.value = circle.anchors.join('\n');
    anchors.readOnly = config.mode === 'fixture';
    const card = node('div', { class: 'circle' }, [
      node('div', { class: 'circle-top' }, [node('span', { class: 'circle-index', text: String(index + 1) }), name]),
      node('label', { for: `circle-anchors-${index}`, text: 'Artists, books, films, or verified Qloo IDs' }), anchors
    ]);
    $('#circles').append(card);
  });
  syncCircles();
  if (clearSaved) $('#saved-room-status').textContent = 'Saved room cleared. The sample is ready; no query has been made.';
}

function syncCircles() {
  const count = Number($('#circle-count').value);
  document.querySelectorAll('#circles .circle').forEach((circle, index) => {
    circle.hidden = index >= count;
    for (const field of circle.querySelectorAll('input,textarea')) field.disabled = busy || index >= count;
  });
  $('#circle-summary').textContent = `${count === 2 ? 'Two' : 'Three'} circles. One shared evening.`;
}

function readInput() {
  return {
    venue: $('#venue').value,
    circles: config.sample.circles.slice(0, Number($('#circle-count').value)).map((_, index) => ({
      name: $(`#circle-name-${index}`).value,
      anchors: $(`#circle-anchors-${index}`).value.split('\n').map((value, line) => {
        const text = value.trim();
        return chosenIdentities.get(`${index}:${line}:${text}`) ?? config.resolvedAnchors?.find(anchor => anchor.name === text)?.id ?? text;
      }).filter(Boolean),
      anchorLabels: $(`#circle-anchors-${index}`).value.split('\n').map((value,line)=>originalAnchorLabels.get(`${index}:${line}:${value.trim()}`)??value.trim()).filter(Boolean)
    })),
    minutes: Number($('#minutes').value),
    minimumCoverage: Number($('#coverage').value),
    vetoes: $('#vetoes').value.split('\n').map(value => value.trim()).filter(Boolean)
  };
}

function trace(event) {
  const li = node('li', {}, [
    node('span', { class: 'trace-num', text: String(event.sequence).padStart(2, '0') }),
    node('div', {}, [node('span', { class: 'phase', text: event.phase }), node('strong', { text: event.message })])
  ]);
  $('#trace').append(li);
  $('#trace-count').textContent = `${event.sequence} steps`;
  $('#progress-text').textContent = event.message;
  if (['evaluate', 'refine', 'complete', 'blocked'].includes(event.phase)) progressStage = 3;
  else if (event.operation === 'rank') progressStage = Math.max(progressStage, 2);
  for (const step of document.querySelectorAll('[data-stage]')) {
    const number = Number(step.dataset.stage);
    step.classList.toggle('passed', number < progressStage);
    if (number === progressStage) step.setAttribute('aria-current', 'step');
    else step.removeAttribute('aria-current');
  }
  $('#trace-wrap').hidden = false;
}

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = node('a', { href: url, download: filename });
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function briefMarkdown(result) {
  const lines = [
    '# Common Room event brief', '', `Evidence: ${result.evidenceLabel}`, '',
    `Status: ${result.status}`, `Venue: ${result.input.venue}`, `Run: ${result.id}`, '',
    `Generated: ${result.generatedAt}`, '',
    '## Decision', '', ...(result.decision.reasons.length ? result.decision.reasons : ['The brief meets the stated comparison threshold and exact vetoes.']), ''
  ];
  lines.push('## Originating cultural anchors', '');
  for (const circle of result.anchorEvidence ?? result.input.circles.map(circle => ({ ...circle, anchors: circle.anchors.map(input => ({ input, name: input })) }))) {
    lines.push(`### ${circle.name}`, '', ...circle.anchors.map(anchor => `- ${anchor.name ?? anchor.input}${anchor.type ? ` (${anchor.type.replace('urn:entity:', '')})` : ''}${anchor.id ? `; Qloo ID: ${anchor.id}` : ''}${anchor.enteredText && anchor.enteredText !== anchor.name ? `; host entered: ${anchor.enteredText}` : ''}. Source: ${anchor.source ?? 'Provided input'}.`), '');
  }
  const bundle = result.decision.selected ?? result.decision.bestUnqualified;
  const curation = result.curation ?? explainCuration(bundle, result.input, result.decision.baseline, result.evidence);
  lines.push('## Binding vetoes', '', ...(result.input.vetoes.length ? result.input.vetoes.map(veto => `- ${veto}`) : ['None specified.']), '');
  if (curation) {
    lines.push('## A way in for each circle', '');
    for (const entry of curation.entryPoints) lines.push(`- ${entry.name}: ${entry.works.length ? entry.works.map(work => `${work.name} (rank ${work.rank}/${work.totalOptions}, relative score ${work.score}/100)`).join('; ') : 'No returned rank support among these selections.'}`);
    lines.push('', curation.note, '');
    lines.push('## Group tradeoffs', '', '| Circle | Balanced coverage | Average-only coverage | Change |', '| --- | --- | --- | --- |');
    for (const row of curation.circles) lines.push(`| ${row.name.replaceAll('|', '/')} | ${row.score} | ${row.baseline ?? 'unavailable'} | ${row.delta ?? 'unavailable'} |`);
    if (result.decision.baseline) lines.push('', `Average-only selections: ${result.decision.baseline.items.map(item => item.name).join('; ')}.`, curation.sameAsAverage ? 'Both policies selected the same three works in this run.' : 'Both policies used the same eligible shortlist and binding vetoes.', '');
  }
  if (result.program) {
    lines.push(hostNotesMarkdown(currentHostNotes));
    lines.push('## Host preparation', '', ...(result.program.preparation ?? []).map(value => `- ${value}`), '', '## One connecting question', '', compileHostProgram(result.program,currentHostNotes).openingQuestion || curation?.connectionQuestion || '', '');
    lines.push(`## ${result.program.title}`, '', result.program.description, '', '| Minutes | Activity |', '| --- | --- |');
    for (const row of result.program.schedule) lines.push(`| ${row.minutes} | ${row.label.replaceAll('|', '/')} |`);
    lines.push('', '## Host prompts', '');
    for (const row of hostRunningOrder(result.program, currentHostNotes)) lines.push(`- ${row.activity}`);
    lines.push('', result.program.note, '');
  }
  lines.push('## Coverage', '', result.scoring.explanation, '');
  if (bundle) for (const row of bundle.metrics.coverage) lines.push(`- ${row.name}: ${row.score}/100 relative coverage.`);
  lines.push('', '## Limits', '', ...result.limitations.map(limit => `- ${limit}`), '', 'Export the evidence JSON beside this brief to retain every entity ID, workflow, and score.');
  return lines.join('\n');
}

function matrix(bundle, input, anchorEvidence = []) {
  const table = node('table', { class: 'matrix', 'aria-label': 'Relative rank coverage by taste circle and selected cultural work' });
  const head = node('tr', {}, [node('th', { scope: 'col', text: 'Taste circle' }), ...['Read', 'Listen', 'Discuss', 'Coverage'].map(text => node('th', { scope: 'col', text }))]);
  table.append(node('thead', {}, [head]));
  const body = node('tbody');
  input.circles.forEach(circle => {
    const names = anchorEvidence.find(row => row.circleId === circle.id)?.anchors.map(anchor => anchor.name ?? anchor.input).join(' / ');
    const cells = [node('td', {}, [node('strong', { text: circle.name }), ...(names ? [paragraph(names, 'originating-anchor')] : [])])];
    for (const item of bundle.items) {
      const score = item.scores[circle.id];
      const value = score?.relativeScore ?? 0;
      const className = value >= 70 ? 'strong' : value >= 40 ? 'medium' : 'weak';
      cells.push(node('td', {}, [node('span', { class: `score ${className}`, text: score?.observed ? format(value) : '?', title: score?.observed ? `${item.name}: rank ${score.rank} of ${score.totalOptions}` : 'Not returned. Conservative score 0; not evidence of dislike.' })]));
    }
    const coverage = bundle.metrics.coverage.find(row => row.circleId === circle.id).score;
    cells.push(node('td', {}, [node('span', { class: 'coverage', text: format(coverage) })]));
    body.append(node('tr', {}, cells));
  });
  table.append(body);
  const mobile = node('div', { class: 'mobile-coverage', 'aria-label': 'Coverage and cultural scores by taste circle' });
  input.circles.forEach(circle => {
    const values = node('dl');
    for (const item of bundle.items) {
      const score = item.scores[circle.id];
      values.append(node('div', {}, [node('dt', { text: { book: 'Read', artist: 'Listen', movie: 'Discuss' }[item.domain] }), node('dd', { text: score?.observed ? format(score.relativeScore) : '?' })]));
    }
    const coverage = bundle.metrics.coverage.find(row => row.circleId === circle.id).score;
    values.append(node('div', { class: 'circle-coverage' }, [node('dt', { text: 'Coverage' }), node('dd', { text: format(coverage) })]));
    const names = anchorEvidence.find(row => row.circleId === circle.id)?.anchors.map(anchor => anchor.name ?? anchor.input).join(' / ');
    mobile.append(node('section', {}, [node('h4', { text: circle.name }), ...(names ? [paragraph(names, 'originating-anchor')] : []), values]));
  });
  return node('div', {}, [node('div', { class: 'matrix-scroll' }, [table]), mobile]);
}

function section(title, description, children) {
  return node('section', { class: 'result-section', tabindex: '-1' }, [node('h3', { text: title }), paragraph(description), ...children]);
}

function renderResult(result, { formSnapshot, focus = true } = {}) {
  currentResult = result;
  currentHostNotes = hostNotesByRun.get(result.id) ?? normalizeHostNotes();
  $('#veto-feedback').textContent = '';
  resultFormSnapshot = formSnapshot ?? JSON.stringify(readInput());
  const container = $('#results');
  container.replaceChildren();
  container.hidden = false;
  const ready = result.status === 'ready';
  const bundle = result.decision.selected ?? result.decision.bestUnqualified;
  const curation = result.curation ?? explainCuration(bundle, result.input, result.decision.baseline, result.evidence);
  let curatorialNote;
  container.append(node('div', { class: 'decision-header' }, [
    node('div', {}, [node('h3', { text: ready ? result.program.title : 'Keep the room open.' }), paragraph(ready ? `${result.input.minutes} minutes · ${result.input.venue}` : 'This brief needs a decision from its owner.')]),
    node('span', { class: `pill${ready ? '' : ' blocked'}`, text: ready ? 'SHORTLIST READY' : 'CONSTRAINTS NOT MET' })
  ]));
  container.append(paragraph(result.evidenceLabel, 'artifact-note'));
  container.append(node('div', { id: 'stale-notice', class: 'stale-notice', role: 'status', hidden: '' }, [paragraph('Your brief has changed. This result and its exports still describe the previous brief.'), node('button', { type: 'submit', form: 'planner', class: 'secondary', text: 'Run the updated brief' })]));
  const exports = node('div', { class: 'result-actions export-actions' });
  const brief = node('button', { class: 'secondary', type: 'button', text: ready ? 'Export host brief' : 'Export decision note' });
  brief.addEventListener('click', () => download(ready ? 'common-room-brief.md' : 'common-room-decision.md', briefMarkdown(result), 'text/markdown'));
  const evidence = node('button', { class: 'secondary', type: 'button', text: 'Export evidence JSON' });
  evidence.addEventListener('click', () => download('common-room-evidence.json', JSON.stringify({ ...result, ...(ready ? { program: compileHostProgram(result.program,currentHostNotes), hostNotes: hostNoteState(currentHostNotes) } : {}), ...(restoredResult ? { exportContext: { source: 'Result restored from this tab', originalGeneratedAt: result.generatedAt, newProviderQuery: false } } : {}) }, null, 2), 'application/json'));
  exports.append(brief, evidence);
  if (ready) {
    const print = node('button', { type: 'button', class: 'text-button', text: 'Print host copy' });
    print.addEventListener('click', () => window.print());
    exports.append(print);
  }
  container.append(exports);
  if (ready) {
    const nav = node('nav', { class: 'result-nav', 'aria-label': 'Explore this program' });
    for (const [id, label] of [['program-selections','The program'],['circle-coverage','Every circle'],['program-tradeoffs','The tradeoff'],['host-copy','Host copy']]) nav.append(node('a', { href: `#${id}`, text: label }));
    container.append(nav);
    curatorialNote = node('section', { class: 'curatorial-note', tabindex: '-1' }, [
      node('h3', { text: 'A shortlist to shape together.' }),
      paragraph(curation.connectionQuestion, 'connecting-question'),
      paragraph('This is a draft discussion prompt. Qloo supports the shortlist; you choose the passage, recording and substantive connection in the host copy below. No full screening is assumed.', 'curation-context')
    ]);
  }
  if (!ready) {
    container.append(node('div', { class: 'blocked-reasons' }, [
      ...result.decision.reasons.map(reason => paragraph(reason)),
      paragraph(`Your vetoes are intact. ${result.decision.refined ? 'The agent tried one targeted refinement and stopped.' : 'The search stopped without approving a plan.'} Review the minimum or your cultural anchors before trying again.`)
    ]));
    const recovery = node('div', { class: 'result-actions recovery-actions' });
    const minimum = node('button', { type: 'button', class: 'secondary', text: 'Review the minimum' });
    const vetoes = node('button', { type: 'button', class: 'text-button', text: 'Review the vetoes' });
    minimum.addEventListener('click', () => focusField('#coverage'));
    vetoes.addEventListener('click', () => focusField('#vetoes'));
    recovery.append(minimum, vetoes);
    container.append(recovery);
  }
  if (bundle) {
    const evidenceContainer = ready ? container : node('details', { class: 'diagnostic-details' }, [node('summary', { text: 'Why the best candidate fell short' }), paragraph('For diagnosis only. These selections do not form an approved event brief.', 'explanation')]);
    if (!ready) container.append(evidenceContainer);
    evidenceContainer.append(node('div', { class: 'selection-grid', ...(ready ? { id: 'program-selections', tabindex: '-1', 'aria-label': 'Selected cultural works' } : {}) }, bundle.items.map(item => {
      const facts = curation.works.find(work => work.id === item.id);
      const card = node('article', { class: `selection-card ${item.domain}` }, [
        node('span', { class: 'domain', text: slotNames[item.domain] }), node('h4', { text: item.name }),
        paragraph(facts.invitations.length ? `Highest of these three for ${facts.invitations.join(' and ')}, by relative rank.` : 'Part of the balanced bundle. No circle ranks it highest among these three selections.', 'work-reason'),
        paragraph(`Ranked by ${facts.observedCircles} of ${result.input.circles.length} circles. ${result.mode === 'fixture' ? 'Synthetic rankings.' : 'Actual Qloo rankings.'}`, 'work-source')
      ]);
      const catalogue = node('details', { class: 'catalogue-details' }, [node('summary', { text: 'About this selection & its source' })]);
      if (item.catalogue?.description) catalogue.append(paragraph(item.catalogue.description, 'catalogue-note'));
      else catalogue.append(paragraph('A catalogue description was not returned. Research this exact work before choosing your discussion material.', 'explanation'));
      if (item.catalogue?.releaseYear || item.catalogue?.contentRating) catalogue.append(paragraph([item.catalogue.releaseYear, item.catalogue.contentRating].filter(Boolean).join(' · '), 'catalogue-facts'));
      const source = node('a', { href: `#evidence-${item.id}`, text: `Inspect ${result.mode === 'fixture' ? 'fixture' : 'Qloo'} identity & source`, class: 'catalogue-source' });
      source.addEventListener('click', event => {
        event.preventDefault();
        const row = $(`#evidence-${item.id}`);row.closest('details').open = true;row.focus({ preventScroll: true });row.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
      });
      catalogue.append(source, node('a', { href: `https://www.google.com/search?q=${encodeURIComponent(`${item.name} ${item.domain === 'artist' ? 'music artist' : item.domain}`)}`, target: '_blank', rel: 'noreferrer', text: 'Research this title or artist', class: 'catalogue-source' }), paragraph('Search by name only; external pages are not verified by Common Room.', 'explanation'));
      card.append(catalogue);
      if (ready) {
        const veto = node('button', { ...(item.domain === 'book' ? { id: 'veto-selected' } : {}), type: 'button', class: 'text-button veto-work', 'data-veto': item.id, text: `Veto this ${item.domain}` });
        veto.addEventListener('click', () => {
          if (busy) return;
          const previous = $('#vetoes').value.trim();
          $('#vetoes').value = `${previous}${previous ? '\n' : ''}${item.id}`;
          updateBriefState();
          $('#veto-feedback').textContent = `Added ${item.name} as an exact veto. Run the updated brief to compare again; this existing result has not changed.`;
          focusField('#vetoes');
        });
        card.append(veto);
      }
      return card;
    })));
    if (ready) evidenceContainer.append(curatorialNote);
    const coverageSection = section('A reason for every seat', `Lowest circle coverage: ${curation.weakestCircles.join(' and ')}, at ${format(bundle.metrics.minimum)}/100. Your minimum is ${result.input.minimumCoverage}.`, [
      matrix(bundle, result.input, result.anchorEvidence), paragraph('100 means first in this shortlist. It does not mean certain interest. A missing graph result is shown as ? and counted conservatively as 0.', 'explanation')
    ]);
    coverageSection.id = 'circle-coverage';
    const entryList = node('ul', { class: 'entry-points' });
    for (const entry of curation.entryPoints) entryList.append(node('li', {}, [node('strong', { text: entry.name }), paragraph(entry.works.length ? entry.works.map(work => `${work.name}: rank ${work.rank} of ${work.totalOptions}`).join('; ') : 'No returned rank support among these works.')]));
    coverageSection.append(node('details', { class: 'entry-details' }, [node('summary', { text: 'See the strongest entry point for each circle' }), entryList, paragraph(curation.note, 'explanation')]));
    evidenceContainer.append(coverageSection);
    const baseline = result.decision.baseline;
    if (baseline) {
      const tradeoffs = section('What changes when the quietest circle counts?', curation.sameAsAverage ? 'Both policies select the same three works in this run. There is no gain to claim here.' : 'One shortlist and the same vetoes. A different choice about whose interests count first.', [
        node('div', { class: 'comparison' }, [
          node('div', { class: 'metric' }, [node('span', { class: 'metric-label', text: 'Optimize the average' }), paragraph(`${format(baseline.metrics.minimum)}/100`, 'metric-value'), paragraph('Weakest circle coverage'), paragraph(`Room average: ${format(baseline.metrics.average)}`)]),
          node('div', { class: 'metric highlight' }, [node('span', { class: 'metric-label', text: 'Make room for each circle' }), paragraph(`${format(bundle.metrics.minimum)}/100`, 'metric-value'), paragraph('Weakest circle coverage'), paragraph(`Room average: ${format(bundle.metrics.average)}`)])
        ]),
        paragraph(`Lowest-circle change: +${format(result.decision.minimumGainVsAverage)} points. Average tradeoff: ${format(result.decision.averageTradeoff)} points. This is a calculation on ${result.mode === 'fixture' ? 'synthetic fixture rankings' : 'this Qloo shortlist'}, not a measured attendance improvement.`, 'comparison-note')
      ]);
      tradeoffs.id = 'program-tradeoffs';
      const alternative = node('details', { class: 'alternative-details' }, [node('summary', { text: 'See the alternative program and each circle’s tradeoff' }), paragraph(`Average-only program: ${baseline.items.map(item => item.name).join(' / ')}.`, 'alternative-works')]);
      const rows = node('div', { class: 'tradeoff-rows' });
      for (const row of curation.circles) rows.append(node('div', { class: 'tradeoff-row' }, [node('strong', { text: row.name }), node('span', { text: `Average-only ${format(row.baseline)}\nBalanced ${format(row.score)}` }), node('span', { class: row.delta > 0 ? 'delta gain' : row.delta < 0 ? 'delta loss' : 'delta', text: `${row.delta > 0 ? '+' : ''}${format(row.delta)} points` })]));
      alternative.append(rows);
      tradeoffs.append(alternative);
      evidenceContainer.append(tradeoffs);
    }
    const details = node('details', { class: 'evidence-details' }, [node('summary', { text: 'Inspect the cultural evidence and exact entity IDs' })]);
    for (const item of bundle.items) {
      const rows = [node('h4', { text: item.name }), paragraph(`Entity ID: ${item.id}`)];
      for (const circle of result.input.circles) {
        const score = item.scores[circle.id];
        const workflow = result.evidence.find(record => record.workflowId === score.workflowId);
        rows.push(paragraph(`${circle.name}: ${score.observed ? `rank ${score.rank}/${score.totalOptions}; raw ${result.mode === 'fixture' ? 'synthetic' : 'Qloo'} affinity ${score.rawAffinity ?? 'not supplied'}` : 'not returned'}; ${score.workflowId}.`));
        rows.push(paragraph(`Source: ${workflow.provenance.source}. ${workflow.provenance.endpoint ?? 'Local fixture, no API endpoint.'}`));
      }
      rows.push(paragraph(`Catalogue source: ${item.catalogue?.workflowId ?? 'No catalogue text supplied'}. Descriptive metadata is separate from rank evidence.`));
      details.append(node('div', { class: 'evidence-row', id: `evidence-${item.id}`, tabindex: '-1' }, rows));
    }
    evidenceContainer.append(details);
  }
  const constraintSection = node('section', { class: 'constraint-receipt' }, [node('h3', { text: 'Your non-negotiables' })]);
  if (!result.input.vetoes.length) constraintSection.append(paragraph('No hard vetoes were specified for this run. Use a selection’s veto control to exclude its exact identity before comparing again.'));
  else for (const veto of explainVetoes(result.input.vetoes, result.evidence, bundle?.items)) constraintSection.append(paragraph(`${veto.matchedNames.length ? veto.matchedNames.join(', ') + ': matched in discovery and excluded.' : veto.value + ': retained as a binding veto; no matching discovery result was observed.'}`));
  constraintSection.append(paragraph(`Minimum for each circle: ${result.input.minimumCoverage}/100. ${ready ? 'Every circle clears this relative coverage minimum.' : 'This run did not meet all requirements.'} No veto or minimum was automatically relaxed.`, 'explanation'));
  container.append(constraintSection);
  if (result.program) {
    let minute = 0;
    const time = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
    const schedule = node('ol', { class: 'schedule', 'aria-label': 'Host running order, with elapsed times' }, result.program.schedule.map(row => {
      const start = minute;
      minute += row.minutes;
      return node('li', { class: 'program-row' }, [node('div', { class: 'schedule-time' }, [node('span', { class: 'time-range', text: `${time(start)} to ${time(minute)}` }), node('span', { class: 'duration', text: `${row.minutes} min` })]), node('div', {}, [node('h4', { text: row.label }), paragraph(row.activity)])]);
    }));
    schedule.dataset.program = `${result.input.venue} / Running order`;
    const host = section('Finish the host working copy', 'Choose the content and question before hosting. Your notes stay in this page and appear in print, Markdown and JSON; they do not change Qloo rankings.', [
      node('details', { class: 'preparation-details' }, [node('summary', { text: 'Before guests arrive' }), node('ul', {}, (result.program.preparation ?? []).map(text => node('li', { text })))]),
      schedule,
      paragraph(result.program.note, 'explanation')
    ]);
    const workbench = node('fieldset', { class: 'host-workbench' }, [node('legend', { text: 'Four choices that make this your evening' }), paragraph('', 'host-note-status')]);
    for (const field of hostFields) {
      const input = node('textarea', { id: `host-${field.key}`, rows: field.key === 'question' ? '3' : '2', maxlength: String(field.max), placeholder: field.placeholder });input.value = currentHostNotes[field.key];
      input.addEventListener('input', () => {
        currentHostNotes = normalizeHostNotes(Object.fromEntries(hostFields.map(row => [row.key, $(`#host-${row.key}`).value])));
        fitHostField(input);hostNotesByRun.set(result.id, currentHostNotes);updateHostCopy();saveRoom();
      });
      workbench.append(node('div', { class: ['filmMoment','question'].includes(field.key) ? 'host-note-field host-question' : 'host-note-field' }, [node('label', { for: input.id, text: field.label }), input]));
    }
    const captured = node('section', { class: 'host-notes-copy', 'aria-label': 'Host-entered content choices' });
    host.insertBefore(workbench, host.querySelector('.preparation-details'));
    host.insertBefore(captured, host.querySelector('.preparation-details'));
    host.id = 'host-copy';host.classList.add('host-sheet');container.append(host);
    host.querySelectorAll('textarea').forEach(fitHostField);
    updateHostCopy();
  }
  const generated = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(result.generatedAt));
  container.append(paragraph(`${generated} · Run ${result.id} · ${result.budget.workflowCount}/${result.budget.workflowLimit} bounded workflows · ${result.decision.refined ? 'One targeted refinement used' : 'No refinement used'} · No auto-publishing`, 'explanation run-metadata'));
  const heading = container.querySelector('.decision-header h3');
  heading.setAttribute('tabindex', '-1');
  if (focus) { heading.focus({ preventScroll: true });heading.scrollIntoView({ behavior: scrollBehavior(), block: 'start' }); }
}

function updateHostCopy() {
  const state = hostNoteState(currentHostNotes);
  const status = $('.host-note-status');
  if (!status) return;
  status.textContent = `${state.completed}/4 host choices recorded. ${state.missing.length ? 'Preparation still needed before hosting.' : 'Content choices recorded; check permissions, availability and access needs.'}`;
  $('#host-copy > h3').textContent = state.missing.length ? 'Finish the host working copy' : 'Your host working copy';
  $('.connecting-question').textContent = state.notes.question || currentResult.curation?.connectionQuestion || currentResult.program.openingQuestion;
  $('.curatorial-note > h3').textContent = state.notes.question ? 'Your connecting question' : 'A shortlist to shape together.';
  $('.curatorial-note').classList.toggle('has-host-question',Boolean(state.notes.question));
  $('.curation-context').textContent = state.notes.question ? 'Host-authored interpretation. Qloo supplied the shortlist and ranks; it did not verify this thematic connection or any permissions.' : 'This is a draft discussion prompt. Qloo supports the shortlist; choose your materials and connection in the host copy below.';
  $('.host-notes-copy').replaceChildren(node('h4', { text: 'Your content choices' }), ...hostFields.map(field => node('div', { class: 'host-choice' }, [node('strong', { text: field.label }), paragraph(state.notes[field.key] || 'Still to choose before hosting.')])), paragraph('Host-entered notes. Qloo does not verify these materials, the connection or permissions.', 'explanation'));
  hostRunningOrder(currentResult.program, state.notes).forEach((row, index) => {
    const activity = document.querySelectorAll('#host-copy .program-row > div:last-child > p')[index];
    if (activity) activity.textContent = row.activity;
  });
}

function fitHostField(field) {
  field.style.height = 'auto';
  field.style.height = `${Math.max(84, Math.min(320, field.scrollHeight + 2))}px`;
}
window.addEventListener('resize', () => document.querySelectorAll('.host-workbench textarea').forEach(fitHostField));

async function run(event) {
  event.preventDefault();
  if (busy) return;
  const previousResult = currentResult;
  const previousSnapshot = resultFormSnapshot;
  const previousRestored = restoredResult;
  busy = true;
  saveRoom();
  $('#run').disabled = true;
  $('#quick-run').disabled = true;
  $('#quick-run').textContent = 'Working through the brief';
  $('#reset').disabled = true;
  $('#forget-room').disabled = true;
  $('#strict').disabled = true;
  $('#error').hidden = true;
  $('#retry').hidden = true;
  $('#resolution').hidden = true;
  $('#planner').setAttribute('aria-busy', 'true');
  for (const field of document.querySelectorAll('#planner input, #planner textarea, #planner select')) field.disabled = true;
  $('#results').hidden = true;
  $('#empty').hidden = true;
  $('#running').hidden = false;
  $('#trace').replaceChildren();
  $('#trace-count').textContent = '0 steps';
  $('#trace-wrap').hidden = false;
  $('#trace-wrap').open = false;
  progressStage = 1;
  for (const step of document.querySelectorAll('[data-stage]')) {
    step.classList.remove('passed');
    if (step.dataset.stage === '1') step.setAttribute('aria-current', 'step');
    else step.removeAttribute('aria-current');
  }
  const started = Date.now();
  $('#elapsed').textContent = '0:00 elapsed';
  elapsedTimer = setInterval(() => {
    const seconds = Math.floor((Date.now() - started) / 1000);
    $('#elapsed').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} elapsed`;
  }, 1000);
  $('#progress-text').textContent = 'Preparing the search.';
  $('#running').scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
  let gotResult = false;
  try {
    const response = await fetch('/api/plan/stream', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Common-Room-Code': $('#access').value }, body: JSON.stringify(readInput())
    });
    if (!response.ok) {
      const value = await response.json();
      throw providerError(value.error, response.status);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const consume = line => {
      if (!line.trim()) return;
      const item = JSON.parse(line);
      if (item.type === 'trace') trace(item.data);
      if (item.type === 'result') { renderResult(item.data); restoredResult = false; gotResult = true; }
      if (item.type === 'error') throw providerError(item.error);
    };
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) consume(line);
      if (done) { if (buffer) consume(buffer); break; }
    }
    if (!gotResult) throw new Error('The connection ended before the agent returned a decision. No completed plan is available.');
    $('#trace-wrap').open = false;
  } catch (error) {
    $('#results').hidden = true;
    currentResult = undefined;
    resultFormSnapshot = undefined;
    if (previousResult) {
      renderResult(previousResult, { formSnapshot: previousSnapshot, focus: false });
      restoredResult = previousRestored;
      $('#results').prepend(node('div', { class: 'previous-result-notice', role: 'status' }, [paragraph('This attempt did not complete. The result below is your earlier completed run, with its original evidence and host notes. It is not a fresh result for the failed attempt.')]));
    }
    const recoveries = {
      BUSY: 'Another room is being planned. Wait for it to finish, then try your preserved brief again.',
      GLOBAL_WORKFLOW_LIMIT: error.message,
      TOTAL_WORKFLOW_LIMIT: 'The event allowance is reserved. Live planning is paused. You can still edit your brief.',
      BUDGET_STORAGE: 'The shared quota store could not be checked. Live planning is paused. Try again later.',
      QLOO_NEEDS_INPUT: error.details?.choices?.some(choice=>choice.input?.trim()&&choice.candidates?.length) ? 'Qloo found more than one matching identity. Choose the intended anchor below, then try again.' : 'Qloo could not resolve a cultural anchor. Edit the indicated circle or use an exact Qloo identity, then try again. Your brief is preserved.',
      ACCESS_CODE: 'Check the venue or judge access code, then try your brief again.'
    };
    $('#error').replaceChildren(paragraph(recoveries[error.code] ?? `${error.message} Your brief has been kept. No completed plan is available.`));
    if (error.code === 'QLOO_NEEDS_INPUT' && /^circle-[1-3]$/u.test(error.details?.circleId ?? '')) {
      const edit = node('button', { type: 'button', class: 'secondary', text: 'Review this circle’s anchors' });
      edit.addEventListener('click',()=>focusField(`#circle-anchors-${Number(error.details.circleId.slice(-1))-1}`));$('#error').append(edit);
    }
    if (error.code) $('#error').append(paragraph(`Reference: ${error.code}`, 'error-reference'));
    $('#error').hidden = false;
    $('#retry').textContent = 'Try the brief again';
    $('#retry').hidden = false;
    renderChoices(error.details?.choices, error.details);
    $('#error').focus({ preventScroll: true });
    $('#error').scrollIntoView({ behavior: scrollBehavior(), block: 'nearest' });
  } finally {
    clearInterval(elapsedTimer);
    busy = false;
    $('#run').disabled = false;
    $('#quick-run').disabled = false;
    $('#quick-run').textContent = 'Plan this brief';
    $('#reset').disabled = false;
    $('#forget-room').disabled = false;
    $('#strict').disabled = false;
    $('#running').hidden = true;
    $('#planner').setAttribute('aria-busy', 'false');
    for (const field of document.querySelectorAll('#planner input, #planner textarea, #planner select')) field.disabled = false;
    syncCircles();
    updateBriefState();
  }
}

$('#coverage').addEventListener('input', () => { $('#coverage-value').textContent = $('#coverage').value; });
$('#circle-count').addEventListener('change', syncCircles);
$('#planner').addEventListener('input', updateBriefState);
$('#planner').addEventListener('change', updateBriefState);
$('#planner').addEventListener('submit', run);
$('#retry').addEventListener('click', () => {
  if (!config) location.reload();
  else $('#planner').requestSubmit();
});
$('#reset').addEventListener('click', reset);
$('#forget-room').addEventListener('click', reset);
$('#strict').addEventListener('click', () => {
  if (busy) return;
  $('#coverage').value = 95;
  $('#coverage-value').textContent = '95';
  $('#planner').requestSubmit();
});

try {
  const response = await fetch('/api/config');
  if (!response.ok) throw new Error('Cannot load the app configuration.');
  config = await response.json();
  $('#mode').textContent = config.mode === 'live' ? 'LIVE QLOO' : 'SYNTHETIC DEMO';
  $('#mode').classList.toggle('live', config.mode === 'live');
  $('#mode-notice').classList.toggle('live', config.mode === 'live');
  $('#mode-notice').textContent = config.mode === 'live'
    ? 'Live Qloo graph. Each new brief queries real cultural evidence. Ambiguous names need your choice; failures stay visible. One brief runs at a time to protect shared access.'
    : 'You are in the synthetic demo. Entity IDs, affinities, and audience relationships are invented fixtures. No Qloo API is called. Use live mode for a fresh graph-backed decision.';
  $('#anchor-note').textContent = config.mode === 'live'
    ? 'One public work or creator per line, up to three. The sample identities were resolved with Qloo. New names use its resolver; if a name is ambiguous, choose the intended identity before retrying.'
    : 'Sample anchors are fixed because this fixture only models these circles. Labels, vetoes, timing, and the coverage threshold are editable.';
  $('#access-wrap').hidden = !config.accessCodeRequired;
  $('#quick-run').disabled = false;
  $('#run').disabled = false;
  $('#reset').disabled = false;
  $('#strict').disabled = false;
  $('#start-note').textContent = config.mode === 'live'
    ? 'The sample is ready to run. Live searches can take a couple of minutes.'
    : 'Explore the fixed sample. Synthetic evidence, with no Qloo API calls.';
  reset({ clearSaved: false });
  $('#forget-room').disabled = false;
  restoreRoom();
} catch (error) {
  $('#error').textContent = error.message;
  $('#error').hidden = false;
  $('#retry').textContent = 'Reconnect to Common Room';
  $('#retry').hidden = false;
  $('#error').focus();
  $('#run').disabled = true;
  $('#reset').disabled = true;
  $('#strict').disabled = true;
}

const printState = new Map();
window.addEventListener('beforeprint', () => {
  for (const details of document.querySelectorAll('.preparation-details')) {
    printState.set(details, details.open);
    details.open = true;
  }
});
window.addEventListener('afterprint', () => {
  for (const [details, open] of printState) details.open = open;
  printState.clear();
});
