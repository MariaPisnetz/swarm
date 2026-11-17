import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readHistory, summarizeHistory } from '../../../../src/history.mjs';

test('readHistory tolerates a missing file and bad lines', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hist-'));
  assert.deepEqual(readHistory(path.join(dir, 'nope.jsonl')), []);
  const file = path.join(dir, 'h.jsonl');
  fs.writeFileSync(file, '{"task":"a/b","status":"submitted"}\nnot json\n\n{"task":"a/c","status":"failed"}\n');
  assert.deepEqual(readHistory(file).map((e) => e.task), ['a/b', 'a/c']);
});

test('summarizeHistory totals by status and runner', () => {
  const s = summarizeHistory([
    { task: 'a/1', status: 'submitted', runner: 'claude', usage: { costUsd: 1.004 } },
    { task: 'a/2', status: 'failed', runner: 'claude', usage: { costUsd: 0.5 } },
    { task: 'a/3', status: 'submitted', runner: 'codex' },
  ]);
  assert.equal(s.submitted, 2);
  assert.equal(s.failed, 1);
  assert.equal(s.costUsd, 1.5);
  assert.deepEqual(s.byRunner.claude, { submitted: 1, failed: 1, costUsd: 1.5 });
  assert.deepEqual(s.byRunner.codex, { submitted: 1, failed: 0, costUsd: 0 });
  assert.deepEqual(summarizeHistory([]), { submitted: 0, failed: 0, costUsd: 0, byRunner: {} });
});
