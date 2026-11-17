// The MCP connector end to end, over real stdio, against a bare repository on disk.
// Connector mode needs no model: the test plays the host agent and edits through the file tools.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { resolveInside } from '../src/session.mjs';

const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'swarm.mjs');
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-mcp-')));
const remote = path.join(tmp, 'remote.git');
const GIT_ENV = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid', GIT_CONFIG_GLOBAL: '/dev/null' };
const nested = Boolean(process.env.SWARM_SANDBOX) || process.platform !== 'darwin';

function sh(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, env: { ...process.env, ...GIT_ENV }, encoding: 'utf8' });
  assert.equal(r.status, 0, `${cmd} ${args.join(' ')}\n${r.stderr}`);
  return r.stdout;
}
const write = (file, text) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

/** A minimal MCP client: one JSON-RPC message per line. */
function connect(home, env = {}) {
  const child = spawn(process.execPath, [BIN, 'mcp'], {
    env: { ...process.env, ...GIT_ENV, SWARM_HOME: path.join(tmp, home), ...(nested ? { SWARM_UNSAFE_NO_SANDBOX: '1' } : {}), ...env },
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  const waiting = new Map();
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    const msg = JSON.parse(line); // anything that is not protocol on stdout fails the test here
    waiting.get(msg.id)?.(msg);
    waiting.delete(msg.id);
  });
  let next = 1;
  const request = (method, params) =>
    new Promise((resolve) => {
      const id = next++;
      waiting.set(id, resolve);
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  const call = async (name, args = {}) => {
    const res = await request('tools/call', { name, arguments: args });
    const text = res.result.content[0].text;
    return res.result.isError ? { error: text } : JSON.parse(text);
  };
  return { request, call, close: () => child.stdin.end() };
}

test.before(() => {
  const seed = path.join(tmp, 'seed');
  write(
    path.join(seed, '.swarm/projects/demo/project.json'),
    JSON.stringify({ name: 'Demo', paths: ['src/**'], protect: ['check.mjs'], verify: [{ name: 'check', run: 'node check.mjs' }], review: { quorum: 1 } }),
  );
  for (const t of ['one', 'two', 'three']) write(path.join(seed, `.swarm/projects/demo/tasks/${t}.md`), `---\ntitle: Add module ${t}\nsize: S\n---\nCreate src/${t}.mjs exporting a function.\n`);
  write(path.join(seed, 'check.mjs'), "import fs from 'node:fs';\nfor (const f of fs.readdirSync('src')) { const m = await import('./src/' + f); if (typeof Object.values(m)[0] !== 'function') process.exit(1); }\n");
  write(path.join(seed, 'src/index.mjs'), 'export const main = () => 1;\n');
  write(path.join(seed, 'README.md'), 'needle in the readme\n');
  sh('git', ['init', '-q', '-b', 'main'], seed);
  sh('git', ['add', '-A'], seed);
  sh('git', ['commit', '-q', '-m', 'seed'], seed);
  sh('git', ['init', '-q', '--bare', '-b', 'main', remote], tmp);
  sh('git', ['push', '-q', remote, 'main'], seed);
});

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const refs = (prefix) => sh('git', ['for-each-ref', '--format=%(refname)', prefix], remote).split('\n').filter(Boolean);

test('protocol: initialize, tool list, unknown method, notification', async () => {
  const c = connect('proto');
  const init = await c.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } });
  assert.equal(init.result.protocolVersion, '2025-06-18');
  assert.equal(init.result.serverInfo.name, 'swarm');
  const { tools } = (await c.request('tools/list')).result;
  assert.ok(tools.length >= 15);
  for (const t of tools) assert.equal(t.inputSchema.type, 'object', t.name);
  assert.equal((await c.request('nope/nope')).error.code, -32601);
  const status = await c.call('swarm_status');
  assert.match(status.worker.id, /^[0-9a-f]{16}$/);
  c.close();
});

