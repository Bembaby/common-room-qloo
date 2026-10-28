import { randomUUID } from 'node:crypto';
import { AppError } from './errors.js';
import { DOMAINS, validateInput, isVetoed } from './input.js';
import { optimize, rankScores } from './optimizer.js';
import { explainCuration } from '../public/curation.js';

export const SCORE_EXPLANATION = 'For each circle and domain, every candidate is ranked against the same shortlist. Relative score = 100 × (shortlist size - rank + 1) / shortlist size. Missing candidates receive 0 as a conservative evidence gap. A circle coverage score is the mean across the three slots. The agent maximizes the lowest circle coverage, then the average. These are application-derived rank scores, not Qloo probabilities, measured satisfaction, attendance, or revenue.';

function makeProgram(bundle, input, curation) {
  if (!bundle) return null;
  const [book, artist, movie] = bundle.items;
  const welcome = input.minutes === 60 ? 5 : 10;
  const close = welcome;
  const central = input.minutes - welcome - close;
  const read = Math.round(central * 0.36);
  const listen = Math.round(central * 0.28);
  const discuss = central - read - listen;
  return {
    title: 'Three Ways Into One Room',
    venue: input.venue,
    format: 'A hosted conversation salon',
    durationMinutes: input.minutes,
    openingQuestion: curation.connectionQuestion,
    invitations: curation.entryPoints,
    preparation: [
      `Prepare a short excerpt or a discussion-only introduction to ${book.name}.`,
      `Choose a recording by ${artist.name} if playback is appropriate and permitted, or discuss it without playback.`,
      `Prepare a conversation prompt about ${movie.name}; a full screening is not part of this timed salon.`,
      'Check availability, access needs and any permissions before inviting guests. No rights or venue arrangements are verified.'
    ],
    description: `A ${input.minutes}-minute conversation at ${input.venue}, built around ${book.name}, ${artist.name}, and ${movie.name}. Each selection has an inspectable reason to be in the room.`,
    schedule: [
      { minutes: welcome, label: 'Open the room', activity: `Invite each circle to introduce a familiar way into the program. ${curation.entryPoints.map(entry => entry.works.length ? `${entry.name}: ${entry.works.map(work => work.name).join(' or ')}.` : `${entry.name}: ask for a participant-chosen starting point; no returned rank support was available.`).join(' ')}` },
      { minutes: read, label: `Read: ${book.name}`, activity: `Use ${book.name} as the first discussion anchor. Ask: what would you want a first-time reader to notice?`, entityId: book.id },
      { minutes: listen, label: `Listen: ${artist.name}`, activity: `Discuss a participant-chosen recording by ${artist.name}. Ask: what feeling or detail would you connect to the book discussion?`, entityId: artist.id },
      { minutes: discuss, label: `Discuss: ${movie.name}`, activity: `Use ${movie.name} as a film conversation prompt. Ask: ${curation.connectionQuestion} Let participants name the connection or disagreement; do not assume a shared theme.`, entityId: movie.id },
      { minutes: close, label: 'Leave with a bridge', activity: 'Each participant names one unfamiliar work they now want to explore. Collect voluntary feedback before repeating the event.' }
    ],
    note: 'This is a planning brief with discussion prompts. No screening, performer availability, inventory, licensing, attendance, or sales is verified.'
  };
}

export function workflowLimitFor(circleCount, configured = 22) {
  if (![2, 3].includes(circleCount)) throw new AppError('INVALID_INPUT', 'A brief needs two or three taste circles.', 400);
  // Three discoveries and three comparisons per circle, then at most one
  // deeper discovery and one revised-domain comparison per circle.
  const completePlanMaximum = 7 * circleCount + 1;
  return Math.min(completePlanMaximum, Math.max(1, Math.min(22, Math.floor(Number(configured) || 22))));
}

