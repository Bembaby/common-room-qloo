import { explainCuration, explainVetoes, slotNames } from './curation.js';
const $ = selector => document.querySelector(selector);
let config;
let currentResult;
let busy = false;
let resultFormSnapshot;
let progressStage = 1;
let elapsedTimer;
const chosenIdentities = new Map();
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
  const changed = currentResult && JSON.stringify(readInput()) !== resultFormSnapshot;
  const notice = $('#stale-notice');
  if (notice) notice.hidden = !changed;
  for (const veto of document.querySelectorAll('[data-veto]')) veto.disabled = Boolean(changed || busy);
  $('#run span').textContent = changed ? 'Update the common thread' : 'Find our common thread';
}

function renderChoices(choices = []) {
  const panel = $('#resolution');
  panel.replaceChildren();
  panel.hidden = true;
  for (const choice of choices) {
    if (!choice.candidates?.length) continue;
    const group = node('section', { class: 'resolution-choice' }, [node('h3', { text: `Which ${choice.input} did you mean?` }), paragraph('Qloo returned these identities. Choose a specific cultural anchor, then run your brief again.')]);
    for (const candidate of choice.candidates) {
      const button = node('button', { type: 'button', class: 'secondary', text: `${candidate.name} · ${candidate.type.replace('urn:entity:', '')}` });
      button.addEventListener('click', () => {
        for (const input of document.querySelectorAll('#circles textarea')) {
          input.value = input.value.split('\n').map(anchor => anchor.trim() === choice.input ? candidate.name : anchor).join('\n');
        }
        chosenIdentities.set(candidate.name, candidate.id);
        group.replaceChildren(paragraph(`Selected ${candidate.name} (${candidate.type.replace('urn:entity:', '')}). Its exact Qloo identity is retained for your next run; the name stays readable in your brief.`, 'resolution-selected'));
        $('#retry').focus();
      });
      group.append(button);
    }
    panel.append(group);
    panel.hidden = false;
  }
}

function reset() {
  if (busy) return;
  currentResult = undefined;
  resultFormSnapshot = undefined;
  chosenIdentities.clear();
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
      anchors: $(`#circle-anchors-${index}`).value.split('\n').map(value => value.trim()).filter(Boolean)
        .map(value => chosenIdentities.get(value) ?? config.resolvedAnchors?.find(anchor => anchor.name === value)?.id ?? value)
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
    lines.push('## Host preparation', '', ...(result.program.preparation ?? []).map(value => `- ${value}`), '', '## One connecting question', '', result.program.openingQuestion ?? curation?.connectionQuestion ?? '', '');
    lines.push(`## ${result.program.title}`, '', result.program.description, '', '| Minutes | Activity |', '| --- | --- |');
    for (const row of result.program.schedule) lines.push(`| ${row.minutes} | ${row.label.replaceAll('|', '/')} |`);
    lines.push('', '## Host prompts', '');
    for (const row of result.program.schedule) lines.push(`- ${row.activity}`);
    lines.push('', result.program.note, '');
  }
  lines.push('## Coverage', '', result.scoring.explanation, '');
  if (bundle) for (const row of bundle.metrics.coverage) lines.push(`- ${row.name}: ${row.score}/100 relative coverage.`);
  lines.push('', '## Limits', '', ...result.limitations.map(limit => `- ${limit}`), '', 'Export the evidence JSON beside this brief to retain every entity ID, workflow, and score.');
  return lines.join('\n');
}

function matrix(bundle, input) {
  const table = node('table', { class: 'matrix', 'aria-label': 'Relative rank coverage by taste circle and selected cultural work' });
  const head = node('tr', {}, [node('th', { scope: 'col', text: 'Taste circle' }), ...['Read', 'Listen', 'Discuss', 'Coverage'].map(text => node('th', { scope: 'col', text }))]);
  table.append(node('thead', {}, [head]));
  const body = node('tbody');
  input.circles.forEach(circle => {
    const cells = [node('td', { text: circle.name })];
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
    mobile.append(node('section', {}, [node('h4', { text: circle.name }), values]));
  });
  return node('div', {}, [node('div', { class: 'matrix-scroll' }, [table]), mobile]);
}

function section(title, description, children) {
  return node('section', { class: 'result-section', tabindex: '-1' }, [node('h3', { text: title }), paragraph(description), ...children]);
}

