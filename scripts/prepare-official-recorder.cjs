// Stage downloaded official code for an isolated instrumentation check. Generated files are
// test inputs outside the repository and are never bundled into the production APK.
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { createHash } = require('node:crypto');
const acorn = require('acorn');

const [bundlePath, workerPath, outputDir] = process.argv.slice(2);
if (!bundlePath || !workerPath || !outputDir) throw new Error('Expected bundle path, official worker path and staging directory');
const source = readFileSync(bundlePath, 'utf8');
const root = acorn.parse(source, { ecmaVersion: 'latest' }).body[0].expression;
const bootstraps = [];
function visit(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'o' &&
      node.arguments[0]?.type === 'AssignmentExpression' && node.arguments[0].left?.object?.name === 'o' &&
      node.arguments[0].left?.property?.name === 's') bootstraps.push(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'start' || key === 'end') continue;
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') visit(value);
  }
}
visit(root.callee.body);
if (bootstraps.length !== 1 || !source.includes('o.m=e,o.c=n')) throw new Error('Official runtime changed; inspect it before adapting the test');
for (const id of ['uFvF', 'iHlY']) {
  if (!root.arguments[0].properties.some(property => (property.key.name || property.key.value) === id)) {
    throw new Error(`Official recorder module ${id} is missing`);
  }
}
const bootstrap = bootstraps[0];
// Skip website initialization: the harness loads only the recorder class and never creates a meeting.
const runtime = (source.slice(0, bootstrap.start) + 'void 0' + source.slice(bootstrap.end))
  .replace('o.m=e,o.c=n', 'window.__tingwuEncoderRequire=o,o.m=e,o.c=n');
const worker = readFileSync(workerPath);
mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'official-runtime.js'), runtime);
writeFileSync(join(outputDir, 'opusEncoderWorker.js'), worker);
const sha256 = value => createHash('sha256').update(value).digest('hex');
writeFileSync(join(outputDir, 'official-recorder-sources.json'), JSON.stringify({
  bundle: 'https://g.alicdn.com/idst-fe/mind-meeting-assistant2/0.1.32/umi.js',
  bundleSha256: sha256(source),
  worker: 'https://tingwu.aliyun.com/public/opusEncoderWorker.js',
  workerSha256: sha256(worker),
  applicationBootstrapDisabled: true,
}, null, 2));
console.log('Staged official recorder runtime and worker; application initialization is disabled.');
