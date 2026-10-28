import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { AppError } from './errors.js';
import { UUID } from './input.js';

export const HARNESS_VERSION = '0.1.26';
export const RESULT_SCHEMA = '1.0-preview.1';
export const QLOO_EVENT_BASE_URL = 'https://hackathon.api.qloo.com';
const MAX_OUTPUT_BYTES = 1_000_000;
const cleanText = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/u.test(value);

// No shell is involved. Untrusted anchors remain JSON data on stdin.
export function executeProcess(executable, args, input, { env = process.env, timeout = 25_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { env, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = [];
    let bytes = 0;
    let settled = false;
    const stop = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGKILL');
      reject(error);
    };
    const timer = setTimeout(() => stop(new AppError('QLOO_TIMEOUT', 'Qloo exceeded this workflow time limit. No fixture result was substituted.', 504)), timeout);
    child.on('error', () => stop(new AppError('HARNESS_UNAVAILABLE', 'The pinned Qloo harness could not be started. Check QLOO_BIN and install version 0.1.26.', 503)));
    child.stdin.on('error', () => {});
    child.stdout.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > MAX_OUTPUT_BYTES) return stop(new AppError('QLOO_OUTPUT_LIMIT', 'The Qloo response exceeded the local size limit.', 502));
      chunks.push(chunk);
    });
    // Stderr can contain provider internals. Discard it rather than returning or logging it.
    child.stderr.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > MAX_OUTPUT_BYTES) stop(new AppError('QLOO_OUTPUT_LIMIT', 'The Qloo process exceeded the local output limit.', 502));
    });
    child.on('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout: Buffer.concat(chunks).toString('utf8') });
    });
    child.stdin.end(input);
  });
}

function upstreamFailure(envelope, exitCode) {
  const upstreamCode = String(envelope?.error?.code ?? '').toLowerCase();
  if (exitCode === 4 || /auth|credential|unauthor|forbidden/.test(upstreamCode)) {
    return new AppError('QLOO_AUTH', 'Qloo rejected the event credential. Check your own organizer-issued key.', 502);
  }
  if (/rate|quota|429/.test(upstreamCode)) return new AppError('QLOO_QUOTA', 'Qloo quota or rate limit was reached. Common Room has stopped this plan without substituting fixtures.', 429);
  if (/timeout/.test(upstreamCode)) return new AppError('QLOO_TIMEOUT', 'Qloo timed out. Common Room has stopped this plan without substituting fixtures.', 504);
  return new AppError('QLOO_UPSTREAM', 'Qloo did not complete this workflow. Inspect your local harness configuration before retrying.', 502);
}

