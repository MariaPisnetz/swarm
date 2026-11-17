// A fake agent for tests and offline demos. It runs the shell command in SWARM_MOCK_CMD
// inside the work directory instead of calling a model, and reports zero usage.
import { run } from '../util.mjs';

export const name = 'mock';

export async function runAgent({ cwd, prompt }) {
  const cmd = process.env.SWARM_MOCK_CMD;
  if (!cmd) return { ok: false, error: 'SWARM_MOCK_CMD is not set', runner: name };
  const res = await run('/bin/sh', ['-c', cmd], { cwd, env: { ...process.env, SWARM_PROMPT: prompt } });
  return {
    ok: res.code === 0,
    error: res.code === 0 ? undefined : res.stderr.trim() || `mock command exited ${res.code}`,
    runner: name,
    model: 'mock',
    version: '0',
    summary: res.stdout.trim().slice(0, 2000),
    rateLimit: null,
    usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, turns: 1, durationMs: 0 },
  };
}

export async function probeQuota() {
  return null;
}