function renderResult(result) {
  currentResult = result;
  resultFormSnapshot = JSON.stringify(readInput());
  const container = $('#results');
  container.replaceChildren();
  container.hidden = false;
  const ready = result.status === 'ready';
  const bundle = result.decision.selected ?? result.decision.bestUnqualified;
  const curation = result.curation ?? explainCuration(bundle, result.input, result.decision.baseline, result.evidence);
  let curatorialNote;
  container.append(node('div', { class: 'decision-header' }, [
    node('div', {}, [node('h3', { text: ready ? result.program.title : 'Keep the room open.' }), paragraph(ready ? `${result.input.minutes} minutes · ${result.input.venue}` : 'This brief needs a decision from its owner.')]),
    node('span', { class: `pill${ready ? '' : ' blocked'}`, text: ready ? 'BRIEF READY' : 'CONSTRAINTS NOT MET' })
  ]));
  container.append(paragraph(result.evidenceLabel, 'artifact-note'));
  container.append(node('div', { id: 'stale-notice', class: 'stale-notice', role: 'status', hidden: '' }, [paragraph('Your brief has changed. This result and its exports still describe the previous brief.'), node('button', { type: 'submit', form: 'planner', class: 'secondary', text: 'Run the updated brief' })]));
  const exports = node('div', { class: 'result-actions export-actions' });
  const brief = node('button', { class: 'secondary', type: 'button', text: ready ? 'Export host brief' : 'Export decision note' });
  brief.addEventListener('click', () => download(ready ? 'common-room-brief.md' : 'common-room-decision.md', briefMarkdown(result), 'text/markdown'));
  const evidence = node('button', { class: 'secondary', type: 'button', text: 'Export evidence JSON' });
  evidence.addEventListener('click', () => download('common-room-evidence.json', JSON.stringify(result, null, 2), 'application/json'));
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
      node('h3', { text: 'Three works. One conversation.' }),
      paragraph(curation.connectionQuestion, 'connecting-question'),
      paragraph('Carry one detail into the next work, then compare what changed. Your guests make the connection; Qloo supplies rankings, not shared themes. No full screening is assumed.', 'curation-context')
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
    const coverageSection = section('A reason for every seat', `${curation.weakestCircles.join(' and ')} ${curation.weakestCircles.length === 1 ? 'has' : 'have'} the lowest coverage at ${format(bundle.metrics.minimum)}/100; your minimum is ${result.input.minimumCoverage}.`, [
      matrix(bundle, result.input), paragraph('100 means first in this shortlist. It does not mean certain interest. A missing graph result is shown as ? and counted conservatively as 0.', 'explanation')
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
      for (const row of curation.circles) rows.append(node('div', { class: 'tradeoff-row' }, [node('strong', { text: row.name }), node('span', { text: `Average-only ${format(row.baseline)} / Balanced ${format(row.score)}` }), node('span', { class: row.delta > 0 ? 'delta gain' : row.delta < 0 ? 'delta loss' : 'delta', text: `${row.delta > 0 ? '+' : ''}${format(row.delta)} points` })]));
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
      details.append(node('div', { class: 'evidence-row' }, rows));
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
    const host = section('A night the host can actually run', result.program.description, [
      node('details', { class: 'preparation-details' }, [node('summary', { text: 'Before guests arrive' }), node('ul', {}, (result.program.preparation ?? []).map(text => node('li', { text })))]),
      schedule,
      paragraph(result.program.note, 'explanation')
    ]);
    host.id = 'host-copy';host.classList.add('host-sheet');container.append(host);
  }
  const generated = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(result.generatedAt));
  container.append(paragraph(`${generated} · ${result.budget.workflowCount}/${result.budget.workflowLimit} bounded workflows · ${result.decision.refined ? 'One targeted refinement used' : 'No refinement used'} · No auto-publishing`, 'explanation run-metadata'));
  const heading = container.querySelector('.decision-header h3');
  heading.setAttribute('tabindex', '-1');
  heading.focus({ preventScroll: true });
  heading.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
}

async function run(event) {
  event.preventDefault();
  if (busy) return;
  busy = true;
  $('#run').disabled = true;
  $('#quick-run').disabled = true;
  $('#quick-run').textContent = 'Working through the brief';
  $('#reset').disabled = true;
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
      if (item.type === 'result') { renderResult(item.data); gotResult = true; }
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
    const recoveries = {
      BUSY: 'Another room is being planned. Wait for it to finish, then try your preserved brief again.',
      GLOBAL_WORKFLOW_LIMIT: 'The shared hourly allowance is reserved. Return after the window resets. Your brief is still here.',
      TOTAL_WORKFLOW_LIMIT: 'The event allowance is reserved. Live planning is paused. You can still edit your brief.',
      BUDGET_STORAGE: 'The shared quota store could not be checked. Live planning is paused. Try again later.',
      QLOO_NEEDS_INPUT: 'Qloo found more than one matching identity. Choose the intended anchor below, then try again.',
      ACCESS_CODE: 'Check the venue or judge access code, then try your brief again.'
    };
    $('#error').replaceChildren(paragraph(recoveries[error.code] ?? `${error.message} Your brief has been kept. No completed plan is available.`));
    if (error.code) $('#error').append(paragraph(`Reference: ${error.code}`, 'error-reference'));
    $('#error').hidden = false;
    $('#retry').textContent = 'Try the brief again';
    $('#retry').hidden = false;
    renderChoices(error.details?.choices);
    $('#error').focus({ preventScroll: true });
    $('#error').scrollIntoView({ behavior: scrollBehavior(), block: 'nearest' });
  } finally {
    clearInterval(elapsedTimer);
    busy = false;
    $('#run').disabled = false;
    $('#quick-run').disabled = false;
    $('#quick-run').textContent = 'Plan this brief';
    $('#reset').disabled = false;
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
  reset();
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