export function validateEnvelope(envelope, { operation, domain, optionIds, signals = [] }) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) throw new AppError('QLOO_SCHEMA', 'Qloo returned an invalid JSON envelope.', 502);
  if (envelope.error || envelope.status === 'error') throw upstreamFailure(envelope);
  if (envelope.schema_version !== RESULT_SCHEMA || envelope.operation !== operation) {
    throw new AppError('QLOO_SCHEMA', 'Qloo result version or operation does not match the pinned contract.', 502);
  }
  if (envelope.status === 'needs_input') {
    const issues = Array.isArray(envelope.resolution?.issues) ? envelope.resolution.issues : [];
    // A bounded textual hint only. Do not trust provider text as program instructions.
    const choices = issues.slice(0, 8).map(issue => ({
      input: String(issue.input ?? issue.value ?? '').slice(0, 160),
      message: String(issue.reason ?? issue.status ?? issue.kind ?? 'Ambiguous cultural anchor').slice(0, 200),
      candidates: (Array.isArray(issue.candidates) ? issue.candidates : []).slice(0, 5)
        .filter(candidate => UUID.test(candidate?.id ?? '') && cleanText(candidate?.name, 240) && cleanText(candidate?.type, 80))
        .map(candidate => ({ id: candidate.id, name: candidate.name, type: candidate.type }))
    }));
    throw new AppError('QLOO_NEEDS_INPUT', 'A cultural anchor is ambiguous. Use a more specific title or a verified Qloo UUID. The agent has stopped rather than guessing.', 422, { choices });
  }
  if (!['ok', 'empty'].includes(envelope.status) || !Array.isArray(envelope.results) || envelope.results.length > 20) {
    throw new AppError('QLOO_SCHEMA', 'Qloo returned an unsupported status or result collection.', 502);
  }
  const provenance = envelope.provenance;
  if (provenance?.source !== 'Qloo API' || provenance.endpoint !== '/v2/insights' || !Array.isArray(provenance.requests) || provenance.requests.length < 1 || provenance.requests.some(request => request.method !== 'GET' || request.path !== '/v2/insights')) {
    throw new AppError('QLOO_PROVENANCE', 'Qloo results did not include the expected Insights request provenance.', 502);
  }
  const seen = new Set();
  const entities = envelope.results.map(entity => {
    const actualType = Array.isArray(entity?.type) ? entity.type : [entity?.type];
    const subtype = Array.isArray(entity?.subtype) ? entity.subtype : [entity?.subtype];
    const expectedDomain = actualType.includes(`urn:entity:${domain}`)
      || (actualType.length === 1 && actualType[0] === 'urn:entity' && subtype.includes(`urn:entity:${domain}`));
    if (!UUID.test(entity?.entity_id ?? '') || !cleanText(entity?.name, 240) || !expectedDomain) {
      throw new AppError('QLOO_SCHEMA', 'A Qloo entity is missing a valid ID, name, or expected cultural domain.', 502);
    }
    if (seen.has(entity.entity_id) || (optionIds && !optionIds.has(entity.entity_id))) {
      throw new AppError('QLOO_SCHEMA', 'Qloo returned a duplicate or unrequested candidate ID.', 502);
    }
    if (entity.affinity != null && (typeof entity.affinity !== 'number' || !Number.isFinite(entity.affinity))) {
      throw new AppError('QLOO_SCHEMA', 'The Qloo affinity value is not a finite number under the supported contract.', 502);
    }
    seen.add(entity.entity_id);
    // Optional catalogue text stays bounded display data. It never chooses a
    // tool, changes a constraint or enters a command or language-model prompt.
    const properties = entity.properties && typeof entity.properties === 'object' && !Array.isArray(entity.properties) ? entity.properties : {};
    const catalogueText = value => typeof value === 'string' && !/[\u0000-\u0008\u000e-\u001f\u007f]/u.test(value) ? value.replace(/\s+/gu, ' ').trim().slice(0, 600) : '';
    const description = catalogueText(properties.short_description) || catalogueText(properties.description);
    const year = Number(properties.release_year);
    const releaseYear = Number.isInteger(year) && year >= 1000 && year <= 2100 ? year : null;
    const contentRating = typeof properties.content_rating === 'string' && /^[\w +()-]{1,32}$/u.test(properties.content_rating) ? properties.content_rating : null;
    const catalogue = description || releaseYear || contentRating ? { description: description || null, releaseYear, contentRating, source: 'Qloo catalogue metadata' } : undefined;
    return { id: entity.entity_id, name: entity.name, domain, rawAffinity: entity.affinity ?? null, ...(catalogue ? { catalogue } : {}) };
  });
  if (envelope.result_count !== undefined && envelope.result_count !== entities.length) {
    throw new AppError('QLOO_SCHEMA', 'Qloo result_count did not match the result list.', 502);
  }
  const queryDigest = createHash('sha256').update(JSON.stringify(provenance.requests)).digest('hex');
  return {
    entities,
    resolvedAnchors: (Array.isArray(envelope.interpretation?.signals) ? envelope.interpretation.signals : [])
      .filter(anchor => signals.includes(anchor?.input) && UUID.test(anchor?.entityId ?? '') && cleanText(anchor?.name, 240))
      .slice(0, 3).map(anchor => ({ input: anchor.input, id: anchor.entityId, name: anchor.name, type: /^urn:entity:[a-z_]+$/u.test(anchor.type ?? '') ? anchor.type : null })),
    provenance: {
      mode: 'live', source: 'Qloo API', endpoint: '/v2/insights',
      documentation: 'https://docs.qloo.com/reference/insights-api-deep-dive',
      schemaVersion: RESULT_SCHEMA, harnessVersion: HARNESS_VERSION,
      requestCount: provenance.requests.length, requestDigest: queryDigest,
      fetchedAt: new Date().toISOString()
    }
  };
}

