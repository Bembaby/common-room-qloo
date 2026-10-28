import { createApp } from '../src/server.js';
import { BlobWorkflowBudget } from '../src/blob-budget.js';

const env = { ...process.env, QLOO_NODE_ENTRY: 'node_modules/@qloo/qloo-harness/dist/bin.js' };
const app = createApp({ env, budgetFactory: configuration => new BlobWorkflowBudget({ env: configuration }) });

export default function handler(request, response) {
  app.emit('request', request, response);
}
