const $ = selector => document.querySelector(selector);
let config;
let currentResult;
let busy = false;
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
  const error = new Error(`${value?.message ?? 'The request failed.'} (${value?.code ?? status})`);
  error.details = value?.details;
  return error;
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
          input.value = input.value.split('\n').map(anchor => anchor.trim() === choice.input ? candidate.id : anchor).join('\n');
        }
        group.replaceChildren(paragraph(`Selected ${candidate.name} (${candidate.type.replace('urn:entity:', '')}). Its verified Qloo ID is now in your brief.`, 'resolution-selected'));
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
  const sample = config.sample;
  $('#venue').value = sample.venue;
  $('#minutes').value = sample.minutes;
  $('#coverage').value = sample.minimumCoverage;
  $('#coverage-value').textContent = sample.minimumCoverage;
  $('#vetoes').value = '';
  $('#circles').replaceChildren();
  sample.circles.forEach((circle, index) => {
    const name = node('input', { id: `circle-name-${index}`, value: circle.name, maxlength: '60', 'aria-label': `Circle ${index + 1} name`, required: '' });
    const anchors = node('textarea', { id: `circle-anchors-${index}`, rows: '2', maxlength: '480', 'aria-label': `Circle ${index + 1} cultural anchors`, required: '' });
    anchors.value = circle.anchors.join('\n');
    anchors.readOnly = config.mode === 'fixture';
    const card = node('div', { class: 'circle' }, [
      node('div', { class: 'circle-top' }, [node('span', { class: 'circle-index', text: String(index + 1) }), name]),
      node('label', { for: `circle-anchors-${index}`, text: 'Artists, books, films, or verified Qloo IDs' }), anchors
    ]);
    $('#circles').append(card);
  });
}

