import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseRollout, latestRollout } from '../../../../src/quota-codex.mjs';

const limits = (p, s) => ({ primary: p, secondary: s });

test('parseRollout returns the last token_count with rate limits', () => {
  const text = [
    JSON.stringify({ type: 'token_count', rate_limits: limits({ used_percent: 10, window_minutes: 300, resets_at: 1794962400 }, { used_percent: 40, window_minutes: 10080, resets_at: 1795291200 }) }),
    'garbage',
    JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: {}, rate_limits: limits({ used_percent: 25, window_minutes: 300, resets_at: 1794962400 }, { used_percent: 55.5, window_minutes: 10080, resets_at: 1795291200 }) } }),
    JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: {} } }),
  ].join('\n');
  const r = parseRollout(text);
  assert.equal(r.status, 'allowed');
  assert.equal(r.fiveHour.utilization, 0.25);
  assert.equal(r.weekly.utilization, 0.555);
  assert.equal(r.weekly.resetsAt, new Date(1795291200 * 1000).toISOString());
});

test('parseRollout handles one window, swapped order and nothing', () => {
  const only = parseRollout(JSON.stringify({ type: 'token_count', rate_limits: { primary: { used_percent: 80, window_minutes: 10080 } } }));
  assert.equal(only.weekly, null);
  assert.equal(only.fiveHour.utilization, 0.8);
  assert.equal(only.fiveHour.resetsAt, null);
  const swapped = parseRollout(JSON.stringify({ type: 'token_count', rate_limits: limits({ used_percent: 70, window_minutes: 10080 }, { used_percent: 5, window_minutes: 300 }) }));
  assert.equal(swapped.fiveHour.utilization, 0.05);
  assert.equal(swapped.weekly.utilization, 0.7);
  assert.equal(parseRollout(''), null);
  assert.equal(parseRollout('{"type":"other"}'), null);
});

test('latestRollout finds the newest rollout file', () => {
  assert.equal(latestRollout(path.join(os.tmpdir(), 'does-not-exist-swarm')), null);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-'));
  fs.mkdirSync(path.join(dir, '2026/11/16'), { recursive: true });
  fs.mkdirSync(path.join(dir, '2026/11/17'), { recursive: true });
  const old = path.join(dir, '2026/11/16/rollout-a.jsonl');
  const fresh = path.join(dir, '2026/11/17/rollout-b.jsonl');
  fs.writeFileSync(old, '{}');
  fs.writeFileSync(fresh, '{}');
  fs.writeFileSync(path.join(dir, '2026/11/17/notes.txt'), 'x');
  fs.utimesSync(old, new Date(Date.now() - 86_400_000), new Date(Date.now() - 86_400_000));
  assert.equal(latestRollout(dir), fresh);
});
