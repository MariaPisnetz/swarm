// The volunteer's work loop: pick a task, claim it, let the agent edit a fresh clone, verify
// in the sandbox, sign a receipt, submit.
import fs from 'node:fs';
import path from 'node:path';
import { SWARM_HOME, ensureDir, step, ok, warn, fail, c, fmtUsd, fmtDuration } from './util.mjs';
import { completedTasks, protectedGlobs, verifySteps, receiptPath } from './project.mjs';
import { git, diffSummary, checkPolicy, runVerify, describeFailure } from './verify.mjs';
import { buildReceipt } from './receipt.mjs';
import { makeWorkDir } from './repo.mjs';

export function buildPrompt({ project, task, feedback }) {
  const steps = verifySteps(project, task);
  const lines = [
    'You are a volunteer coding agent contributing to an open-source project through Swarm.',
    'A maintainer wrote the task below. Complete it in the repository in the current directory.',
    '',
    `# Task ${task.ref}: ${task.title}`,
    '',
    task.body,
    '',
    '# Rules',
    `- You may create or change only files matching: ${task.paths.join(', ')}`,
    `- Never change: ${protectedGlobs(project).join(', ')}`,
    '- You cannot run commands. Read the code carefully instead of guessing.',
    '- When you finish, an automated verifier runs these steps in a sandbox with no network access:',
    ...steps.map((s) => `    - ${s.name}: ${s.run}`),
    '  If a step fails you get its output and one more attempt.',
    '- Keep the change small and focused on the task. Follow the style of the surrounding code.',
    '- Add or update tests when you change behaviour. Do not add dependencies unless the task says so.',
    '- If the task cannot be done as written, change nothing and explain why.',
    '- End with a short summary of what you changed and why. It becomes the pull request description.',
  ];
  if (feedback) {
    lines.push('', '# Previous attempt', 'Your earlier changes are still in the working tree. They were not accepted:', '', feedback, '', 'Fix the problem. Do not weaken or delete tests to make them pass.');
  }
  return lines.join('\n');
}

/** Tasks that are ready, not finished, and not already claimed by enough workers. */
export function openTasks(projects, mirrorDir, claims, { projectId, taskRef } = {}) {
  const open = [];
  for (const project of projects) {
    if (projectId && project.id !== projectId) continue;
    const done = completedTasks(mirrorDir, project.id);
    for (const task of project.tasks) {
      if (taskRef && task.ref !== taskRef && task.id !== taskRef) continue;
      const live = claims.get(task.ref) || [];
      const state = done.has(task.id) ? 'done' : task.status !== 'ready' ? task.status : live.length >= project.replication ? 'claimed' : 'open';
      open.push({ project, task, state, claims: live });
    }
  }
  return open;
}

