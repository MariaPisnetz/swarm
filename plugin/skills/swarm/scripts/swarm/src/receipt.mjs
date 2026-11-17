// A receipt is a signed statement by a worker: "I ran this agent on this task at this base
// commit, produced this exact tree, and these verify steps passed on my machine."
// Receipts are committed to the repository, so the contribution ledger is just git history.
//
// A submission branch always has this shape:
//
//   base ── work commit (the agent's change) ── receipt commit (adds one receipt file)
//
// checkSubmission() re-derives everything it can from git instead of trusting the receipt.
import fs from 'node:fs';
import path from 'node:path';
import { signDoc, verifyDoc } from './identity.mjs';
import { receiptPath, findTask } from './project.mjs';
import { git, diffSummary, checkPolicy, isAncestor } from './verify.mjs';

export const RECEIPT_VERSION = 1;

export function buildReceipt({ project, task, base, work, tree, diff, agent, usage, verify, sandbox, attempts, identity }) {
  return signDoc(
    {
      v: RECEIPT_VERSION,
      kind: 'receipt',
      project: project.id,
      task: task.id,
      base,
      work,
      tree,
      diffSha256: diff.sha256,
      filesChanged: diff.files.length,
      linesChanged: diff.lines,
      agent,
      usage,
      attempts,
      sandbox,
      verify: verify.results.map(({ name, run, exit, ms, outputSha256 }) => ({ name, run, exit, ms, outputSha256 })),
      ts: new Date().toISOString(),
    },
    identity,
  );
}

export function buildReview({ receipt, verdict, notes, verify, agent, usage, sandbox, identity }) {
  return signDoc(
    {
      v: RECEIPT_VERSION,
      kind: 'review',
      project: receipt.project,
      task: receipt.task,
      work: receipt.work,
      submitter: receipt.signer.id,
      verdict, // "approve" | "reject"
      notes,
      agent,
      usage,
      sandbox,
      verify: verify.results.map(({ name, run, exit, ms, outputSha256 }) => ({ name, run, exit, ms, outputSha256 })),
      ts: new Date().toISOString(),
    },
    identity,
  );
}

/**
 * Structural check of a submission branch. `projects` must be loaded from the BASE commit
 * (the maintainers' version), never from the submission itself.
 * Returns { ok, problems, receipt, project, task }.
 */
export async function checkSubmission(cwd, { base, head, projects }) {
  const problems = [];
  const out = { ok: false, problems, receipt: null, project: null, task: null };

  const commits = (await git(cwd, ['rev-list', '--reverse', `${base}..${head}`])).split('\n').filter(Boolean);
  if (commits.length !== 2) {
    problems.push(`expected exactly 2 commits on top of base (work, receipt); found ${commits.length}`);
    return out;
  }
  const [work, receiptCommit] = commits;
  if (!(await isAncestor(cwd, base, work))) problems.push('work commit is not based on the base commit');

  const added = (await git(cwd, ['diff', '--name-status', '--no-renames', work, receiptCommit])).split('\n').filter(Boolean);
  if (added.length !== 1 || !added[0].startsWith('A\t')) {
    problems.push('the receipt commit must add exactly one receipt file and change nothing else');
    return out;
  }
  const file = added[0].slice(2);
  let receipt;
  try {
    receipt = JSON.parse(await git(cwd, ['show', `${receiptCommit}:${file}`]));
  } catch {
    problems.push(`${file} is not valid JSON`);
    return out;
  }
  out.receipt = receipt;

  const sig = verifyDoc(receipt);
  if (!sig.ok) problems.push(`receipt signature: ${sig.reason}`);
  if (receipt.kind !== 'receipt' || receipt.v !== RECEIPT_VERSION) problems.push('unsupported receipt kind or version');

  const found = findTask(projects, `${receipt.project}/${receipt.task}`);
  if (!found) {
    problems.push(`task ${receipt.project}/${receipt.task} does not exist at the base commit`);
    return out;
  }
  out.project = found.project;
  out.task = found.task;

  if (file !== receiptPath(receipt.project, receipt.task, receipt.signer?.id)) problems.push(`receipt is stored at an unexpected path: ${file}`);
  if (receipt.work !== work) problems.push('receipt.work does not match the work commit');
  const tree = (await git(cwd, ['rev-parse', `${work}^{tree}`])).trim();
  if (receipt.tree !== tree) problems.push('receipt.tree does not match the work commit tree');
  const baseSha = (await git(cwd, ['rev-parse', base])).trim();
  if (receipt.base !== baseSha && !(await isAncestor(cwd, receipt.base, baseSha))) problems.push('receipt.base is not in the history of the target branch');

  const diff = await diffSummary(cwd, base, work);
  problems.push(...checkPolicy(diff, found.project, found.task));
  if (receipt.base === baseSha && receipt.diffSha256 !== diff.sha256) problems.push('receipt.diffSha256 does not match the actual diff');

  out.work = work;
  out.diff = diff;
  out.ok = problems.length === 0;
  return out;
}

/** All merged receipts in a checkout, with signature status. */
export function readLedger(root) {
  const dir = path.join(root, '.swarm', 'receipts');
  const entries = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.json')) {
        try {
          const receipt = JSON.parse(fs.readFileSync(p, 'utf8'));
          entries.push({ ...receipt, valid: verifyDoc(receipt).ok });
        } catch {
          /* unreadable receipts are ignored by the ledger; CI rejects them before merge */
        }
      }
    }
  };
  walk(dir);
  return entries.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
}