test('connector mode: confined file tools, verifier feedback, signed submission', async () => {
  const c = connect('host');
  const begun = await c.call('swarm_begin', { repo: remote, task: 'demo/one', agent: 'test-host', model: 'none' });
  assert.equal(begun.task, 'demo/one', JSON.stringify(begun));
  assert.match(begun.instructions, /swarm_finish/);
  const s = begun.session;
  assert.equal(refs('refs/swarm/claims').length, 1);

  // Reading and searching work; the clone is all there is.
  assert.ok((await c.call('swarm_list', { session: s })).files.includes('src/index.mjs'));
  assert.match((await c.call('swarm_read', { session: s, path: 'src/index.mjs' })).text, /main/);
  assert.match((await c.call('swarm_search', { session: s, pattern: 'needle' })).matches[0], /^README\.md:1:/);

  // The file tools refuse everything outside the task's box.
  assert.match((await c.call('swarm_read', { session: s, path: '../../etc/passwd' })).error, /leaves the repository/);
  assert.match((await c.call('swarm_read', { session: s, path: '/etc/passwd' })).error, /relative/);
  assert.match((await c.call('swarm_read', { session: s, path: '.git/config' })).error, /\.git/);
  assert.match((await c.call('swarm_write', { session: s, path: 'check.mjs', content: 'process.exit(0)' })).error, /protected/);
  assert.match((await c.call('swarm_write', { session: s, path: 'README.md', content: 'x' })).error, /outside the paths/);
  assert.match((await c.call('swarm_write', { session: s, path: '.swarm/projects/demo/project.json', content: '{}' })).error, /protected/);
  assert.match((await c.call('swarm_delete', { session: s, path: 'check.mjs' })).error, /protected/);

  // A wrong change is caught by the sandboxed verifier and comes back as feedback.
  await c.call('swarm_write', { session: s, path: 'src/one.mjs', content: 'export const one = 1;\n' });
  const bad = await c.call('swarm_finish', { session: s, summary: 'first try' });
  assert.equal(bad.ok, false);
  assert.equal(bad.failedStep, 'check');
  assert.equal(bad.attemptsLeft, 2);
  assert.deepEqual(refs('refs/heads/swarm'), []);

  // Fix it with an exact-text edit; ambiguous edits are refused.
  assert.match((await c.call('swarm_edit', { session: s, path: 'src/one.mjs', old_text: 'nope', new_text: 'x' })).error, /not found/);
  await c.call('swarm_edit', { session: s, path: 'src/one.mjs', old_text: 'const one = 1;', new_text: 'const one = () => 1;' });
  const good = await c.call('swarm_finish', { session: s, summary: 'Added src/one.mjs exporting a function.' });
  assert.equal(good.ok, true, JSON.stringify(good));
  assert.deepEqual(good.verified, ['check']);

  // Exactly one submission branch, shaped work + receipt, with the host recorded as self-reported.
  const [branch] = refs('refs/heads/swarm');
  assert.match(branch, /^refs\/heads\/swarm\/demo\/one\//);
  assert.equal(sh('git', ['rev-list', '--count', `main..${branch}`], remote).trim(), '2');
  const receiptFile = sh('git', ['diff', '--name-only', `${branch}~1`, branch], remote).trim();
  const receipt = JSON.parse(sh('git', ['show', `${branch}:${receiptFile}`], remote));
  assert.equal(receipt.agent.runner, 'connector:test-host');
  assert.equal(receipt.agent.selfReported, true);
  assert.equal(receipt.attempts, 2);
  assert.deepEqual(refs('refs/swarm/claims'), []);

  // Asking again returns the stored outcome; the session is closed to further edits.
  assert.equal((await c.call('swarm_finish', { session: s, summary: 'again' })).where, good.where);
  assert.match((await c.call('swarm_write', { session: s, path: 'src/x.mjs', content: 'x' })).error, /submitted/);
  c.close();
});

test('connector mode: abandoning releases the claim; an unfinished session is resumed', async () => {
  const c = connect('host');
  const begun = await c.call('swarm_begin', { repo: remote, task: 'demo/two' });
  assert.equal(refs('refs/swarm/claims').length, 1);
  const again = await c.call('swarm_begin', { repo: remote, task: 'demo/three' });
  assert.equal(again.resumed, true);
  assert.equal(again.session, begun.session);
  const out = await c.call('swarm_abandon', { session: begun.session, reason: 'cannot be done' });
  assert.match(out.problem, /Abandoned/);
  assert.deepEqual(refs('refs/swarm/claims'), []);
  const tasks = (await c.call('swarm_tasks', { repo: remote })).tasks;
  assert.equal(tasks.find((t) => t.task === 'demo/two').state, 'open');
  assert.equal(tasks.find((t) => t.task === 'demo/one').state, 'claimed'); // submitted, awaiting merge
  c.close();
});

test('delegate mode: a background job runs the CLI and can be polled', async () => {
  const c = connect('delegate', { SWARM_MOCK_CMD: "echo 'export const three = () => 3;' > src/three.mjs" });
  const started = await c.call('swarm_donate', { repo: remote, task: 'demo/three', runner: 'mock' });
  assert.equal(started.state, 'running', JSON.stringify(started));
  let status;
  for (let i = 0; i < 120; i++) {
    status = await c.call('swarm_job', { job: started.job });
    if (status.state === 'finished') break;
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.equal(status.state, 'finished');
  assert.match(status.log, /Submitted demo\/three/, status.log);
  assert.equal(refs('refs/heads/swarm').filter((r) => r.includes('/three/')).length, 1);
  c.close();
});

test('path confinement survives symlinks', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-paths-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-outside-'));
  fs.writeFileSync(path.join(outside, 'secret'), 's');
  fs.symlinkSync(outside, path.join(root, 'link'));
  fs.mkdirSync(path.join(root, 'src'));
  assert.equal(resolveInside(root, 'src/new/file.mjs').rel, 'src/new/file.mjs');
  assert.equal(resolveInside(root, './src/../src/a').rel, 'src/a');
  assert.throws(() => resolveInside(root, 'link/secret'), /leaves the repository/);
  assert.throws(() => resolveInside(root, 'link/new-file'), /leaves the repository/);
  assert.throws(() => resolveInside(root, 'src/../../x'), /leaves the repository/);
  assert.throws(() => resolveInside(root, 'a/.git/hooks/pre-commit'), /\.git/);
  assert.throws(() => resolveInside(root, ''), /required/);
});