function record(entry) {
  ensureDir(SWARM_HOME);
  fs.appendFileSync(path.join(SWARM_HOME, 'history.jsonl'), JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
}

/**
 * Work on one task. Returns { status: 'submitted' | 'failed' | 'lost-claim' | 'dry-run', ... }.
 */
export async function workOn({ repo, mirror, board, identity, runner, project, task, opts }) {
  const branch = board.branchFor(task);
  const workDir = await makeWorkDir(repo, mirror, { name: `${project.id}-${task.id}`, commit: mirror.base, branch });
  const keep = () => warn(`Work directory kept for inspection: ${workDir}`);

  step(`Claiming ${c.bold(task.ref)}: ${task.title}`);
  const claim = opts.dryRun ? { dry: true } : await board.claim({ project, task, workDir, branch, base: mirror.base });
  if (!claim) {
    warn('Another worker got there first.');
    fs.rmSync(workDir, { recursive: true, force: true });
    return { status: 'lost-claim' };
  }

  const usage = { inputTokens: 0, outputTokens: 0, costUsd: 0, turns: 0, durationMs: 0 };
  let agentInfo = null;
  let feedback = null;
  let verify = null;
  let diff = null;
  let summary = '';
  let rateLimit = null;
  let attempts = 0;

  try {
    for (attempts = 1; attempts <= opts.attempts; attempts++) {
      step(`Agent ${c.bold(runner.name)} working (attempt ${attempts}/${opts.attempts}, budget ${fmtUsd(opts.budgetUsd)})`);
      const started = Date.now();
      const res = await runner.runAgent({
        cwd: workDir,
        prompt: buildPrompt({ project, task, feedback }),
        model: opts.model,
        effort: opts.effort,
        budgetUsd: opts.budgetUsd,
        timeoutMs: opts.timeoutMinutes * 60_000,
      });
      usage.inputTokens += res.usage?.inputTokens || 0;
      usage.outputTokens += res.usage?.outputTokens || 0;
      usage.costUsd += res.usage?.costUsd || 0;
      usage.turns += res.usage?.turns || 0;
      usage.durationMs += res.usage?.durationMs || Date.now() - started;
      rateLimit = res.rateLimit || rateLimit;
      agentInfo = { runner: res.runner || runner.name, model: res.model, version: res.version };
      summary = res.summary || summary;
      if (!res.ok) {
        fail(`Agent stopped: ${res.error}`);
        break; // budget, rate limit or crash: retrying would only burn quota
      }

      await git(workDir, ['add', '-A']);
      diff = await diffSummary(workDir, mirror.base);
      const problems = checkPolicy(diff, project, task);
      if (problems.length) {
        feedback = `The change breaks the contribution policy:\n${problems.map((p) => `- ${p}`).join('\n')}`;
        fail(`Policy: ${problems[0]}${problems.length > 1 ? ` (+${problems.length - 1} more)` : ''}`);
        verify = null;
        continue;
      }

      step(`Verifying in ${c.bold(opts.sandbox)} sandbox`);
      verify = await runVerify(project, task, { workDir, sandbox: opts.sandbox, onStep: (s) => step(`  ${s.name}: ${c.dim(s.run)}`) });
      if (verify.ok) break;
      feedback = describeFailure(verify);
      fail(`Verification failed at "${verify.results.at(-1).name}"`);
    }

    if (!verify?.ok) {
      if (!opts.dryRun) await board.release(claim);
      record({ repo: repo.slug, task: task.ref, status: 'failed', usage, runner: runner.name });
      keep();
      return { status: 'failed', usage, rateLimit, workDir };
    }

    ok(`Verified: ${verify.results.map((r) => r.name).join(', ')} (${diff.files.length} files, ${diff.lines} lines)`);
    await git(workDir, ['commit', '--quiet', '-m', `${task.title}\n\nSwarm-Task: ${task.ref}\nSwarm-Worker: ${identity.id}`]);
    const work = (await git(workDir, ['rev-parse', 'HEAD'])).trim();
    const tree = (await git(workDir, ['rev-parse', 'HEAD^{tree}'])).trim();
    const receipt = buildReceipt({ project, task, base: mirror.base, work, tree, diff, agent: agentInfo, usage, verify, sandbox: opts.sandbox, attempts: Math.min(attempts, opts.attempts), identity });
    const file = receiptPath(project.id, task.id, identity.id);
    ensureDir(path.dirname(path.join(workDir, file)));
    fs.writeFileSync(path.join(workDir, file), JSON.stringify(receipt, null, 2) + '\n');
    await git(workDir, ['add', '-f', file]);
    await git(workDir, ['commit', '--quiet', '-m', `swarm: receipt for ${task.ref}`]);

    if (opts.dryRun) {
      ok(`Dry run: nothing pushed. Result is in ${workDir}`);
      return { status: 'dry-run', usage, rateLimit, workDir, receipt };
    }
    const sub = await board.submit({ workDir, branch, claim, project, task, receipt, summary });
    record({ repo: repo.slug, task: task.ref, status: 'submitted', usage, runner: runner.name, where: sub.where });
    ok(`Submitted ${c.bold(task.ref)} → ${sub.where}  ${c.dim(`(${fmtUsd(usage.costUsd)} API-equivalent, ${fmtDuration(usage.durationMs)})`)}`);
    fs.rmSync(workDir, { recursive: true, force: true });
    return { status: 'submitted', usage, rateLimit, receipt, submission: sub };
  } catch (err) {
    if (!opts.dryRun) await board.release(claim).catch(() => {});
    keep();
    throw err;
  }
}
