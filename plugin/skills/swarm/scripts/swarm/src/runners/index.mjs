import * as claude from './claude.mjs';
import * as codex from './codex.mjs';
import * as mock from './mock.mjs';
import { which } from '../util.mjs';

export const runners = { claude, codex, mock };

export function getRunner(name) {
  const r = runners[name];
  if (!r) throw new Error(`Unknown runner "${name}". Available: ${Object.keys(runners).join(', ')}`);
  return r;
}

/** Agent CLIs installed on this machine, in preference order. */
export async function detectRunners() {
  const found = [];
  for (const n of ['claude', 'codex']) if (await which(n)) found.push(n);
  return found;
}
