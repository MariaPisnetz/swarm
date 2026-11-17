import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECKS, checkReadability, checkSlop, checkClaims, loadContext, parseAsset, checkAsset } from '../../../../gtm/checks/lib.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'gtm');
const ctx = loadContext(root);
function asset(body) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'read-')), 'a.md');
  fs.writeFileSync(file, `---\nchannel: faq\ntitle: t\n---\n${body}`);
  return parseAsset(file);
}
const w = (n, word = 'word') => Array.from({ length: n }, () => word).join(' ');

test('registered', () => assert.equal(CHECKS.readability, checkReadability));

test('short plain copy passes', () => {
  assert.deepEqual(checkReadability(asset('# Title\n\nShort sentence one. Short sentence two.\n\n- a list item\n- another item\n'), ctx), []);
});

test('long sentence, high average and long paragraph are reported', () => {
  assert.ok(checkReadability(asset(`Alpha beta gamma delta epsilon zeta ${w(40)}.`), ctx).some((p) => p.includes('Alpha beta gamma delta epsilon zeta')));
  assert.ok(checkReadability(asset(`${w(30)}. ${w(30)}. ${w(30)}.`), ctx).length > 0);
  const para = Array.from({ length: 13 }, () => `${w(10)}.`).join(' ');
  assert.ok(checkReadability(asset(para), ctx).some((p) => /paragraph/i.test(p)));
});

test('dots inside abbreviations, versions and file names do not end sentences; code is ignored', () => {
  const body = `Use Node 2.1 or newer, e.g. from your package manager, and read facts.json first. Done.\n\n\`\`\`\n${w(200)}\n\`\`\`\n`;
  assert.deepEqual(checkReadability(asset(body), ctx), []);
});

test('other checks still bite, and shipped assets still pass', () => {
  assert.ok(checkSlop(asset('A revolutionary tool!')).length >= 2);
  assert.ok(checkClaims(asset('Save $500 a week.'), ctx).length > 0);
  for (const f of fs.readdirSync(path.join(root, 'assets')).filter((x) => x.endsWith('.md'))) {
    const res = checkAsset(path.join(root, 'assets', f), ctx);
    assert.ok(res.ok, `${f}: ${JSON.stringify(res.results)}`);
  }
});
