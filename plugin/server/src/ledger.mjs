// The contribution ledger is the set of signed receipts merged into the repository.
import { c, fmtUsd } from './util.mjs';

export function leaderboard(receipts) {
  const valid = receipts.filter((r) => r.valid && r.kind === 'receipt');
  const workers = new Map();
  for (const r of valid) {
    const w = workers.get(r.signer.id) || { id: r.signer.id, handle: r.signer.handle, tasks: 0, costUsd: 0, linesChanged: 0, runners: new Set(), last: r.ts };
    w.tasks += 1;
    w.costUsd += r.usage?.costUsd || 0;
    w.linesChanged += r.linesChanged || 0;
    w.runners.add(r.agent?.runner);
    w.handle = r.signer.handle;
    if (String(r.ts) > String(w.last)) w.last = r.ts;
    workers.set(r.signer.id, w);
  }
  const rows = [...workers.values()]
    .map((w) => ({ ...w, runners: [...w.runners].filter(Boolean).sort(), costUsd: Math.round(w.costUsd * 100) / 100 }))
    .sort((a, b) => b.tasks - a.tasks || b.costUsd - a.costUsd);
  return {
    generatedAt: new Date().toISOString(),
    totals: {
      tasks: valid.length,
      workers: rows.length,
      costUsd: Math.round(valid.reduce((n, r) => n + (r.usage?.costUsd || 0), 0) * 100) / 100,
      invalidReceipts: receipts.length - valid.length,
    },
    workers: rows,
    recent: valid
      .slice(-20)
      .reverse()
      .map((r) => ({ task: `${r.project}/${r.task}`, worker: r.signer.id, handle: r.signer.handle, runner: r.agent?.runner, model: r.agent?.model, costUsd: r.usage?.costUsd || 0, ts: r.ts })),
  };
}

export function renderLeaderboard(board) {
  const lines = [
    `${c.bold('Swarm ledger')}: ${board.totals.tasks} verified task(s) from ${board.totals.workers} worker(s), ${fmtUsd(board.totals.costUsd)} API-equivalent quota donated`,
    '',
  ];
  if (!board.workers.length) lines.push(c.dim('  No merged receipts yet.'));
  board.workers.forEach((w, i) => {
    lines.push(`  ${String(i + 1).padStart(2)}. ${w.handle.padEnd(18)} ${c.dim(w.id)}  ${String(w.tasks).padStart(3)} task(s)  ${fmtUsd(w.costUsd).padStart(8)}  ${c.dim(w.runners.join(','))}`);
  });
  return lines.join('\n');
}
