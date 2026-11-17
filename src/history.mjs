import fs from 'node:fs';

/** Parsed entries of a history.jsonl file. A missing file gives []; malformed lines are skipped. */
export function readHistory(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const entries = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) entries.push(entry);
    } catch {
      // skip malformed line
    }
  }
  return entries;
}

const cents = (n) => Math.round(n * 100) / 100;

/** Totals by status and by runner. Costs are rounded to cents. */
export function summarizeHistory(entries) {
  const total = { submitted: 0, failed: 0, costUsd: 0 };
  const byRunner = {};
  for (const e of entries) {
    const name = e.runner || 'unknown';
    const r = (byRunner[name] ||= { submitted: 0, failed: 0, costUsd: 0 });
    const cost = Number(e.usage?.costUsd) || 0;
    if (e.status === 'submitted') {
      total.submitted++;
      r.submitted++;
    } else if (e.status === 'failed') {
      total.failed++;
      r.failed++;
    }
    total.costUsd += cost;
    r.costUsd += cost;
  }
  for (const r of Object.values(byRunner)) r.costUsd = cents(r.costUsd);
  return { submitted: total.submitted, failed: total.failed, costUsd: cents(total.costUsd), byRunner };
}