function readInput() {
  return {
    venue: $('#venue').value,
    circles: config.sample.circles.map((_, index) => ({
      name: $(`#circle-name-${index}`).value,
      anchors: $(`#circle-anchors-${index}`).value.split('\n').map(value => value.trim()).filter(Boolean)
        .map(value => config.resolvedAnchors?.find(anchor => anchor.name === value)?.id ?? value)
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
  if (result.program) {
    lines.push(`## ${result.program.title}`, '', result.program.description, '', '| Minutes | Activity |', '| --- | --- |');
    for (const row of result.program.schedule) lines.push(`| ${row.minutes} | ${row.label.replaceAll('|', '/')} |`);
    lines.push('', '## Host prompts', '');
    for (const row of result.program.schedule) lines.push(`- ${row.activity}`);
    lines.push('', result.program.note, '');
  }
  lines.push('## Coverage', '', result.scoring.explanation, '');
  const bundle = result.decision.selected ?? result.decision.bestUnqualified;
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
  return node('section', { class: 'result-section' }, [node('h3', { text: title }), paragraph(description), ...children]);
}

function renderResult(result) {
  currentResult = result;
  const container = $('#results');
  container.replaceChildren();
  container.hidden = false;
  const ready = result.status === 'ready';
  const bundle = result.decision.selected ?? result.decision.bestUnqualified;
  container.append(node('div', { class: 'decision-header' }, [
    node('div', {}, [node('h3', { text: ready ? result.program.title : 'Keep the room open.' }), paragraph(ready ? `${result.input.minutes} minutes · ${result.input.venue}` : 'This brief needs a decision from its owner.')]),
    node('span', { class: `pill${ready ? '' : ' blocked'}`, text: ready ? 'BRIEF READY' : 'CONSTRAINTS NOT MET' })
  ]));
  container.append(paragraph(result.evidenceLabel, 'artifact-note'));
  if (!ready) {
    container.append(node('div', { class: 'blocked-reasons' }, [
      ...result.decision.reasons.map(reason => paragraph(reason)),
      paragraph('The agent kept your vetoes, used its one refinement, and stopped. Adjust the minimum, change the cultural anchors in live mode, or revisit a veto before running again.')
    ]));
  }
  if (bundle) {
    if (!ready) container.append(paragraph('Best unqualified candidate, shown for diagnosis only. This is not an approved event brief.', 'explanation'));
    container.append(node('div', { class: 'selection-grid' }, bundle.items.map(item => node('article', { class: `selection-card ${item.domain}` }, [
      node('span', { class: 'domain', text: { book: '01 / READ', artist: '02 / LISTEN', movie: '03 / DISCUSS' }[item.domain] }),
      node('h4', { text: item.name }),
      paragraph(`${item.discoveryIds.length} discovery workflow${item.discoveryIds.length === 1 ? '' : 's'} · ${result.mode === 'fixture' ? 'synthetic' : 'Qloo evidence'}`)
    ]))));
    container.append(section('A reason for every seat', 'Coverage is relative to this shortlist. The lowest circle matters as much as the overall room.', [
      matrix(bundle, result.input), paragraph('100 means first in this shortlist. It does not mean certain interest. A missing graph result is shown as ? and counted conservatively as 0.', 'explanation')
    ]));
    const baseline = result.decision.baseline;
    if (baseline) {
      container.append(section('What changes when the quietest circle counts?', 'Both strategies use the same cultural candidates and the same vetoes.', [
        node('div', { class: 'comparison' }, [
          node('div', { class: 'metric' }, [node('span', { class: 'metric-label', text: 'Optimize the average' }), paragraph(`${format(baseline.metrics.minimum)}/100`, 'metric-value'), paragraph('Weakest circle coverage'), paragraph(`Room average: ${format(baseline.metrics.average)}`)]),
          node('div', { class: 'metric highlight' }, [node('span', { class: 'metric-label', text: 'Make room for each circle' }), paragraph(`${format(bundle.metrics.minimum)}/100`, 'metric-value'), paragraph('Weakest circle coverage'), paragraph(`Room average: ${format(bundle.metrics.average)}`)])
        ]),
        paragraph(`Lowest-circle change: +${format(result.decision.minimumGainVsAverage)} points. Average tradeoff: ${format(result.decision.averageTradeoff)} points. This is a calculation on ${result.mode === 'fixture' ? 'synthetic fixture rankings' : 'this Qloo shortlist'}, not a measured attendance improvement.`, 'comparison-note')
      ]));
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
    container.append(details);
  }
  if (result.program) {
    container.append(section('A night the host can actually run', result.program.description, [
      ...result.program.schedule.map(row => node('div', { class: 'program-row' }, [node('span', { class: 'duration', text: `${row.minutes} MIN` }), node('div', {}, [node('h4', { text: row.label }), paragraph(row.activity)])])),
      paragraph(result.program.note, 'explanation')
    ]));
  }
  const actions = node('div', { class: 'result-actions' });
  const brief = node('button', { class: 'secondary', type: 'button', text: 'Export host brief ↗' });
  brief.addEventListener('click', () => download('common-room-brief.md', briefMarkdown(result), 'text/markdown'));
  const evidence = node('button', { class: 'secondary', type: 'button', text: 'Export evidence JSON ↗' });
  evidence.addEventListener('click', () => download('common-room-evidence.json', JSON.stringify(result, null, 2), 'application/json'));
  actions.append(brief, evidence);
  if (ready) {
    const veto = node('button', { class: 'secondary', type: 'button', text: 'What if this book is unavailable?' });
    veto.addEventListener('click', () => {
      if (busy) return;
      const existing = $('#vetoes').value.trim();
      $('#vetoes').value = `${existing}${existing ? '\n' : ''}${bundle.items.find(item => item.domain === 'book').id}`;
      $('#planner').requestSubmit();
    });
    actions.append(veto);
  }
  container.append(actions);
  container.append(paragraph(`${result.budget.workflowCount}/${result.budget.workflowLimit} bounded workflows · ${result.decision.refined ? 'One targeted refinement used' : 'Initial search met the brief'} · No auto-publishing`, 'explanation'));
}

async function run(event) {
  event.preventDefault();
  if (busy) return;
  busy = true;
  $('#run').disabled = true;
  $('#reset').disabled = true;
  $('#strict').disabled = true;
  $('#error').hidden = true;
  $('#retry').hidden = true;
  $('#resolution').hidden = true;
  $('#planner').setAttribute('aria-busy', 'true');
  $('#results').hidden = true;
  $('#empty').hidden = true;
  $('#running').hidden = false;
  $('#trace').replaceChildren();
  $('#trace-count').textContent = '0 steps';
  $('#trace-wrap').hidden = false;
  $('#trace-wrap').open = true;
  $('#progress-text').textContent = 'Preparing the search.';
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
      if (item.type === 'result') { gotResult = true; renderResult(item.data); }
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
    $('#error').textContent = error.message;
    $('#error').hidden = false;
    $('#retry').textContent = 'Try the brief again';
    $('#retry').hidden = false;
    renderChoices(error.details?.choices);
    $('#error').focus({ preventScroll: true });
    $('#error').scrollIntoView({ behavior: scrollBehavior(), block: 'nearest' });
  } finally {
    busy = false;
    $('#run').disabled = false;
    $('#reset').disabled = false;
    $('#strict').disabled = false;
    $('#running').hidden = true;
    $('#planner').setAttribute('aria-busy', 'false');
  }
}

$('#coverage').addEventListener('input', () => { $('#coverage-value').textContent = $('#coverage').value; });
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
