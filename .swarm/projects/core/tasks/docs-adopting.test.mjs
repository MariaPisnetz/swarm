import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'docs', 'ADOPTING.md');

test('docs/ADOPTING.md has the required sections, in order, and covers every manifest key', () => {
  const text = fs.readFileSync(file, 'utf8');
  const headings = ['## Before you start', '## Add a project', '## Write tasks', '## Pin acceptance tests', '## Set up CI', '## Review and merge'];
  let at = -1;
  for (const h of headings) {
    const i = text.indexOf(h);
    assert.ok(i > at, `missing or out of order: ${h}`);
    at = i;
  }
  for (const key of ['paths', 'protect', 'verify', 'limits', 'review', 'replication', 'claimTtlMinutes', 'sandbox']) {
    assert.ok(text.includes('`' + key + '`'), `manifest key not explained: ${key}`);
  }
  const words = text.split(/\s+/).filter(Boolean).length;
  assert.ok(words >= 400 && words <= 1200, `${words} words; expected 400 to 1200`);
  assert.ok(text.includes('```json'), 'needs a JSON manifest example');
});
