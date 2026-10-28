import { QlooHarnessAdapter } from '../src/harness.js';
import { publicError } from '../src/errors.js';

const blockers = [];
if (process.env.APP_MODE !== 'live') blockers.push('Set APP_MODE=live.');
if (!process.env.QLOO_API_KEY?.trim()) blockers.push('Supply your individually issued Qloo hackathon API key in the server environment.');
if (process.env.PUBLIC_DEMO === 'true' && process.env.APP_ACCESS_CODE) blockers.push('Public submission mode cannot require APP_ACCESS_CODE.');
if (process.env.HOST === '0.0.0.0' && process.env.PUBLIC_DEMO !== 'true') blockers.push('Set PUBLIC_DEMO=true for a public submission, keep APP_ACCESS_CODE empty, and persist .data with one replica.');
if (blockers.length) {
  console.error(JSON.stringify({ category: 'configuration_blocked', blockers }, null, 2));
  process.exitCode = 1;
} else {
  try {
    await new QlooHarnessAdapter().check();
    console.log(JSON.stringify({ category: 'configuration_ready', harnessVersion: '0.1.26', liveApiVerified: false, next: 'Run npm run live:smoke with a verified QLOO_SMOKE_ENTITY_ID. This check makes no Qloo API request.' }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ category: 'configuration_blocked', error: publicError(error) }, null, 2));
    process.exitCode = 1;
  }
}
