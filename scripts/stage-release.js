import { readdir, readFile, mkdir, writeFile, copyFile, stat } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// A deliberate publication boundary. No private handoffs, local history,
// account receipts, configuration values or quota state enter this tree.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = resolve(root, '.data/public-release');
const directories = ['src', 'api', 'test', 'fixtures', 'public'];
directories.push('docs/screenshots');
const files = ['README.md', 'LICENSE', 'package.json', 'package-lock.json', '.env.example', '.gitignore', '.dockerignore', '.vercelignore', 'Dockerfile', 'vercel.json', 'ASSET_MANIFEST.json', 'docs/SPEC.md', 'docs/HARNESS_CONTRACT.md', 'docs/SOURCES.md', 'docs/CREDITS.md', 'docs/DEPLOYMENT.md', 'docs/DEMO_SCRIPT.md', 'docs/LIVE_VERIFICATION.md', 'docs/RULES_AND_RUBRIC.md', 'scripts/live-check.js', 'scripts/live-plan.js', 'scripts/live-smoke.js', 'scripts/verify-hosted-budget.js', 'scripts/init-hosted-budget.js', 'scripts/stage-release.js', 'scripts/demo-evidence.js', 'artifacts/demo-evidence.json', 'artifacts/demo-evidence.md'];
files.push('docs/DEPENDENCIES.md');
files.push('scripts/verify-evidence.js');
files.push('docs/EVIDENCE.md');
files.push('docs/ROUND3_REVIEW.md');
files.push('docs/ROUND4_REVIEW.md');
async function collect(path) {
  for (const entry of await readdir(resolve(root, path), { withFileTypes: true })) {
    const name = `${path}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error('Release cannot contain symbolic links.');
    if (entry.isDirectory()) await collect(name);
    else files.push(name);
  }
}
for (const directory of directories) await collect(directory);
// Reusing a staging checkout must not retain unreviewed nested copies.
const allowed = new Set(files);
async function inspectDestination(path = '') {
  let entries;
  try { entries = await readdir(resolve(destination, path), { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  for (const entry of entries) {
    if (!path && ['.git', 'node_modules', '.vercel'].includes(entry.name)) continue;
    const name = path ? `${path}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Unreviewed staging link: ${name}`);
    if (entry.isDirectory()) await inspectDestination(name);
    else if (!allowed.has(name)) throw new Error(`Unlisted staging file: ${name}. Archive it outside the release tree before staging.`);
  }
}
await inspectDestination();
const secrets = [];
for (const name of ['.env', '.env.local']) {
  try {
    for (const line of (await readFile(resolve(root, name), 'utf8')).split(/\r?\n/)) {
      const match = line.match(/^([A-Z_]+)=(.*)$/);
      if (match && /KEY|TOKEN|SECRET|CODE/.test(match[1])) {
        const value = match[2].trim().replace(/^['"]|['"]$/g, '');
        if (value.length >= 12) secrets.push(value);
      }
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const manifest = [];
for (const path of files.sort()) {
  const bytes = await readFile(resolve(root, path));
  const text = bytes.toString('utf8');
  const forbiddenTypography = [String.fromCodePoint(0x2014), '&' + 'mdash;', '&#' + '8212;', '&#x' + '2014;', '\\u' + '2014'];
  if (/\.(?:js|json|html|css|md|txt|srt|vtt)$/i.test(path) && forbiddenTypography.some(mark => text.toLowerCase().includes(mark))) throw new Error(`Typography scan failed: ${path}`);
  if (secrets.some(secret => text.includes(secret)) || /(?:github_pat_|ghp_|vercel_blob_rw_)[A-Za-z0-9_]{20,}/.test(text)) throw new Error(`Credential scan failed: ${path}`);
  const target = resolve(destination, path);
  if (relative(destination, target).startsWith('..')) throw new Error('Unsafe release path.');
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve(root, path), target);
  manifest.push({ path, bytes: (await stat(target)).size, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await writeFile(resolve(root, '.data/public-release-manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), files: manifest }, null, 2));
console.log(`Staged ${manifest.length} scanned project files in .data/public-release. No publication occurred.`);
