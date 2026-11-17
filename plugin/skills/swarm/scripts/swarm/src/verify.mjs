// Verification of a contribution: a policy check on the diff, then the project's verify
// commands inside the sandbox. The same code runs on the volunteer's machine before
// submitting, on a reviewer's machine, and in CI. Nobody's word is taken for it.
import { must, run, sha256, tail, matchesAny } from './util.mjs';
import { protectedGlobs, verifySteps } from './project.mjs';
import { runSandboxed } from './sandbox.mjs';

export const git = (cwd, args, opts = {}) =>
  must('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.quotepath=off', ...args], { cwd, ...opts });

/** Files changed between two commits (or base and the index when `head` is null). */
export async function diffSummary(cwd, base, head = null) {
  const range = head ? [base, head] : ['--cached', base];
  const numstat = await git(cwd, ['diff', '--numstat', '--no-renames', ...range]);
  const raw = await git(cwd, ['diff', '--raw', '--no-renames', ...range]);
  const modes = new Map();
  for (const line of raw.split('\n').filter(Boolean)) {
    const [meta, file] = line.split('\t');
    modes.set(file, meta.split(' ')[1]);
  }
  const files = numstat
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [added, removed, file] = line.split('\t');
      return {
        file,
        added: added === '-' ? 0 : Number(added),
        removed: removed === '-' ? 0 : Number(removed),
        binary: added === '-',
        mode: modes.get(file) || '',
      };
    });
  const patch = await git(cwd, ['diff', '--no-renames', '--binary', ...range], { maxBuffer: 64 * 1024 * 1024 });
  return { files, lines: files.reduce((n, f) => n + f.added + f.removed, 0), sha256: sha256(patch) };
}

/** Returns a list of human-readable violations; empty means the diff is allowed. */
export function checkPolicy(diff, project, task) {
  const problems = [];
  if (diff.files.length === 0) problems.push('the change is empty');
  const protect = protectedGlobs(project);
  for (const f of diff.files) {
    if (matchesAny(f.file, protect)) problems.push(`${f.file} is protected and cannot be changed by a contribution`);
    else if (!matchesAny(f.file, task.paths)) problems.push(`${f.file} is outside the paths this task may touch (${task.paths.join(', ')})`);
    if (f.mode === '120000') problems.push(`${f.file} is a symlink; symlinks are not accepted`);
    if (f.mode === '160000') problems.push(`${f.file} is a submodule; submodules are not accepted`);
  }
  const { maxFilesChanged, maxDiffLines } = project.limits;
  if (diff.files.length > maxFilesChanged) problems.push(`${diff.files.length} files changed; the limit is ${maxFilesChanged}`);
  if (diff.lines > maxDiffLines) problems.push(`${diff.lines} lines changed; the limit is ${maxDiffLines}`);
  return problems;
}

/** Run every verify step. Stops at the first failure. */
export async function runVerify(project, task, { workDir, sandbox, onStep }) {
  const results = [];
  for (const s of verifySteps(project, task)) {
    const started = Date.now();
    if (onStep) onStep(s);
    const res = await runSandboxed(s.run, { workDir, mode: sandbox, project, timeoutMs: (s.timeoutSec || 300) * 1000 });
    const output = `${res.stdout}\n${res.stderr}`;
    results.push({
      name: s.name,
      run: s.run,
      exit: res.timedOut ? 124 : res.code,
      ms: Date.now() - started,
      outputSha256: sha256(output),
      tail: tail(output, 60),
    });
    if (res.code !== 0 || res.timedOut) break;
  }
  const expected = verifySteps(project, task).length;
  return { ok: results.length === expected && results.every((r) => r.exit === 0), results };
}

export function describeFailure(verify) {
  const failed = verify.results.find((r) => r.exit !== 0);
  if (!failed) return '';
  return `Verify step "${failed.name}" (${failed.run}) exited ${failed.exit}.\n\n${failed.tail}`;
}

export async function isAncestor(cwd, ancestor, descendant) {
  const res = await run('git', ['merge-base', '--is-ancestor', ancestor, descendant], { cwd });
  return res.code === 0;
}