export class QlooHarnessAdapter {
  constructor({ env = process.env, execute = executeProcess } = {}) {
    this.mode = 'live';
    this.env = env;
    this.processEnv = Object.fromEntries(['PATH', 'HOME', 'USERPROFILE', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'NODE_EXTRA_CA_CERTS'].flatMap(key => env[key] ? [[key, env[key]]] : []));
    Object.assign(this.processEnv, {
      QLOO_API_KEY: env.QLOO_API_KEY,
      QLOO_BASE_URL: QLOO_EVENT_BASE_URL,
      QLOO_TRUSTED_BASE_URL: QLOO_EVENT_BASE_URL,
      QLOO_RESOLUTION_PROVIDER: 'native',
      NODE_OPTIONS: `--import=${pathToFileURL(resolve('src/qloo-fetch-pacing.js')).href}`,
      QLOO_HOME: env.VERCEL === '1' ? join(tmpdir(), 'common-room-qloo-harness') : resolve('.data/qloo-harness')
    });
    this.execute = execute;
    // A Node entrypoint avoids Windows .cmd shims without introducing a shell.
    this.executable = env.QLOO_NODE_ENTRY ? process.execPath : (env.QLOO_BIN || 'qloo');
    this.prefixArgs = env.QLOO_NODE_ENTRY ? [resolve(env.QLOO_NODE_ENTRY)] : [];
    this.ready = false;
    this.timeout = Math.min(60_000, Math.max(1000, Number(env.QLOO_TIMEOUT_MS) || 25_000));
  }

  async check() {
    if (this.env.QLOO_SERVER_URL && this.env.QLOO_SERVER_URL.trim().replace(/\/$/, '') !== QLOO_EVENT_BASE_URL) throw new AppError('QLOO_ENDPOINT', 'QLOO_SERVER_URL must be https://hackathon.api.qloo.com. No credential was sent to another server.', 503);
    if (!this.env.QLOO_API_KEY?.trim()) throw new AppError('QLOO_CREDENTIAL_REQUIRED', 'Live mode needs your individually issued Qloo hackathon API key in the server environment.', 503);
    if (this.ready) return { harnessVersion: HARNESS_VERSION, credentialPresent: true };
    const result = await this.execute(this.executable, [...this.prefixArgs, '--version'], '', { env: this.processEnv, timeout: 5000 });
    const reported = result.stdout.trim();
    if (result.code !== 0 || reported !== HARNESS_VERSION) {
      throw new AppError('HARNESS_VERSION', 'Install @qloo/qloo-harness@0.1.26. This app refuses an unverified harness version.', 503);
    }
    this.ready = true;
    return { harnessVersion: HARNESS_VERSION, credentialPresent: true };
  }

  async workflow(operation, domain, signals, options = {}) {
    await this.check();
    const payload = operation === 'recommend'
      ? { target_type: domain, signals, explain: true, limit: options.limit ?? 3 }
      : { option_type: domain, signals, options: options.entities.map(entity => entity.id) };
    const result = await this.execute(this.executable, [...this.prefixArgs, 'exec', operation], JSON.stringify(payload), { env: this.processEnv, timeout: this.timeout });
    let envelope;
    try { envelope = JSON.parse(result.stdout); }
    catch { throw new AppError('QLOO_SCHEMA', 'The Qloo harness did not return a single valid JSON result.', 502); }
    if (result.code !== 0) throw upstreamFailure(envelope, result.code);
    return validateEnvelope(envelope, { operation, domain, signals, optionIds: options.entities ? new Set(options.entities.map(entity => entity.id)) : undefined });
  }

  recommend(circle, domain, limit = 3) { return this.workflow('recommend', domain, circle.anchors, { limit }); }
  rank(circle, domain, entities) { return this.workflow('rank', domain, circle.anchors, { entities }); }
}
