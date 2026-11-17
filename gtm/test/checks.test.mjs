import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContext, parseAsset, checkSlop, checkClaims, checkStructure, checkLinks, checkAsset } from '../checks/lib.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = loadContext(root);

function asset(body, meta = { channel: 'faq', title: 't' }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtm-'));
  const file = path.join(dir, 'a.md');
  fs.writeFileSync(file, `---\n${Object.entries(meta).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n${body}`);
  return parseAsset(file);
}

test('slop: flags hype, exclamation marks and emoji; ignores code', () => {
  assert.deepEqual(checkSlop(asset('Plain sentence about a tool.')), []);
  assert.ok(checkSlop(asset('A revolutionary tool.')).some((p) => p.includes('revolutionary')));
  assert.ok(checkSlop(asset('It works!')).some((p) => p.includes('exclamation')));
  assert.ok(checkSlop(asset('Ship it 🚀')).some((p) => p.includes('emoji')));
  assert.deepEqual(checkSlop(asset('Run `unlock --seamless` then:\n```\nleverage!\n```')), []);
});

test('claims: numbers must be listed in facts.json', () => {
  assert.deepEqual(checkClaims(asset('Swarm keeps 20% of your quota in reserve and caps a run at $3.'), ctx), []);
  assert.ok(checkClaims(asset('Save $500 a week.'), ctx).some((p) => p.includes('$500')));
  assert.ok(checkClaims(asset('It is 10x faster.'), ctx).some((p) => p.includes('10x')));
  assert.ok(checkClaims(asset('Trusted by 4,000 developers.'), ctx).some((p) => p.includes('4,000 developers')));
});

test('claims: forbidden topics are allowed only when denied', () => {
  assert.ok(checkClaims(asset('A peer-to-peer swarm of agents.'), ctx).some((p) => p.includes('peer-to-peer')));
  assert.deepEqual(checkClaims(asset('This is not a peer-to-peer network.'), ctx), []);
  assert.ok(checkClaims(asset('We pool your tokens.'), ctx).some((p) => p.includes('pool')));
});

test('structure: channel, title, length and required sections', () => {
  assert.ok(checkStructure(asset('x', { channel: 'nope', title: 't' }), ctx)[0].includes('must be one of'));
  const short = checkStructure(asset('Too short.', { channel: 'factsheet', title: 't' }), ctx);
  assert.ok(short.some((p) => p.includes('at least')));
  assert.ok(short.some((p) => p.includes('What it is')));
});

test('links: external links need the allowlist, relative links must resolve', () => {
  assert.deepEqual(checkLinks(asset('See [docs](https://github.com/example/repo).'), ctx), []);
  assert.ok(checkLinks(asset('See [this](https://evil.example/x).'), ctx).some((p) => p.includes('allowlist')));
  assert.ok(checkLinks(asset('Bare https://tracker.example/pixel here.'), ctx).some((p) => p.includes('allowlist')));
  assert.ok(checkLinks(asset('See [gone](./missing.md).'), ctx).some((p) => p.includes('broken')));
});

test('every shipped asset passes every check', () => {
  const dir = path.join(root, 'assets');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    const res = checkAsset(path.join(dir, f), ctx);
    assert.ok(res.ok, `${f}: ${JSON.stringify(res.results)}`);
  }
});
