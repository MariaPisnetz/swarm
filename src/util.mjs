// Small shared helpers. No dependencies beyond the Node standard library.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const SWARM_HOME = process.env.SWARM_HOME || path.join(os.homedir(), '.swarm');

export function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (fallback !== undefined && err.code === 'ENOENT') return fallback;
    throw new Error(`Cannot read ${file}: ${err.message}`);
  }
}

export function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

/**
 * Run a command without a shell. Resolves with { code, stdout, stderr, timedOut }.
 * Never rejects on a non-zero exit; callers decide what a failure means.
 */
export function run(cmd, args = [], opts = {}) {
  const { cwd, env, input, timeoutMs = 0, maxBuffer = 8 * 1024 * 1024, onStdout } = opts;
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const cap = (buf, chunk) => (buf.length < maxBuffer ? buf + chunk : buf);
    child.stdout.on('data', (d) => {
      const s = d.toString();
      stdout = cap(stdout, s);
      if (onStdout) onStdout(s);
    });
    child.stderr.on('data', (d) => (stderr = cap(stderr, d.toString())));
    const timer = timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill('SIGKILL');
        }, timeoutMs)
      : null;
    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(new Error(`Failed to start ${cmd}: ${err.message}`));
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr, timedOut });
    });
    if (input !== undefined) child.stdin.write(input);
    child.stdin.end();
  });
}

/** Like run(), but throws when the command exits non-zero. */
export async function must(cmd, args = [], opts = {}) {
  const res = await run(cmd, args, opts);
  if (res.code !== 0) {
    const detail = (res.stderr || res.stdout).trim().split('\n').slice(-6).join('\n');
    throw new Error(`${cmd} ${args.join(' ')} failed (exit ${res.code})\n${detail}`);
  }
  return res.stdout;
}

export async function which(bin) {
  const res = await run('/usr/bin/env', ['which', bin]).catch(() => ({ code: 1, stdout: '' }));
  return res.code === 0 ? res.stdout.trim() : null;
}

/**
 * Glob match supporting `*` (within a path segment), `**` (across segments) and `?`.
 * A pattern ending in `/` matches everything below that directory.
 */
export function globToRegExp(glob) {
  const g = glob.endsWith('/') ? glob + '**' : glob;
  return new RegExp(`^${globBody(g)}$`);
}

// Converts glob text to a regex source. `{a,b}` is alternation (not nestable);
// a `{` without a closing `}` is literal, as is a `{` nested inside a group.
function globBody(g) {
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '{') {
      const end = g.indexOf('}', i);
      if (end !== -1) {
        re += `(?:${g.slice(i + 1, end).split(',').map(globBody).join('|')})`;
        i = end;
      } else {
        re += '\\{';
      }
    } else if (c === '*') {
      if (g[i + 1] === '*') {
        i++;
        if (g[i + 1] === '/') {
          i++;
          re += '(?:.*/)?';
        } else {
          re += '.*';
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return re;
}

export function matchesAny(file, globs = []) {
  return globs.some((g) => globToRegExp(g).test(file));
}

/**
 * Parse a markdown file with a `---` frontmatter block.
 * Values are JSON when they parse as JSON (arrays, numbers, quoted strings), else plain strings.
 */
export function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const raw = line.slice(idx + 1).trim();
    try {
      meta[key] = JSON.parse(raw);
    } catch {
      meta[key] = raw;
    }
  }
  return { meta, body: m[2].trim() };
}

/** Deterministic JSON: object keys sorted recursively. Used for signing. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .filter((k) => value[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function tail(text, lines = 40) {
  return text.trim().split('\n').slice(-lines).join('\n');
}

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
export const c = {
  dim: paint('2'),
  bold: paint('1'),
  green: paint('32'),
  red: paint('31'),
  yellow: paint('33'),
  cyan: paint('36'),
};

let sink = (line) => process.stdout.write(line + '\n');

/** Redirect all progress output. Returns the previous sink so it can be restored. */
export function setLogSink(fn) {
  const prev = sink;
  sink = fn;
  return prev;
}

export function log(msg = '') {
  sink(String(msg));
}
export const step = (msg) => log(`${c.cyan('›')} ${msg}`);
export const ok = (msg) => log(`${c.green('✓')} ${msg}`);
export const warn = (msg) => log(`${c.yellow('!')} ${msg}`);
export const fail = (msg) => log(`${c.red('✗')} ${msg}`);

export function fmtUsd(n) {
  return `$${(n || 0).toFixed(2)}`;
}

export function fmtDuration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 90) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
}
