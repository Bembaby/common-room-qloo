import { DOMAINS, isVetoed } from './input.js';

const rounded = number => Math.round(number * 100) / 100;

export function evaluateBundle(items, circles) {
  const coverage = circles.map(circle => ({
    circleId: circle.id,
    name: circle.name,
    // A rank is relative evidence within the same shortlist, never a probability.
    score: rounded(items.reduce((sum, item) => sum + (item.scores[circle.id]?.relativeScore ?? 0), 0) / DOMAINS.length),
    supportedSlots: items.filter(item => item.scores[circle.id]?.observed).length,
    reasons: items.map(item => ({
      entityId: item.id, domain: item.domain,
      score: item.scores[circle.id]?.relativeScore ?? 0,
      observed: Boolean(item.scores[circle.id]?.observed),
      evidenceId: item.scores[circle.id]?.evidenceId ?? null
    }))
  }));
  return {
    coverage,
    minimum: rounded(Math.min(...coverage.map(row => row.score))),
    average: rounded(coverage.reduce((sum, row) => sum + row.score, 0) / coverage.length),
    spread: rounded(Math.max(...coverage.map(row => row.score)) - Math.min(...coverage.map(row => row.score)))
  };
}

function better(candidate, previous, objective) {
  if (!previous) return true;
  const keys = objective === 'average' ? ['average', 'minimum'] : ['minimum', 'average'];
  for (const key of keys) {
    if (candidate.metrics[key] !== previous.metrics[key]) return candidate.metrics[key] > previous.metrics[key];
  }
  return candidate.items.map(item => item.id).join('|') < previous.items.map(item => item.id).join('|');
}

export function optimize(catalog, input, objective = 'fair') {
  const available = Object.fromEntries(DOMAINS.map(domain => [domain,
    catalog.filter(entity => entity.domain === domain && !isVetoed(entity, input.vetoes))
      .sort((a, b) => a.id.localeCompare(b.id))
  ]));
  const missingDomains = DOMAINS.filter(domain => available[domain].length === 0);
  if (missingDomains.length) return { bundle: null, missingDomains, considered: 0 };
  let best = null;
  let considered = 0;
  for (const book of available.book) for (const artist of available.artist) for (const movie of available.movie) {
    considered += 1;
    const candidate = { items: [book, artist, movie], metrics: evaluateBundle([book, artist, movie], input.circles) };
    if (better(candidate, best, objective)) best = candidate;
  }
  return { bundle: best, missingDomains, considered };
}

export function rankScores(result, options, circleId, workflowId) {
  const count = options.length;
  const resultById = new Map(result.entities.map((entity, index) => [entity.id, { entity, rank: index + 1 }]));
  return new Map(options.map(option => {
    const match = resultById.get(option.id);
    return [option.id, {
      circleId,
      observed: Boolean(match),
      rank: match?.rank ?? null,
      totalOptions: count,
      relativeScore: match ? rounded(100 * (count - match.rank + 1) / count) : 0,
      rawAffinity: match?.entity.rawAffinity ?? null,
      evidenceId: `${workflowId}:${option.id}`,
      workflowId,
      note: match ? 'Rank among the same candidate shortlist.' : 'Not returned for this circle; conservatively unscored, not evidence of dislike.'
    }];
  }));
}
