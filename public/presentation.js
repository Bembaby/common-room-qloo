// Typography only. Entity IDs, ordering, affinities and scores stay unchanged.
const dash = String.fromCodePoint(0x2014);
export const presentationText = value => typeof value === 'string' ? value.split(dash).join('-') : value;

export function presentationCopy(value) {
  let replacements = 0;
  const copy = JSON.parse(JSON.stringify(value, (_key, item) => {
    if (typeof item !== 'string') return item;
    replacements += item.split(dash).length - 1;
    return presentationText(item);
  }));
  if (replacements && copy && typeof copy === 'object' && !Array.isArray(copy)) {
    copy.presentationNormalization = { punctuation: 'Long dash replaced with an ASCII hyphen for display and export.', replacements, decisionDataChanged: false };
  }
  return copy;
}
