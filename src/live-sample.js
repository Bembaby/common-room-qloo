// Public identities resolved through the official event API on October 28.
// These are real anchor identities, not cached recommendations or affinities.
export const resolvedAnchors = [
  { name: 'Toni Morrison', id: '0989FBAF-7A79-4764-895D-1E054EFF175D', type: 'urn:entity:author' },
  { name: 'Miles Davis', id: '578CFC26-B696-449A-9655-3FB270DDA725', type: 'urn:entity:artist' },
  { name: 'The Grand Budapest Hotel', id: 'DF788007-B5EA-4F29-872B-96BCB8EEC42F', type: 'urn:entity:movie' }
];

export const liveSample = {
  venue: 'The Common Room Bookshop',
  circles: [
    { name: 'Novel readers', anchors: ['Toni Morrison'] },
    { name: 'Jazz listeners', anchors: ['Miles Davis'] },
    { name: 'Cinema regulars', anchors: ['The Grand Budapest Hotel'] }
  ],
  vetoes: [], minimumCoverage: 60, minutes: 90
};
