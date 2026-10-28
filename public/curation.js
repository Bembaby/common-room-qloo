const rounded = value => Math.round(value * 100) / 100;
export const slotNames = { book: 'Read', artist: 'Listen', movie: 'Discuss' };
export function explainVetoes(vetoes, evidence, items = []) {
  const matches = (veto, item) => [item.id, item.name].some(value => value.toLocaleLowerCase('en-US') === veto.toLocaleLowerCase('en-US'));
  return vetoes.map(value => {
    const found = evidence.filter(record => record.operation === 'recommend').flatMap(record => record.results).filter(item => matches(value, item));
    return { value, matchedNames: [...new Set(found.map(item => item.name))], matchedIds: [...new Set(found.map(item => item.id))], excludedFromBundle: !items.some(item => matches(value, item)) };
  });
}

// Explain only the supplied ranks and constraints. This does not infer themes,
// personal preferences or a causal reason for an upstream recommendation.
export function explainCuration(bundle, input, baseline, evidence = []) {
  if (!bundle) return null;
  const entryPoints = input.circles.map(circle => {
    const observed = bundle.items.filter(item => item.scores[circle.id]?.observed);
    const highest = Math.max(...observed.map(item => item.scores[circle.id].relativeScore));
    return { circleId: circle.id, name: circle.name, works: observed.filter(item => item.scores[circle.id].relativeScore === highest).map(item => ({ id: item.id, name: item.name, domain: item.domain, rank: item.scores[circle.id].rank, totalOptions: item.scores[circle.id].totalOptions, score: highest })) };
  });
  const circles = bundle.metrics.coverage.map(row => {
    const alternative = baseline?.metrics.coverage.find(other => other.circleId === row.circleId);
    return { ...row, baseline: alternative?.score ?? null, delta: alternative ? rounded(row.score - alternative.score) : null, meetsMinimum: row.score >= input.minimumCoverage };
  });
  const works = bundle.items.map(item => ({
    id: item.id, name: item.name, domain: item.domain,
    invitations: entryPoints.filter(entry => entry.works.some(work => work.id === item.id)).map(entry => entry.name),
    ranks: input.circles.map(circle => ({ name: circle.name, circleId: circle.id, ...item.scores[circle.id] })),
    observedCircles: input.circles.filter(circle => item.scores[circle.id]?.observed).length
  }));
  const vetoes = explainVetoes(input.vetoes, evidence, bundle.items);
  return {
    entryPoints, works, circles, vetoes,
    weakestCircles: circles.filter(row => row.score === bundle.metrics.minimum).map(row => row.name),
    sameAsAverage: Boolean(baseline && bundle.items.every(item => baseline.items.some(other => other.id === item.id))),
    connectionQuestion: `What detail from ${bundle.items[0].name} would you carry into a conversation about ${bundle.items[1].name} and ${bundle.items[2].name}?`,
    note: 'Entry points describe the strongest relative ranks among these three selections. Connections between the works are prompts for participants, not Qloo-supplied themes or predictions about people.'
  };
}
