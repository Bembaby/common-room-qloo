import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { AppError } from './errors.js';

export const fixture = JSON.parse(await readFile(new URL('../fixtures/scenario.json', import.meta.url), 'utf8'));

export class FixtureAdapter {
  constructor(input) {
    this.mode = 'fixture';
    this.input = input;
  }
  async check() { return { credentialPresent: false, fixture: true }; }
  async run(operation, circle, domain, { limit = 3, options } = {}) {
    const index = Number(circle.id.split('-')[1]) - 1;
    const known = fixture.input.circles[index];
    if (!known || JSON.stringify(circle.anchors) !== JSON.stringify(known.anchors)) {
      throw new AppError('FIXTURE_INPUT_UNSUPPORTED', 'The synthetic demo only models its displayed cultural anchors. Use live mode for fresh anchors, or restore the sample.', 422);
    }
    const records = this.input.scenario === 'empty' ? [] : fixture.entities
      .filter(entity => entity.domain === domain && (!options || options.some(option => option.id === entity.id)))
      .sort((a, b) => b.affinities[index] - a.affinities[index] || a.id.localeCompare(b.id));
    const entities = (operation === 'recommend' ? records.slice(0, limit) : records)
      .map(entity => ({ id: entity.id, name: entity.name, domain, rawAffinity: entity.affinities[index] }));
    return {
      entities,
      provenance: {
        mode: 'fixture', source: 'Synthetic fixture', endpoint: null,
        documentation: 'fixtures/scenario.json',
        requestCount: 0,
        requestDigest: createHash('sha256').update(JSON.stringify({ operation, circle, domain, options, limit })).digest('hex'),
        fetchedAt: new Date().toISOString(),
        warning: fixture.label
      }
    };
  }
  recommend(circle, domain, limit = 3) { return this.run('recommend', circle, domain, { limit }); }
  rank(circle, domain, entities) { return this.run('rank', circle, domain, { options: entities }); }
}
