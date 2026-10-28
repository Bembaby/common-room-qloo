import { AppError } from './errors.js';

export const DOMAINS = ['book', 'artist', 'movie'];
export const DOMAIN_LABELS = { book: 'Read', artist: 'Listen', movie: 'Discuss' };
export const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const ownObject = value => value && typeof value === 'object' && !Array.isArray(value);

function text(value, field, max = 120) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new AppError('INVALID_INPUT', `${field} must be text between 1 and ${max} characters without control characters.`);
  }
  return value.trim();
}

export function validateInput(value) {
  if (!ownObject(value)) throw new AppError('INVALID_INPUT', 'Send a JSON object with a venue and two or three taste circles.');
  const allowed = new Set(['venue', 'circles', 'vetoes', 'minimumCoverage', 'minutes', 'scenario']);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new AppError('INVALID_INPUT', `Unsupported field: ${key.slice(0, 40)}.`);
  if (!Array.isArray(value.circles) || value.circles.length < 2 || value.circles.length > 3) {
    throw new AppError('INVALID_INPUT', 'Use two or three taste circles. Each circle represents public cultural interests, not a demographic.');
  }
  const circles = value.circles.map((circle, index) => {
    if (!ownObject(circle) || !Array.isArray(circle.anchors) || circle.anchors.length < 1 || circle.anchors.length > 3) {
      throw new AppError('INVALID_INPUT', `Circle ${index + 1} needs one to three cultural anchors.`);
    }
    const anchors = [...new Set(circle.anchors.map((anchor, i) => text(anchor, `Circle ${index + 1}, anchor ${i + 1}`, 160)))];
    let anchorLabels;
    if (circle.anchorLabels !== undefined) {
      if (!Array.isArray(circle.anchorLabels) || circle.anchorLabels.length !== circle.anchors.length) throw new AppError('INVALID_INPUT', 'Readable anchor labels must correspond to the supplied cultural anchors.');
      const labels = circle.anchorLabels.map((label,i)=>text(label,`Circle ${index+1}, entered anchor ${i+1}`,160));
      anchorLabels = anchors.map(anchor=>labels[circle.anchors.findIndex(value=>value.trim()===anchor)]);
    }
    return { id: `circle-${index + 1}`, name: text(circle.name, `Circle ${index + 1} name`, 60), anchors, ...(anchorLabels ? { anchorLabels } : {}) };
  });
  if (new Set(circles.map(circle => circle.name.toLowerCase())).size !== circles.length) {
    throw new AppError('INVALID_INPUT', 'Give each taste circle a different name.');
  }
  const vetoes = value.vetoes ?? [];
  if (!Array.isArray(vetoes) || vetoes.length > 30) throw new AppError('INVALID_INPUT', 'Use at most 30 exact entity IDs or names as vetoes.');
  const minimumCoverage = value.minimumCoverage ?? 60;
  if (!Number.isInteger(minimumCoverage) || minimumCoverage < 0 || minimumCoverage > 100) {
    throw new AppError('INVALID_INPUT', 'Minimum relative coverage must be an integer from 0 to 100.');
  }
  const minutes = value.minutes ?? 90;
  if (![60, 90, 120].includes(minutes)) throw new AppError('INVALID_INPUT', 'Choose a 60, 90, or 120 minute event.');
  const scenario = value.scenario ?? 'common-room';
  if (!['common-room', 'empty'].includes(scenario)) throw new AppError('INVALID_INPUT', 'Unknown fixture scenario.');
  return {
    venue: text(value.venue, 'Venue name', 80), circles,
    vetoes: [...new Set(vetoes.map((veto, i) => text(veto, `Veto ${i + 1}`, 160)))],
    minimumCoverage, minutes, scenario
  };
}

export function isVetoed(entity, vetoes) {
  const excluded = new Set(vetoes.map(value => value.toLocaleLowerCase('en-US')));
  return excluded.has(entity.id.toLocaleLowerCase('en-US')) || excluded.has(entity.name.toLocaleLowerCase('en-US'));
}