export async function runPlan(rawInput, adapter, { maxWorkflows = 22, onEvent = () => {}, beforeWorkflow = () => {} } = {}) {
  const input = validateInput(rawInput);
  const started = Date.now();
  const id = randomUUID();
  const trace = [];
  const evidence = [];
  const catalogMap = new Map();
  let workflowCount = 0;
  const limit = workflowLimitFor(input.circles.length, maxWorkflows);
  const emit = (phase, message, details = {}) => {
    const event = { sequence: trace.length + 1, phase, message, ...details };
    trace.push(event);
    onEvent(event);
  };
  const call = async (operation, circle, domain, options = {}) => {
    if (workflowCount >= limit) throw new AppError('WORKFLOW_BUDGET', `The local budget of ${limit} Qloo workflows was exhausted. The agent has stopped.`, 429);
    await beforeWorkflow();
    workflowCount += 1;
    const workflowId = `workflow-${String(workflowCount).padStart(2, '0')}`;
    emit('tool', `${operation === 'recommend' ? 'Discover' : 'Compare'} ${domain} candidates for ${circle.name}.`, { workflowId, operation, circleId: circle.id, domain });
    const result = operation === 'recommend'
      ? await adapter.recommend(circle, domain, options.limit ?? 3)
      : await adapter.rank(circle, domain, options.entities);
    if (!result || result.provenance?.mode !== adapter.mode || !Array.isArray(result.entities)) {
      throw new AppError('EVIDENCE_MODE_MISMATCH', 'The adapter returned evidence inconsistent with the active mode.', 502);
    }
    evidence.push({
      workflowId, operation, circleId: circle.id, domain,
      inputs: { anchors: [...circle.anchors], ...(options.entities ? { optionIds: options.entities.map(entity => entity.id) } : { limit: options.limit ?? 3 }) },
      provenance: result.provenance,
      results: result.entities
    });
    emit('observed', `${result.entities.length} ${domain} results received.`, { workflowId, resultCount: result.entities.length });
    return { ...result, workflowId };
  };
  const add = (result, domain) => {
    for (const entity of result.entities) {
      if (isVetoed(entity, input.vetoes)) {
        emit('constraint', `Excluded ${entity.name} because it matches an explicit veto.`, { entityId: entity.id });
        continue;
      }
      const existing = catalogMap.get(entity.id);
      if (existing && (existing.domain !== domain || existing.name !== entity.name)) {
        throw new AppError('QLOO_INCONSISTENT_ENTITY', 'The same entity ID returned conflicting names or domains.', 502);
      }
      if (!existing && [...catalogMap.values()].filter(item => item.domain === domain).length >= 10) continue;
      const record = existing ?? { id: entity.id, name: entity.name, domain, discoveryIds: [], scores: {} };
      record.discoveryIds.push(result.workflowId);
      catalogMap.set(entity.id, record);
    }
  };
  const rankDomain = async domain => {
    const options = [...catalogMap.values()].filter(entity => entity.domain === domain);
    if (!options.length) return;
    for (const circle of input.circles) {
      const result = await call('rank', circle, domain, { entities: options });
      const scores = rankScores(result, options, circle.id, result.workflowId);
      for (const option of options) option.scores[circle.id] = scores.get(option.id);
    }
  };

  await adapter.check();
  emit('plan', `Design one ${input.minutes}-minute conversation salon for ${input.circles.length} taste circles.`, {
    mode: adapter.mode,
    objective: 'Maximize the weakest circle coverage while honoring every exact veto.',
    workflowLimit: limit
  });
  for (const domain of DOMAINS) for (const circle of input.circles) {
    add(await call('recommend', circle, domain), domain);
  }
  for (const domain of DOMAINS) await rankDomain(domain);
  const counts = () => Object.fromEntries(DOMAINS.map(domain => [domain, [...catalogMap.values()].filter(entity => entity.domain === domain).length]));
  let solution = optimize([...catalogMap.values()], input);
  const initialMinimum = solution.bundle?.metrics.minimum ?? null;
  emit('evaluate', solution.bundle ? `First search: weakest circle coverage ${solution.bundle.metrics.minimum}/100.` : 'First search did not provide every required cultural domain.', { considered: solution.considered, counts: counts() });

  const sparseDomain = () => DOMAINS.find(domain => counts()[domain] < 3);
  let refined = false;
  if (!solution.bundle || solution.bundle.metrics.minimum < input.minimumCoverage || sparseDomain()) {
    const weakest = solution.bundle?.metrics.coverage.reduce((a, b) => a.score <= b.score ? a : b);
    const circle = input.circles.find(item => item.id === weakest?.circleId) ?? input.circles[0];
    const weakestItem = solution.bundle?.items.reduce((a, b) => (a.scores[circle.id]?.relativeScore ?? 0) <= (b.scores[circle.id]?.relativeScore ?? 0) ? a : b);
    const domain = sparseDomain() ?? weakestItem?.domain ?? 'book';
    emit('refine', `Search deeper in ${domain} for ${circle.name}, then compare the revised shortlist for every circle.`, { reason: sparseDomain() ? 'Too few comparison candidates.' : 'Minimum relative coverage is not satisfied.' });
    const before = catalogMap.size;
    add(await call('recommend', circle, domain, { limit: 6 }), domain);
    if (catalogMap.size > before) await rankDomain(domain);
    else emit('refine', 'The bounded refinement found no additional eligible entities.');
    refined = true;
    solution = optimize([...catalogMap.values()], input);
  }

  const baseline = optimize([...catalogMap.values()], input, 'average').bundle;
  const insufficientDomain = sparseDomain();
  const feasible = Boolean(solution.bundle && !insufficientDomain && solution.bundle.metrics.minimum >= input.minimumCoverage);
  const reasons = [];
  if (solution.missingDomains.length) reasons.push(`No eligible candidates in: ${solution.missingDomains.join(', ')}.`);
  if (insufficientDomain && !solution.missingDomains.length) reasons.push(`Fewer than three eligible ${insufficientDomain} candidates remain, so relative coverage is not sufficiently informative.`);
  if (solution.bundle && solution.bundle.metrics.minimum < input.minimumCoverage) reasons.push(`The strongest balanced plan reaches ${solution.bundle.metrics.minimum}/100 for its weakest circle, below your ${input.minimumCoverage}/100 minimum.`);
  emit(feasible ? 'complete' : 'blocked', feasible ? 'A balanced event brief is ready for the venue owner to review.' : 'No event meets the constraints. Keep the vetoes and ask the owner to revise the brief.', { workflowCount, considered: solution.considered });
  const curation = explainCuration(solution.bundle, input, baseline, evidence);
  return {
    version: '1.0', id, mode: adapter.mode,
    evidenceLabel: adapter.mode === 'live' ? 'Live Qloo graph evidence' : 'Synthetic fixture evidence. No Qloo API was called.',
    status: feasible ? 'ready' : 'blocked', input,
    generatedAt: new Date().toISOString(), elapsedMs: Date.now() - started,
    decision: {
      feasible, reasons,
      selected: feasible ? solution.bundle : null,
      bestUnqualified: feasible ? null : solution.bundle,
      baseline,
      minimumCoverage: input.minimumCoverage,
      minimumGainVsAverage: solution.bundle && baseline ? Math.round((solution.bundle.metrics.minimum - baseline.metrics.minimum) * 100) / 100 : null,
      averageTradeoff: solution.bundle && baseline ? Math.round((baseline.metrics.average - solution.bundle.metrics.average) * 100) / 100 : null,
      refined, initialMinimum,
      comparison: 'The baseline maximizes average rank coverage on the exact same eligible shortlist. It is not a measured real-world popularity baseline.'
    },
    curation,
    program: feasible ? makeProgram(solution.bundle, input, curation) : null,
    scoring: { explanation: SCORE_EXPLANATION, minimumCandidatesPerDomain: 3, missingMeans: 'Unobserved evidence, not dislike.' },
    budget: { workflowCount, workflowLimit: limit, note: 'A harness workflow may make several Qloo HTTP calls for entity resolution. This is not an API-request count.' },
    catalog: [...catalogMap.values()], evidence, trace,
    limitations: [
      'Cultural affinity does not predict an individual person or attendance.',
      'Scores are relative within this run and must not be compared as calibrated measurements across runs.',
      'No venue logistics, availability, rights, ticketing, or revenue is verified.',
      'The search is bounded to one refinement and at most ten candidates per domain.'
    ]
  };
}
