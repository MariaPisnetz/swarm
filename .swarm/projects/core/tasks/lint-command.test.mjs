import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintRepo } from '../../../../src/lint.mjs';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

function repo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-'));
  for (const [f, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
    fs.writeFileSync(path.join(root, f), text);
  }
  return root;
}
const manifest = (extra = {}) => JSON.stringify({ name: 'P', verify: [{ name: 't', run: 'true' }], ...extra });
const has = (problems, re) => problems.some((p) => re.test(`${p.file} ${p.problem}`));

test('a clean project has no problems', () => {
  const root = repo({ '.swarm/projects/p/project.json': manifest(), '.swarm/projects/p/tasks/do-it.md': '---\ntitle: Do it\n---\nBody.\n' });
  assert.deepEqual(lintRepo(root), []);
});

test('manifest problems', () => {
  assert.ok(has(lintRepo(repo({ '.swarm/projects/p/project.json': '{not json' })), /project\.json/));
  assert.ok(has(lintRepo(repo({ '.swarm/projects/p/project.json': manifest({ verfy: [] }) })), /verfy/));
  assert.ok(has(lintRepo(repo({ '.swarm/projects/p/project.json': JSON.stringify({ name: 'P', verify: [{ name: 't' }] }) })), /run/));
  assert.ok(lintRepo(repo({ '.swarm/projects/p/project.json': JSON.stringify({ name: 'P' }) })).length > 0);
});

test('task problems', () => {
  const base = { '.swarm/projects/p/project.json': manifest() };
  assert.ok(has(lintRepo(repo({ ...base, '.swarm/projects/p/tasks/a.md': '---\nsize: S\n---\nBody.\n' })), /title/));
  assert.ok(has(lintRepo(repo({ ...base, '.swarm/projects/p/tasks/Bad_Name.md': '---\ntitle: T\n---\nBody.\n' })), /Bad_Name/));
  assert.ok(has(lintRepo(repo({ ...base, '.swarm/projects/p/tasks/a.md': '---\ntitle: T\nstatus: maybe\n---\nBody.\n' })), /status/));
  assert.ok(has(lintRepo(repo({ ...base, '.swarm/projects/p/tasks/a.md': '---\ntitle: T\n---\n' })), /a\.md/));
  assert.ok(has(lintRepo(repo({ ...base, '.swarm/projects/p/tasks/a.md': '---\ntitle: T\nverify: ["node --test .swarm/projects/p/tasks/gone.test.mjs"]\n---\nBody.\n' })), /gone\.test\.mjs/));
});

test("this repository's own .swarm directory lints clean", () => {
  assert.deepEqual(lintRepo(repoRoot), []);
});
